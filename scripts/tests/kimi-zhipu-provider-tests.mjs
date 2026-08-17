import assert from 'node:assert/strict';

import {
  buildProviderFcRequestPlan,
  resolveChatProviderFcRelease,
  resolveProviderFcTransport,
} from '../../src/scripts/agent/provider-fc-transport.js';
import { LLMClient } from '../../src/scripts/api/client.js';
import {
  KIMI_BASE_URL,
  KIMI_CHINA_BASE_URL,
  KIMI_DEFAULT_MODEL,
  KIMI_GLOBAL_BASE_URL,
  KimiProvider,
} from '../../src/scripts/api/providers/kimi.js';
import {
  ZHIPU_BASE_URL,
  ZHIPU_DEFAULT_MODEL,
  ZhipuProvider,
} from '../../src/scripts/api/providers/zhipu.js';

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

test('KimiProvider uses the official OpenAI-compatible defaults', () => {
  const provider = new KimiProvider({ apiKey: 'kimi-key' });
  assert.equal(provider.provider, 'kimi');
  assert.equal(provider.baseUrl, KIMI_BASE_URL);
  assert.equal(provider.model, KIMI_DEFAULT_MODEL);
  assert.equal(provider.getHeaders().Authorization, 'Bearer kimi-key');

  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hi' }], {
    temperature: 0.6,
    maxTokens: 64,
    max_completion_tokens: 64,
  });
  assert.equal(prepared.url, `${KIMI_BASE_URL}/chat/completions`);
  assert.equal(prepared.payload.model, KIMI_DEFAULT_MODEL);
  assert.equal(Object.hasOwn(prepared.payload, 'temperature'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'maxTokens'), false);
  assert.equal(prepared.payload.max_completion_tokens, 64);

  const chinaProvider = new KimiProvider({
    apiKey: 'kimi-cn-key',
    baseUrl: KIMI_CHINA_BASE_URL,
  });
  assert.equal(KIMI_BASE_URL, KIMI_GLOBAL_BASE_URL);
  assert.equal(chinaProvider.baseUrl, KIMI_CHINA_BASE_URL);
  assert.equal(
    chinaProvider.prepareChatRequest([{ role: 'user', content: 'hi' }]).url,
    `${KIMI_CHINA_BASE_URL}/chat/completions`,
  );
});

test('KimiProvider omits sampling fields that Kimi family models reject', () => {
  const provider = new KimiProvider({ apiKey: 'kimi-key', model: 'kimi-k3' });
  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hi' }], {
    temperature: 0,
    top_p: 0.8,
    n: 2,
    presence_penalty: 0.4,
    frequency_penalty: 0.2,
    max_completion_tokens: 32,
    thinking: { type: 'disabled' },
  });
  assert.equal(Object.hasOwn(prepared.payload, 'temperature'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'top_p'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'n'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'presence_penalty'), false);
  assert.equal(Object.hasOwn(prepared.payload, 'frequency_penalty'), false);
  assert.equal(prepared.payload.max_completion_tokens, 32);
  assert.deepEqual(prepared.payload.thinking, { type: 'disabled' });

  const moonshot = new KimiProvider({ apiKey: 'kimi-key', model: 'moonshot-v1-32k' });
  assert.equal(
    moonshot.prepareChatRequest([{ role: 'user', content: 'hi' }], { temperature: 0.4 }).payload.temperature,
    0.4,
  );
});

test('KimiProvider returns every server model id without duplicates', async () => {
  const provider = new KimiProvider({ apiKey: 'kimi-key', model: 'private-kimi-model' });
  provider.requestJson = async ({ url, method, headers }) => {
    assert.equal(url, `${KIMI_BASE_URL}/models`);
    assert.equal(method, 'GET');
    assert.equal(headers.Authorization, 'Bearer kimi-key');
    return [
      { id: 'kimi-k3' },
      { id: 'kimi-k2.6' },
      { id: 'moonshot-v1-128k' },
      { id: 'text-embedding-v1' },
      { id: 'kimi-k3' },
    ];
  };
  assert.deepEqual(await provider.listModels(), [
    'kimi-k3',
    'kimi-k2.6',
    'moonshot-v1-128k',
    'text-embedding-v1',
    'private-kimi-model',
  ]);
});

