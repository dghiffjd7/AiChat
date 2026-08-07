import assert from 'node:assert/strict';

import {
  BRIDGE_CONTRACT_DOMAINS,
  ensureBridgeContractRegistry,
  ensureDebugUiRegistry,
  getBridgeContractRegistry,
  registerBridgeContractMetadata,
  registerChatUiBridgeContract,
  registerConfigRuntimeBridgeContract,
  registerGenerationBridgeContract,
  registerMessageActionBridgeContract,
  registerMemoryStoreBridgeContract,
  registerMemoryUpdateBridgeContract,
  registerPersonaBridgeContract,
  registerPresetStoreBridgeContract,
  registerPromptInjectionBridgeContract,
  registerPromptProcessingBridgeContract,
  registerRegexStoreBridgeContract,
  registerRegexTransformBridgeContract,
  registerRoleWorldBridgeContract,
  registerRuntimeServiceBridgeContract,
  registerSessionStateBridgeContract,
  registerSharedSessionBridgeContract,
  registerScriptRuntimeBridgeContract,
  registerTurnCheckpointBridgeContract,
  registerUiUtilityBridgeContract,
  registerVariableRuntimeBridgeContract,
  registerWorldStoreBridgeContract,
  registerWorldSessionBridgeContract,
} from '../../src/scripts/ui/app-bridge-contract.js';

