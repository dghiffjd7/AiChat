import assert from 'node:assert/strict';

import { resolveProviderFcTransport } from '../../src/scripts/agent/provider-fc-transport.js';
import { LLMClient } from '../../src/scripts/api/client.js';
import {
  OpenCodeProvider,
  isOpenCodeGoChatCompletionsModel,
} from '../../src/scripts/api/providers/opencode.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const createLocalStorage = () => {
  const data = new Map();
  return {
    getItem: key => data.get(String(key)) ?? null,
    setItem: (key, value) => data.set(String(key), String(value)),
    removeItem: key => data.delete(String(key)),
  };
};

test('OpenCodeProvider uses the official Zen Go Chat Completions defaults', () => {
  const provider = new OpenCodeProvider({ apiKey: 'oc-key' });
  assert.equal(provider.provider, 'opencode');
  assert.equal(provider.baseUrl, 'https://opencode.ai/zen/go/v1');
  assert.equal(provider.model, 'glm-5.3');
  assert.equal(provider.getHeaders().Authorization, 'Bearer oc-key');

  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hi' }], {
    temperature: 0.4,
    max_tokens: 32,
  });
  assert.equal(prepared.url, 'https://opencode.ai/zen/go/v1/chat/completions');
  assert.equal(prepared.payload.model, 'glm-5.3');
  assert.equal(prepared.payload.temperature, 0.4);
  assert.equal(prepared.payload.max_tokens, 32);
});

test('OpenCode Go model classifier only admits documented Chat Completions families', () => {
  for (const model of [
    'glm-5.3',
    'kimi-k3',
    'deepseek-v4-flash',
    'mimo-v2.5-pro',
    'hy3',
  ]) {
    assert.equal(isOpenCodeGoChatCompletionsModel(model), true, model);
  }
  for (const model of [
    'gpt-5.6-luna',
    'grok-4.5',
    'minimax-m3',
    'qwen3.8-max',
    '',
  ]) {
    assert.equal(isOpenCodeGoChatCompletionsModel(model), false, model);
  }
});

test('OpenCodeProvider filters the mixed Go catalog and preserves a manually entered model', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'oc-key', model: 'private-compatible-model' });
  provider.requestJson = async ({ url, method, headers }) => {
    assert.equal(url, 'https://opencode.ai/zen/go/v1/models');
    assert.equal(method, 'GET');
    assert.equal(headers.Authorization, 'Bearer oc-key');
    return {
      data: [
        { id: 'glm-5.3' },
        { id: 'kimi-k3' },
        { id: 'deepseek-v4-flash' },
        { id: 'mimo-v2.5-pro' },
        { id: 'hy3' },
        { id: 'gpt-5.6-luna' },
        { id: 'grok-4.5' },
        { id: 'minimax-m3' },
        { id: 'qwen3.8-max' },
      ],
    };
  };
  assert.deepEqual(await provider.listModels(), [
    'glm-5.3',
    'kimi-k3',
    'deepseek-v4-flash',
    'mimo-v2.5-pro',
    'hy3',
    'private-compatible-model',
  ]);
});

test('OpenCodeProvider keeps the current model when catalog refresh fails', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'oc-key', model: 'glm-5.2' });
  provider.requestJson = async () => {
    throw new Error('network down');
  };
  const previousWarn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await provider.listModels(), ['glm-5.2']);
  } finally {
    console.warn = previousWarn;
  }
});

test('OpenCodeProvider preserves status and server detail in branded errors', async () => {
  const provider = new OpenCodeProvider({ apiKey: 'bad-key' });
  provider.request = async () => ({
    ok: false,
    status: 401,
    body: JSON.stringify({ error: { message: 'invalid api key' } }),
  });
  await assert.rejects(
    provider.chat([{ role: 'user', content: 'hi' }]),
    (error) => {
      assert.equal(error.status, 401);
      assert.equal(error.response, '{"error":{"message":"invalid api key"}}');
      assert.match(error.message, /^OpenCode Go API Error: 401 - invalid api key$/u);
      return true;
    },
  );
});

test('OpenCodeProvider aborts a pre-cancelled stream before starting native transport', async () => {
  const previousTauri = globalThis.__TAURI__;
  let invokeCount = 0;
  globalThis.__TAURI__ = {
    core: {
      invoke: async () => {
        invokeCount += 1;
        throw new Error('must not start transport');
      },
    },
  };
  try {
    const controller = new AbortController();
    controller.abort();
    const provider = new OpenCodeProvider({ apiKey: 'oc-key' });
    const stream = provider.streamChat([{ role: 'user', content: 'hi' }], {
      signal: controller.signal,
    });
    await assert.rejects(stream.next(), error => error?.name === 'AbortError');
    assert.equal(invokeCount, 0);
  } finally {
    if (previousTauri === undefined) delete globalThis.__TAURI__;
    else globalThis.__TAURI__ = previousTauri;
  }
});

