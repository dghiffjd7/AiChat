import assert from 'node:assert/strict';

import {
  VoiceClient,
  buildVoiceModelsRequest,
  buildVoiceSpeechRequest,
  buildVoiceTranscriptionRequest,
  parseVoiceModelCatalog,
  resolveVoiceRequestTimeoutMs,
} from '../../src/scripts/api/voice-client.js';

const decodeMultipart = request => Buffer.from(request.bodyBase64, 'base64').toString('utf8');

{
  const request = buildVoiceModelsRequest({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1/',
    apiKey: 'openai-test',
  });
  assert.equal(request.url, 'https://api.openai.com/v1/models');
  assert.equal(request.method, 'GET');
  assert.equal(request.headers.Authorization, 'Bearer openai-test');

  const localRequest = buildVoiceModelsRequest({
    provider: 'qwen_local',
    baseUrl: 'http://127.0.0.1:8765/v1',
    apiKey: 'must-not-leak',
  });
  assert.equal(localRequest.headers.Authorization, undefined);
  console.log('ok - voice model discovery uses the provider models endpoint and auth contract');
}

{
  const catalog = JSON.stringify({
    data: [
      { id: 'gpt-4o-mini-tts' },
      { id: 'tts-1-hd' },
      { id: 'gpt-transcribe' },
      { id: 'gpt-transcribe-2026-08-11' },
      { id: 'gpt-4o-mini-transcribe' },
      { id: 'gpt-4o-mini-transcribe-2025-12-15' },
      { id: 'gpt-live-transcribe' },
      { id: 'gpt-4o-transcribe-diarize' },
      { id: 'whisper-1' },
      { id: 'gpt-realtime-whisper' },
      { id: 'gpt-5.6-luna' },
    ],
  });
  assert.deepEqual(parseVoiceModelCatalog(catalog, {
    provider: 'openai',
    capability: 'tts',
  }), ['gpt-4o-mini-tts', 'tts-1-hd']);
  assert.deepEqual(parseVoiceModelCatalog(catalog, {
    provider: 'openai',
    capability: 'stt',
  }), [
    'gpt-transcribe',
    'gpt-transcribe-2026-08-11',
    'gpt-4o-mini-transcribe',
    'gpt-4o-mini-transcribe-2025-12-15',
    'whisper-1',
  ]);
  console.log('ok - OpenAI voice model discovery only exposes supported file-transcription contracts');
}

{
  const elevenCatalog = [
    { model_id: 'eleven_flash_v2_5', can_do_text_to_speech: true },
    { model_id: 'eleven_multilingual_sts_v2', can_do_text_to_speech: false },
  ];
  assert.deepEqual(parseVoiceModelCatalog(elevenCatalog, {
    provider: 'elevenlabs',
    capability: 'tts',
  }), ['eleven_flash_v2_5']);
  assert.deepEqual(parseVoiceModelCatalog(elevenCatalog, {
    provider: 'elevenlabs',
    capability: 'stt',
  }), ['scribe_v2']);

  const qwenCatalog = {
    data: [
      { id: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice' },
      { id: 'Qwen/Qwen3-ASR-0.6B' },
    ],
  };
  assert.deepEqual(parseVoiceModelCatalog(qwenCatalog, {
    provider: 'qwen_local',
    capability: 'tts',
  }), ['Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice']);
  assert.deepEqual(parseVoiceModelCatalog(qwenCatalog, {
    provider: 'qwen_local',
    capability: 'stt',
  }), ['Qwen/Qwen3-ASR-0.6B']);
  console.log('ok - ElevenLabs and Qwen catalogs are filtered by voice capability');
}

{
  assert.equal(resolveVoiceRequestTimeoutMs({ provider: 'openai', timeout: 60000 }), 60000);
  assert.equal(resolveVoiceRequestTimeoutMs({ provider: 'qwen_local', timeout: 60000 }), 300000);
  assert.equal(resolveVoiceRequestTimeoutMs({ provider: 'qwen_local', timeout: 600000 }), 600000);
  console.log('ok - Qwen local voice keeps enough timeout headroom for cold model loading');
}

{
  const request = buildVoiceSpeechRequest({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1/',
    apiKey: 'openai-test',
    model: 'gpt-4o-mini-tts',
    ttsVoice: 'marin',
  }, {
    text: '早安，主人。',
    instructions: '语气温柔。',
  });
  assert.equal(request.url, 'https://api.openai.com/v1/audio/speech');
  assert.equal(request.headers.Authorization, 'Bearer openai-test');
  assert.equal(request.sampleRate, 24000);
  assert.deepEqual(JSON.parse(request.body), {
    model: 'gpt-4o-mini-tts',
    input: '早安，主人。',
    voice: 'marin',
    response_format: 'pcm',
    instructions: '语气温柔。',
  });
  console.log('ok - OpenAI TTS uses the Audio speech PCM streaming contract');
}

{
  const request = buildVoiceSpeechRequest({
    provider: 'elevenlabs',
    baseUrl: 'https://api.elevenlabs.io/v1',
    apiKey: 'eleven-test',
    model: 'eleven_flash_v2_5',
    ttsVoice: 'JBFqnCBsd6RMkjVDRZzb',
  }, { text: '你好。' });
  assert.equal(
    request.url,
    'https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb/stream?output_format=pcm_24000',
  );
  assert.equal(request.headers['xi-api-key'], 'eleven-test');
  assert.deepEqual(JSON.parse(request.body), {
    text: '你好。',
    model_id: 'eleven_flash_v2_5',
  });
  console.log('ok - ElevenLabs TTS uses its voice-scoped streaming endpoint');
}

{
  const request = buildVoiceTranscriptionRequest({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'openai-test',
    model: 'gpt-4o-mini-transcribe',
  }, {
    audioBytes: new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]),
    mimeType: 'audio/wav',
    fileName: 'recording.wav',
    language: 'zh',
  });
  assert.equal(request.url, 'https://api.openai.com/v1/audio/transcriptions');
  assert.match(request.headers['Content-Type'], /^multipart\/form-data; boundary=MiPhoneVoice/);
  const body = decodeMultipart(request);
  assert.match(body, /name="model"\r\n\r\ngpt-4o-mini-transcribe/);
  assert.match(body, /name="response_format"\r\n\r\njson/);
  assert.match(body, /name="language"\r\n\r\nzh/);
  assert.match(body, /name="file"; filename="recording\.wav"/);
  assert.match(body, /Content-Type: audio\/wav/);
  console.log('ok - OpenAI STT sends native-safe multipart audio bytes');
}

