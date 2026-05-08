import assert from 'node:assert/strict';

import {
  BRIDGE_CONTRACT_DOMAINS,
  ensureBridgeContractRegistry,
  ensureDebugUiRegistry,
  getBridgeContractRegistry,
  registerBridgeContractMetadata,
  registerConfigRuntimeBridgeContract,
  registerGenerationBridgeContract,
  registerMessageActionBridgeContract,
  registerMemoryUpdateBridgeContract,
  registerPersonaBridgeContract,
  registerPromptInjectionBridgeContract,
  registerPromptProcessingBridgeContract,
  registerRegexStoreBridgeContract,
  registerRegexTransformBridgeContract,
  registerRoleWorldBridgeContract,
  registerRuntimeServiceBridgeContract,
  registerSessionStateBridgeContract,
  registerSharedSessionBridgeContract,
  registerTurnCheckpointBridgeContract,
  registerUiUtilityBridgeContract,
  registerWorldStoreBridgeContract,
} from '../../src/scripts/ui/app-bridge-contract.js';

{
  const appBridge = {};
  const methods = {
    queuePromptInjection: () => 'queue',
    peekPromptInjections: () => 'peek',
    consumePromptInjections: () => 'consume',
    notify: () => 'notify',
  };
  const ok = registerPromptInjectionBridgeContract(appBridge, methods);
  assert.equal(ok, true);
  assert.equal(appBridge.queuePromptInjection(), 'queue');
  assert.equal(appBridge.notify(), 'notify');
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.queuePromptInjection.domain, BRIDGE_CONTRACT_DOMAINS.promptInjection);
  assert.equal(registry.contracts.notify.kind, 'method');
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.promptInjection].peekPromptInjections, true);
  console.log('ok - registerPromptInjectionBridgeContract assigns prompt helpers');
}

{
  const appBridge = {};
  registerPromptProcessingBridgeContract(appBridge, {
    processTextMacros: (text, context) => `${context?.sessionId}:${text}`,
  });
  assert.equal(appBridge.processTextMacros('hello', { sessionId: 's1' }), 's1:hello');
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.processTextMacros.domain, BRIDGE_CONTRACT_DOMAINS.promptProcessing);
  console.log('ok - registerPromptProcessingBridgeContract assigns macro helpers');
}

{
  const appBridge = {};
  const ok = registerPersonaBridgeContract(appBridge, {
    getActivePersonaId: () => 'p1',
    switchPersona: async () => true,
  });
  assert.equal(ok, true);
  assert.equal(appBridge.getActivePersonaId(), 'p1');
  assert.equal(await appBridge.switchPersona(), true);
  console.log('ok - registerPersonaBridgeContract assigns persona helpers');
}

{
  const appBridge = {};
  const ok = registerSessionStateBridgeContract(appBridge, {
    getActiveSessionId: () => 's1',
    setActiveSession: next => `set:${next}`,
  });
  assert.equal(ok, true);
  assert.equal(appBridge.getActiveSessionId(), 's1');
  assert.equal(appBridge.setActiveSession('s2'), 'set:s2');
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getActiveSessionId.domain, BRIDGE_CONTRACT_DOMAINS.sessionState);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.sessionState].setActiveSession, true);
  console.log('ok - registerSessionStateBridgeContract assigns session-state helpers');
}

