/**
 * 流式响应处理工具
 */

export const parseSSEBuffer = (buffer = '', { final = false } = {}) => {
    const normalized = String(buffer ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const frames = normalized.split(/\n\n+/);
    const rest = final ? '' : (frames.pop() || '');
    const events = [];
    let done = false;

    for (const frame of frames) {
        const dataLines = [];
        for (const rawLine of String(frame || '').split('\n')) {
            if (!rawLine || rawLine.startsWith(':')) continue;
            if (!rawLine.startsWith('data:')) continue;
            let data = rawLine.slice(5);
            if (data.startsWith(' ')) data = data.slice(1);
            dataLines.push(data);
        }
        if (!dataLines.length) continue;
        const dataText = dataLines.join('\n').trim();
        if (!dataText) continue;
        if (dataText === '[DONE]') {
            done = true;
            break;
        }
        try {
            events.push(JSON.parse(dataText));
        } catch (e) {
            console.warn('SSE parse error:', e, 'data:', dataText);
        }
    }

    return { events, rest, done };
};

export const parseSSEText = function* (text = '') {
    const { events } = parseSSEBuffer(`${String(text ?? '')}\n\n`, { final: true });
    yield* events;
};

/**
 * 处理 Server-Sent Events (SSE) 流
 * @param {Response} response - Fetch API 返回的响应对象
 * @returns {AsyncGenerator<Object>} 解析后的数据流
 */
export async function* handleSSE(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const parsed = parseSSEBuffer(buffer, { final: false });
            buffer = parsed.rest;
            for (const event of parsed.events) yield event;
            if (parsed.done) return;
        }

        buffer += decoder.decode();
        if (buffer) {
            const parsed = parseSSEBuffer(buffer, { final: true });
            for (const event of parsed.events) yield event;
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * 处理 Chunked Transfer Encoding 流
 * @param {Response} response - Fetch API 返回的响应对象
 * @returns {AsyncGenerator<string>} 文本数据流
 */
export async function* handleChunked(response) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value, { stream: true });
            if (text) yield text;
        }
    } finally {
        reader.releaseLock();
    }
}

/**
 * WebSocket 流式连接（用于需要双向通信的场景）
 */
export class WebSocketStream {
    constructor(url, options = {}) {
        this.url = url;
        this.options = options;
        this.ws = null;
    }

    /**
     * 建立连接并流式发送/接收数据
     * @param {Object} data - 要发送的数据
     * @returns {AsyncGenerator<Object>} 接收到的数据流
     */
    async *stream(data) {
        this.ws = new WebSocket(this.url);

        const queue = [];
        let resolve = null;
        let done = false;
        let error = null;

        this.ws.onmessage = (event) => {
            try {
                const item = JSON.parse(event.data);
                if (resolve) {
                    resolve({ value: item, done: false });
                    resolve = null;
                } else {
                    queue.push(item);
                }
            } catch (e) {
                console.error('WebSocket message parse error:', e);
            }
        };

        this.ws.onerror = (err) => {
            error = err;
            done = true;
            if (resolve) {
                resolve({ done: true, error });
            }
        };

        this.ws.onclose = () => {
            done = true;
            if (resolve) {
                resolve({ done: true });
            }
        };

        // 等待连接建立
        await new Promise((res, rej) => {
            this.ws.onopen = res;
            this.ws.onerror = rej;
        });

        // 发送初始数据
        this.ws.send(JSON.stringify(data));

        // 接收数据
        while (!done) {
            if (queue.length > 0) {
                yield queue.shift();
            } else {
                const result = await new Promise((res) => {
                    resolve = res;
                });
                if (result.done) {
                    if (result.error) throw result.error;
                    break;
                }
                if (result.value) yield result.value;
            }
        }
    }

    close() {
        if (this.ws) {
            this.ws.close();
        }
    }
}
