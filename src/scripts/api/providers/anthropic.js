/**
 * Anthropic (Claude) API 适配器
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

export class AnthropicProvider {
    constructor(config) {
        this.transportConfig = config || {};
        this.apiKey = config.apiKey;
        this.baseUrl = config.baseUrl || 'https://api.anthropic.com/v1';
        this.model = config.model || 'claude-3-5-sonnet-20241022';
        this.timeout = config.timeout || 60000;
        this.apiVersion = '2023-06-01';
    }

    getHeaders() {
        return {
            'Content-Type': 'application/json',
            'x-api-key': this.apiKey,
            'anthropic-version': this.apiVersion
        };
    }

    canUseNativeHttp() {
        try {
            return typeof getTauriInvoker() === 'function';
        } catch (_e) {
            return false;
        }
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
        const prepared = prepareTransportRequest({
            config: this.transportConfig,
            provider: 'anthropic',
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
                    timeout_ms: this.timeout,
                    request_id: requestId || null,
                });
            } catch (err) {
                if (isTauriWebview()) {
                    const e = new Error(`native http_request failed: ${err?.message || err}`);
                    e.cause = err;
                    throw e;
                }
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
            const detail = this.extractErrorDetail(res.body);
            const error = new Error(`Anthropic API Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
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
     * 转换消息格式（OpenAI -> Anthropic）
     */
    convertMessages(messages) {
        const parseDataUrl = (url) => {
            const raw = String(url || '').trim();
            if (!raw.startsWith('data:')) return null;
            const match = raw.match(/^data:([^;]+);base64,(.+)$/i);
            if (!match) return null;
            return { mime: match[1], data: match[2] };
        };
        const toAnthropicContent = (content) => {
            if (Array.isArray(content)) {
                const parts = [];
                content.forEach((part) => {
                    if (!part || typeof part !== 'object') return;
                    if (part.type === 'text') {
                        const text = String(part.text || '');
                        if (text) parts.push({ type: 'text', text });
                        return;
                    }
                    if (part.type === 'image_url') {
                        const url = part?.image_url?.url;
                        const parsed = parseDataUrl(url);
                        if (parsed?.data) {
                            parts.push({
                                type: 'image',
                                source: {
                                    type: 'base64',
                                    media_type: parsed.mime || 'image/jpeg',
                                    data: parsed.data,
                                },
                            });
                        } else if (url) {
                            parts.push({ type: 'text', text: `[图片] ${String(url)}` });
                        }
                    }
                });
                return parts.length ? parts : [{ type: 'text', text: '' }];
            }
            return [{ type: 'text', text: String(content ?? '') }];
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
        const systemMessages = messages.filter(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        const system = systemMessages.map(m => toSystemText(m.content)).join('\n');

        return {
            system: system || undefined,
            messages: otherMessages.map(m => ({
                role: m.role,
                content: toAnthropicContent(m.content),
            })),
        };
    }

    /**
     * 发送聊天消息（非流式）
     */
    async chat(messages, options = {}) {
        const { signal, requestId, options: payloadOptionsRaw } = splitRequestOptions(options);
        const maxTokens = payloadOptionsRaw?.maxTokens ?? payloadOptionsRaw?.max_tokens;
        const payloadOptions = { ...(payloadOptionsRaw || {}) };
        delete payloadOptions.maxTokens;

        const { system, messages: convertedMessages } = this.convertMessages(messages);

        const data = await this.requestJson({
            url: `${this.baseUrl}/messages`,
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({
                model: this.model,
                messages: convertedMessages,
                system: system,
                max_tokens: maxTokens || payloadOptions.max_tokens || 4096,
                stream: false,
                ...payloadOptions
            }),
            signal,
            requestId,
        });

        const textBlocks = Array.isArray(data?.content)
            ? data.content.filter((block) => block?.type === 'text' && typeof block?.text === 'string')
            : [];
        return textBlocks.map((block) => block.text).join('') || '';
    }

    /**
     * 流式聊天
     */
    async *streamChat(messages, options = {}) {
        const { signal, requestId, options: payloadOptionsRaw } = splitRequestOptions(options);
        const maxTokens = payloadOptionsRaw?.maxTokens ?? payloadOptionsRaw?.max_tokens;
        const payloadOptions = { ...(payloadOptionsRaw || {}) };
        delete payloadOptions.maxTokens;

        const { system, messages: convertedMessages } = this.convertMessages(messages);
        const payload = JSON.stringify({
            model: this.model,
            messages: convertedMessages,
            system: system,
            max_tokens: maxTokens || payloadOptions.max_tokens || 4096,
            stream: true,
            ...payloadOptions
        });

        if (this.canUseNativeHttp()) {
            if (signal?.aborted) throw makeAbortError();
            const res = await this.request({
                url: `${this.baseUrl}/messages`,
                method: 'POST',
                headers: { ...this.getHeaders(), Accept: 'text/event-stream' },
                body: payload,
                signal,
                requestId,
            });
            if (!res.ok) {
                const detail = this.extractErrorDetail(res.body);
                const error = new Error(`Anthropic API Error: ${res.status}${detail ? ` - ${detail}` : ''}`);
                error.status = res.status;
                error.response = res.body;
                throw error;
            }
            for (const data of parseSSEText(res.body)) {
                if (data.type === 'content_block_delta') {
                    const content = data.delta?.text;
                    if (content) yield content;
                }
            }
            return;
        }

        const { controller, cleanup } = createLinkedAbortController({ timeoutMs: this.timeout, signal });
        try {
            const prepared = prepareTransportRequest({
                config: this.transportConfig,
                provider: 'anthropic',
                url: `${this.baseUrl}/messages`,
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
                const detail = this.extractErrorDetail(txt);
                const error = new Error(`Anthropic API Error: ${response.status}${detail ? ` - ${detail}` : ''}`);
                error.status = response.status;
                error.response = txt;
                throw error;
            }

            for await (const data of handleSSE(response)) {
                if (data.type === 'content_block_delta') {
                    const content = data.delta?.text;
                    if (content) {
                        yield content;
                    }
                }
            }
        } finally {
            cleanup();
        }
    }

    /**
     * 获取可用模型列表
     */
    async listModels() {
        const fallbackModels = [
            'claude-3-5-sonnet-20241022',
            'claude-3-opus-20240229',
            'claude-3-sonnet-20240229',
            'claude-3-haiku-20240307'
        ];

        try {
            const data = await this.requestJson({
                url: `${this.baseUrl}/models`,
                method: 'GET',
                headers: this.getHeaders(),
            });
            const rawItems = Array.isArray(data)
                ? data
                : Array.isArray(data?.data)
                    ? data.data
                    : [];
            const models = rawItems
                .map((item) => {
                    if (typeof item === 'string') return item.trim();
                    return String(item?.id || item?.name || '').trim();
                })
                .filter(Boolean);

            return models.length ? Array.from(new Set(models)) : fallbackModels;
        } catch {
            return fallbackModels;
        }
    }

    /**
     * 健康检查
     */
    async healthCheck() {
        try {
            // 发送一个最小的请求来验证连接
            const testMessages = [{ role: 'user', content: 'Hi' }];
            await this.chat(testMessages, { maxTokens: 10 });
            return { ok: true };
        } catch (error) {
            return { ok: false, error: error.message };
        }
    }
}
