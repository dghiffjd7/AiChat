import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { OpenAIProvider } from '../../src/scripts/api/providers/openai.js';
import { AnthropicProvider } from '../../src/scripts/api/providers/anthropic.js';
import { GeminiProvider } from '../../src/scripts/api/providers/gemini.js';
import { MakersuiteProvider } from '../../src/scripts/api/providers/makersuite.js';
import { VertexAIProvider } from '../../src/scripts/api/providers/vertexai.js';
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
  const onProviderToolCallDelta = () => {};
  const options = splitRequestOptions({
    signal: 'sig',
    nativeRequestId: 'abc_123',
    onProviderToolCallDelta,
    temperature: 0.7,
  });
  assert.equal(options.signal, 'sig');
  assert.equal(options.requestId, 'abc_123');
  assert.equal(options.onProviderToolCallDelta, onProviderToolCallDelta);
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

test('openai gpt-5 chat request should map max_tokens and omit restricted sampling params', () => {
  const provider = new OpenAIProvider({
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-5.5',
    timeout: 5000,
  });
  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hello' }], {
    max_tokens: 1234,
    temperature: 0.7,
    top_p: 0.9,
    presence_penalty: 0.2,
    frequency_penalty: 0.1,
    seed: 42,
    n: 2,
  });

  assert.equal(prepared.payload.max_completion_tokens, 1234);
  assert.equal(Object.hasOwn(prepared.payload, 'max_tokens'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'temperature'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'top_p'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'presence_penalty'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'frequency_penalty'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'seed'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'n'), false);
});

test('openai legacy chat request should keep max_tokens', () => {
  const provider = new OpenAIProvider({
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    timeout: 5000,
  });
  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hello' }], {
    max_tokens: 1234,
    temperature: 0.7,
    top_p: 0.9,
  });

  assert.equal(prepared.payload.max_tokens, 1234);
  assert.equal(prepared.payload.temperature, 0.7);
  assert.equal(prepared.payload.top_p, 0.9);
  assert.equal(Object.hasOwn(prepared.payload, 'max_completion_tokens'), false);
});

test('openai prepareChatRequest should keep provider tool delta callback out of payload', () => {
  const onProviderToolCallDelta = () => {};
  const provider = new OpenAIProvider({
    provider: 'openai',
    apiKey: 'test-key',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    timeout: 5000,
  });
  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hello' }], {
    onProviderToolCallDelta,
    nativeRequestId: 'tool_probe_case',
    temperature: 0.7,
  });

  assert.equal(prepared.onProviderToolCallDelta, onProviderToolCallDelta);
  assert.equal(prepared.requestId, 'tool_probe_case');
  assert.equal(Object.hasOwn(prepared.payload, 'onProviderToolCallDelta'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'nativeRequestId'), false);
  assert.equal(prepared.payload.temperature, 0.7);
});

test('deepseek request should not use OpenAI max_completion_tokens mapping', () => {
  const provider = new OpenAIProvider({
    provider: 'deepseek',
    apiKey: 'test-key',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    timeout: 5000,
  });
  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hello' }], {
    max_tokens: 1234,
  });

  assert.equal(prepared.payload.max_tokens, 1234);
  assert.equal(Object.hasOwn(prepared.payload, 'max_completion_tokens'), false);
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

test('openai stream: should expose raw provider tool-call deltas without yielding tool text', async () => {
  const requestBodies = [];
  await withServer(async (req, res) => {
    if (req.url !== '/chat/completions' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    for await (const chunk of req) body += chunk;
    requestBodies.push(body);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"contact_profile.list","arguments":"{\\"limit\\":"}}]}}]}\n\n');
    res.write('data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"1}"}}]}}]}\n\n');
    res.write('data: {"choices":[{"finish_reason":"tool_calls"}]}\n\n');
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
    const callbackEvents = [];
    const chunks = [];
    for await (const chunk of provider.streamChat([{ role: 'user', content: 'go' }], {
      nativeRequestId: 'stream_tool_probe_case',
      onProviderToolCallDelta: data => callbackEvents.push(data),
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, []);
    assert.equal(callbackEvents.length, 3);
    assert.equal(callbackEvents[0].choices[0].delta.tool_calls[0].id, 'call_1');
    assert.equal(callbackEvents[2].choices[0].finish_reason, 'tool_calls');
    const payload = JSON.parse(requestBodies[0]);
    assert.equal(Object.hasOwn(payload, 'onProviderToolCallDelta'), false);
    assert.equal(Object.hasOwn(payload, 'nativeRequestId'), false);
  });
});

