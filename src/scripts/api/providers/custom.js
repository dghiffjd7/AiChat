/**
 * 自定义 API 适配器
 * 支持兼容 OpenAI 格式的自建 API
 */

import { handleSSE } from '../stream.js';
import { createLinkedAbortController, splitRequestOptions } from '../abort.js';
import {
    createReasoningStreamEvent,
    extractOpenAICompatibleStreamParts,
} from '../native-reasoning.js';
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

const normalizeNonNegativeSeed = (value) => {
    if (String(value ?? '').trim() === '') return undefined;
    const seed = Math.trunc(Number(value));
    if (!Number.isFinite(seed) || seed < 0) return undefined;
    return seed;
};

const buildEndpointUrl = (baseUrl, path) => {
    const base = String(baseUrl || '').replace(/\/+$/, '');
    const nextPath = String(path || '').replace(/^\/+/, '');
    return `${base}/${nextPath}`;
};

const isOfficialGeminiOpenAIEndpoint = (baseUrl) => {
    try {
        const url = new URL(String(baseUrl || '').trim());
        return (
            url.hostname === 'generativelanguage.googleapis.com' &&
            url.pathname.split('/').filter(Boolean).includes('openai')
        );
    } catch (_e) {
        return false;
    }
};

const normalizeOpenAICompatiblePayloadOptions = (options = {}, { officialGeminiOpenAIEndpoint = false } = {}) => {
    const out = { ...(options && typeof options === 'object' ? options : {}) };
    if (officialGeminiOpenAIEndpoint) {
        delete out.deepseekPrefix;
        delete out.thinkingBudget;
        delete out.thinkingLevel;
        delete out.stream;
    }

    if (Object.hasOwn(out, 'seed')) {
        const seed = normalizeNonNegativeSeed(out.seed);
        if (seed === undefined || officialGeminiOpenAIEndpoint) {
            delete out.seed;
        } else {
            out.seed = seed;
        }
    }
    if (officialGeminiOpenAIEndpoint && Object.hasOwn(out, 'n')) {
        const n = Math.trunc(Number(out.n));
        if (!Number.isFinite(n) || n <= 1) {
            delete out.n;
        } else {
            out.n = n;
        }
    }
    if (officialGeminiOpenAIEndpoint && Object.hasOwn(out, 'presence_penalty')) {
        const value = Number(out.presence_penalty);
        if (!Number.isFinite(value) || value === 0) {
            delete out.presence_penalty;
        } else {
            out.presence_penalty = value;
        }
    }
    if (officialGeminiOpenAIEndpoint && Object.hasOwn(out, 'frequency_penalty')) {
        const value = Number(out.frequency_penalty);
        if (!Number.isFinite(value) || value === 0) {
            delete out.frequency_penalty;
        } else {
            out.frequency_penalty = value;
        }
    }
    return out;
};

export class CustomProvider {
    constructor(config) {
        this.transportConfig = config || {};
        this.provider = config.provider || 'custom';
        this.apiKey = config.apiKey || '';
        this.baseUrl = config.baseUrl;
        this.model = config.model || 'default';
        this.timeout = config.timeout || 60000;
    }

    getHeaders() {
        const headers = {
            'Content-Type': 'application/json'
        };

        if (this.apiKey) {
            headers['Authorization'] = `Bearer ${this.apiKey}`;
        }

        return headers;
    }