{
  const appBridge = {};
  const ok = registerVariableRuntimeBridgeContract(appBridge, {
    initializeMvuVariables: sessionId => ({ sessionId, applied: true }),
    reconvertMvuVariables: async options => ({ ...options, recovered: true }),
  });
  assert.equal(ok, true);
  assert.deepEqual(appBridge.initializeMvuVariables('rp:hero'), {
    sessionId: 'rp:hero',
    applied: true,
  });
  assert.deepEqual(await appBridge.reconvertMvuVariables({ sessionId: 'rp:hero' }), {
    sessionId: 'rp:hero',
    recovered: true,
  });
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(
    registry.contracts.initializeMvuVariables.domain,
    BRIDGE_CONTRACT_DOMAINS.variableRuntime,
  );
  assert.equal(
    registry.contracts.reconvertMvuVariables.domain,
    BRIDGE_CONTRACT_DOMAINS.variableRuntime,
  );
  assert.equal(registry.contracts.reconvertMvuVariables.status, 'covered');
  console.log('ok - registerVariableRuntimeBridgeContract assigns variable recovery actions');
}

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
    getCurrentCharacterId: () => 'character:p1',
    getPersonaScope: () => 'scope:p1',
    setPersonaScope: scopeId => `set:${scopeId}`,
    deletePersonaCard: async id => `delete:${id}`,
    cleanupPersonaScopedData: async (keepIds, deleteIds) => ({ keepIds, deleteIds }),
    switchPersona: async () => true,
  });
  assert.equal(ok, true);
  assert.equal(appBridge.getActivePersonaId(), 'p1');
  assert.equal(appBridge.getCurrentCharacterId(), 'character:p1');
  assert.equal(appBridge.getPersonaScope(), 'scope:p1');
  assert.equal(appBridge.setPersonaScope('scope:p2'), 'set:scope:p2');
  assert.equal(await appBridge.deletePersonaCard('p3'), 'delete:p3');
  assert.deepEqual(await appBridge.cleanupPersonaScopedData(['p1'], ['p3']), {
    keepIds: ['p1'],
    deleteIds: ['p3'],
  });
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
  assert.equal(registry.contracts.getActiveSessionId.returns, 'string');
  assert.equal(registry.contracts.getActiveSessionId.status, 'covered');
  assert.deepEqual(registry.contracts.setActiveSession.params, ['sessionId: string']);
  assert.equal(registry.contracts.setActiveSession.returns, 'void');
  assert.equal(registry.contracts.setActiveSession.sideEffects.includes('dispatches plugin/script session.changed'), true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.sessionState].setActiveSession, true);
  console.log('ok - registerSessionStateBridgeContract assigns session-state helpers and metadata');
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
    setRoleWorldResolver: appBridge.setRoleWorldResolver.bind(appBridge),
    setWorldLifecycleHandler: appBridge.setWorldLifecycleHandler.bind(appBridge),
    setSessionWorldIds: (sessionId, worldIds, options = {}) => ({ sessionId, worldIds, options }),
    assignRoleWorldToPersona: async () => 'assign',
    buildWorldDebugLabel: () => ({ sessionId: 's1' }),
    explainWorldEntryActivation: (worldId, entryId, label) => ({ worldId, entryId, label }),
  });
  assert.equal(ok, true);
  assert.deepEqual(appBridge.setSessionWorldIds('s1', ['w1'], { silent: true }), {
    sessionId: 's1',
    worldIds: ['w1'],
    options: { silent: true },
  });
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
  assert.equal(registry.contracts.setRoleWorldResolver.domain, BRIDGE_CONTRACT_DOMAINS.roleWorld);
  assert.equal(registry.contracts.setWorldLifecycleHandler.domain, BRIDGE_CONTRACT_DOMAINS.roleWorld);
  assert.equal(registry.contracts.setSessionWorldIds.domain, BRIDGE_CONTRACT_DOMAINS.roleWorld);
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
    getWorldInfoSnapshot: async id => ({ worldbookId: id, revision: 1, generation: 1 }),
    saveWorldInfo: async (id, data) => calls.push(['save', id, data]),
    worldInfoExists: async id => id === 'w1',
    auditWorldInfoStorage: async () => ({ nativeOnlyIds: ['legacy'] }),
    listWorlds: async () => ['w1'],
    waitForWorldStoreReady: async () => true,
    loadStoredWorldInfo: id => ({ id, stored: true }),
    hasStoredWorldInfo: id => id === 'w1',
    bindWorldToSession: (sessionId, worldId, options = {}) => calls.push(['bind', sessionId, worldId, options]),
    deleteWorldInfo: async id => calls.push(['delete', id]),
    renameWorldInfo: async (from, to) => calls.push(['rename', from, to]),
  });
  assert.deepEqual(await appBridge.getWorldInfo('w1'), { id: 'w1' });
  assert.deepEqual(await appBridge.getWorldInfoSnapshot('w1'), {
    worldbookId: 'w1',
    revision: 1,
    generation: 1,
  });
  await appBridge.saveWorldInfo('w1', { name: 'World' });
  assert.equal(await appBridge.worldInfoExists('w1'), true);
  assert.deepEqual(await appBridge.auditWorldInfoStorage(), { nativeOnlyIds: ['legacy'] });
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
  assert.equal(registry.contracts.getWorldInfoSnapshot.domain, BRIDGE_CONTRACT_DOMAINS.worldStore);
  assert.equal(registry.contracts.worldInfoExists.domain, BRIDGE_CONTRACT_DOMAINS.worldStore);
  assert.equal(registry.contracts.auditWorldInfoStorage.domain, BRIDGE_CONTRACT_DOMAINS.worldStore);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].waitForWorldStoreReady, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].loadStoredWorldInfo, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].hasStoredWorldInfo, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].bindWorldToSession, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldStore].renameWorldInfo, true);
  console.log('ok - registerWorldStoreBridgeContract assigns world-store helpers');
}

