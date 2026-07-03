// 在运行中的 dev APP（WebView2，--remote-debugging-port=9222）里执行 JS 并打印结果。
// 用于开发期真机验证：node scripts/dev/app-eval.mjs "<expression>"
// 表达式在 APP 页面上下文求值，支持 await；结果以 JSON 输出。
// 零依赖：内置最小 RFC6455 WebSocket 客户端（仅本地 CDP 用途）。

import { connect } from 'node:net';
import { randomBytes, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
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

const createWsClient = (wsUrl, { onMessage, onOpen }) => {
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
      if (opcode === 0x9) { // ping -> pong
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
        console.error('websocket handshake failed:', head.split('\r\n')[0]);
        process.exit(2);
      }
      const expected = createHash('sha1').update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
      if (!head.includes(expected)) {
        console.error('websocket accept key mismatch');
        process.exit(2);
      }
      buffer = buffer.subarray(headerEnd + 4);
      handshaken = true;
      onOpen?.();
    }
    processFrames();
  });

  socket.on('error', (err) => {
    console.error('websocket error:', err.message);
    process.exit(2);
  });

  return {
    send: payload => socket.write(encodeFrame(payload)),
    close: () => socket.end(),
  };
};

const main = async () => {
  let expression = process.argv[2];
  if (!expression) {
    console.error('usage: node scripts/dev/app-eval.mjs "<js expression>" | @expr-file.js');
    process.exit(1);
  }
  if (expression.startsWith('@')) {
    expression = readFileSync(expression.slice(1), 'utf8').replace(/^﻿/, '');
  }
  const targets = await fetchJson(`http://${CDP_HOST}:${CDP_PORT}/json`);
  const page = targets.find(t => t.type === 'page' && /^https?:/.test(t.url || ''));
  if (!page?.webSocketDebuggerUrl) {
    console.error('app page target not found; is npm run dev running with --remote-debugging-port?');
    process.exit(2);
  }

  const timeoutMs = Math.max(5000, Number(process.env.CDP_TIMEOUT_MS || 30000) || 30000);
  const timeout = setTimeout(() => {
    console.error('cdp evaluate timed out');
    process.exit(3);
  }, timeoutMs);

  const ws = createWsClient(page.webSocketDebuggerUrl, {
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
      clearTimeout(timeout);
      if (message.error) {
        console.error('cdp error:', JSON.stringify(message.error));
        process.exit(4);
      }
      const { result, exceptionDetails } = message.result || {};
      if (exceptionDetails) {
        console.error('page exception:', exceptionDetails.exception?.description || exceptionDetails.text);
        process.exit(5);
      }
      console.log(JSON.stringify(result?.value ?? null, null, 2));
      ws.close();
      process.exit(0);
    },
  });
};

main().catch((err) => {
  console.error(err.message || String(err));
  process.exit(2);
});
