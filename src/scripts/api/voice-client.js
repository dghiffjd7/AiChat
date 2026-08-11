import { createLinkedAbortController } from './abort.js';
import { prepareTransportRequest } from './transport.js';

const DEFAULT_TIMEOUT_MS = 60000;
const QWEN_LOCAL_MIN_TIMEOUT_MS = 300000;
const PCM_SAMPLE_RATE = 24000;

const getDefaultInvoker = () => {
  const g = typeof globalThis !== 'undefined' ? globalThis : undefined;
  const invoke =
    g?.__TAURI__?.core?.invoke ||
    g?.__TAURI__?.invoke ||
    g?.__TAURI_INVOKE__ ||
    g?.__TAURI_INTERNALS__?.invoke;
  return typeof invoke === 'function' ? (command, args) => invoke(command, args) : null;
};

const normalizeProvider = value => String(value || 'openai').trim().toLowerCase() || 'openai';
const trimBaseUrl = value => String(value || '').trim().replace(/\/+$/, '');
const makeRequestId = prefix => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;

export const resolveVoiceRequestTimeoutMs = (config = {}) => {
  const configured = Number(config?.timeout);
  const timeout = Number.isFinite(configured) && configured > 0
    ? Math.trunc(configured)
    : DEFAULT_TIMEOUT_MS;
  return normalizeProvider(config?.provider) === 'qwen_local'
    ? Math.max(timeout, QWEN_LOCAL_MIN_TIMEOUT_MS)
    : timeout;
};

const makeAbortError = () => {
  try {
    return new DOMException('Aborted', 'AbortError');
  } catch {
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
  }
};

const encodeUtf8 = value => new TextEncoder().encode(String(value ?? ''));

const concatBytes = chunks => {
  const list = Array.isArray(chunks) ? chunks : [];
  const size = list.reduce((total, chunk) => total + chunk.length, 0);
  const output = new Uint8Array(size);
  let offset = 0;
  list.forEach((chunk) => {
    output.set(chunk, offset);
    offset += chunk.length;
  });
  return output;
};

const bytesToBase64 = value => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
};