{
  const request = buildVoiceTranscriptionRequest({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'openai-test',
    model: 'gpt-transcribe',
  }, {
    audioBytes: new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]),
    mimeType: 'audio/wav',
    fileName: 'recording.wav',
    language: 'zh',
    prompt: '角色名为米娅。',
  });
  const body = decodeMultipart(request);
  assert.match(body, /name="model"\r\n\r\ngpt-transcribe/);
  assert.match(body, /name="languages\[\]"\r\n\r\nzh/);
  assert.match(body, /name="prompt"\r\n\r\n角色名为米娅。/);
  assert.doesNotMatch(body, /name="language"\r\n/);
  assert.doesNotMatch(body, /name="response_format"\r\n/);
  console.log('ok - GPT Transcribe uses the current languages array contract');
}

{
  const request = buildVoiceTranscriptionRequest({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'openai-test',
    model: 'gpt-transcribe-2026-08-11',
  }, {
    audioBytes: new Uint8Array([1, 2, 3, 4]),
    mimeType: 'audio/wav',
    language: 'zh',
  });
  const body = decodeMultipart(request);
  assert.match(body, /name="languages\[\]"\r\n\r\nzh/);
  assert.doesNotMatch(body, /name="language"\r\n/);
  assert.doesNotMatch(body, /name="response_format"\r\n/);
  assert.throws(
    () => buildVoiceTranscriptionRequest({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-test',
      model: 'gpt-live-transcribe',
    }, { audioBytes: new Uint8Array([1]), mimeType: 'audio/wav' }),
    /不支持实时转写模型/,
  );
  assert.throws(
    () => buildVoiceTranscriptionRequest({
      provider: 'openai',
      baseUrl: 'https://api.openai.com/v1',
      apiKey: 'openai-test',
      model: 'gpt-4o-transcribe-diarize',
    }, { audioBytes: new Uint8Array([1]), mimeType: 'audio/wav' }),
    /不支持说话人分离模型/,
  );
  console.log('ok - OpenAI STT routes GPT Transcribe snapshots and rejects unsupported specialized models');
}

{
  const speech = buildVoiceSpeechRequest({
    provider: 'qwen_local',
    apiKey: 'must-not-leak-to-local-service',
    baseUrl: 'http://127.0.0.1:8765/v1',
    model: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    ttsVoice: 'Vivian',
  }, { text: '这是本地语音测试。' });
  assert.equal(speech.url, 'http://127.0.0.1:8765/v1/audio/speech');
  assert.equal(speech.headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(speech.body), {
    model: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice',
    input: '这是本地语音测试。',
    voice: 'Vivian',
    response_format: 'pcm',
  });

  const transcription = buildVoiceTranscriptionRequest({
    provider: 'qwen_local',
    apiKey: 'must-not-leak-to-local-service',
    baseUrl: 'http://127.0.0.1:8765/v1',
    model: 'Qwen/Qwen3-ASR-0.6B',
  }, {
    audioBytes: new Uint8Array([82, 73, 70, 70]),
    mimeType: 'audio/wav',
  });
  assert.equal(transcription.url, 'http://127.0.0.1:8765/v1/audio/transcriptions');
  assert.equal(transcription.headers.Authorization, undefined);
  assert.match(decodeMultipart(transcription), /name="model"\r\n\r\nQwen\/Qwen3-ASR-0\.6B/);
  console.log('ok - Qwen local voice uses the shared keyless OpenAI-compatible contract');
}