{
  const appBridge = {};
  const worldSessionMap = { s1: ['w1'] };
  registerWorldSessionBridgeContract(appBridge, {
    getWorldSessionMap: () => worldSessionMap,
    getWorldIdsForSession: sessionId => worldSessionMap?.[sessionId] || [],
    getWorldSessionBindingSnapshot: sessionId => ({ sessionId, scopeId: 'p1', worldbookIds: [] }),
    updateWorldSessionBinding: (sessionId, options) => ({ sessionId, options }),
    getCurrentWorldId: () => 'w1',
    getCurrentWorldIds: () => ['w1'],
    getGlobalWorldId: () => 'global',
    emitWorldInfoChanged: detail => ({ emitted: detail }),
    setCurrentWorld: (worldId, sessionId) => ({ worldId, sessionId }),
    replaceWorldSessionMap: map => ({ replaced: map }),
    renameWorldSessionMapEntry: (from, to) => `${from}->${to}`,
    deleteWorldSessionMapEntry: id => `delete:${id}`,
    persistWorldSessionMap: () => true,
  });
  assert.equal(appBridge.getWorldSessionMap(), worldSessionMap);
  assert.deepEqual(appBridge.getWorldIdsForSession('s1'), ['w1']);
  assert.deepEqual(appBridge.getWorldSessionBindingSnapshot('s1'), {
    sessionId: 's1',
    scopeId: 'p1',
    worldbookIds: [],
  });
  assert.deepEqual(appBridge.updateWorldSessionBinding('s1', { worldbookId: 'w2' }), {
    sessionId: 's1',
    options: { worldbookId: 'w2' },
  });
  assert.equal(appBridge.getCurrentWorldId(), 'w1');
  assert.deepEqual(appBridge.getCurrentWorldIds(), ['w1']);
  assert.equal(appBridge.getGlobalWorldId(), 'global');
  assert.deepEqual(appBridge.emitWorldInfoChanged({ sessionId: 's1' }), { emitted: { sessionId: 's1' } });
  assert.deepEqual(appBridge.setCurrentWorld('w2', 's2'), { worldId: 'w2', sessionId: 's2' });
  assert.deepEqual(appBridge.replaceWorldSessionMap({ s2: ['w2'] }), { replaced: { s2: ['w2'] } });
  assert.equal(appBridge.renameWorldSessionMapEntry('s1', 's2'), 's1->s2');
  assert.equal(appBridge.deleteWorldSessionMapEntry('s2'), 'delete:s2');
  assert.equal(appBridge.persistWorldSessionMap(), true);
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getWorldSessionMap.domain, BRIDGE_CONTRACT_DOMAINS.worldSession);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].getWorldIdsForSession, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].getWorldSessionBindingSnapshot, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].updateWorldSessionBinding, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].getCurrentWorldId, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].getCurrentWorldIds, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].getGlobalWorldId, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].emitWorldInfoChanged, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].setCurrentWorld, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.worldSession].persistWorldSessionMap, true);
  console.log('ok - registerWorldSessionBridgeContract assigns world-session helpers');
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
    isConfigured: () => true,
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
  assert.equal(appBridge.isConfigured(), true);
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
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.configRuntime].isConfigured, true);
  console.log('ok - registerConfigRuntimeBridgeContract assigns config runtime helpers');
}

{
  const appBridge = {};
  const presetStore = { id: 'preset-store' };
  registerPresetStoreBridgeContract(appBridge, {
    getPresetStore: () => presetStore,
  });
  assert.equal(appBridge.getPresetStore(), presetStore);
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getPresetStore.domain, BRIDGE_CONTRACT_DOMAINS.presetStore);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.presetStore].getPresetStore, true);
  console.log('ok - registerPresetStoreBridgeContract assigns preset store getter');
}