test('ZhipuProvider uses the official OpenAI-compatible defaults', () => {
  const provider = new ZhipuProvider({ apiKey: 'glm-key' });
  assert.equal(provider.provider, 'zhipu');
  assert.equal(provider.baseUrl, ZHIPU_BASE_URL);
  assert.equal(provider.model, ZHIPU_DEFAULT_MODEL);
  assert.equal(provider.getHeaders().Authorization, 'Bearer glm-key');

  const prepared = provider.prepareChatRequest([{ role: 'user', content: 'hi' }], {
    temperature: 0.8,
    maxTokens: 64,
    max_tokens: 64,
  });
  assert.equal(prepared.url, `${ZHIPU_BASE_URL}/chat/completions`);
  assert.equal(prepared.payload.model, ZHIPU_DEFAULT_MODEL);
  assert.equal(prepared.payload.temperature, 0.8);
  assert.equal(Object.hasOwn(prepared.payload, 'maxTokens'), false);
  assert.equal(prepared.payload.max_tokens, 64);
});

test('ZhipuProvider enables incremental tool arguments only for streaming tool requests', async () => {
  const previousTauri = globalThis.__TAURI__;
  let requestPayload = null;
  let readCount = 0;
  globalThis.__TAURI__ = {
    core: {
      invoke: async (command, args = {}) => {
        if (command === 'http_stream_request_start') {
          requestPayload = JSON.parse(args.body);
          return null;
        }
        if (command === 'http_stream_request_read') {
          readCount += 1;
          return {
            status: 200,
            ok: true,
            done: true,
            chunks: [
              'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call-1","type":"function","function":{"name":"emit_reply","arguments":"{\\"value\\":\\"ok\\"}"}}]},"finish_reason":"tool_calls"}]}\n\ndata: [DONE]\n\n',
            ],
          };
        }
        if (command === 'http_stream_request_close') return null;
        throw new Error(`unexpected command: ${command}`);
      },
    },
  };
  try {
    const provider = new ZhipuProvider({ apiKey: 'glm-key' });
    const deltas = [];
    for await (const chunk of provider.streamChat([{ role: 'user', content: 'hi' }], {
      tools: [{
        type: 'function',
        function: {
          name: 'emit_reply',
          description: 'emit',
          parameters: { type: 'object', properties: { value: { type: 'string' } } },
        },
      }],
      onProviderToolCallDelta: body => deltas.push(body),
    })) {
      assert.equal(typeof chunk === 'string' && chunk.length > 0, false);
    }
    assert.equal(readCount, 1);
    assert.equal(requestPayload.stream, true);
    assert.equal(requestPayload.tool_stream, true);
    assert.equal(deltas.length, 1);

    const nonStreaming = provider.prepareChatRequest([{ role: 'user', content: 'hi' }], {
      tools: [{ type: 'function', function: { name: 'emit_reply', parameters: { type: 'object' } } }],
    });
    assert.equal(Object.hasOwn(nonStreaming.payload, 'tool_stream'), false);
  } finally {
    if (previousTauri === undefined) delete globalThis.__TAURI__;
    else globalThis.__TAURI__ = previousTauri;
  }
});

test('ZhipuProvider refreshes only GLM chat models and preserves a manual model', async () => {
  const provider = new ZhipuProvider({ apiKey: 'glm-key', model: 'private-glm-model' });
  provider.requestJson = async ({ url, method, headers }) => {
    assert.equal(url, `${ZHIPU_BASE_URL}/models`);
    assert.equal(method, 'GET');
    assert.equal(headers.Authorization, 'Bearer glm-key');
    return {
      data: [
        { id: 'glm-5.2' },
        { id: 'glm-4.7-flash' },
        { id: 'embedding-3' },
        { id: 'cogview-4' },
        { id: 'glm-5.2' },
      ],
    };
  };
  assert.deepEqual(await provider.listModels(), [
    'glm-5.2',
    'glm-4.7-flash',
    'private-glm-model',
  ]);
});