{
  const groq = buildVoiceTranscriptionRequest({
    provider: 'groq',
    baseUrl: 'https://api.groq.com/openai/v1',
    apiKey: 'groq-test',
    model: 'whisper-large-v3-turbo',
  }, {
    audioBytes: new Uint8Array([1, 2]),
    mimeType: 'audio/webm',
  });
  assert.equal(groq.url, 'https://api.groq.com/openai/v1/audio/transcriptions');
  assert.equal(groq.headers.Authorization, 'Bearer groq-test');
  assert.match(decodeMultipart(groq), /name="model"\r\n\r\nwhisper-large-v3-turbo/);

  const eleven = buildVoiceTranscriptionRequest({
    provider: 'elevenlabs',
    baseUrl: 'https://api.elevenlabs.io/v1',
    apiKey: 'eleven-test',
    model: 'scribe_v2',
  }, {
    audioBytes: new Uint8Array([1, 2]),
    mimeType: 'audio/webm',
  });
  assert.equal(eleven.url, 'https://api.elevenlabs.io/v1/speech-to-text');
  assert.equal(eleven.headers['xi-api-key'], 'eleven-test');
  assert.match(decodeMultipart(eleven), /name="model_id"\r\n\r\nscribe_v2/);
  console.log('ok - Groq and ElevenLabs STT select their documented endpoints and fields');
}

{
  const calls = [];
  let readCount = 0;
  const client = new VoiceClient({
    invoke: async (command, args) => {
      calls.push({ command, args });
      if (command === 'http_stream_request_start') return true;
      if (command === 'http_stream_request_read') {
        readCount += 1;
        if (readCount === 1) {
          return {
            status: 200,
            ok: true,
            chunks: [Buffer.from([0, 1, 2, 3]).toString('base64')],
            done: false,
          };
        }
        return { status: 200, ok: true, chunks: [], done: true };
      }
      return true;
    },
  });
  const received = [];
  for await (const chunk of client.streamSpeech({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'key',
    model: 'gpt-4o-mini-tts',
    ttsVoice: 'marin',
  }, { text: '测试' })) {
    received.push(...chunk);
  }
  assert.deepEqual(received, [0, 1, 2, 3]);
  const start = calls.find(call => call.command === 'http_stream_request_start');
  assert.equal(start.args.responseBase64, true);
  assert.equal(calls.some(call => call.command === 'http_stream_request_close'), true);
  console.log('ok - VoiceClient decodes native base64 audio chunks without waiting for the full response');
}

{
  let nativeRequest = null;
  const client = new VoiceClient({
    invoke: async (command, args) => {
      assert.equal(command, 'http_request');
      nativeRequest = args;
      return {
        status: 200,
        ok: true,
        body: JSON.stringify({
          data: [
            { id: 'Qwen/Qwen3-TTS-12Hz-0.6B-CustomVoice' },
            { id: 'Qwen/Qwen3-ASR-0.6B' },
          ],
        }),
      };
    },
  });
  const models = await client.listModels({
    provider: 'qwen_local',
    baseUrl: 'http://127.0.0.1:8765/v1',
  }, { capability: 'stt' });
  assert.deepEqual(models, ['Qwen/Qwen3-ASR-0.6B']);
  assert.equal(nativeRequest.method, 'GET');
  assert.equal(nativeRequest.url, 'http://127.0.0.1:8765/v1/models');
  assert.equal(nativeRequest.body, null);
  console.log('ok - VoiceClient discovers capability-specific models through native HTTP');
}

{
  let nativeRequest = null;
  const client = new VoiceClient({
    invoke: async (command, args) => {
      if (command === 'http_request') {
        nativeRequest = args;
        return {
          status: 200,
          ok: true,
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ text: '请帮我整理今天的任务。' }),
        };
      }
      return false;
    },
  });
  const text = await client.transcribe({
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    apiKey: 'key',
    model: 'gpt-4o-mini-transcribe',
  }, {
    audio: new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
  });
  assert.equal(text, '请帮我整理今天的任务。');
  assert.equal(typeof nativeRequest.bodyBase64, 'string');
  assert.equal(nativeRequest.body, null);
  console.log('ok - VoiceClient transcribes a browser recording through native HTTP without CORS');
}