{
  const appBridge = {};
  const scriptStore = { id: 'script-store' };
  const scriptRuntime = { id: 'script-runtime' };
  const calls = [];
  registerScriptRuntimeBridgeContract(appBridge, {
    setScriptRuntime: runtime => calls.push(['set-runtime', runtime]),
    getScriptStore: () => scriptStore,
    getScriptRuntime: () => scriptRuntime,
    restartScriptWorker: reason => calls.push(['restart', reason]),
    allowScriptOnce: (sessionId, ids) => calls.push(['once', sessionId, ids]),
    syncScripts: payload => calls.push(['sync', payload]),
    dispatchScriptEvent: (eventName, payload, options) => calls.push(['event', eventName, payload, options]),
  });
  appBridge.setScriptRuntime(scriptRuntime);
  assert.equal(appBridge.getScriptStore(), scriptStore);
  assert.equal(appBridge.getScriptRuntime(), scriptRuntime);
  appBridge.restartScriptWorker('reload');
  appBridge.allowScriptOnce('s1', ['a']);
  appBridge.syncScripts({ sessionId: 's1' });
  appBridge.dispatchScriptEvent('message.before_render', { id: 'm1' }, { allowMutate: false });
  assert.deepEqual(calls, [
    ['set-runtime', scriptRuntime],
    ['restart', 'reload'],
    ['once', 's1', ['a']],
    ['sync', { sessionId: 's1' }],
    ['event', 'message.before_render', { id: 'm1' }, { allowMutate: false }],
  ]);
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getScriptStore.domain, BRIDGE_CONTRACT_DOMAINS.scriptRuntime);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.scriptRuntime].dispatchScriptEvent, true);
  console.log('ok - registerScriptRuntimeBridgeContract assigns script runtime helpers');
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
  assert.deepEqual(registry.contracts.generate.params, ['userMessage: string', 'context?: generation context']);
  assert.equal(registry.contracts.generate.returns, 'Promise<string> | AsyncGenerator<string>');
  assert.equal(registry.contracts.generate.sideEffects.includes('updates lastRequest diagnostics'), true);
  assert.equal(registry.contracts.generate.tests.includes('send-cancel-regenerate-integration.mjs'), true);
  assert.equal(registry.contracts.generate.status, 'covered');
  assert.equal(registry.contracts.buildMessages.returns, 'Provider message[]');
  assert.equal(registry.contracts.backgroundChat.sideEffects.includes('does not write chat history'), true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.generation].backgroundChat, true);
  console.log('ok - registerGenerationBridgeContract assigns generation helpers and metadata');
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
    getRegexContext: () => ({ sessionId: 's1' }),
    getRegexSession: id => ({ id }),
    listRegexLocalSets: () => [{ id: 'set-1' }],
    getRegexLocalSet: id => ({ id, name: 'Set' }),
    upsertRegexLocalSet: async set => calls.push(['upsert', set]),
    removeRegexLocalSet: async id => calls.push(['remove', id]),
    syncPresetRegexBindings: async () => calls.push(['sync-preset']),
    syncWorldRegexBindings: async () => calls.push(['sync-world']),
  });
  assert.deepEqual(appBridge.getRegexStore(), { id: 'regex-store' });
  assert.equal(await appBridge.waitForRegexStoreReady(), true);
  assert.deepEqual(appBridge.getRegexContext(), { sessionId: 's1' });
  assert.deepEqual(appBridge.getRegexSession('s1'), { id: 's1' });
  assert.deepEqual(appBridge.listRegexLocalSets(), [{ id: 'set-1' }]);
  assert.deepEqual(appBridge.getRegexLocalSet('set-1'), { id: 'set-1', name: 'Set' });
  await appBridge.upsertRegexLocalSet({ id: 'set-2' });
  await appBridge.removeRegexLocalSet('set-1');
  await appBridge.syncPresetRegexBindings();
  await appBridge.syncWorldRegexBindings();
  assert.deepEqual(calls, [
    ['upsert', { id: 'set-2' }],
    ['remove', 'set-1'],
    ['sync-preset'],
    ['sync-world'],
  ]);
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getRegexStore.domain, BRIDGE_CONTRACT_DOMAINS.regexStore);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.regexStore].getRegexContext, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.regexStore].upsertRegexLocalSet, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.regexStore].removeRegexLocalSet, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.regexStore].syncPresetRegexBindings, true);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.regexStore].syncWorldRegexBindings, true);
  console.log('ok - registerRegexStoreBridgeContract assigns regex store helpers');
}