test('dedicated providers surface refresh failures instead of reporting one fake success', async () => {
  const providers = [
    new KimiProvider({ apiKey: 'kimi-key', model: 'kimi-manual' }),
    new ZhipuProvider({ apiKey: 'glm-key', model: 'glm-manual' }),
  ];
  for (const provider of providers) {
    provider.requestJson = async () => { throw new Error('network down'); };
    await assert.rejects(() => provider.listModels(), /network down/u);
  }
});

test('LLMClient exposes Kimi as a fail-closed candidate and releases only exact Zhipu GLM 5.2', () => {
  const kimiClient = new LLMClient({ provider: 'kimi', apiKey: 'kimi-key' });
  const zhipuClient = new LLMClient({ provider: 'zhipu', apiKey: 'glm-key' });
  assert.equal(kimiClient.provider instanceof KimiProvider, true);
  assert.equal(zhipuClient.provider instanceof ZhipuProvider, true);

  const candidates = [
    {
      config: { provider: 'kimi', baseUrl: KIMI_GLOBAL_BASE_URL, model: 'kimi-k3' },
      endpoint: 'official_kimi_global_chat_completions',
    },
    {
      config: { provider: 'kimi', baseUrl: KIMI_CHINA_BASE_URL, model: 'kimi-k3' },
      endpoint: 'official_kimi_china_chat_completions',
    },
    {
      config: { provider: 'zhipu', baseUrl: ZHIPU_BASE_URL, model: 'glm-5.2' },
      endpoint: 'official_zhipu_chat_completions',
    },
  ];
  for (const { config, endpoint } of candidates) {
    assert.deepEqual(resolveProviderFcTransport(config), {
      supported: true,
      reason: '',
      provider: config.provider,
      family: 'openai',
      endpoint,
    });
    const plan = buildProviderFcRequestPlan({
      config,
      tools: [{
        type: 'function',
        function: {
          name: 'emit_reply',
          description: 'Emit one reply.',
          parameters: { type: 'object', properties: {} },
        },
      }],
    });
    assert.equal(plan.ok, true, `${config.provider}: ${plan.reason}`);
    assert.equal(plan.requestOptions.tool_choice, 'auto');
    assert.equal(plan.diagnostics.providerToolChoice, 'auto');
    assert.equal(plan.diagnostics.toolChoiceOverrideReason, `${config.provider}_tool_choice_auto_only`);
    assert.deepEqual(
      plan.generationOptions,
      config.provider === 'kimi' ? { thinking: { type: 'disabled' } } : {},
    );
  }
  for (const baseUrl of [KIMI_GLOBAL_BASE_URL, KIMI_CHINA_BASE_URL]) {
    const release = resolveChatProviderFcRelease({
      provider: 'kimi',
      baseUrl,
      model: 'kimi-k3',
    });
    assert.equal(release.enabled, false);
    assert.equal(release.reason, 'provider_rollout_deferred');
  }
  const zhipuRelease = resolveChatProviderFcRelease({
    provider: 'zhipu',
    baseUrl: ZHIPU_BASE_URL,
    model: 'glm-5.2',
  });
  assert.equal(zhipuRelease.enabled, true);
  assert.equal(zhipuRelease.capabilitySource, 'verified_seed');
  assert.equal(zhipuRelease.capabilityRuleId, 'bundled.zhipu.chat-completions.glm-5.2');
  const unverifiedZhipuModel = resolveChatProviderFcRelease({
    provider: 'zhipu',
    baseUrl: ZHIPU_BASE_URL,
    model: 'glm-5.1',
  });
  assert.equal(unverifiedZhipuModel.enabled, false);
  assert.equal(unverifiedZhipuModel.reason, 'provider_model_not_verified');
  assert.equal(resolveProviderFcTransport({
    provider: 'kimi',
    baseUrl: 'https://api.moonshot.ai.evil.example/v1',
  }).reason, 'unverified_provider_endpoint');
  assert.equal(resolveProviderFcTransport({
    provider: 'zhipu',
    baseUrl: ZHIPU_BASE_URL,
    connectionMode: 'reverse_proxy',
  }).reason, 'unverified_provider_endpoint');
});

