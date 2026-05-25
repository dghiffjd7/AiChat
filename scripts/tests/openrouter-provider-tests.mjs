import assert from 'node:assert/strict';

import {
  buildReasoningRequestOptions,
  getReasoningCapability,
} from '../../src/scripts/api/model-capabilities.js';
import { LLMClient } from '../../src/scripts/api/client.js';
import { OpenRouterProvider } from '../../src/scripts/api/providers/openrouter.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('OpenRouterProvider uses OpenRouter defaults and attribution headers', () => {
  const provider = new OpenRouterProvider({ apiKey: 'or-key' });
  assert.equal(provider.provider, 'openrouter');
  assert.equal(provider.baseUrl, 'https://openrouter.ai/api/v1');
  assert.equal(provider.model, 'openrouter/auto');

  const headers = provider.getHeaders();
  assert.equal(headers.Authorization, 'Bearer or-key');
  assert.equal(headers['Content-Type'], 'application/json');
  assert.equal(headers['HTTP-Referer'], 'https://tauri-chat-app.local');
  assert.equal(headers['X-OpenRouter-Title'], 'Tauri Chat App');
  assert.equal(headers['X-Title'], 'Tauri Chat App');
});

test('OpenRouterProvider honors custom attribution config', () => {
  const provider = new OpenRouterProvider({
    apiKey: 'or-key',
    openrouterReferer: 'https://example.test',
    openrouterTitle: 'Example App',
  });
  const headers = provider.getHeaders();
  assert.equal(headers['HTTP-Referer'], 'https://example.test');
  assert.equal(headers['X-OpenRouter-Title'], 'Example App');
  assert.equal(headers['X-Title'], 'Example App');
});

test('OpenRouterProvider prepares OpenAI-compatible chat completions', () => {
  const provider = new OpenRouterProvider({
    apiKey: 'or-key',
    model: 'openai/gpt-5.2',
  });
  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hi' }], {
    temperature: 0.7,
    max_tokens: 64,
    reasoning: { effort: 'high' },
    tools: [{ type: 'function', function: { name: 'contact_profile_list', parameters: { type: 'object' } } }],
    tool_choice: 'auto',
  });
  assert.equal(prepared.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(prepared.payload.model, 'openai/gpt-5.2');
  assert.equal(prepared.payload.temperature, 0.7);
  assert.equal(prepared.payload.max_tokens, 64);
  assert.deepEqual(prepared.payload.reasoning, { effort: 'high' });
  assert.equal(prepared.payload.tools[0].function.name, 'contact_profile_list');
  assert.equal(prepared.payload.tool_choice, 'auto');
});

test('OpenRouter reasoning models use reasoning.effort options', () => {
  const capability = getReasoningCapability({
    provider: 'openrouter',
    model: 'openai/gpt-5.2',
    baseUrl: 'https://openrouter.ai/api/v1',
  });
  assert.equal(capability.supported, true);
  assert.equal(capability.strategy, 'openrouter-reasoning');
  assert.deepEqual(
    buildReasoningRequestOptions({
      provider: 'openrouter',
      model: 'openai/gpt-5.2',
      baseUrl: 'https://openrouter.ai/api/v1',
      requestReasoning: true,
      reasoningEffort: 'high',
    }),
    { reasoning: { effort: 'high' } },
  );
  assert.deepEqual(
    buildReasoningRequestOptions({
      provider: 'openrouter',
      model: 'openai/gpt-5.2',
      baseUrl: 'https://openrouter.ai/api/v1',
      requestReasoning: true,
      reasoningEffort: 'auto',
    }),
    {},
  );
});

test('OpenRouterProvider lists OpenRouter models without filtering provider slugs', async () => {
  const provider = new OpenRouterProvider({ apiKey: 'or-key' });
  provider.requestJson = async ({ url, method, headers }) => {
    assert.equal(url, 'https://openrouter.ai/api/v1/models');
    assert.equal(method, 'GET');
    assert.equal(headers.Authorization, 'Bearer or-key');
    return {
      data: [
        { id: 'openrouter/auto' },
        { id: 'anthropic/claude-sonnet-4.5' },
        { id: 'openai/gpt-5.2' },
        { id: 'deepseek/deepseek-v3.2' },
      ],
    };
  };
  assert.deepEqual(await provider.listModels(), [
    'openrouter/auto',
    'anthropic/claude-sonnet-4.5',
    'openai/gpt-5.2',
    'deepseek/deepseek-v3.2',
  ]);
});

test('OpenRouterProvider falls back to auto router when models endpoint fails', async () => {
  const provider = new OpenRouterProvider({ apiKey: 'or-key' });
  provider.requestJson = async () => {
    throw new Error('network down');
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(await provider.listModels(), ['openrouter/auto']);
  } finally {
    console.warn = originalWarn;
  }
});

test('LLMClient can create the OpenRouter provider', () => {
  const client = new LLMClient({ provider: 'openrouter', apiKey: 'or-key' });
  assert.equal(client.provider instanceof OpenRouterProvider, true);
});

test('ConfigPanel exposes OpenRouter as a chat provider with defaults', async () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = previousLocalStorage || {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  try {
    const { ConfigPanel } = await import('../../src/scripts/ui/config-panel.js');
    const panel = new ConfigPanel();
    assert.equal(panel.getProviderOptions().some(item => item.value === 'openrouter'), true);
    assert.deepEqual(panel.getProviderDefaults('openrouter'), {
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'openrouter/auto',
      urlHelp: 'OpenRouter API 基础 URL',
    });

    panel.activeTab = 'image';
    assert.equal(panel.getProviderOptions().some(item => item.value === 'openrouter'), false);
  } finally {
    if (previousLocalStorage) {
      globalThis.localStorage = previousLocalStorage;
    } else {
      delete globalThis.localStorage;
    }
  }
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) process.exit(1);
