/**
 * OpenAI API 适配器
 */

import { handleSSE } from '../stream.js';
import { createLinkedAbortController, splitRequestOptions } from '../abort.js';

const getTauriInvoker = () => {
  const g = typeof globalThis !== 'undefined' ? globalThis : undefined;
  // Tauri v2 typically exposes __TAURI__.core.invoke; some builds expose __TAURI_INVOKE__.
  const inv =
    g?.__TAURI__?.core?.invoke ||
    g?.__TAURI__?.invoke ||
    g?.__TAURI_INVOKE__ ||
    g?.__TAURI_INTERNALS__?.invoke;
  return inv;
};

const isTauriWebview = () => {
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : undefined;
    const origin = String(g?.location?.origin || '');
    return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || origin.includes('tauri.localhost'));
  } catch (_e) {
    return false;
  }
};

const parseSSEText = function* (text) {
  const raw = String(text ?? '');
  const lines = raw.split('\n');
  for (const line of lines) {
    if (!line.startsWith('data: ')) continue;
    const data = line.slice(6).trim();
    if (!data || data === '[DONE]') continue;
    try {
      yield JSON.parse(data);
    } catch (_e) {
      // ignore partial/invalid lines
    }
  }
};

const makeAbortError = () => {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
};

const estimateOpenAIRequestChars = ({ model, messages, stream, options } = {}) => {
  const arr = Array.isArray(messages) ? messages : [];
  let n = 0;
  n += String(model || '').length + 64;
  n += stream ? 32 : 16;
  n += (options && typeof options === 'object') ? 256 : 0;
  for (const m of arr) {
    if (!m || typeof m !== 'object') continue;
    n += 64;
    if (typeof m.role === 'string') n += m.role.length;
    if (typeof m.name === 'string') n += m.name.length;
    if (Array.isArray(m.content)) {
      for (const part of m.content) {
        if (!part || typeof part !== 'object') continue;
        if (typeof part.text === 'string') n += part.text.length;
        const imageUrl = part?.image_url?.url;
        if (typeof imageUrl === 'string') n += imageUrl.length;
        const audioData = part?.input_audio?.data;
        if (typeof audioData === 'string') n += audioData.length;
      }
    } else if (typeof m.content === 'string') {
      n += m.content.length;
    }
  }
  return n;
};

