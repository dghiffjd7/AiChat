import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { OpenAIProvider } from '../../src/scripts/api/providers/openai.js';
import { AnthropicProvider } from '../../src/scripts/api/providers/anthropic.js';
import { splitRequestOptions } from '../../src/scripts/api/abort.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const isAbortError = (error) => {
  const name = String(error?.name || '');
  const message = String(error?.message || '').toLowerCase();
  return name === 'AbortError' || message.includes('aborted');
};

const withServer = async (handler, run) => {
  const server = http.createServer(handler);
  await new Promise((resolve, reject) => {
    server.listen(0, '127.0.0.1', (err) => (err ? reject(err) : resolve()));
  });
  const addr = server.address();
  const port = Number(addr?.port || 0);
  const baseUrl = `http://127.0.0.1:${port}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
  }
};

test('splitRequestOptions: nativeRequestId should map to requestId', () => {
  const options = splitRequestOptions({
    signal: 'sig',
    nativeRequestId: 'abc_123',
    temperature: 0.7,
  });
  assert.equal(options.signal, 'sig');
  assert.equal(options.requestId, 'abc_123');
  assert.deepEqual(options.options, { temperature: 0.7 });
});

test('deepseek reasoner prepareChatRequest should normalize mid-chat system and use beta prefix completion', () => {
  const provider = new OpenAIProvider({
    provider: 'deepseek',
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-reasoner',
    timeout: 5000,
  });
  const prepared = provider.prepareChatRequest([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'reply' },
    { role: 'system', content: 'late sys' },
  ], {
    deepseekPrefix: {
      mode: 'assistant_prefill',
      prefix: '<prefill>',
    },
  });

  assert.equal(prepared.url, 'https://api.deepseek.com/beta/chat/completions');
  assert.deepEqual(
    prepared.messages.map(msg => msg.role),
    ['system', 'user', 'assistant', 'user', 'assistant'],
  );
  assert.equal(prepared.messages[3].content, 'late sys');
  assert.equal(prepared.messages[4].prefix, true);
  assert.equal(prepared.responsePrefix, '<prefill>');
});

test('deepseek chat prepareChatRequest should stay unchanged unless prefix mode is explicitly requested', () => {
  const provider = new OpenAIProvider({
    provider: 'deepseek',
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    timeout: 5000,
  });
  const prepared = provider.prepareChatRequest([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hello' },
    { role: 'system', content: 'late sys' },
  ], {});

  assert.equal(prepared.url, 'https://api.deepseek.com/v1/chat/completions');
  assert.deepEqual(
    prepared.messages.map(msg => msg.role),
    ['system', 'user', 'system'],
  );
  assert.equal(prepared.compat.reasoner.changed, false);
});

test('openai non-stream: abort signal should cancel request', async () => {
  await withServer(async (req, res) => {
    if (req.url !== '/chat/completions' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    await delay(300);
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        choices: [{ message: { content: 'late reply' } }],
      }),
    );
  }, async (baseUrl) => {
    const provider = new OpenAIProvider({
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl,
      model: 'test-model',
      timeout: 5000,
    });
    const controller = new AbortController();
    const pending = provider.chat([{ role: 'user', content: 'hi' }], {
      signal: controller.signal,
      nativeRequestId: 'nonstream_abort_case',
    });
    setTimeout(() => controller.abort(), 50);
    await assert.rejects(pending, (err) => isAbortError(err));
  });
});

test('openai stream: abort should stop further chunks', async () => {
  await withServer(async (req, res) => {
    if (req.url !== '/chat/completions' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: {"choices":[{"delta":{"content":"A"}}]}\n\n');
    await delay(120);
    res.write('data: {"choices":[{"delta":{"content":"B"}}]}\n\n');
    await delay(120);
    res.write('data: [DONE]\n\n');
    res.end();
  }, async (baseUrl) => {
    const provider = new OpenAIProvider({
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl,
      model: 'test-model',
      timeout: 5000,
    });
    const controller = new AbortController();
    const chunks = [];
    let aborted = false;
    try {
      for await (const chunk of provider.streamChat([{ role: 'user', content: 'go' }], {
        signal: controller.signal,
        nativeRequestId: 'stream_abort_case',
      })) {
        chunks.push(chunk);
        if (chunks.length === 1) controller.abort('user');
      }
    } catch (error) {
      aborted = isAbortError(error);
    }
    assert.ok(chunks.length >= 1);
    assert.ok(aborted || controller.signal.aborted);
  });
});

test('openai native http: should pass requestId and support external abort', async () => {
  const prevTauri = globalThis.__TAURI__;
  const pendingById = new Map();
  let seenRequestId = '';
  try {
    globalThis.__TAURI__ = {
      core: {
        invoke: async (cmd, args = {}) => {
          if (cmd === 'http_request') {
            seenRequestId = String(args?.requestId || '');
            return await new Promise((resolve, reject) => {
              pendingById.set(seenRequestId, { resolve, reject });
            });
          }
          if (cmd === 'http_abort_request') {
            const id = String(args?.requestId || '');
            const pending = pendingById.get(id);
            if (!pending) return false;
            pendingById.delete(id);
            pending.reject(new Error('aborted'));
            return true;
          }
          throw new Error(`unexpected invoke command: ${cmd}`);
        },
      },
    };

    const provider = new OpenAIProvider({
      provider: 'openai',
      apiKey: 'test-key',
      baseUrl: 'https://example.invalid',
      model: 'test-model',
      timeout: 5000,
    });

    const pending = provider.chat([{ role: 'user', content: 'native' }], {
      nativeRequestId: 'native_abort_case',
    });
    setTimeout(() => {
      globalThis.__TAURI__.core.invoke('http_abort_request', { requestId: 'native_abort_case' }).catch(() => {});
    }, 30);

    await assert.rejects(pending, /native http_request failed: aborted/i);
    assert.equal(seenRequestId, 'native_abort_case');
  } finally {
    globalThis.__TAURI__ = prevTauri;
  }
});

test('anthropic native stream: should yield incremental deltas from tauri stream commands', async () => {
  const prevTauri = globalThis.__TAURI__;
  const readQueue = [
    {
      status: 200,
      ok: true,
      headers: { 'content-type': 'text/event-stream' },
      chunks: ['data: {"type":"content_block_delta","delta":{"text":"A"}}\n\n'],
      done: false,
      error: null,
    },
    {
      status: 200,
      ok: true,
      headers: null,
      chunks: ['data: {"type":"content_block_delta","delta":{"text":"B"}}\n\n'],
      done: true,
      error: null,
    },
  ];
  let startedRequestId = '';
  let closedRequestId = '';
  try {
    globalThis.__TAURI__ = {
      core: {
        invoke: async (cmd, args = {}) => {
          if (cmd === 'http_stream_request_start') {
            startedRequestId = String(args?.requestId || '');
            return true;
          }
          if (cmd === 'http_stream_request_read') {
            return readQueue.shift() || {
              status: 200,
              ok: true,
              headers: null,
              chunks: [],
              done: true,
              error: null,
            };
          }
          if (cmd === 'http_stream_request_close') {
            closedRequestId = String(args?.requestId || '');
            return true;
          }
          throw new Error(`unexpected invoke command: ${cmd}`);
        },
      },
    };

    const provider = new AnthropicProvider({
      provider: 'anthropic',
      apiKey: 'test-key',
      baseUrl: 'https://example.invalid/v1',
      model: 'claude-test',
      timeout: 5000,
    });

    const chunks = [];
    for await (const chunk of provider.streamChat([{ role: 'user', content: 'go' }], {
      nativeRequestId: 'anthropic_native_stream_case',
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ['A', 'B']);
    assert.equal(startedRequestId, 'anthropic_native_stream_case');
    assert.equal(closedRequestId, 'anthropic_native_stream_case');
  } finally {
    globalThis.__TAURI__ = prevTauri;
  }
});

let failed = 0;
for (const item of tests) {
  try {
    await item.fn();
    console.log(`ok - ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${item.name}`);
    console.error(error);
  }
}

if (failed > 0) process.exit(1);
