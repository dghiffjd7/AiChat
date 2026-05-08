import assert from 'node:assert/strict';
import {
  createConfigRuntimeAdapter,
  createConfigProfile,
  ensureConfigStores,
  getActiveConfigProfile,
  getActiveConfigProfileId,
  getBridgeConfig,
  getConfigProfileById,
  getConfigProfiles,
  isBridgeConfigured,
  loadBridgeConfig,
  reloadBridgeConfig,
  resolveConfigRuntimeBridge,
  setActiveConfigProfile,
  syncChatRuntimeConfigToBridge,
} from '../../src/scripts/ui/config-runtime-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('resolveConfigRuntimeBridge binds explicit config runtime methods', () => {
  const bridge = {
    config: { id: 'config-manager' },
    marker: 'bridge-marker',
    getConfig() {
      return { marker: this.marker };
    },
    loadConfig() {
      return { loaded: this.marker };
    },
    reloadConfig() {
      return { reloaded: this.marker };
    },
    ensureConfigStores() {
      return `ensured:${this.marker}`;
    },
    getConfigProfiles() {
      return [{ id: this.marker }];
    },
    getConfigProfileById(id) {
      return { id, marker: this.marker };
    },
    getActiveConfigProfile() {
      return { active: this.marker };
    },
    getActiveConfigProfileId() {
      return this.marker;
    },
    setActiveConfigProfile(id) {
      return { id, marker: this.marker };
    },
    createConfigProfile(name, config) {
      return { name, config, marker: this.marker };
    },
    setChatRuntimeConfig(config) {
      return { configured: config.enabled === true };
    },
    isConfigured() {
      return this.marker === 'bridge-marker';
    },
  };
  const context = resolveConfigRuntimeBridge({ bridge });
  assert.equal(context.configManager.id, 'config-manager');
  assert.deepEqual(context.getConfig(), { marker: 'bridge-marker' });
  assert.deepEqual(context.loadConfig(), { loaded: 'bridge-marker' });
  assert.deepEqual(context.reloadConfig(), { reloaded: 'bridge-marker' });
  assert.equal(context.ensureConfigStores(), 'ensured:bridge-marker');
  assert.deepEqual(context.getConfigProfiles(), [{ id: 'bridge-marker' }]);
  assert.deepEqual(context.getConfigProfileById('p1'), { id: 'p1', marker: 'bridge-marker' });
  assert.deepEqual(context.getActiveConfigProfile(), { active: 'bridge-marker' });
  assert.equal(context.getActiveConfigProfileId(), 'bridge-marker');
  assert.deepEqual(context.setActiveConfigProfile('p2'), { id: 'p2', marker: 'bridge-marker' });
  assert.deepEqual(context.createConfigProfile('New', { provider: 'openai' }), {
    name: 'New',
    config: { provider: 'openai' },
    marker: 'bridge-marker',
  });
  assert.deepEqual(context.setChatRuntimeConfig({ enabled: true }), { configured: true });
  assert.equal(context.isConfigured(), true);
});

test('getBridgeConfig and loadBridgeConfig prefer contract methods with config fallback', async () => {
  const contractBridge = {
    getConfig: () => ({ provider: 'contract' }),
    loadConfig: async () => ({ provider: 'loaded-contract' }),
  };
  const fallbackBridge = {
    config: {
      loaded: false,
      get() {
        return { provider: this.loaded ? 'loaded-fallback' : 'fallback' };
      },
      async load() {
        this.loaded = true;
        return { provider: 'raw-load' };
      },
    },
  };
  assert.deepEqual(getBridgeConfig(contractBridge), { provider: 'contract' });
  assert.deepEqual(await loadBridgeConfig(contractBridge), { provider: 'loaded-contract' });
  assert.deepEqual(getBridgeConfig(fallbackBridge), { provider: 'fallback' });
  assert.deepEqual(await loadBridgeConfig(fallbackBridge), { provider: 'loaded-fallback' });
});

test('reloadBridgeConfig uses contract method or config manager fallback', async () => {
  const contractBridge = {
    reloadConfig: async () => ({ provider: 'contract' }),
  };
  const fallbackBridge = {
    config: {
      async reload() {
        return { provider: 'fallback' };
      },
    },
  };
  assert.deepEqual(await reloadBridgeConfig(contractBridge), { provider: 'contract' });
  assert.deepEqual(await reloadBridgeConfig(fallbackBridge), { provider: 'fallback' });
});