{
  const appBridge = {};
  const pluginRuntime = { id: 'plugin-runtime' };
  registerRuntimeServiceBridgeContract(appBridge, {
    init: () => 'initialized',
    setChatStore: store => ({ store }),
    setContactsStore: store => ({ store }),
    setPluginRuntime: runtime => ({ runtime }),
    getPluginRuntime: () => pluginRuntime,
    setMomentSummaryStore: store => ({ store }),
    variableRuleEngine: { id: 'vre' },
    stageManager: { id: 'stage' },
    pluginUiManager: { id: 'plugin-ui' },
  });
  assert.equal(appBridge.init(), 'initialized');
  assert.deepEqual(appBridge.setChatStore({ id: 'chat-store' }), { store: { id: 'chat-store' } });
  assert.deepEqual(appBridge.setContactsStore({ id: 'contacts-store' }), { store: { id: 'contacts-store' } });
  assert.deepEqual(appBridge.setPluginRuntime(pluginRuntime), { runtime: pluginRuntime });
  assert.equal(appBridge.getPluginRuntime(), pluginRuntime);
  assert.deepEqual(appBridge.setMomentSummaryStore({ id: 'moment-summary-store' }), {
    store: { id: 'moment-summary-store' },
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
    getLastMemoryUpdate: sessionId => ({ sessionId }),
    setLastMemoryUpdate: (sessionId, entry) => ({ sessionId, entry }),
    getLastMemoryPlan: () => ({ enabled: true }),
    setLastMemoryPlan: plan => ({ plan }),
    buildMemoryPromptPlan: async ctx => ({ ctx }),
    rollbackLastMemoryUpdate: async () => 3,
  });
  assert.deepEqual(appBridge.getLastMemoryUpdate('s1'), { sessionId: 's1' });
  assert.deepEqual(appBridge.setLastMemoryUpdate('s1', { ok: true }), { sessionId: 's1', entry: { ok: true } });
  assert.deepEqual(appBridge.getLastMemoryPlan(), { enabled: true });
  assert.deepEqual(appBridge.setLastMemoryPlan({ enabled: false }), { plan: { enabled: false } });
  assert.deepEqual(await appBridge.buildMemoryPromptPlan({ sessionId: 's1' }), { ctx: { sessionId: 's1' } });
  assert.equal(await appBridge.rollbackLastMemoryUpdate(), 3);
  const registry = getBridgeContractRegistry(appBridge);
  assert.deepEqual(registry.contracts.getLastMemoryUpdate.params, ['sessionId: string']);
  assert.equal(registry.contracts.getLastMemoryUpdate.returns, 'Memory update entry | null');
  assert.equal(registry.contracts.setLastMemoryUpdate.sideEffects.includes('stores or clears last memory update entry scoped by sessionId'), true);
  assert.equal(registry.contracts.buildMemoryPromptPlan.returns, 'Promise<Memory prompt plan | null>');
  assert.equal(registry.contracts.rollbackLastMemoryUpdate.returns, 'Promise<boolean>');
  assert.equal(registry.contracts.rollbackLastMemoryUpdate.tests.includes('memory-lifecycle-integration.mjs'), true);
  console.log('ok - registerMemoryUpdateBridgeContract assigns memory-update helpers and metadata');
}

