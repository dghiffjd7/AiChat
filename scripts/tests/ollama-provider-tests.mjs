import assert from 'node:assert/strict';

import { LLMClient } from '../../src/scripts/api/client.js';
import {
  buildOllamaCapabilityIdentity,
  clearOllamaModelCapabilitiesForTests,
  readOllamaModelCapabilities,
  recordOllamaModelCapabilities,
} from '../../src/scripts/api/ollama-model-capabilities.js';
import {
  OLLAMA_DEFAULT_BASE_URL,
  OllamaProvider,
  resolveOllamaNativeBaseUrl,
} from '../../src/scripts/api/providers/ollama.js';
import {
  buildProviderFcRequestPlan,
  resolveChatProviderFcRelease,
  resolveProviderFcTransport,
  sanitizeProviderFcInheritedRequestOptions,
} from '../../src/scripts/agent/provider-fc-transport.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const tool = {
  type: 'function',
  function: {
    name: 'emit_reply',
    description: 'Emit one reply.',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: { content: { type: 'string' } },
      required: ['content'],
    },
  },
};

test('OllamaProvider distinguishes the OpenAI-compatible and native API roots', () => {
  const provider = new OllamaProvider({ provider: 'ollama', model: 'qwen:test' });
  assert.equal(provider.provider, 'ollama');
  assert.equal(provider.baseUrl, OLLAMA_DEFAULT_BASE_URL);
  assert.equal(resolveOllamaNativeBaseUrl(provider.baseUrl), 'http://127.0.0.1:11434');

  const cloud = new OllamaProvider({
    provider: 'ollama',
    baseUrl: 'http://ollama.com/v1/',
    model: 'cloud:test',
    apiKey: 'cloud-key',
  });
  assert.equal(cloud.baseUrl, 'https://ollama.com/v1/');
  assert.equal(resolveOllamaNativeBaseUrl(cloud.baseUrl), 'https://ollama.com');
  assert.equal(cloud.getHeaders().Authorization, 'Bearer cloud-key');
});

test('OllamaProvider refreshes installed models from native tags without mutating them', async () => {
  const provider = new OllamaProvider({ provider: 'ollama', model: 'qwen:test' });
  provider.requestJson = async ({ url, method }) => {
    assert.equal(url, 'http://127.0.0.1:11434/api/tags');
    assert.equal(method, 'GET');
    return {
      models: [
        { name: 'qwen:test', digest: 'sha256:a' },
        { model: 'llama:test', digest: 'sha256:b' },
        { name: 'qwen:test', digest: 'sha256:a' },
      ],
    };
  };
  assert.deepEqual(await provider.listModels(), ['qwen:test', 'llama:test']);
});

test('OllamaProvider binds tool capability to service version and model digest', async () => {
  clearOllamaModelCapabilitiesForTests();
  const provider = new OllamaProvider({ provider: 'ollama', model: 'qwen:test' });
  const requests = [];
  provider.requestJson = async (request) => {
    requests.push(request);
    if (request.url.endsWith('/api/version')) return { version: '0.32.5' };
    if (request.url.endsWith('/api/tags')) {
      return { models: [{ name: 'qwen:test', digest: 'sha256:abc' }] };
    }
    assert.equal(request.url, 'http://127.0.0.1:11434/api/show');
    assert.equal(request.method, 'POST');
    assert.deepEqual(JSON.parse(request.body), { model: 'qwen:test' });
    return { capabilities: ['completion', 'tools'] };
  };
  const result = await provider.prepareProviderFcCapabilities();
  assert.equal(requests.length, 3);
  assert.equal(result.known, true);
  assert.equal(result.modelPresent, true);
  assert.equal(result.supportsTools, true);
  assert.equal(result.serviceVersion, '0.32.5');
  assert.equal(result.digest, 'sha256:abc');
  assert.equal(result.capabilityIdentity, buildOllamaCapabilityIdentity({
    baseUrl: OLLAMA_DEFAULT_BASE_URL,
    version: '0.32.5',
    model: 'qwen:test',
    digest: 'sha256:abc',
  }));
});

