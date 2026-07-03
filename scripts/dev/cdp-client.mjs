// 最小 CDP 客户端（零依赖 RFC6455 WebSocket，仅本地调试用途）。
// 供 app-eval.mjs（单表达式 CLI）与 run-smoke.mjs（冒烟场景集）共用。

import { connect } from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import http from 'node:http';

const CDP_HOST = '127.0.0.1';
const CDP_PORT = Number(process.env.CDP_PORT || 9222);

const fetchJson = url => new Promise((resolve, reject) => {
  http.get(url, (res) => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try { resolve(JSON.parse(data)); } catch (err) { reject(err); }
    });
  }).on('error', reject);
});

const encodeFrame = (payload) => {
  const data = Buffer.from(payload, 'utf8');
  const mask = randomBytes(4);
  let header;
  if (data.length < 126) {
    header = Buffer.alloc(2);
    header[1] = 0x80 | data.length;
  } else if (data.length < 65536) {
    header = Buffer.alloc(4);
    header[1] = 0x80 | 126;
    header.writeUInt16BE(data.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 0x80 | 127;
    header.writeBigUInt64BE(BigInt(data.length), 2);
  }
  header[0] = 0x81; // FIN + text
  const masked = Buffer.from(data);
  for (let i = 0; i < masked.length; i += 1) masked[i] ^= mask[i % 4];
  return Buffer.concat([header, mask, masked]);
};

const createWsClient = (wsUrl, { onMessage, onOpen, onError }) => {
  const url = new URL(wsUrl);
  const socket = connect(Number(url.port), url.hostname);
  const key = randomBytes(16).toString('base64');
  let buffer = Buffer.alloc(0);
  let handshaken = false;
  let fragments = [];

  socket.on('connect', () => {
    socket.write([
      `GET ${url.pathname} HTTP/1.1`,
      `Host: ${url.host}`,
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`,
      'Sec-WebSocket-Version: 13',
      '', '',
    ].join('\r\n'));
  });

  const processFrames = () => {
    while (buffer.length >= 2) {
      const fin = (buffer[0] & 0x80) !== 0;
      const opcode = buffer[0] & 0x0f;
      let length = buffer[1] & 0x7f;
      let offset = 2;
      if (length === 126) {
        if (buffer.length < 4) return;
        length = buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (buffer.length < 10) return;
        length = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (buffer.length < offset + length) return;
      const payload = buffer.subarray(offset, offset + length);
      buffer = buffer.subarray(offset + length);
      if (opcode === 0x9) {
        const pong = encodeFrame('');
        pong[0] = 0x8a;
        socket.write(pong);
        continue;
      }
      if (opcode === 0x8) { socket.end(); continue; }
      if (opcode === 0x1 || opcode === 0x0) {
        fragments.push(payload);
        if (fin) {
          const message = Buffer.concat(fragments).toString('utf8');
          fragments = [];
          onMessage?.(message);
        }
      }
    }
  };

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    if (!handshaken) {
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const head = buffer.subarray(0, headerEnd).toString('utf8');
      if (!/HTTP\/1\.1 101/.test(head)) {
        onError?.(new Error(`websocket handshake failed: ${head.split('\r\n')[0]}`));
        socket.end();
        return;
      }
      const expected = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      if (!head.includes(expected)) {
        onError?.(new Error('websocket accept key mismatch'));
        socket.end();
        return;
      }
      buffer = buffer.subarray(headerEnd + 4);
      handshaken = true;
      onOpen?.();
    }
    processFrames();
  });

  socket.on('error', err => onError?.(err));

  return {
    send: payload => socket.write(encodeFrame(payload)),
    close: () => socket.end(),
  };
};

export const findAppPageTarget = async ({ host = CDP_HOST, port = CDP_PORT } = {}) => {
  const targets = await fetchJson(`http://${host}:${port}/json`);
  return targets.find(t => t.type === 'page' && /^https?:/.test(t.url || '')) || null;
};

// 在 APP 页面上下文求值（支持 await），返回结果值；失败/超时抛错。
export const evaluateInApp = (expression, {
  timeoutMs = 30000,
  host = CDP_HOST,
  port = CDP_PORT,
} = {}) => new Promise((resolve, reject) => {
  findAppPageTarget({ host, port }).then((page) => {
    if (!page?.webSocketDebuggerUrl) {
      reject(new Error('app page target not found; is npm run dev running with --remote-debugging-port?'));
      return;
    }
    const timeout = setTimeout(() => {
      try { ws?.close(); } catch {}
      reject(new Error('cdp evaluate timed out'));
    }, Math.max(5000, Number(timeoutMs) || 30000));
    const finish = (fn, value) => {
      clearTimeout(timeout);
      try { ws?.close(); } catch {}
      fn(value);
    };
    let ws = null;
    ws = createWsClient(page.webSocketDebuggerUrl, {
      onOpen: () => {
        ws.send(JSON.stringify({
          id: 1,
          method: 'Runtime.evaluate',
          params: {
            expression: `(async () => (${expression}))()`,
            returnByValue: true,
            awaitPromise: true,
          },
        }));
      },
      onMessage: (raw) => {
        let message = null;
        try { message = JSON.parse(raw); } catch { return; }
        if (message.id !== 1) return;
        if (message.error) {
          finish(reject, new Error(`cdp error: ${JSON.stringify(message.error)}`));
          return;
        }
        const { result, exceptionDetails } = message.result || {};
        if (exceptionDetails) {
          finish(reject, new Error(`page exception: ${exceptionDetails.exception?.description || exceptionDetails.text}`));
          return;
        }
        finish(resolve, result?.value ?? null);
      },
      onError: err => finish(reject, err),
    });
  }, reject);
});