test('gemini stream: should expose raw functionCall deltas without payload leakage', async () => {
  const requestBodies = [];
  await withServer(async (req, res) => {
    if (!req.url.startsWith('/v1beta/models/test-model:streamGenerateContent') || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    for await (const chunk of req) body += chunk;
    requestBodies.push(body);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"contact_profile.list","args":{"limit":1}}}]}}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  }, async (baseUrl) => {
    const provider = new GeminiProvider({
      apiKey: 'test-key',
      baseUrl,
      model: 'test-model',
      timeout: 5000,
    });
    const callbackEvents = [];
    const chunks = [];
    for await (const chunk of provider.streamChat([{ role: 'user', content: 'go' }], {
      nativeRequestId: 'gemini_tool_probe_case',
      onProviderToolCallDelta: data => callbackEvents.push(data),
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, []);
    assert.equal(callbackEvents.length, 1);
    assert.equal(callbackEvents[0].candidates[0].content.parts[0].functionCall.name, 'contact_profile.list');
    const payload = JSON.parse(requestBodies[0]);
    assert.equal(Object.hasOwn(payload, 'onProviderToolCallDelta'), false);
    assert.equal(Object.hasOwn(payload, 'nativeRequestId'), false);
  });
});

test('vertexai stream: should expose raw functionCall deltas without payload leakage', async () => {
  const requestBodies = [];
  await withServer(async (req, res) => {
    if (!req.url.startsWith('/v1/projects/proj/locations/us-central1/publishers/google/models/test-model:streamGenerateContent') || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    for await (const chunk of req) body += chunk;
    requestBodies.push(body);
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write('data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"contact_profile.list","args":{"limit":2}}}]}}]}\n\n');
    res.write('data: [DONE]\n\n');
    res.end();
  }, async (baseUrl) => {
    const provider = new VertexAIProvider({
      vertexaiProjectId: 'proj',
      vertexaiRegion: 'us-central1',
      model: 'test-model',
      timeout: 5000,
    });
    provider.baseHost = baseUrl;
    provider.baseUrl = baseUrl;
    provider.getHeaders = async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test-token' });
    const callbackEvents = [];
    const chunks = [];
    for await (const chunk of provider.streamChat([{ role: 'user', content: 'go' }], {
      nativeRequestId: 'vertex_tool_probe_case',
      onProviderToolCallDelta: data => callbackEvents.push(data),
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, []);
    assert.equal(callbackEvents.length, 1);
    assert.equal(callbackEvents[0].candidates[0].content.parts[0].functionCall.name, 'contact_profile.list');
    const payload = JSON.parse(requestBodies[0]);
    assert.equal(Object.hasOwn(payload, 'onProviderToolCallDelta'), false);
    assert.equal(Object.hasOwn(payload, 'nativeRequestId'), false);
  });
});

test('anthropic non-stream: should expose pure tool_use responses without requiring text', async () => {
  const requestBodies = [];
  await withServer(async (req, res) => {
    if (req.url !== '/messages' || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    for await (const chunk of req) body += chunk;
    requestBodies.push(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'fc_probe', input: { value: 'ok' } }],
      stop_reason: 'tool_use',
      usage: { input_tokens: 10, output_tokens: 5 },
    }));
  }, async (baseUrl) => {
    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      baseUrl,
      model: 'claude-test',
      timeout: 5000,
    });
    const callbackEvents = [];
    const text = await provider.chat([{ role: 'user', content: 'go' }], {
      nativeRequestId: 'anthropic_nonstream_tool_case',
      tools: [{ name: 'fc_probe', input_schema: { type: 'object' } }],
      onProviderToolCallDelta: data => callbackEvents.push(data),
    });
    assert.equal(text, '');
    assert.equal(callbackEvents.length, 1);
    assert.equal(callbackEvents[0].content[0].type, 'tool_use');
    const payload = JSON.parse(requestBodies[0]);
    assert.equal(Object.hasOwn(payload, 'onProviderToolCallDelta'), false);
    assert.equal(Object.hasOwn(payload, 'nativeRequestId'), false);
  });
});

