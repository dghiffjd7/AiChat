import assert from 'node:assert/strict';

import {
  BRIDGE_CONTRACT_DOMAINS,
  ensureBridgeContractRegistry,
  ensureDebugUiRegistry,
  getBridgeContractRegistry,
  registerBridgeContractMetadata,
  registerMessageActionBridgeContract,
  registerMemoryUpdateBridgeContract,
  registerPersonaBridgeContract,
  registerPromptInjectionBridgeContract,
  registerRoleWorldBridgeContract,
  registerRuntimeServiceBridgeContract,
  registerSharedSessionBridgeContract,
  registerTurnCheckpointBridgeContract,
  registerUiUtilityBridgeContract,
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
  });
  assert.equal(ok, true);
  assert.equal(await appBridge.assignRoleWorldToPersona(), 'assign');
  assert.deepEqual(calls[0], ['resolver', { sessionId: 's1', options: { test: true } }]);
  assert.equal(calls[1][0], 'lifecycle');
  assert.deepEqual(await appBridge.lifecycleHandler({ type: 'sync' }), { type: 'sync' });
  const registry = getBridgeContractRegistry(appBridge);
  assert.equal(registry.contracts.assignRoleWorldToPersona.domain, BRIDGE_CONTRACT_DOMAINS.roleWorld);
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