const base64ToBytes = value => {
  const binary = atob(String(value || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
};

const escapeMultipartName = value => String(value || '').replace(/["\r\n]/g, '_');

const appendMultipartText = (chunks, boundary, name, value) => {
  chunks.push(encodeUtf8([
    `--${boundary}`,
    `Content-Disposition: form-data; name="${escapeMultipartName(name)}"`,
    '',
    String(value ?? ''),
    '',
  ].join('\r\n')));
};

const appendMultipartFile = (chunks, boundary, name, file) => {
  chunks.push(encodeUtf8([
    `--${boundary}`,
    `Content-Disposition: form-data; name="${escapeMultipartName(name)}"; filename="${escapeMultipartName(file.fileName)}"`,
    `Content-Type: ${file.mimeType || 'application/octet-stream'}`,
    '',
    '',
  ].join('\r\n')));
  chunks.push(file.bytes);
  chunks.push(encodeUtf8('\r\n'));
};

const getAuthHeaders = config => {
  const provider = normalizeProvider(config?.provider);
  const apiKey = String(config?.apiKey || '').trim();
  if (provider === 'qwen_local') return {};
  if (!apiKey) return {};
  if (provider === 'elevenlabs') return { 'xi-api-key': apiKey };
  return { Authorization: `Bearer ${apiKey}` };
};

const resolveAudioFileName = mimeType => {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('wav')) return 'recording.wav';
  if (mime.includes('mp4') || mime.includes('m4a')) return 'recording.m4a';
  if (mime.includes('mpeg') || mime.includes('mp3')) return 'recording.mp3';
  if (mime.includes('ogg')) return 'recording.ogg';
  return 'recording.webm';
};

const buildMultipart = ({ fields = {}, audioBytes, mimeType, fileName } = {}) => {
  const boundary = `MiPhoneVoice${Date.now().toString(36)}${Math.random().toString(16).slice(2)}`;
  const chunks = [];
  Object.entries(fields).forEach(([name, value]) => {
    if (value === undefined || value === null || String(value) === '') return;
    appendMultipartText(chunks, boundary, name, value);
  });
  appendMultipartFile(chunks, boundary, 'file', {
    bytes: audioBytes instanceof Uint8Array ? audioBytes : new Uint8Array(audioBytes || []),
    mimeType: String(mimeType || 'audio/webm'),
    fileName: String(fileName || resolveAudioFileName(mimeType)),
  });
  chunks.push(encodeUtf8(`--${boundary}--\r\n`));
  const body = concatBytes(chunks);
  return {
    body,
    bodyBase64: bytesToBase64(body),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
};

export const buildVoiceModelsRequest = (config = {}) => {
  const provider = normalizeProvider(config.provider);
  const baseUrl = trimBaseUrl(config.baseUrl);
  if (!baseUrl) throw new Error('语音 API Base URL 未配置');
  return {
    provider,
    url: `${baseUrl}/models`,
    method: 'GET',
    headers: {
      ...getAuthHeaders(config),
      Accept: 'application/json',
    },
  };
};

export const buildVoiceSpeechRequest = (config = {}, {
  text = '',
  voice = '',
  instructions = '',
} = {}) => {
  const provider = normalizeProvider(config.provider);
  const baseUrl = trimBaseUrl(config.baseUrl);
  const model = String(config.model || config.ttsModel || '').trim();
  const input = String(text || '').trim();
  const voiceId = String(voice || config.ttsVoice || '').trim();
  if (!baseUrl) throw new Error('TTS API Base URL 未配置');
  if (!model) throw new Error('TTS 模型未配置');
  if (!voiceId) throw new Error(provider === 'elevenlabs' ? 'ElevenLabs Voice ID 未配置' : 'TTS 声音未配置');
  if (!input) throw new Error('没有可朗读的文字');

  const headers = {
    ...getAuthHeaders(config),
    'Content-Type': 'application/json',
    Accept: 'application/octet-stream',
  };
  if (provider === 'elevenlabs') {
    return {
      provider,
      url: `${baseUrl}/text-to-speech/${encodeURIComponent(voiceId)}/stream?output_format=pcm_24000`,
      method: 'POST',
      headers,
      body: JSON.stringify({ text: input, model_id: model }),
      sampleRate: PCM_SAMPLE_RATE,
    };
  }

  const payload = {
    model,
    input,
    voice: voiceId,
    response_format: 'pcm',
  };
  const speakingInstructions = String(instructions || '').trim();
  if (speakingInstructions) payload.instructions = speakingInstructions;
  return {
    provider,
    url: `${baseUrl}/audio/speech`,
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    sampleRate: PCM_SAMPLE_RATE,
  };
};

export const buildVoiceTranscriptionRequest = (config = {}, {
  audioBytes,
  mimeType = 'audio/webm',
  fileName = '',
  language = '',
  prompt = '',
} = {}) => {
  const provider = normalizeProvider(config.provider);
  const baseUrl = trimBaseUrl(config.baseUrl);
  const model = String(config.model || config.sttModel || '').trim();
  if (!baseUrl) throw new Error('STT API Base URL 未配置');
  if (!model) throw new Error('STT 模型未配置');
  if (provider === 'openai' && isOpenAiLiveTranscriptionModelId(model)) {
    throw new Error('当前录音转文字功能不支持实时转写模型');
  }
  if (provider === 'openai' && isOpenAiDiarizationModelId(model)) {
    throw new Error('当前录音转文字功能不支持说话人分离模型');
  }

  const fields = provider === 'elevenlabs'
    ? { model_id: model, language_code: language }
    : isGptTranscribeModelId(model)
      ? { model, 'languages[]': language, prompt }
      : { model, response_format: 'json', language, prompt };
  const multipart = buildMultipart({
    fields,
    audioBytes,
    mimeType,
    fileName,
  });
  return {
    provider,
    url: provider === 'elevenlabs'
      ? `${baseUrl}/speech-to-text`
      : `${baseUrl}/audio/transcriptions`,
    method: 'POST',
    headers: {
      ...getAuthHeaders(config),
      'Content-Type': multipart.contentType,
      Accept: 'application/json',
    },
    ...multipart,
  };
};

const extractErrorDetail = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const data = JSON.parse(raw);
    return String(data?.error?.message || data?.detail || data?.message || raw).trim().slice(0, 400);
  } catch {
    return raw.slice(0, 400);
  }
};

const parseTranscriptText = value => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const data = JSON.parse(raw);
    return String(data?.text || data?.transcript || data?.result?.text || '').trim();
  } catch {
    return raw;
  }
};

