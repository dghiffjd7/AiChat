/**
 * Google Vertex AI Provider
 * Supports both Express mode (API key) and Full mode (Service Account JSON)
 */

import { handleSSE } from '../stream.js';
import { createLinkedAbortController, splitRequestOptions } from '../abort.js';
import { prepareTransportRequest } from '../transport.js';

const getTauriInvoker = () => {
  const g = typeof globalThis !== 'undefined' ? globalThis : undefined;
  return (
    g?.__TAURI__?.core?.invoke ||
    g?.__TAURI__?.invoke ||
    g?.__TAURI_INVOKE__ ||
    g?.__TAURI_INTERNALS__?.invoke
  );
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

const b64UrlFromBytes = (bytes) => {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const b64UrlFromJson = (obj) => {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  return b64UrlFromBytes(bytes);
};

const pemToArrayBuffer = (pem) => {
  const raw = String(pem || '')
    .replace(/-----BEGIN [^-]+-----/g, '')
    .replace(/-----END [^-]+-----/g, '')
    .replace(/\s+/g, '');
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
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
    } catch (_e) {}
  }
};

const makeAbortError = () => {
  const err = new Error('Aborted');
  err.name = 'AbortError';
  return err;
};

const request = async ({
  provider = 'vertexai',
  transportConfig = null,
  url,
  method = 'GET',
  headers = {},
  body = undefined,
  timeoutMs = 60000,
  signal,
  requestId = '',
  allowProxy = true,
} = {}) => {
  const prepared = prepareTransportRequest({
    config: transportConfig,
    provider,
    url,
    headers,
    allowProxy,
  });
  const invoker = getTauriInvoker();
  if (typeof invoker === 'function') {
    if (signal?.aborted) throw makeAbortError();
    return invoker('http_request', {
      url: prepared.url,
      method,
      headers: prepared.headers,
      body: typeof body === 'string' ? body : body == null ? null : String(body),
      timeoutMs,
      requestId: requestId || null,
    });
  }

  if (isTauriWebview()) {
    throw new Error('Tauri invoke not available for Vertex AI; cannot use fetch due to CORS');
  }

  const { controller, cleanup } = createLinkedAbortController({ timeoutMs, signal });
  try {
    const resp = await fetch(prepared.url, {
      method,
      headers: prepared.headers,
      body,
      signal: controller.signal,
    });
    const text = await resp.text();
    const outHeaders = {};
    resp.headers.forEach((v, k) => { outHeaders[k] = v; });
    return { status: resp.status, ok: resp.ok, headers: outHeaders, body: text };
  } finally {
    cleanup();
  }
};