test('OpenCodeProvider closes an active native stream after cancellation', async () => {
  const previousTauri = globalThis.__TAURI__;
  const calls = [];
  globalThis.__TAURI__ = {
    core: {
      invoke: async (command) => {
        calls.push(command);
        if (command === 'http_stream_request_read') {
          return { status: 200, ok: true, chunks: [], done: false };
        }
        return null;
      },
    },
  };
  try {
    const controller = new AbortController();
    const provider = new OpenCodeProvider({ apiKey: 'oc-key', timeout: 1000 });
    const stream = provider.streamChat([{ role: 'user', content: 'hi' }], {
      signal: controller.signal,
    });
    const pending = stream.next();
    setTimeout(() => controller.abort(), 5);
    await assert.rejects(pending, error => error?.name === 'AbortError');
    await new Promise(resolve => setTimeout(resolve, 0));
    assert.equal(calls.includes('http_stream_request_start'), true);
    assert.equal(calls.includes('http_stream_request_close'), true);
  } finally {
    if (previousTauri === undefined) delete globalThis.__TAURI__;
    else globalThis.__TAURI__ = previousTauri;
  }
});

test('OpenCodeProvider applies its configured request timeout', async () => {
  const previousTauri = globalThis.__TAURI__;
  const previousFetch = globalThis.fetch;
  delete globalThis.__TAURI__;
  globalThis.fetch = async (_url, options = {}) => await new Promise((resolve, reject) => {
    const rejectAbort = () => {
      const error = new Error('Aborted');
      error.name = 'AbortError';
      reject(error);
    };
    if (options.signal?.aborted) {
      rejectAbort();
      return;
    }
    options.signal?.addEventListener?.('abort', rejectAbort, { once: true });
  });
  try {
    const provider = new OpenCodeProvider({ apiKey: 'oc-key', timeout: 15 });
    await assert.rejects(
      provider.chat([{ role: 'user', content: 'hi' }]),
      error => error?.name === 'AbortError',
    );
  } finally {
    if (previousTauri === undefined) delete globalThis.__TAURI__;
    else globalThis.__TAURI__ = previousTauri;
    globalThis.fetch = previousFetch;
  }
});

test('LLMClient creates the dedicated OpenCode provider with the exact J.3 FC transport', () => {
  const client = new LLMClient({ provider: 'opencode', apiKey: 'oc-key' });
  assert.equal(client.provider instanceof OpenCodeProvider, true);
  assert.deepEqual(resolveProviderFcTransport({
    provider: 'opencode',
    baseUrl: 'https://opencode.ai/zen/go/v1',
  }), {
    supported: true,
    reason: '',
    provider: 'opencode',
    family: 'openai',
    endpoint: 'official_opencode_go_chat_completions',
  });
});

test('ConfigPanel exposes OpenCode only for chat with fixed Zen Go defaults', async () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = previousLocalStorage || createLocalStorage();
  try {
    const { ConfigPanel } = await import('../../src/scripts/ui/config-panel.js');
    const panel = new ConfigPanel();
    assert.equal(panel.getProviderOptions().some(item => item.value === 'opencode'), true);
    assert.deepEqual(panel.getProviderDefaults('opencode'), {
      baseUrl: 'https://opencode.ai/zen/go/v1',
      model: 'glm-5.3',
      urlHelp: 'OpenCode Go API（首版仅支持 Chat Completions 模型）',
    });
    assert.equal(panel.usesEditableBaseUrl('opencode'), false);

    panel.activeTab = 'image';
    assert.equal(panel.getProviderOptions().some(item => item.value === 'opencode'), false);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test('ConfigManager validates OpenCode as chat-only and keeps profile keys isolated across reload', async () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = createLocalStorage();
  const scope = `opencode_j2_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  try {
    const { ConfigManager } = await import('../../src/scripts/storage/config.js');
    const manager = new ConfigManager({ scope });
    await manager.ensureStores();
    const customProfile = await manager.createProfile('Existing Custom', {
      provider: 'custom',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      model: 'glm-5.3',
    });
    await manager.save({
      provider: 'custom',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      model: 'glm-5.3',
      apiKey: 'custom-secret',
    });

    const openCodeProfile = await manager.createProfile('OpenCode Go', {
      provider: 'opencode',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      model: 'glm-5.3',
    });
    await manager.save({
      provider: 'opencode',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      model: 'glm-5.3',
      apiKey: 'opencode-secret',
    });

    assert.equal(manager.getProfileById(customProfile.id).provider, 'custom');
    assert.equal(manager.getProfileById(openCodeProfile.id).provider, 'opencode');
    assert.equal(manager.listKeys(customProfile.id).length, 1);
    assert.equal(manager.listKeys(openCodeProfile.id).length, 1);

    const reloaded = new ConfigManager({ scope });
    const activeRuntime = await reloaded.load();
    assert.equal(activeRuntime.provider, 'opencode');
    assert.equal(activeRuntime.apiKey, 'opencode-secret');
    await reloaded.setActiveProfile(customProfile.id);
    assert.equal(reloaded.get().provider, 'custom');
    assert.equal(reloaded.get().apiKey, 'custom-secret');

    const imageManager = new ConfigManager({ scope: 'image' });
    assert.throws(() => imageManager.validate({
      provider: 'opencode',
      baseUrl: 'https://opencode.ai/zen/go/v1',
      model: 'glm-5.3',
    }), /无效的 provider/u);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(error);
  }
}

if (failed > 0) process.exit(1);