{
  const calls = [];
  const appBridge = {
    setRoleWorldResolver(fn) {
      calls.push(['resolver', fn('s1', { test: true })]);
    },
    setWorldLifecycleHandler(fn) {
      calls.push(['lifecycle']);
      this.lifecycleHandler = fn;
    },
  };
  const ok = registerRoleWorldBridgeContract(appBridge, {
    resolveRoleWorldBindings: (sessionId, options) => ({ sessionId, options }),
    handleWorldLifecycle: async event => ({ type: event.type }),
    assignRoleWorldToPersona: async () => 'assign',
    buildWorldDebugLabel: () => ({ sessionId: 's1' }),
    explainWorldEntryActivation: (worldId, entryId, label) => ({ worldId, entryId, label }),
  });
  assert.equal(ok, true);
  assert.equal(await appBridge.assignRoleWorldToPersona(), 'assign');
  assert.deepEqual(appBridge.buildWorldDebugLabel(), { sessionId: 's1' });
  assert.deepEqual(appBridge.explainWorldEntryActivation('w1', 'e1', { sessionId: 's2' }), {
    worldId: 'w1',
    entryId: 'e1',
    label: { sessionId: 's2' },
  });
  assert.deepEqual(calls[0], ['resolver', { sessionId: 's1', options: { test: true } }]);
  assert.equal(calls[1][0], 'lifecycle');
  assert.deepEqual(await appBridge.lifecycleHandler({ type: 'sync' }), { type: 'sync' });
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.assignRoleWorldToPersona.domain, BRIDGE_CONTRACT_DOMAINS.roleWorld);
  assert.equal(registry.contracts.buildWorldDebugLabel.domain, BRIDGE_CONTRACT_DOMAINS.roleWorld);
  assert.equal(registry.contracts.explainWorldEntryActivation.domain, BRIDGE_CONTRACT_DOMAINS.roleWorld);
  assert.deepEqual(registry.contracts.resolveRoleWorldBindings, {
    name: 'resolveRoleWorldBindings',
    domain: BRIDGE_CONTRACT_DOMAINS.roleWorld,
    kind: 'resolver',
    source: 'app-bridge-contract',
    bridgeField: 'setRoleWorldResolver',
  });
  assert.equal(registry.contracts.handleWorldLifecycle.kind, 'lifecycle-handler');
  console.log('ok - registerRoleWorldBridgeContract assigns methods and optional setters');
}

{
  const appBridge = {};
  registerSharedSessionBridgeContract(appBridge, {
    isSharedVariableSession: () => true,
    isSharedMemorySession: () => false,
  });
  assert.equal(appBridge.isSharedVariableSession(), true);
  assert.equal(appBridge.isSharedMemorySession(), false);
  console.log('ok - registerSharedSessionBridgeContract assigns shared-session helpers');
}

{
  const calls = [];
  const appBridge = {};
  registerWorldStoreBridgeContract(appBridge, {
    getWorldInfo: async id => ({ id }),
    saveWorldInfo: async (id, data) => calls.push(['save', id, data]),
    listWorlds: async () => ['w1'],
    waitForWorldStoreReady: async () => true,
    loadStoredWorldInfo: id => ({ id, stored: true }),
    hasStoredWorldInfo: id => id === 'w1',
    bindWorldToSession: (sessionId, worldId, options = {}) => calls.push(['bind', sessionId, worldId, options]),
    deleteWorldInfo: async id => calls.push(['delete', id]),
    renameWorldInfo: async (from, to) => calls.push(['rename', from, to]),
  });
  assert.deepEqual(await appBridge.getWorldInfo('w1'), { id: 'w1' });
  await appBridge.saveWorldInfo('w1', { name: 'World' });
  assert.deepEqual(await appBridge.listWorlds(), ['w1']);
  assert.equal(await appBridge.waitForWorldStoreReady(), true);
  assert.deepEqual(appBridge.loadStoredWorldInfo('w1'), { id: 'w1', stored: true });
  assert.equal(appBridge.hasStoredWorldInfo('w1'), true);
  appBridge.bindWorldToSession('s1', 'w1', { silent: true });
  await appBridge.deleteWorldInfo('w2');
  await appBridge.renameWorldInfo('old', 'new');
  assert.deepEqual(calls, [
    ['save', 'w1', { name: 'World' }],
    ['bind', 's1', 'w1', { silent: true }],
    ['delete', 'w2'],
    ['rename', 'old', 'new'],
  ]);
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.saveWorldInfo.domain, BRIDGE_CONTRACT_DOMAINS.worldStore);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].waitForWorldStoreReady, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].loadStoredWorldInfo, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].hasStoredWorldInfo, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].bindWorldToSession, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].renameWorldInfo, true);
  console.log('ok - registerWorldStoreBridgeContract assigns world-store helpers');
}