const isTtsModelId = value => {
  const id = String(value || '').trim().toLowerCase();
  return /(^|[-_/])tts($|[-_/])/.test(id) || /text[-_/ ]?to[-_/ ]?speech/.test(id);
};

const isSttModelId = value => {
  const id = String(value || '').trim().toLowerCase();
  return /(^|[-_/])(stt|asr)($|[-_/])/.test(id)
    || /transcrib/.test(id)
    || /whisper/.test(id)
    || /speech[-_/ ]?to[-_/ ]?text/.test(id);
};

const isGptTranscribeModelId = value => (
  /^gpt-transcribe(?:-\d{4}-\d{2}-\d{2})?$/i.test(String(value || '').trim())
);

const isOpenAiLiveTranscriptionModelId = value => {
  const id = String(value || '').trim().toLowerCase();
  return /^gpt-live-transcribe(?:-|$)/.test(id)
    || /(^|[-_/])realtime($|[-_/])/.test(id);
};

const isOpenAiDiarizationModelId = value => (
  /transcribe-diarize(?:-|$)/i.test(String(value || '').trim())
);

const isSupportedOpenAiFileTranscriptionModelId = value => {
  const id = String(value || '').trim().toLowerCase();
  return isGptTranscribeModelId(id)
    || /^gpt-4o(?:-mini)?-transcribe(?:-\d{4}-\d{2}-\d{2})?$/.test(id)
    || id === 'whisper-1';
};

