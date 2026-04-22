/**
 * 自定义 API 适配器
 * 支持兼容 OpenAI 格式的自建 API
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
     * 发送聊天消息（非流式）
     */
    async chat(messages, options = {}) {
        const { signal, requestId, options: payloadOptions } = splitRequestOptions(options);
        const data = await this.requestJson({
            url: `${this.baseUrl}/chat/completions`,
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model: this.model,
                messages: messages,
                stream: false,
                ...payloadOptions
            }),
            signal,
            requestId,
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
        const { signal, requestId, options: payloadOptions } = splitRequestOptions(options);
        const payload = JSON.stringify({
            model: this.model,
            messages: messages,
            stream: true,
            ...payloadOptions
        });

        const invoker = getTauriInvoker();
        if (typeof invoker === 'function') {
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
                const content =
                    data.choices?.[0]?.delta?.content ||
                    data.choices?.[0]?.text ||
                    data.delta?.content ||
                    data.content;
                if (content) yield content;
            }
            return;
        }

        const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal });
        try {
            const prepared = prepareTransportRequest({
                config: this.transportConfig,
                provider: this.provider,
                url: `${this.baseUrl}/chat/completions`,
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
                const content =
                    data.choices?.[0]?.delta?.content ||
                    data.choices?.[0]?.text ||
                    data.delta?.content ||
                    data.content;

                if (content) {
                    yield content;
                }
            }
        } finally {
            cleanup();
        }
    }

    /**
     * 生成图片（OpenAI 兼容 /images/generations）
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