test('profile helpers prefer contract methods with config manager fallback', async () => {
  const contractBridge = {
    ensureConfigStores: async () => 'contract-ready',
    getConfigProfiles: () => [{ id: 'contract' }],
    getConfigProfileById: id => ({ id, source: 'contract' }),
    getActiveConfigProfile: () => ({ id: 'active-contract' }),
    getActiveConfigProfileId: () => 'active-contract',
    setActiveConfigProfile: async id => ({ id, source: 'contract-set' }),
    createConfigProfile: async (name, config) => ({ name, config, source: 'contract-create' }),
  };
  const fallbackBridge = {
    config: {
      ensured: false,
      async ensureStores() {
        this.ensured = true;
        return 'fallback-ready';
      },
      getProfiles: () => [{ id: 'fallback' }],
      getProfileById: id => ({ id, source: 'fallback' }),
      getActiveProfile: () => ({ id: 'active-fallback' }),
      getActiveProfileId: () => 'active-fallback',
      setActiveProfile: async id => ({ id, source: 'fallback-set' }),
      createProfile: async (name, config) => ({ name, config, source: 'fallback-create' }),
    },
  };
  assert.equal(await ensureConfigStores(contractBridge), 'contract-ready');
  assert.deepEqual(getConfigProfiles(contractBridge), [{ id: 'contract' }]);
  assert.deepEqual(getConfigProfileById(contractBridge, 'p1'), { id: 'p1', source: 'contract' });
  assert.deepEqual(getActiveConfigProfile(contractBridge), { id: 'active-contract' });
  assert.equal(getActiveConfigProfileId(contractBridge), 'active-contract');
  assert.deepEqual(await setActiveConfigProfile(contractBridge, 'p2'), { id: 'p2', source: 'contract-set' });
  assert.deepEqual(await createConfigProfile(contractBridge, 'New', { model: 'm' }), {
    name: 'New',
    config: { model: 'm' },
    source: 'contract-create',
  });
  assert.equal(await ensureConfigStores(fallbackBridge), 'fallback-ready');
  assert.deepEqual(getConfigProfiles(fallbackBridge), [{ id: 'fallback' }]);
  assert.deepEqual(getConfigProfileById(fallbackBridge, 'p1'), { id: 'p1', source: 'fallback' });
  assert.deepEqual(getActiveConfigProfile(fallbackBridge), { id: 'active-fallback' });
  assert.equal(getActiveConfigProfileId(fallbackBridge), 'active-fallback');
  assert.deepEqual(await setActiveConfigProfile(fallbackBridge, 'p2'), { id: 'p2', source: 'fallback-set' });
  assert.deepEqual(await createConfigProfile(fallbackBridge, 'New', { model: 'm' }), {
    name: 'New',
    config: { model: 'm' },
    source: 'fallback-create',
  });
});

test('createConfigRuntimeAdapter exposes config manager compatible surface', async () => {
  const bridge = {
    getConfig: () => ({ provider: 'openai' }),
    loadConfig: async () => ({ provider: 'loaded' }),
    reloadConfig: async () => ({ provider: 'reloaded' }),
    getConfigProfiles: () => [{ id: 'p1' }],
    getConfigProfileById: id => ({ id }),
    getActiveConfigProfile: () => ({ id: 'active' }),
    getActiveConfigProfileId: () => 'active',
    setActiveConfigProfile: async id => ({ id, active: true }),
    createConfigProfile: async (name, config) => ({ id: 'created', name, config }),
  };
  const adapter = createConfigRuntimeAdapter(bridge);
  assert.deepEqual(adapter.get(), { provider: 'openai' });
  assert.deepEqual(await adapter.load(), { provider: 'loaded' });
  assert.deepEqual(await adapter.reload(), { provider: 'reloaded' });
  assert.deepEqual(adapter.getProfiles(), [{ id: 'p1' }]);
  assert.deepEqual(adapter.getProfileById('p2'), { id: 'p2' });
  assert.deepEqual(adapter.getActiveProfile(), { id: 'active' });
  assert.equal(adapter.getActiveProfileId(), 'active');
  assert.deepEqual(await adapter.setActiveProfile('p2'), { id: 'p2', active: true });
  assert.deepEqual(await adapter.createProfile('New', { provider: 'custom' }), {
    id: 'created',
    name: 'New',
    config: { provider: 'custom' },
  });
});

test('syncChatRuntimeConfigToBridge uses contract method when available', () => {
  const calls = [];
  const bridge = {
    setChatRuntimeConfig(config) {
      calls.push(config);
      return { ok: true, configured: true, clientReady: true };
    },
  };
  const result = syncChatRuntimeConfigToBridge({
    bridge,
    runtime: { provider: 'openai' },
  });
  assert.deepEqual(calls, [{ provider: 'openai' }]);
  assert.deepEqual(result, { ok: true, configured: true, clientReady: true });
});

test('isBridgeConfigured prefers contract method and defaults to configured', () => {
  assert.equal(isBridgeConfigured({ isConfigured: () => false }), false);
  assert.equal(isBridgeConfigured({ isConfigured: () => true }), true);
  assert.equal(isBridgeConfigured({}), true);
});

test('syncChatRuntimeConfigToBridge fallback writes config and client', () => {
  const stored = [];
  const bridge = {
    config: {
      set: config => stored.push(config),
    },
    client: null,
  };
  const result = syncChatRuntimeConfigToBridge({
    bridge,
    runtime: { provider: 'openai', apiKey: 'k' },
    canInitClient: config => Boolean(config.apiKey),
    createClient: config => ({ provider: config.provider }),
  });
  assert.deepEqual(stored, [{ provider: 'openai', apiKey: 'k' }]);
  assert.deepEqual(bridge.client, { provider: 'openai' });
  assert.deepEqual(result, { ok: true, configured: true, clientReady: true });
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

if (failed > 0) {
  process.exit(1);
}