{
  const appBridge = {};
  registerConfigRuntimeBridgeContract(appBridge, {
    getConfig: () => ({ provider: 'openai' }),
    loadConfig: async () => ({ provider: 'loaded' }),
    reloadConfig: async () => ({ provider: 'reloaded' }),
    ensureConfigStores: async () => 'ensured',
    getConfigProfiles: () => [{ id: 'profile-1' }],
    getConfigProfileById: id => ({ id }),
    getActiveConfigProfile: () => ({ id: 'active' }),
    getActiveConfigProfileId: () => 'profile-1',
    setActiveConfigProfile: async id => ({ id }),
    createConfigProfile: async (name, config) => ({ name, config }),
    setChatRuntimeConfig: config => ({ configured: Boolean(config?.apiKey) }),
  });
  assert.deepEqual(appBridge.getConfig(), { provider: 'openai' });
  assert.deepEqual(await appBridge.loadConfig(), { provider: 'loaded' });
  assert.deepEqual(await appBridge.reloadConfig(), { provider: 'reloaded' });
  assert.equal(await appBridge.ensureConfigStores(), 'ensured');
  assert.deepEqual(appBridge.getConfigProfiles(), [{ id: 'profile-1' }]);
  assert.deepEqual(appBridge.getConfigProfileById('profile-2'), { id: 'profile-2' });
  assert.deepEqual(appBridge.getActiveConfigProfile(), { id: 'active' });
  assert.equal(appBridge.getActiveConfigProfileId(), 'profile-1');
  assert.deepEqual(await appBridge.setActiveConfigProfile('profile-2'), { id: 'profile-2' });
  assert.deepEqual(await appBridge.createConfigProfile('New', { provider: 'openai' }), {
    name: 'New',
    config: { provider: 'openai' },
  });
  assert.deepEqual(appBridge.setChatRuntimeConfig({ apiKey: 'k' }), { configured: true });
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getConfig.domain, BRIDGE_CONTRACT_DOMAINS.configRuntime);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].ensureConfigStores, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].getConfigProfiles, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].getConfigProfileById, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].getActiveConfigProfile, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].getActiveConfigProfileId, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].setActiveConfigProfile, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].createConfigProfile, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].setChatRuntimeConfig, true);
  console.log('ok - registerConfigRuntimeBridgeContract assigns config runtime helpers');
}

{
  const appBridge = {};
  registerGenerationBridgeContract(appBridge, {
    generate: async text => `generated:${text}`,
    buildMessages: text => [{ role: 'user', content: text }],
    backgroundChat: async messages => `background:${messages.length}`,
  });
  assert.equal(await appBridge.generate('hello'), 'generated:hello');
  assert.deepEqual(appBridge.buildMessages('hi'), [{ role: 'user', content: 'hi' }]);
  assert.equal(await appBridge.backgroundChat([{ role: 'user' }]), 'background:1');
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.generate.domain, BRIDGE_CONTRACT_DOMAINS.generation);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.generation].backgroundChat, true);
  console.log('ok - registerGenerationBridgeContract assigns generation helpers');
}

{
  const appBridge = {};
  registerRegexTransformBridgeContract(appBridge, {
    applyInputStoredRegex: text => `is:${text}`,
    applyInputDisplayRegex: text => `id:${text}`,
    applyOutputStoredRegex: text => `os:${text}`,
    applyOutputDisplayRegex: text => `od:${text}`,
    applyReasoningStoredRegex: text => `rs:${text}`,
    applyReasoningDisplayRegex: text => `rd:${text}`,
  });
  assert.equal(appBridge.applyInputStoredRegex('a'), 'is:a');
  assert.equal(appBridge.applyOutputDisplayRegex('b'), 'od:b');
  assert.equal(appBridge.applyReasoningDisplayRegex('c'), 'rd:c');
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.applyOutputStoredRegex.domain, BRIDGE_CONTRACT_DOMAINS.regexTransform);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.regexTransform].applyReasoningStoredRegex, true);
  console.log('ok - registerRegexTransformBridgeContract assigns regex transform helpers');
}

{
  const calls = [];
  const appBridge = {};
  registerRegexStoreBridgeContract(appBridge, {
    getRegexStore: () => ({ id: 'regex-store' }),
    waitForRegexStoreReady: async () => true,
    getRegexSession: id => ({ id }),
    listRegexLocalSets: () => [{ id: 'set-1' }],
    getRegexLocalSet: id => ({ id, name: 'Set' }),
    upsertRegexLocalSet: async set => calls.push(['upsert', set]),
    removeRegexLocalSet: async id => calls.push(['remove', id]),
  });
  assert.deepEqual(appBridge.getRegexStore(), { id: 'regex-store' });
  assert.equal(await appBridge.waitForRegexStoreReady(), true);
  assert.deepEqual(appBridge.getRegexSession('s1'), { id: 's1' });
  assert.deepEqual(appBridge.listRegexLocalSets(), [{ id: 'set-1' }]);
  assert.deepEqual(appBridge.getRegexLocalSet('set-1'), { id: 'set-1', name: 'Set' });
  await appBridge.upsertRegexLocalSet({ id: 'set-2' });
  await appBridge.removeRegexLocalSet('set-1');
  assert.deepEqual(calls, [
    ['upsert', { id: 'set-2' }],
    ['remove', 'set-1'],
  ]);
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getRegexStore.domain, BRIDGE_CONTRACT_DOMAINS.regexStore);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.regexStore].upsertRegexLocalSet, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.regexStore].removeRegexLocalSet, true);
  console.log('ok - registerRegexStoreBridgeContract assigns regex store helpers');
}