{
  const appBridge = {};
  const memoryTableStore = { id: 'memory-table-store' };
  const memoryTemplateStore = { id: 'memory-template-store' };
  const profile = { contactId: 'contact:1', displayName: '菲伦' };
  registerMemoryStoreBridgeContract(appBridge, {
    setMemoryTableStore: store => ({ store }),
    setMemoryTemplateStore: store => ({ store }),
    getMemoryTableStore: () => memoryTableStore,
    getMemoryTemplateStore: () => memoryTemplateStore,
    listContactProfiles: () => [profile],
    getContactProfile: id => (id === 'contact:1' ? profile : null),
    listContactProfilePendingUpdates: () => [{ id: 'pending:1', contactId: 'contact:1' }],
    approveContactProfilePendingUpdate: ({ id }) => ({ ok: id === 'pending:1' }),
    denyContactProfilePendingUpdate: ({ id }) => ({ ok: id === 'pending:1' }),
  });
  assert.deepEqual(appBridge.setMemoryTableStore(memoryTableStore), { store: memoryTableStore });
  assert.deepEqual(appBridge.setMemoryTemplateStore(memoryTemplateStore), { store: memoryTemplateStore });
  assert.equal(appBridge.getMemoryTableStore(), memoryTableStore);
  assert.equal(appBridge.getMemoryTemplateStore(), memoryTemplateStore);
  assert.deepEqual(appBridge.listContactProfiles(), [profile]);
  assert.equal(appBridge.getContactProfile('contact:1'), profile);
  assert.deepEqual(appBridge.listContactProfilePendingUpdates(), [{ id: 'pending:1', contactId: 'contact:1' }]);
  assert.deepEqual(appBridge.approveContactProfilePendingUpdate({ id: 'pending:1' }), { ok: true });
  assert.deepEqual(appBridge.denyContactProfilePendingUpdate({ id: 'pending:1' }), { ok: true });
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getMemoryTableStore.domain, BRIDGE_CONTRACT_DOMAINS.memoryStore);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.memoryStore].getContactProfile, true);
  console.log('ok - registerMemoryStoreBridgeContract assigns memory and contact profile store helpers');
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
  const chatUI = { id: 'chat-ui' };
  registerChatUiBridgeContract(appBridge, {
    setChatUI: ui => ({ ui }),
    getChatUI: () => chatUI,
  });
  assert.deepEqual(appBridge.setChatUI(chatUI), { ui: chatUI });
  assert.equal(appBridge.getChatUI(), chatUI);
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.getChatUI.domain, BRIDGE_CONTRACT_DOMAINS.chatUi);
  assert.equal(registry.domains[BRIDGE_CONTRACT_DOMAINS.chatUi].getChatUI, true);
  console.log('ok - registerChatUiBridgeContract assigns chat ui getter');
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