test('Ollama missing, offline, version, and digest changes remain fail-closed', async () => {
  clearOllamaModelCapabilitiesForTests();
  const provider = new OllamaProvider({ provider: 'ollama', model: 'missing:test' });
  provider.requestJson = async ({ url }) => {
    if (url.endsWith('/api/version')) return { version: '0.32.5' };
    return { models: [] };
  };
  const missing = await provider.prepareProviderFcCapabilities();
  assert.equal(missing.known, true);
  assert.equal(missing.modelPresent, false);
  assert.equal(missing.supportsTools, false);

  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    const offline = new OllamaProvider({ provider: 'ollama', model: 'offline:test' });
    recordOllamaModelCapabilities({
      baseUrl: offline.baseUrl,
      version: '0.32.5',
      model: 'offline:test',
      digest: 'sha256:stale',
      capabilities: ['tools'],
    });
    offline.requestJson = async () => { throw new Error('offline'); };
    assert.equal((await offline.prepareProviderFcCapabilities()).known, false);
  } finally {
    console.warn = originalWarn;
  }

  const first = recordOllamaModelCapabilities({
    baseUrl: OLLAMA_DEFAULT_BASE_URL,
    version: '0.32.5',
    model: 'changing:test',
    digest: 'sha256:old',
    capabilities: ['tools'],
  });
  const second = recordOllamaModelCapabilities({
    baseUrl: OLLAMA_DEFAULT_BASE_URL,
    version: '0.33.0',
    model: 'changing:test',
    digest: 'sha256:new',
    capabilities: ['tools'],
  });
  assert.notEqual(first.capabilityIdentity, second.capabilityIdentity);
  assert.equal(readOllamaModelCapabilities({
    baseUrl: OLLAMA_DEFAULT_BASE_URL,
    model: 'changing:test',
  }).capabilityIdentity, second.capabilityIdentity);
});

test('Ollama capability identity changes for every seed lookup component', () => {
  const base = {
    baseUrl: OLLAMA_DEFAULT_BASE_URL,
    version: '0.32.5',
    model: 'identity:test',
    digest: 'sha256:base',
  };
  const identity = buildOllamaCapabilityIdentity(base);
  [
    { ...base, baseUrl: 'https://ollama.com/v1' },
    { ...base, version: '0.32.6' },
    { ...base, model: 'identity:other' },
    { ...base, digest: 'sha256:other' },
  ].forEach(candidate => assert.notEqual(buildOllamaCapabilityIdentity(candidate), identity));
});

test('Ollama FC probes require exact endpoint and live tool metadata but stay unreleased without a cohort seed', () => {
  clearOllamaModelCapabilitiesForTests();
  const localConfig = {
    provider: 'ollama',
    baseUrl: OLLAMA_DEFAULT_BASE_URL,
    model: 'qwen:test',
    connectionMode: 'direct',
  };
  assert.equal(
    resolveProviderFcTransport(localConfig).endpoint,
    'official_ollama_local_chat_completions',
  );
  assert.equal(resolveProviderFcTransport({
    ...localConfig,
    baseUrl: 'https://ollama.com/v1',
  }).endpoint, 'official_ollama_cloud_chat_completions');
  assert.equal(resolveProviderFcTransport({
    ...localConfig,
    baseUrl: 'http://192.168.1.20:11434/v1',
  }).reason, 'unverified_provider_endpoint');
  assert.equal(resolveProviderFcTransport({
    ...localConfig,
    connectionMode: 'reverse_proxy',
  }).reason, 'unverified_provider_endpoint');
  assert.equal(buildProviderFcRequestPlan({ config: localConfig, tools: [tool] }).reason, 'ollama_model_capabilities_unknown');

  recordOllamaModelCapabilities({
    baseUrl: localConfig.baseUrl,
    version: '0.32.5',
    model: localConfig.model,
    digest: 'sha256:test',
    capabilities: ['completion', 'tools'],
  });
  const plan = buildProviderFcRequestPlan({ config: localConfig, tools: [tool] });
  assert.equal(plan.ok, true);
  assert.equal(plan.requestOptions.tool_choice, 'required');
  assert.equal(Object.hasOwn(plan.requestOptions, 'parallel_tool_calls'), false);
  assert.equal(resolveChatProviderFcRelease(localConfig).reason, 'provider_model_not_verified');
  assert.deepEqual(sanitizeProviderFcInheritedRequestOptions({
    provider: 'ollama',
    options: {
      temperature: 0.6,
      top_p: 0.8,
      frequency_penalty: 0,
      presence_penalty: 0,
      n: 1,
      reasoning: { effort: 'high' },
    },
  }), { temperature: 0.6, top_p: 0.8 });
});

test('LLMClient creates OllamaProvider and delegates capability preflight', async () => {
  const client = new LLMClient({ provider: 'ollama', model: 'qwen:test' });
  assert.equal(client.provider instanceof OllamaProvider, true);
  let called = 0;
  client.provider.prepareProviderFcCapabilities = async () => {
    called += 1;
    return { known: false };
  };
  assert.deepEqual(await client.prepareProviderFcCapabilities(), { known: false });
  assert.equal(called, 1);
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