export const parseVoiceModelCatalog = (value, {
  provider = 'openai',
  capability = 'tts',
} = {}) => {
  const normalizedProvider = normalizeProvider(provider);
  const normalizedCapability = String(capability || '').trim().toLowerCase() === 'stt' ? 'stt' : 'tts';
  let payload = value;
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload);
    } catch {
      throw new Error('模型列表响应不是有效 JSON');
    }
  }

  const source = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.models)
        ? payload.models
        : [];
  const records = source.map((item) => {
    if (typeof item === 'string') return { id: item };
    if (!item || typeof item !== 'object') return { id: '' };
    return {
      ...item,
      id: String(item.id || item.model_id || item.modelId || '').trim(),
    };
  }).filter(item => item.id);

  const filtered = records.filter((item) => {
    const id = item.id;
    const isRealtime = /(^|[-_/])realtime($|[-_/])/.test(id.toLowerCase());
    if (normalizedProvider === 'custom') return true;
    if (normalizedProvider === 'elevenlabs') {
      if (normalizedCapability === 'tts') return item.can_do_text_to_speech === true;
      return !isRealtime && /^scribe_/i.test(id);
    }
    if (normalizedProvider === 'openai' && normalizedCapability === 'stt') {
      return isSupportedOpenAiFileTranscriptionModelId(id);
    }
    if (isRealtime) return false;
    return normalizedCapability === 'stt' ? isSttModelId(id) : isTtsModelId(id);
  }).map(item => item.id);

  // ElevenLabs 的 GET /models 只公开可查询的合成/转换能力；批次 STT 端点当前使用 scribe_v2。
  if (normalizedProvider === 'elevenlabs' && normalizedCapability === 'stt') {
    filtered.push('scribe_v2');
  }
  return Array.from(new Set(filtered));
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export class VoiceClient {
  constructor({ invoke = undefined, fetchFn = undefined } = {}) {
    this.invoke = invoke === undefined ? getDefaultInvoker() : invoke;
    this.fetchFn = fetchFn || globalThis.fetch?.bind(globalThis);
  }

  async listModels(config = {}, { capability = 'tts', signal = null } = {}) {
    const request = buildVoiceModelsRequest(config);
    const transport = prepareTransportRequest({
      config,
      provider: request.provider,
      url: request.url,
      headers: request.headers,
    });
    const prepared = { ...request, url: transport.url, headers: transport.headers };
    let response;

    if (typeof this.invoke === 'function') {
      response = await this.invoke('http_request', {
        url: prepared.url,
        method: prepared.method,
        headers: prepared.headers,
        body: null,
        timeoutMs: resolveVoiceRequestTimeoutMs(config),
        requestId: makeRequestId('voice_models'),
      });
    } else {
      if (typeof this.fetchFn !== 'function') throw new Error('当前环境不支持网络请求');
      const { controller, cleanup } = createLinkedAbortController({
        timeoutMs: resolveVoiceRequestTimeoutMs(config),
        signal,
      });
      try {
        const fetched = await this.fetchFn(prepared.url, {
          method: prepared.method,
          headers: prepared.headers,
          signal: controller.signal,
        });
        response = {
          status: fetched.status,
          ok: fetched.ok,
          body: await fetched.text(),
        };
      } finally {
        cleanup();
      }
    }

    if (!response?.ok) {
      const status = Number(response?.status || 0);
      const detail = extractErrorDetail(response?.body);
      throw new Error(`获取语音模型列表失败（HTTP ${status || '无响应'}）${detail ? `：${detail}` : ''}`);
    }
    return parseVoiceModelCatalog(response.body, {
      provider: request.provider,
      capability,
    });
  }

  async *streamSpeech(config = {}, options = {}) {
    const request = buildVoiceSpeechRequest(config, options);
    const transport = prepareTransportRequest({
      config,
      provider: request.provider,
      url: request.url,
      headers: request.headers,
    });
    const prepared = { ...request, url: transport.url, headers: transport.headers };
    if (typeof this.invoke === 'function') {
      yield* this.streamSpeechNative(prepared, config, options);
      return;
    }
    yield* this.streamSpeechFetch(prepared, config, options);
  }

  async *streamSpeechNative(request, config, { signal } = {}) {
    const requestId = makeRequestId('voice_tts');
    const errorChunks = [];
    let started = false;
    const abortNative = () => {
      this.invoke?.('http_abort_request', { requestId }).catch?.(() => {});
    };
    signal?.addEventListener?.('abort', abortNative, { once: true });
    try {
      if (signal?.aborted) throw makeAbortError();
      await this.invoke('http_stream_request_start', {
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: request.body,
        timeoutMs: resolveVoiceRequestTimeoutMs(config),
        requestId,
        responseBase64: true,
        response_base64: true,
      });
      started = true;
      while (true) {
        if (signal?.aborted) throw makeAbortError();
        const batch = await this.invoke('http_stream_request_read', {
          requestId,
          maxChunks: 32,
        });
        const chunks = Array.isArray(batch?.chunks) ? batch.chunks : [];
        for (const encoded of chunks) {
          const bytes = base64ToBytes(encoded);
          if (batch?.ok === false) errorChunks.push(bytes);
          else if (bytes.length) yield bytes;
        }
        if (batch?.error) {
          if (/aborted/i.test(String(batch.error))) throw makeAbortError();
          throw new Error(String(batch.error));
        }
        if (batch?.done) {
          if (batch?.ok === false) {
            const body = new TextDecoder().decode(concatBytes(errorChunks));
            throw new Error(`语音生成失败（HTTP ${Number(batch?.status || 0)}）${extractErrorDetail(body) ? `：${extractErrorDetail(body)}` : ''}`);
          }
          break;
        }
        if (!chunks.length) await wait(12);
      }
    } finally {
      signal?.removeEventListener?.('abort', abortNative);
      if (started) {
        try {
          await this.invoke('http_stream_request_close', { requestId });
        } catch {}
      }
    }
  }

  async *streamSpeechFetch(request, config, { signal } = {}) {
    if (typeof this.fetchFn !== 'function') throw new Error('当前环境不支持网络请求');
    const { controller, cleanup } = createLinkedAbortController({
      timeoutMs: resolveVoiceRequestTimeoutMs(config),
      signal,
    });
    try {
      const response = await this.fetchFn(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`语音生成失败（HTTP ${response.status}）${extractErrorDetail(body) ? `：${extractErrorDetail(body)}` : ''}`);
      }
      if (!response.body?.getReader) {
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.length) yield bytes;
        return;
      }
      const reader = response.body.getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        const bytes = value instanceof Uint8Array ? value : new Uint8Array(value || []);
        if (bytes.length) yield bytes;
      }
    } finally {
      cleanup();
    }
  }

  async transcribe(config = {}, {
    audio,
    mimeType = '',
    fileName = '',
    language = '',
    prompt = '',
    signal = null,
  } = {}) {
    if (!audio?.arrayBuffer) throw new Error('录音内容为空');
    const audioBytes = new Uint8Array(await audio.arrayBuffer());
    if (!audioBytes.length) throw new Error('录音内容为空');
    const request = buildVoiceTranscriptionRequest(config, {
      audioBytes,
      mimeType: mimeType || audio.type || 'audio/webm',
      fileName,
      language,
      prompt,
    });
    const transport = prepareTransportRequest({
      config,
      provider: request.provider,
      url: request.url,
      headers: request.headers,
    });
    const prepared = { ...request, url: transport.url, headers: transport.headers };
    const response = typeof this.invoke === 'function'
      ? await this.transcribeNative(prepared, config, signal)
      : await this.transcribeFetch(prepared, config, signal);
    if (!response?.ok) {
      const status = Number(response?.status || 0);
      const detail = extractErrorDetail(response?.body);
      throw new Error(`语音识别失败（HTTP ${status || '无响应'}）${detail ? `：${detail}` : ''}`);
    }
    const text = parseTranscriptText(response.body);
    if (!text) throw new Error('语音识别没有返回文字');
    return text;
  }

  async transcribeNative(request, config, signal) {
    const requestId = makeRequestId('voice_stt');
    const abortNative = () => {
      this.invoke?.('http_abort_request', { requestId }).catch?.(() => {});
    };
    signal?.addEventListener?.('abort', abortNative, { once: true });
    try {
      if (signal?.aborted) throw makeAbortError();
      return await this.invoke('http_request', {
        url: request.url,
        method: request.method,
        headers: request.headers,
        body: null,
        bodyBase64: request.bodyBase64,
        timeoutMs: resolveVoiceRequestTimeoutMs(config),
        requestId,
      });
    } finally {
      signal?.removeEventListener?.('abort', abortNative);
    }
  }

  async transcribeFetch(request, config, signal) {
    if (typeof this.fetchFn !== 'function') throw new Error('当前环境不支持网络请求');
    const { controller, cleanup } = createLinkedAbortController({
      timeoutMs: resolveVoiceRequestTimeoutMs(config),
      signal,
    });
    try {
      const response = await this.fetchFn(request.url, {
        method: request.method,
        headers: request.headers,
        body: request.body,
        signal: controller.signal,
      });
      return {
        status: response.status,
        ok: response.ok,
        body: await response.text(),
      };
    } finally {
      cleanup();
    }
  }
}