test('ConfigPanel exposes Kimi and Zhipu only for chat with fixed official defaults', async () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = previousLocalStorage || createLocalStorage();
  try {
    const {
      ConfigPanel,
      shouldResetDirectProviderModel,
    } = await import('../../src/scripts/ui/config-panel.js');
    const panel = new ConfigPanel();
    assert.equal(panel.getProviderOptions().some(item => item.value === 'kimi'), true);
    assert.equal(panel.getProviderOptions().some(item => item.value === 'zhipu'), true);
    assert.deepEqual(panel.getProviderDefaults('kimi'), {
      baseUrl: KIMI_GLOBAL_BASE_URL,
      model: KIMI_DEFAULT_MODEL,
      urlHelp: 'Kimi 全球开放平台；中国大陆 Key 请切换连接站点',
    });
    assert.deepEqual(panel.getProviderDefaults('kimi', { kimiRegion: 'china' }), {
      baseUrl: KIMI_CHINA_BASE_URL,
      model: KIMI_DEFAULT_MODEL,
      urlHelp: 'Kimi 中国大陆开放平台；全球站 Key 与大陆站 Key 不通用',
    });
    assert.deepEqual(panel.getProviderDefaults('zhipu'), {
      baseUrl: ZHIPU_BASE_URL,
      model: ZHIPU_DEFAULT_MODEL,
      urlHelp: '智谱 BigModel API 官方地址',
    });
    assert.equal(panel.usesEditableBaseUrl('kimi'), false);
    assert.equal(panel.usesEditableBaseUrl('zhipu'), false);
    assert.equal(shouldResetDirectProviderModel('kimi', 'gemini-3.7-flash'), true);
    assert.equal(shouldResetDirectProviderModel('kimi', 'kimi-k3'), false);
    assert.equal(shouldResetDirectProviderModel('zhipu', 'kimi-k2.6'), true);
    assert.equal(shouldResetDirectProviderModel('zhipu', 'glm-5.2'), false);

    panel.activeTab = 'image';
    assert.equal(panel.getProviderOptions().some(item => item.value === 'kimi'), false);
    assert.equal(panel.getProviderOptions().some(item => item.value === 'zhipu'), false);
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test('ConfigPanel refreshes profile choices without leaving an empty menu or swallowing immediate selection', async () => {
  const previousDocument = globalThis.document;
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = previousLocalStorage || createLocalStorage();
  const options = [];
  const select = {
    value: '',
    options,
    appendChild(option) {
      options.push(option);
      if (!this.value) this.value = option.value;
    },
  };
  Object.defineProperty(select, 'innerHTML', {
    set() {
      options.length = 0;
      select.value = '';
    },
  });
  const profileButton = {};
  globalThis.document = {
    createElement: () => ({ value: '', textContent: '' }),
  };
  try {
    const { ConfigPanel } = await import('../../src/scripts/ui/config-panel.js');
    const panel = Object.create(ConfigPanel.prototype);
    panel.element = {
      querySelector(selector) {
        if (selector === '#config-profile') return select;
        if (selector === '#config-profile-btn') return profileButton;
        return null;
      },
    };
    panel.configManager = {
      getProfiles: () => [
        { id: 'profile-new', name: '新设置档' },
        { id: 'profile-old', name: '旧设置档' },
      ],
      getActiveProfileId: () => 'profile-new',
    };
    panel.customSelectMenuAnchor = profileButton;
    panel.customSelectMenuEl = { style: { display: 'block' } };
    let menuClosed = false;
    panel.closeCustomSelectMenu = () => {
      menuClosed = true;
      panel.customSelectMenuAnchor = null;
    };
    panel.refreshCustomSelect = () => {};

    panel.refreshProfileOptions();

    assert.equal(menuClosed, true);
    assert.equal(panel.isRefreshingProfile, false);
    assert.equal(select.value, 'profile-new');
    assert.deepEqual(options.map(option => option.textContent), ['新设置档', '旧设置档']);
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test('ConfigPanel keeps the selected Kimi site while applying its fixed endpoint', async () => {
  const { ConfigPanel } = await import('../../src/scripts/ui/config-panel.js');
  const fields = new Map([
    ['#config-region', { value: 'us-central1' }],
    ['#config-ollama-mode', { value: 'cloud' }],
    ['#config-kimi-region', { value: 'china' }],
    ['#config-baseurl', { value: KIMI_GLOBAL_BASE_URL, placeholder: '', nextElementSibling: null }],
    ['#config-baseurl-section', { style: {} }],
    ['#config-model', { value: KIMI_DEFAULT_MODEL, placeholder: '' }],
  ]);
  const panel = Object.create(ConfigPanel.prototype);
  panel.activeTab = 'chat';
  panel.element = { querySelector: selector => fields.get(selector) || null };
  panel.updateVoiceTtsSettings = () => {};

  panel.updateDefaultsForProvider('kimi');

  assert.equal(fields.get('#config-kimi-region').value, 'china');
  assert.equal(fields.get('#config-baseurl').value, KIMI_CHINA_BASE_URL);
});

test('ConfigManager accepts Kimi and Zhipu for chat and rejects them for image', async () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = createLocalStorage();
  try {
    const { ConfigManager } = await import('../../src/scripts/storage/config.js');
    const manager = new ConfigManager({ scope: `direct_cn_${Date.now()}` });
    for (const config of [
      { provider: 'kimi', baseUrl: KIMI_BASE_URL, model: KIMI_DEFAULT_MODEL },
      { provider: 'zhipu', baseUrl: ZHIPU_BASE_URL, model: ZHIPU_DEFAULT_MODEL },
    ]) {
      assert.doesNotThrow(() => manager.validate({ ...config }));
    }

    const imageManager = new ConfigManager({ scope: 'image' });
    for (const config of [
      { provider: 'kimi', baseUrl: KIMI_BASE_URL, model: KIMI_DEFAULT_MODEL },
      { provider: 'zhipu', baseUrl: ZHIPU_BASE_URL, model: ZHIPU_DEFAULT_MODEL },
    ]) {
      assert.throws(() => imageManager.validate({ ...config }), /无效的 provider/u);
    }
  } finally {
    if (previousLocalStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousLocalStorage;
  }
});

test('Kimi and Zhipu profiles keep independent credentials across reload', async () => {
  const previousLocalStorage = globalThis.localStorage;
  globalThis.localStorage = createLocalStorage();
  const scope = `direct_cn_keys_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  try {
    const { ConfigManager } = await import('../../src/scripts/storage/config.js');
    const manager = new ConfigManager({ scope });
    const kimiProfile = await manager.createProfile('Kimi', {
      provider: 'kimi',
      baseUrl: KIMI_BASE_URL,
      model: KIMI_DEFAULT_MODEL,
    });
    await manager.save({
      provider: 'kimi',
      baseUrl: KIMI_BASE_URL,
      model: KIMI_DEFAULT_MODEL,
      apiKey: 'kimi-secret',
    });
    const zhipuProfile = await manager.createProfile('智谱 GLM', {
      provider: 'zhipu',
      baseUrl: ZHIPU_BASE_URL,
      model: ZHIPU_DEFAULT_MODEL,
    });
    await manager.save({
      provider: 'zhipu',
      baseUrl: ZHIPU_BASE_URL,
      model: ZHIPU_DEFAULT_MODEL,
      apiKey: 'zhipu-secret',
    });

    const reloaded = new ConfigManager({ scope });
    assert.equal((await reloaded.load()).apiKey, 'zhipu-secret');
    await reloaded.setActiveProfile(kimiProfile.id);
    assert.equal(reloaded.get().apiKey, 'kimi-secret');
    await reloaded.setActiveProfile(zhipuProfile.id);
    assert.equal(reloaded.get().apiKey, 'zhipu-secret');
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