export class OpenAIProvider {
  constructor(config) {
    this.provider = config.provider || 'openai';
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'https://api.openai.com/v1';
    this.model = config.model || 'gpt-3.5-turbo';
    this.timeout = config.timeout || 60000;
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.apiKey}`,
    };
  }

  canUseNativeHttp() {
    try {
      return typeof getTauriInvoker() === 'function';
    } catch (_e) {
      return false;
    }
  }

  normalizeOptions(options = {}) {
    const src = (options && typeof options === 'object') ? options : {};
    const out = {};

    // Common OpenAI-compatible parameters
    if (typeof src.temperature === 'number') out.temperature = src.temperature;
    if (typeof src.top_p === 'number') out.top_p = src.top_p;
    if (typeof src.presence_penalty === 'number') out.presence_penalty = src.presence_penalty;
    if (typeof src.frequency_penalty === 'number') out.frequency_penalty = src.frequency_penalty;

    // Token limits
    if (Number.isFinite(src.max_tokens)) out.max_tokens = Math.trunc(src.max_tokens);
    if (Number.isFinite(src.maxTokens) && !Number.isFinite(out.max_tokens)) out.max_tokens = Math.trunc(src.maxTokens);

    // stop can be string or array
    if (typeof src.stop === 'string' || Array.isArray(src.stop)) out.stop = src.stop;

    // Some servers reject unsupported fields (DeepSeek is stricter).
    const isDeepSeek = String(this.provider || '').toLowerCase() === 'deepseek';
    if (!isDeepSeek) {
      if (Number.isFinite(src.n)) out.n = Math.trunc(src.n);
      if (Number.isFinite(src.seed)) out.seed = Math.trunc(src.seed);
    }

    return out;
  }

  extractErrorDetail(bodyText) {
    const raw = String(bodyText ?? '').trim();
    if (!raw) return '';
    try {
      const j = JSON.parse(raw);
      const msg = j?.error?.message || j?.message || j?.detail || j?.error || '';
      if (msg) return String(msg);
    } catch (_e) {}
    return raw.length > 400 ? `${raw.slice(0, 400)}…` : raw;
  }

  async request({ url, method = 'GET', headers = {}, body = undefined, signal, requestId = '' } = {}) {
    const mergedHeaders = { ...headers };
    const invoker = getTauriInvoker();
    if (typeof invoker === 'function') {
      if (signal?.aborted) throw makeAbortError();
      try {
        return await invoker('http_request', {
          url,
          method,
          headers: mergedHeaders,
          body: typeof body === 'string' ? body : body == null ? null : String(body),
          timeout_ms: this.timeout,
          request_id: requestId || null,
        });
      } catch (err) {
        if (isTauriWebview()) {
          const e = new Error(`native http_request failed: ${err?.message || err}`);
          e.cause = err;
          throw e;
        }
        console.warn('native http_request failed, fallback to fetch:', err);
      }
    }

    const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal });
    try {
      const response = await fetch(url, {
        method,
        headers: mergedHeaders,
        signal: controller.signal,
        body,
      });
      const text = await response.text();
      const outHeaders = {};
      response.headers.forEach((v, k) => {
        outHeaders[k] = v;
      });
      return { status: response.status, ok: response.ok, headers: outHeaders, body: text };
    } finally {
      cleanup();
    }
  }

  async requestJson({ url, method = 'GET', headers = {}, body = undefined, signal, requestId = '' } = {}) {
    const res = await this.request({ url, method, headers, body, signal, requestId });
    if (!res.ok) {
      const detail = this.extractErrorDetail(res.body);
      const error = new Error(`OpenAI API Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
      error.status = res.status;
      error.response = res.body;
      throw error;
    }
    try {
      return JSON.parse(res.body || '{}');
    } catch (e) {
      const error = new Error(`Invalid JSON response: ${e.message}`);
      error.status = res.status;
      error.response = res.body;
      throw error;
    }
  }

  /**
   * 发送聊天消息（非流式）
   */
  async chat(messages, options = {}) {
    const { signal, requestId, options: payloadOptions } = splitRequestOptions(options);
    const normalized = this.normalizeOptions(payloadOptions);
    const estimatedChars = estimateOpenAIRequestChars({
      model: this.model,
      messages,
      stream: false,
      options: normalized,
    });
    if (estimatedChars > 1_800_000) {
      throw new Error(
        `请求过大（约 ${Math.round(estimatedChars / 1024)} KB），可能导致 Android WebView OOM；请减少历史/摘要/世界书注入或清理该聊天室。`,
      );
    }
    const data = await this.requestJson({
      url: `${this.baseUrl}/chat/completions`,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model: this.model,
        messages: messages,
        stream: false,
        ...normalized,
      }),
      signal,
      requestId,
    });

    return data.choices?.[0]?.message?.content ?? '';
  }

  /**
   * 流式聊天
   */
  async *streamChat(messages, options = {}) {
    const { signal, requestId, options: payloadOptions } = splitRequestOptions(options);
    const normalized = this.normalizeOptions(payloadOptions);
    const estimatedChars = estimateOpenAIRequestChars({
      model: this.model,
      messages,
      stream: true,
      options: normalized,
    });
    if (estimatedChars > 1_800_000) {
      throw new Error(
        `请求过大（约 ${Math.round(estimatedChars / 1024)} KB），可能导致 Android WebView OOM；请减少历史/摘要/世界书注入或清理该聊天室。`,
      );
    }
    const payload = JSON.stringify({
      model: this.model,
      messages: messages,
      stream: true,
      ...normalized,
    });

    if (this.canUseNativeHttp()) {
      if (signal?.aborted) throw makeAbortError();
      const res = await this.request({
        url: `${this.baseUrl}/chat/completions`,
        method: 'POST',
        headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
        body: payload,
        signal,
        requestId,
      });
      if (!res.ok) {
        const detail = this.extractErrorDetail(res.body);
        const error = new Error(`OpenAI API Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
        error.status = res.status;
        error.response = res.body;
        throw error;
      }
      for (const data of parseSSEText(res.body)) {
        const content = data.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
      return;
    }

    const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal });
    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
        signal: controller.signal,
        body: payload,
      });

      if (!response.ok) {
        const txt = await response.text();
        const detail = this.extractErrorDetail(txt);
        const error = new Error(`OpenAI API Error: ${response.status}${detail ? ` - ${detail}` : ''}`);
        error.status = response.status;
        error.response = txt;
        throw error;
      }

      for await (const data of handleSSE(response)) {
        const content = data.choices?.[0]?.delta?.content;
        if (content) {
          yield content;
        }
      }
    } finally {
      cleanup();
    }
  }

  /**
   * 生成图片
   * @param {string} prompt
   * @param {Object} options
   */
  async generateImage(prompt, options = {}) {
    const payload = {
      model: this.model,
      prompt: String(prompt || '').trim(),
      n: Number.isFinite(options.n) ? Math.trunc(options.n) : 1,
    };
    const responseFormat = options.responseFormat || options.response_format || 'b64_json';
    if (responseFormat) payload.response_format = responseFormat;
    if (options.size) payload.size = options.size;
    if (options.quality) payload.quality = options.quality;
    if (options.style) payload.style = options.style;

    const data = await this.requestJson({
      url: `${this.baseUrl}/images/generations`,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(payload),
    });

    const list = Array.isArray(data?.data) ? data.data : [];
    return list.map((item, index) => {
      const b64 = item?.b64_json || item?.b64 || '';
      if (b64) {
        return { dataUrl: `data:image/png;base64,${b64}`, index };
      }
      const url = String(item?.url || '').trim();
      return { url, index };
    });
  }

  /**
   * 获取可用模型列表
   */
  async listModels() {
    const data = await this.requestJson({
      url: `${this.baseUrl}/models`,
      method: 'GET',
      headers: this.getHeaders(),
    });

    return (data.data || []).filter(m => m.id.includes('gpt')).map(m => m.id);
  }

  /**
   * 健康检查
   */
  async healthCheck() {
    try {
      await this.listModels();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
}