{
  const appBridge = {};
  registerRuntimeServiceBridgeContract(appBridge, {
    variableRuleEngine: { id: 'vre' },
    stageManager: { id: 'stage' },
    pluginUiManager: { id: 'plugin-ui' },
  });
  assert.deepEqual(appBridge.variableRuleEngine, { id: 'vre' });
  assert.deepEqual(appBridge.stageManager, { id: 'stage' });
  assert.deepEqual(appBridge.pluginUiManager, { id: 'plugin-ui' });
  console.log('ok - registerRuntimeServiceBridgeContract assigns runtime services and stores');
}

{
  const appBridge = {};
  registerTurnCheckpointBridgeContract(appBridge, {
    syncTurnCheckpointForMessage: async () => 'sync',
    restoreMemoryForActiveThread: async () => 'restore',
  });
  assert.equal(await appBridge.syncTurnCheckpointForMessage(), 'sync');
  assert.equal(await appBridge.restoreMemoryForActiveThread(), 'restore');
  console.log('ok - registerTurnCheckpointBridgeContract assigns checkpoint helpers');
}

{
  const appBridge = {};
  registerMemoryUpdateBridgeContract(appBridge, {
    rollbackLastMemoryUpdate: async () => 3,
  });
  assert.equal(await appBridge.rollbackLastMemoryUpdate(), 3);
  console.log('ok - registerMemoryUpdateBridgeContract assigns memory-update helpers');
}

{
  const appBridge = {};
  registerMessageActionBridgeContract(appBridge, {
    sendMessageFromPlugin: async () => ({ id: 'u1' }),
  });
  assert.deepEqual(await appBridge.sendMessageFromPlugin(), { id: 'u1' });
  console.log('ok - registerMessageActionBridgeContract assigns message action helpers');
}

{
  const appBridge = {};
  registerUiUtilityBridgeContract(appBridge, {
    showPromptPreview: () => true,
    requestSummaryCompaction: async () => false,
    getUiModeContext: () => 'chat',
    getGroupAvatarDebugSnapshot: async () => ({ ok: true }),
    skippedUndefinedUtility: undefined,
  });
  assert.equal(appBridge.showPromptPreview(), true);
  assert.equal(await appBridge.requestSummaryCompaction(), false);
  assert.equal(appBridge.getUiModeContext(), 'chat');
  assert.deepEqual(await appBridge.getGroupAvatarDebugSnapshot(), { ok: true });
  assert.equal('skippedUndefinedUtility' in appBridge, false);
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getUiModeContext.domain, BRIDGE_CONTRACT_DOMAINS.uiUtility);
  assert.equal(registry.contracts.skippedUndefinedUtility, undefined);
  console.log('ok - registerUiUtilityBridgeContract assigns ui/debug bridge helpers');
}

{
  assert.equal(ensureBridgeContractRegistry(null), null);
  assert.equal(getBridgeContractRegistry({}), null);
  assert.equal(registerPromptInjectionBridgeContract(null, { queuePromptInjection: () => null }), false);
  const appBridge = {};
  const registry = ensureBridgeContractRegistry(appBridge);
  assert.deepEqual(registry, { version: 1, contracts: {}, domains: {} });
  registerBridgeContractMetadata(appBridge, 'diagnostics', {
    bridgeContractRegistry: { kind: 'debug-store', source: 'test' },
  });
  assert.deepEqual(appBridge.bridgeContractRegistry.contracts.bridgeContractRegistry, {
    name: 'bridgeContractRegistry',
    domain: 'diagnostics',
    kind: 'debug-store',
    source: 'test',
  });
  console.log('ok - bridge contract registry records sidecar metadata safely');
}

{
  const appBridge = {};
  const registry = ensureDebugUiRegistry(appBridge);
  assert.deepEqual(registry, { panels: {}, stores: {}, actions: {} });
  registry.panels.sample = true;
  const nextRegistry = ensureDebugUiRegistry(appBridge);
  assert.equal(nextRegistry.panels.sample, true);
  assert.deepEqual(Object.keys(nextRegistry).sort(), ['actions', 'panels', 'stores']);
  console.log('ok - ensureDebugUiRegistry creates and normalizes registry buckets');
}