    async request({ url, method = 'GET', headers = {}, body = undefined, signal, requestId = '' } = {}) {
        const prepared = prepareTransportRequest({
            config: this.transportConfig,
            provider: this.provider,
            url,
            headers,
        });
        const mergedHeaders = { ...(prepared.headers || {}) };
        const invoker = getTauriInvoker();
        if (typeof invoker === 'function') {
            if (signal?.aborted) throw makeAbortError();
            try {
                return await invoker('http_request', {
                    url: prepared.url,
                    method,
                    headers: mergedHeaders,
                    body: typeof body === 'string' ? body : body == null ? null : String(body),
                    timeoutMs: this.timeout,
                    requestId: requestId || null,
                });
            } catch (err) {
                if (isTauriWebview()) {
                    const e = new Error(`native http_request failed: ${err?.message || err}`);
                    e.cause = err;
                    throw e;
                }
                // Non-Tauri fallback
            }
        }

        const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal });
        try {
            const response = await fetch(prepared.url, {
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
            const raw = String(res.body || '').trim();
            let detail = '';
            try {
                const j = JSON.parse(raw);
                detail = String(j?.error?.message || j?.message || j?.detail || j?.error || '').trim();
            } catch (_e) {}
            const error = new Error(`Custom API Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
            error.status = res.status;
            error.response = res.body;
            throw error;
        }
        return JSON.parse(res.body || '{}');
    }

    /**
     * 准备聊天请求，供发送链路和调试面板复用同一份实际 payload。
     */
    prepareChatRequest(messages, options = {}) {
        const { signal, requestId, onProviderToolCallDelta, options: rawPayloadOptions } = splitRequestOptions(options);
        const officialGeminiOpenAIEndpoint = isOfficialGeminiOpenAIEndpoint(this.baseUrl);
        const normalizedOptions = normalizeOpenAICompatiblePayloadOptions(rawPayloadOptions, {
            officialGeminiOpenAIEndpoint,
        });
        const payloadMessages = Array.isArray(messages) ? messages : [];
        const payload = {
            model: this.model,
            messages: payloadMessages,
            ...normalizedOptions,
        };
        return {
            signal,
            requestId,
            onProviderToolCallDelta,
            url: officialGeminiOpenAIEndpoint
                ? buildEndpointUrl(this.baseUrl, 'chat/completions')
                : `${this.baseUrl}/chat/completions`,
            payload,
            messages: payloadMessages,
            normalizedOptions,
            responsePrefix: '',
        };
    }

    /**
     * 发送聊天消息（非流式）
     */
    async chat(messages, options = {}) {
        const request = this.prepareChatRequest(messages, options);
        const data = await this.requestJson({
            url: request.url,
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                ...request.payload,
                stream: false,
            }),
            signal: request.signal,
            requestId: request.requestId,
        });

        if (data.choices && data.choices[0]) {
            return data.choices[0].message?.content || data.choices[0].text || '';
        } else if (data.response) {
            return data.response;
        } else if (data.content) {
            return data.content;
        }

        throw new Error('Unknown response format');
    }

    /**
     * 流式聊天
     */
    async *streamChat(messages, options = {}) {
        const request = this.prepareChatRequest(messages, options);
        const notifyProviderToolCallDelta = data => {
            try {
                request.onProviderToolCallDelta?.(data, { provider: this.provider || 'custom', model: this.model });
            } catch {}
        };
        const payload = JSON.stringify({
            ...request.payload,
            stream: true,
        });

        const invoker = getTauriInvoker();
        if (typeof invoker === 'function') {
            if (request.signal?.aborted) throw makeAbortError();
            const res = await this.request({
                url: request.url,
                method: 'POST',
                headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
                body: payload,
                signal: request.signal,
                requestId: request.requestId,
            });
            if (!res.ok) {
                const raw = String(res.body || '').trim();
                let detail = '';
                try {
                    const j = JSON.parse(raw);
                    detail = String(j?.error?.message || j?.message || j?.detail || j?.error || '').trim();
                } catch (_e) {}
                const error = new Error(`Custom API Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
                error.status = res.status;
                error.response = res.body;
                throw error;
            }
            for (const data of parseSSEText(res.body)) {
                notifyProviderToolCallDelta(data);
                const parts = extractOpenAICompatibleStreamParts(data);
                if (parts.reasoning) {
                    yield createReasoningStreamEvent(parts.reasoning, { provider: this.provider || 'custom' });
                }
                if (parts.content) yield parts.content;
            }
            return;
        }

        const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal: request.signal });
        try {
            const prepared = prepareTransportRequest({
                config: this.transportConfig,
                provider: this.provider,
                url: request.url,
                headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
            });
            const response = await fetch(prepared.url, {
                method: 'POST',
                headers: prepared.headers,
                signal: controller.signal,
                body: payload
            });

            if (!response.ok) {
                const txt = await response.text();
                let detail = '';
                try {
                    const j = JSON.parse(String(txt || '').trim());
                    detail = String(j?.error?.message || j?.message || j?.detail || j?.error || '').trim();
                } catch (_e) {}
                const error = new Error(`Custom API Error: ${response.status}${detail ? ` - ${detail}` : ''}`);
                error.status = response.status;
                error.response = txt;
                throw error;
            }

            for await (const data of handleSSE(response)) {
                notifyProviderToolCallDelta(data);
                const parts = extractOpenAICompatibleStreamParts(data);
                if (parts.reasoning) {
                    yield createReasoningStreamEvent(parts.reasoning, { provider: this.provider || 'custom' });
                }
                if (parts.content) yield parts.content;
            }
        } finally {
            cleanup();
        }
    }

    /**
     * 生成图片（OpenAI 兼容 /images/generations）
     */
    async generateImage(prompt, options = {}) {
        const { signal } = options || {};
        const payload = {
            model: this.model,
            prompt: String(prompt || '').trim(),
            n: Number.isFinite(options.n) ? Math.trunc(options.n) : 1,
        };
        const responseFormat = options.responseFormat || options.response_format || '';
        if (responseFormat) payload.response_format = responseFormat;
        if (options.size) payload.size = options.size;
        if (options.quality) payload.quality = options.quality;
        if (options.style) payload.style = options.style;
        const seed = normalizeNonNegativeSeed(options.seed);
        if (seed !== undefined) payload.seed = seed;

        const data = await this.requestJson({
            url: `${this.baseUrl}/images/generations`,
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify(payload),
            signal,
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
        try {
            const res = await this.request({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: this.getHeaders(),
            });
            if (!res.ok) return [this.model];
            const data = JSON.parse(res.body || '{}');
            if (Array.isArray(data)) return data.map(m => m.id || m.name || m);
            if (data.data && Array.isArray(data.data)) return data.data.map(m => m.id || m.name || m);
            return [this.model];
        } catch (error) {
            console.warn('Failed to fetch models:', error);
            return [this.model];
        }
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            const testMessages = [{ role: 'user', content: 'test' }];
            await this.chat(testMessages, { max_tokens: 5 });
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }
}