// rename 生命周期源码契约：真实 AppBridge 无法在 Node 中安全实例化（模块顶层实例化多个 store），
// 行为验证依赖真机 CDP；此处锁定 CAS 写入、绑定迁移、原资源删除与 revision 提交顺序。
{
  const fs = await import('node:fs');
  const bridgeSource = fs.readFileSync(
    new URL('../../src/scripts/ui/bridge.js', import.meta.url),
    'utf8',
  );
  const renameStart = bridgeSource.indexOf('async renameWorldInfo(');
  assert.ok(renameStart > 0, 'renameWorldInfo 必须存在');
  const renameEnd = bridgeSource.indexOf('async deleteWorldInfo(', renameStart);
  const renameBody = bridgeSource.slice(renameStart, renameEnd);
  const orderedMarkers = [
    'await this._saveWorldInfoStorage(to, { ...(data || {}), name: to })',
    'this.worldInfoConcurrency.commitSave(to, payload)',
    'this.persistWorldSessionMap()',
    'this.persistGlobalWorldId()',
    'await this.regex.persist()',
    "await this.worldLifecycleHandler?.({ type: 'rename', from, to })",
    'await this._removeWorldInfoStorage(from)',
    'this.worldInfoConcurrency.commitDelete(from)',
  ];
  let cursor = -1;
  for (const marker of orderedMarkers) {
    const index = renameBody.indexOf(marker);
    assert.ok(index >= 0, `rename 生命周期缺少步骤：${marker}`);
    assert.ok(index > cursor, `rename 生命周期顺序被重排：${marker} 必须晚于前一步骤`);
    cursor = index;
  }
  const removeStart = bridgeSource.indexOf('async _removeWorldInfoStorage(');
  assert.ok(removeStart > 0, '_removeWorldInfoStorage 必须存在');
  const removeBody = bridgeSource.slice(removeStart, renameStart);
  assert.ok(
    removeBody.includes("safeInvoke('delete_world_info'"),
    '_removeWorldInfoStorage 必须调用原生 delete_world_info（否则旧原生文件成孤儿）',
  );
  assert.ok(
    removeBody.includes('await this.worldStore.remove(target, { skipNative: nativeAvailable, nativeDeleted })'),
    '_removeWorldInfoStorage 必须清理前端 worldStore 条目',
  );
  assert.ok(
    removeBody.indexOf("safeInvoke('delete_world_info'")
      < removeBody.indexOf('await this.worldStore.remove(target, { skipNative: nativeAvailable, nativeDeleted })'),
    '原生删除必须先于前端删除（真错误重抛时保持双存储一致可重试）',
  );
  assert.match(
    renameBody,
    /const refCandidates = names\.filter[\s\S]*?this\.worldStore\?\.getMetadata\?\.\(wid\)[\s\S]*?for \(const wid of refCandidates\)/,
    'rename 必须先用索引 refs 筛选引用者，再读取正文',
  );
  assert.match(
    renameBody,
    /for \(let attempt = 0; attempt < 3 && !settled[\s\S]*?rename world refs rewrite conflicted repeatedly/,
    'rename refs 重写冲突必须重读快照重试，重试耗尽必须告警而非静默跳过',
  );

  const waitReadyStart = bridgeSource.indexOf('async waitForWorldStoreReady()');
  const waitReadyEnd = bridgeSource.indexOf('getWorldInfoMetadata(', waitReadyStart);
  const waitReadyBody = bridgeSource.slice(waitReadyStart, waitReadyEnd);
  assert.match(waitReadyBody, /await this\.worldStore\.ready/);
  assert.doesNotMatch(waitReadyBody, /loadAll/);

  assert.match(bridgeSource, /getGlobalWorldIdsKey\(\) \{\s*return 'global_world_ids_shared_v1';\s*\}/);
  assert.match(bridgeSource, /getResolvedWorldState[\s\S]*?globalWorldId: globalWorldIds\[0\] \|\| '',\s*globalWorldIds,/);
  assert.match(bridgeSource, /safeInvoke\('save_kv', \{ name: this\.getGlobalWorldIdsKey\(\), data: this\.globalWorldIds \}\)/);
  assert.match(renameBody, /const globalWorldIds = this\.getGlobalWorldIds\(\)[\s\S]*?globalWorldIds\.includes\(from\)/);
  const deleteStart = bridgeSource.indexOf('async deleteWorldInfo(');
  const deleteEnd = bridgeSource.indexOf('async listWorlds(', deleteStart);
  const deleteBody = bridgeSource.slice(deleteStart, deleteEnd);
  assert.match(deleteBody, /const globalWorldIds = this\.getGlobalWorldIds\(\)[\s\S]*?filter\(id => id !== target\)/);
  assert.equal(
    (bridgeSource.match(/resolvedWorldState\.globalWorldIds\.forEach\(\(id\) =>/g) || []).length >= 3,
    true,
    'all prompt assembly paths must collect every enabled global worldbook',
  );
  console.log('ok - renameWorldInfo lifecycle markers stay present and ordered (incl. old native file cleanup)');
}

{
  const fs = await import('node:fs');
  const appSource = fs.readFileSync(
    new URL('../../src/scripts/ui/app.js', import.meta.url),
    'utf8',
  );
  const greetingStart = appSource.indexOf('const seedRpGreetingIfNeeded = async');
  const greetingEnd = appSource.indexOf('const resetRpHistory', greetingStart);
  const greetingBody = appSource.slice(greetingStart, greetingEnd);
  assert.ok(
    greetingBody.indexOf('await ensureWorldsForSessionDisplay(sid)')
      < greetingBody.indexOf('buildRpGreetingMessage(greeting, sid)'),
    'RP 开场白必须在解析 initvar 前载入绑定世界书',
  );
  assert.equal(
    (appSource.match(/ensureRecentMessagesLoaded: sid => ensureRecentMessagesAndWorlds\(sid\)/g) || []).length,
    3,
    '首次进房、当前会话重绘与 session-changed 都必须先载入世界书再渲染历史',
  );
  const startupHistoryStart = appSource.indexOf('// Preload chat history if available');
  const startupHistoryEnd = appSource.indexOf('// Track the current in-flight generation', startupHistoryStart);
  assert.ok(
    appSource.slice(startupHistoryStart, startupHistoryEnd).includes(
      'await ensureRecentMessagesAndWorlds(currentId)',
    ),
    '冷启动预载当前会话历史前必须先定向载入世界书',
  );
  console.log('ok - cold session rendering and RP greeting preload targeted worldbooks');
}