const testGeminiFamilyNonStreamToolResponse = (label, createProvider, pathPrefix) => {
  test(`${label} non-stream: should expose pure functionCall responses without requiring text`, async () => {
    const requestBodies = [];
    await withServer(async (req, res) => {
      if (!req.url.startsWith(pathPrefix) || req.method !== 'POST') {
        res.writeHead(404);
        res.end();
        return;
      }
      let body = '';
      req.setEncoding('utf8');
      for await (const chunk of req) body += chunk;
      requestBodies.push(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({
        candidates: [{
          content: {
            role: 'model',
            parts: [{ functionCall: { id: 'call_1', name: 'fc_probe', args: { value: 'ok' } } }],
          },
          finishReason: 'STOP',
        }],
      }));
    }, async (baseUrl) => {
      const provider = createProvider(baseUrl);
      const callbackEvents = [];
      const text = await provider.chat([{ role: 'user', content: 'go' }], {
        nativeRequestId: `${label}_nonstream_tool_case`,
        tools: [{ functionDeclarations: [{ name: 'fc_probe' }] }],
        onProviderToolCallDelta: data => callbackEvents.push(data),
      });
      assert.equal(text, '');
      assert.equal(callbackEvents.length, 1);
      assert.equal(callbackEvents[0].candidates[0].content.parts[0].functionCall.name, 'fc_probe');
      const payload = JSON.parse(requestBodies[0]);
      assert.equal(Object.hasOwn(payload, 'onProviderToolCallDelta'), false);
      assert.equal(Object.hasOwn(payload, 'nativeRequestId'), false);
    });
  });
};

testGeminiFamilyNonStreamToolResponse(
  'gemini',
  baseUrl => new GeminiProvider({ apiKey: 'test-key', baseUrl, model: 'test-model', timeout: 5000 }),
  '/v1beta/models/test-model:generateContent',
);

testGeminiFamilyNonStreamToolResponse(
  'makersuite',
  baseUrl => new MakersuiteProvider({ apiKey: 'test-key', baseUrl, model: 'test-model', timeout: 5000 }),
  '/v1beta/models/test-model:generateContent',
);

test('vertexai non-stream: should expose pure functionCall responses without requiring text', async () => {
  const requestBodies = [];
  await withServer(async (req, res) => {
    if (!req.url.startsWith('/v1/projects/proj/locations/us-central1/publishers/google/models/test-model:generateContent') || req.method !== 'POST') {
      res.writeHead(404);
      res.end();
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    for await (const chunk of req) body += chunk;
    requestBodies.push(body);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({
      candidates: [{ content: { parts: [{ functionCall: { name: 'fc_probe', args: { value: 'ok' } } }] } }],
    }));
  }, async (baseUrl) => {
    const provider = new VertexAIProvider({
      vertexaiProjectId: 'proj',
      vertexaiRegion: 'us-central1',
      model: 'test-model',
      timeout: 5000,
    });
    provider.baseHost = baseUrl;
    provider.baseUrl = baseUrl;
    provider.getHeaders = async () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer test-token' });
    const callbackEvents = [];
    const text = await provider.chat([{ role: 'user', content: 'go' }], {
      nativeRequestId: 'vertex_nonstream_tool_case',
      tools: [{ functionDeclarations: [{ name: 'fc_probe' }] }],
      onProviderToolCallDelta: data => callbackEvents.push(data),
    });
    assert.equal(text, '');
    assert.equal(callbackEvents.length, 1);
    assert.equal(callbackEvents[0].candidates[0].content.parts[0].functionCall.name, 'fc_probe');
    assert.equal(Object.hasOwn(JSON.parse(requestBodies[0]), 'onProviderToolCallDelta'), false);
  });
});

test('openai native http: should allocate a request id and bridge signal to native abort', async () => {
  const prevTauri = globalThis.__TAURI__;
  const pendingById = new Map();
  let seenRequestId = '';
  let abortedRequestId = '';
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
            abortedRequestId = id;
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

    const controller = new AbortController();
    const pending = provider.chat([{ role: 'user', content: 'native' }], {
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 30);

    await assert.rejects(
      Promise.race([
        pending,
        delay(500).then(() => { throw new Error('native abort bridge timeout'); }),
      ]),
      isAbortError,
    );
    assert.match(seenRequestId, /^http_[a-z0-9_]+$/i);
    assert.equal(abortedRequestId, seenRequestId);
  } finally {
    globalThis.__TAURI__ = prevTauri;
  }
});

test('anthropic native stream: should yield incremental deltas from tauri stream commands', async () => {
  const prevTauri = globalThis.__TAURI__;
  const callbackEvents = [];
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
      onProviderToolCallDelta: data => callbackEvents.push(data),
    })) {
      chunks.push(chunk);
    }

    assert.deepEqual(chunks, ['A', 'B']);
    assert.equal(callbackEvents.length, 2);
    assert.equal(callbackEvents[0].type, 'content_block_delta');
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