const requestJson = async ({
  provider = 'vertexai',
  transportConfig = null,
  url,
  method = 'GET',
  headers = {},
  body = undefined,
  timeoutMs = 60000,
  signal,
  requestId = '',
  allowProxy = true,
} = {}) => {
  const res = await request({
    provider,
    transportConfig,
    url,
    method,
    headers,
    body,
    timeoutMs,
    signal,
    requestId,
    allowProxy,
  });
  if (!res.ok) {
    const raw = String(res.body || '').trim();
    let detail = '';
    try {
      const j = JSON.parse(raw);
      detail = String(j?.error?.message || j?.message || j?.error || '').trim();
    } catch (_e) {}
    const err = new Error(`Vertex AI Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
    err.status = res.status;
    err.response = res.body;
    throw err;
  }
  return JSON.parse(res.body || '{}');
};

const GEMINI_SAFETY = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

const getHostForRegion = (region) => {
  const r = String(region || '').trim() || 'us-central1';
  return r === 'global' ? 'https://aiplatform.googleapis.com' : `https://${r}-aiplatform.googleapis.com`;
};

export class VertexAIProvider {
  constructor(config) {
    this.transportConfig = config || {};
    this.timeout = config.timeout || 60000;
    this.model = config.model || 'gemini-2.0-flash-exp';
    this.region = config.vertexaiRegion || 'us-central1';

    // Check if using Service Account JSON or API key
    this.serviceAccountJson = config.vertexaiServiceAccount;
    this.apiKey = config.apiKey;

    // Extract Project ID from Service Account JSON if available
    if (this.serviceAccountJson) {
      try {
        const sa = typeof this.serviceAccountJson === 'string'
          ? JSON.parse(this.serviceAccountJson)
          : this.serviceAccountJson;
        this.projectId = sa.project_id;
      } catch (e) {
        console.warn('Failed to parse Service Account JSON:', e);
      }
    }

    // Fall back to explicit projectId if provided
    if (!this.projectId) {
      this.projectId = config.vertexaiProjectId;
    }

    const derivedHost = getHostForRegion(this.region);
    const baseUrl = String(config.baseUrl || '').trim();
    // If user provided a valid aiplatform host, respect it; otherwise derive from region (ST-like behavior).
    this.baseUrl = (baseUrl && baseUrl.includes('aiplatform.googleapis.com')) ? baseUrl : derivedHost;
    this.baseHost = this.baseUrl;

    // Cache for OAuth2 token
    this.accessToken = null;
    this.tokenExpiry = 0;
  }

  /**
   * Get OAuth2 access token from Service Account JSON
   */
  async getAccessToken() {
    // Check if we have a cached valid token
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    if (!this.serviceAccountJson) {
      throw new Error('Service Account JSON is required for Vertex AI authentication');
    }

    try {
      // Parse service account JSON
      const serviceAccount = typeof this.serviceAccountJson === 'string'
        ? JSON.parse(this.serviceAccountJson)
        : this.serviceAccountJson;

      if (!serviceAccount?.client_email || !serviceAccount?.private_key) {
        throw new Error('Invalid Service Account JSON (missing client_email/private_key)');
      }

      if (!globalThis?.crypto?.subtle) {
        throw new Error('WebCrypto 不可用，无法在前端签名 Vertex AI JWT');
      }

      // Create JWT for OAuth2 (same approach as SillyTavern backend, but sign via WebCrypto in WebView)
      const header = {
        alg: 'RS256',
        typ: 'JWT',
        kid: serviceAccount.private_key_id,
      };

      const now = Math.floor(Date.now() / 1000);
      const payload = {
        iss: serviceAccount.client_email,
        sub: serviceAccount.client_email,
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
        scope: 'https://www.googleapis.com/auth/cloud-platform',
      };

      const headerB64 = b64UrlFromJson(header);
      const payloadB64 = b64UrlFromJson(payload);
      const signingInput = `${headerB64}.${payloadB64}`;

      const keyBuf = pemToArrayBuffer(serviceAccount.private_key);
      const cryptoKey = await crypto.subtle.importKey(
        'pkcs8',
        keyBuf,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['sign']
      );

      const sigBuf = await crypto.subtle.sign(
        { name: 'RSASSA-PKCS1-v1_5' },
        cryptoKey,
        new TextEncoder().encode(signingInput)
      );
      const sigB64 = b64UrlFromBytes(new Uint8Array(sigBuf));
      const jwt = `${signingInput}.${sigB64}`;

      const form = new URLSearchParams();
      form.set('grant_type', 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      form.set('assertion', jwt);

      const tok = await requestJson({
        provider: 'vertexai',
        transportConfig: this.transportConfig,
        url: 'https://oauth2.googleapis.com/token',
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form.toString(),
        timeoutMs: this.timeout,
        allowProxy: false,
      });

      const accessToken = String(tok?.access_token || '').trim();
      const expiresIn = Number(tok?.expires_in || 3600);
      if (!accessToken) throw new Error('Failed to obtain access_token');

      this.accessToken = accessToken;
      // refresh slightly earlier
      this.tokenExpiry = Date.now() + Math.max(30, expiresIn - 30) * 1000;
      return this.accessToken;

    } catch (error) {
      throw new Error(`Failed to authenticate with Service Account: ${error.message}`);
    }
  }

  /**
   * Convert OpenAI-style messages to Gemini format
   */
  convertMessages(messages) {
    const contents = [];
    let systemInstruction = '';
    const parseDataUrl = (url) => {
      const raw = String(url || '').trim();
      if (!raw.startsWith('data:')) return null;
      const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
      if (!match) return null;
      return { mime: match[1], data: match[2] };
    };
    const toGeminiParts = (content) => {
      if (Array.isArray(content)) {
        const parts = [];
        content.forEach((part) => {
          if (!part || typeof part !== 'object') return;
          if (part.type === 'text') {
            const text = String(part.text || '');
            if (text) parts.push({ text });
            return;
          }
          if (part.type === 'image_url') {
            const url = part?.image_url?.url;
            const parsed = parseDataUrl(url);
            if (parsed?.data) {
              parts.push({ inlineData: { mimeType: parsed.mime || 'image/jpeg', data: parsed.data } });
            } else if (url) {
              parts.push({ text: `[图片] ${String(url)}` });
            }
          }
        });
        return parts.length ? parts : [{ text: '' }];
      }
      return [{ text: String(content ?? '') }];
    };
    const toSystemText = (content) => {
      if (Array.isArray(content)) {
        return content
          .map((part) => (part?.type === 'text' ? String(part.text || '') : ''))
          .filter(Boolean)
          .join('\n');
      }
      return String(content ?? '');
    };

    for (const msg of messages) {
      if (msg.role === 'system') {
        const text = toSystemText(msg.content);
        systemInstruction += (systemInstruction ? '\n\n' : '') + text;
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: toGeminiParts(msg.content),
        });
      }
    }

    return { contents, systemInstruction };
  }

  /**
   * Build the request URL
   */
  buildUrl(stream = false) {
    return this.buildUrlFor({ stream, region: this.region, baseHost: this.baseHost, model: this.model });
  }

  buildUrlFor({ stream = false, region, baseHost, model }) {
    const endpoint = stream ? 'streamGenerateContent' : 'generateContent';

    if (!this.projectId) {
      throw new Error('Vertex AI requires projectId');
    }

    const url = `${baseHost}/v1/projects/${this.projectId}/locations/${region}/publishers/google/models/${model}:${endpoint}`;
    return stream ? `${url}?alt=sse` : url;
  }

  async getHeaders() {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Use Service Account authentication if available
    if (this.serviceAccountJson) {
      const token = await this.getAccessToken();
      headers['Authorization'] = `Bearer ${token}`;
    }
    else {
      throw new Error('Vertex AI 需要 Service Account（JSON）');
    }

    return headers;
  }

  /**
   * Build request body in Gemini format
   */
  buildRequestBody(messages, options = {}) {
    const { contents, systemInstruction } = this.convertMessages(messages);

    const body = {
      contents,
      safetySettings: GEMINI_SAFETY,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        topP: options.top_p ?? 0.9,
        topK: options.top_k ?? 40,
        maxOutputTokens: options.maxTokens ?? 2048,
      },
    };

    if (Number.isFinite(options.thinkingBudget) || typeof options.thinkingLevel === 'string') {
      body.generationConfig.thinkingConfig = {};
      if (Number.isFinite(options.thinkingBudget)) {
        body.generationConfig.thinkingConfig.thinkingBudget = Math.trunc(options.thinkingBudget);
      }
      if (typeof options.thinkingLevel === 'string' && options.thinkingLevel.trim()) {
        body.generationConfig.thinkingConfig.thinkingLevel = String(options.thinkingLevel).trim();
      }
    }

    if (systemInstruction) {
      body.systemInstruction = {
        role: 'user',
        parts: [{ text: systemInstruction }],
      };
    }

    return body;
  }

  /**
   * Send chat message (non-streaming)
   */
  async chat(messages, options = {}) {
    const { signal, requestId, options: payloadOptions } = splitRequestOptions(options);
    const headers = await this.getHeaders();
    const body = this.buildRequestBody(messages, payloadOptions);
    const tryOnce = async ({ region, baseHost }) => {
      const url = this.buildUrlFor({ stream: false, region, baseHost, model: this.model });
      return requestJson({
        provider: 'vertexai',
        transportConfig: this.transportConfig,
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeoutMs: this.timeout,
        signal,
        requestId,
      });
    };

    let data;
    try {
      data = await tryOnce({ region: this.region, baseHost: this.baseHost });
    } catch (err) {
      // Some Gemini models are only available in `global` location; ST can still use them.
      if (err?.status === 404 && this.region !== 'global') {
        data = await tryOnce({ region: 'global', baseHost: getHostForRegion('global') });
      } else {
        throw err;
      }
    }

    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      let errorMsg = 'No candidates returned';
      if (data?.promptFeedback?.blockReason) {
        errorMsg += `: ${data.promptFeedback.blockReason}`;
      }
      throw new Error(errorMsg);
    }

    const responseContent = candidates[0].content ?? candidates[0].output;
    const responseText = typeof responseContent === 'string'
      ? responseContent
      : responseContent?.parts
          ?.filter(part => !part.thought)
          ?.map(part => part.text)
          ?.join('\n\n');

    if (!responseText) {
      throw new Error('Empty response from Vertex AI');
    }

    return responseText;
  }

  /**
   * Stream chat messages
   */
  async *streamChat(messages, options = {}) {
    const { signal, requestId, options: payloadOptions } = splitRequestOptions(options);
    const headers = await this.getHeaders();
    const body = this.buildRequestBody(messages, payloadOptions);

    const invoker = getTauriInvoker();
    const tryStreamOnce = async function* ({ region, baseHost }) {
      const url = this.buildUrlFor({ stream: true, region, baseHost, model: this.model });

      if (typeof invoker === 'function') {
        if (signal?.aborted) throw makeAbortError();
        const res = await request({
          provider: 'vertexai',
          transportConfig: this.transportConfig,
          url,
          method: 'POST',
          headers: { ...headers, Accept: 'text/event-stream' },
          body: JSON.stringify(body),
          timeoutMs: this.timeout,
          signal,
          requestId,
        });
        if (!res.ok) {
          const err = new Error(`Vertex AI Error: ${res.status}`);
          err.status = res.status;
          err.response = res.body;
          throw err;
        }
        for (const data of parseSSEText(res.body)) {
          const candidates = data?.candidates;
          if (candidates && candidates.length > 0) {
            const content = candidates[0].content;
            if (content?.parts) {
              for (const part of content.parts) {
                if (part.text) yield part.text;
              }
            }
          }
        }
        return;
      }

      // Browser fallback
      const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal });
      try {
        const prepared = prepareTransportRequest({
          config: this.transportConfig,
          provider: 'vertexai',
          url,
          headers: { ...headers, Accept: 'text/event-stream' },
        });
        const response = await fetch(prepared.url, {
          method: 'POST',
          headers: prepared.headers,
          signal: controller.signal,
          body: JSON.stringify(body),
        });
        if (!response.ok) {
          const errorText = await response.text();
          const err = new Error(`Vertex AI Error: ${response.status} ${errorText}`);
          err.status = response.status;
          throw err;
        }
        for await (const data of handleSSE(response)) {
          const candidates = data?.candidates;
          if (candidates && candidates.length > 0) {
            const content = candidates[0].content;
            if (content?.parts) {
              for (const part of content.parts) {
                if (part.text) yield part.text;
              }
            }
          }
        }
      } finally {
        cleanup();
      }
    }.bind(this);

    try {
      yield* tryStreamOnce({ region: this.region, baseHost: this.baseHost });
      return;
    } catch (err) {
      if (err?.status === 404 && this.region !== 'global') {
        yield* tryStreamOnce({ region: 'global', baseHost: getHostForRegion('global') });
        return;
      }
      throw err;
    }
  }

  /**
   * List available models
   */
  async listModels() {
    try {
      if (!this.projectId) {
        throw new Error('Project ID required');
      }

      const headers = await this.getHeaders();
      const out = [];
      const seen = new Set();
      const collectFrom = async ({ region, baseHost }) => {
        let pageToken = '';
        const pageTokensSeen = new Set();
        let pages = 0;
        while (true) {
          const qs = new URLSearchParams();
          qs.set('pageSize', '1000');
          if (pageToken) qs.set('pageToken', pageToken);
          const url = `${baseHost}/v1/projects/${this.projectId}/locations/${region}/publishers/google/models?${qs.toString()}`;

          const data = await requestJson({
            provider: 'vertexai',
            transportConfig: this.transportConfig,
            url,
            method: 'GET',
            headers,
            timeoutMs: this.timeout,
          });
          const models = Array.isArray(data?.models) ? data.models : [];
          models.forEach((m) => {
            const id = String(m?.name || '').split('/').pop();
            if (!id) return;
            if (seen.has(id)) return;
            seen.add(id);
            out.push(id);
          });

          pageToken = String(data?.nextPageToken || '').trim();
          pages++;
          if (!pageToken) break;
          if (pageTokensSeen.has(pageToken)) break;
          pageTokensSeen.add(pageToken);
          if (pages > 200) break;
        }
      };

      await collectFrom({ region: this.region, baseHost: this.baseHost });
      if (this.region !== 'global') {
        await collectFrom({ region: 'global', baseHost: getHostForRegion('global') });
      }

      // ST usually shows a curated set; here we prefer gemini models on top.
      const gemini = out.filter(id => id.toLowerCase().includes('gemini'));
      const rest = out.filter(id => !id.toLowerCase().includes('gemini'));
      const merged = [...gemini, ...rest];
      return merged.length ? merged : this.getFallbackModels();
    } catch (error) {
      console.warn('Failed to list Vertex AI models:', error);
      return this.getFallbackModels();
    }
  }

  getFallbackModels() {
    return [
      'gemini-2.0-flash-exp',
      'gemini-2.0-flash',
      'gemini-2.0-pro-exp',
      'gemini-1.5-pro',
      'gemini-1.5-pro-002',
      'gemini-1.5-flash',
      'gemini-1.5-flash-002',
      'gemini-1.0-pro',
      'text-bison',
      'chat-bison',
    ];
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const testMessages = [{ role: 'user', content: 'Hi' }];
      await this.chat(testMessages);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  }
}
