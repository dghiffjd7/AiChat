import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  APP_BRIDGE_GAP_STATUS,
  buildAppBridgeInventory,
  extractAppBridgeReferencesFromSource,
  extractBridgeContractRegistrationsFromSource,
  formatAppBridgeInventoryReport,
} from '../../src/scripts/ui/app-bridge-inventory-utils.js';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

const walkJsFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkJsFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
};

const readSourceInfo = async (fullPath) => ({
  filePath: path.relative(repoRoot, fullPath).replace(/\\/g, '/'),
  source: await readFile(fullPath, 'utf8'),
});

{
  const source = `
    const bridge = window.appBridge;
    window.appBridge?.notify?.('ok');
    this.appBridge.queuePromptInjection('s1', {});
    appBridge.switchPersona('p1');
    bridge.chatStore?.getCurrent?.();
  `;
  const refs = extractAppBridgeReferencesFromSource({ source, filePath: 'sample.js' });
  assert.deepEqual(
    refs.map(ref => [ref.owner, ref.field]),
    [
      ['window.appBridge', 'notify'],
      ['this.appBridge', 'queuePromptInjection'],
      ['appBridge', 'switchPersona'],
      ['alias:bridge', 'chatStore'],
    ],
  );
  console.log('ok - appBridge inventory extracts direct window this injected and alias references');
}

{
  const source = `
    registerPromptInjectionBridgeContract(window.appBridge, {
      queuePromptInjection,
      notify: (message) => {
        return message;
      },
    });
    registerPromptProcessingBridgeContract(window.appBridge, {
      processTextMacros: (text, context = {}) => text,
    });
    registerSessionStateBridgeContract(window.appBridge, {
      getActiveSessionId: () => 's1',
      setActiveSession: id => id,
    });
    registerRoleWorldBridgeContract(window.appBridge, {
      resolveRoleWorldBindings: (sessionId, options = {}) => ({ sessionId, options }),
      handleWorldLifecycle: async event => ({ type: event.type }),
      assignRoleWorldToPersona: async () => true,
      buildWorldDebugLabel: () => ({ sessionId: 's1' }),
      explainWorldEntryActivation: () => ({ active: true }),
    });
    registerWorldStoreBridgeContract(window.appBridge, {
      getWorldInfo: async id => ({ id }),
      saveWorldInfo: async (id, data) => ({ id, data }),
      listWorlds: async () => [],
      waitForWorldStoreReady: async () => true,
      loadStoredWorldInfo: id => ({ id }),
      hasStoredWorldInfo: id => Boolean(id),
      bindWorldToSession: (sessionId, worldId) => ({ sessionId, worldId }),
      deleteWorldInfo: async id => ({ id }),
      renameWorldInfo: async (from, to) => ({ from, to }),
    });
    registerConfigRuntimeBridgeContract(window.appBridge, {
      getConfig: () => ({ provider: 'openai' }),
      loadConfig: async () => ({ provider: 'loaded' }),
      reloadConfig: async () => ({ provider: 'reloaded' }),
      ensureConfigStores: async () => undefined,
      getConfigProfiles: () => [],
      getConfigProfileById: id => ({ id }),
      getActiveConfigProfile: () => ({ id: 'profile-1' }),
      getActiveConfigProfileId: () => 'profile-1',
      setActiveConfigProfile: async id => ({ id }),
      createConfigProfile: async (name, config) => ({ name, config }),
      setChatRuntimeConfig: config => ({ configured: Boolean(config?.apiKey) }),
    });
    registerGenerationBridgeContract(window.appBridge, {
      generate: async text => text,
      buildMessages: text => [{ role: 'user', content: text }],
      backgroundChat: async messages => messages,
    });
    registerRegexTransformBridgeContract(window.appBridge, {
      applyInputStoredRegex: text => text,
      applyInputDisplayRegex: text => text,
      applyOutputStoredRegex: text => text,
      applyOutputDisplayRegex: text => text,
      applyReasoningStoredRegex: text => text,
      applyReasoningDisplayRegex: text => text,
    });
    registerRegexStoreBridgeContract(window.appBridge, {
      getRegexStore: () => ({}),
      waitForRegexStoreReady: async () => true,
      getRegexSession: id => ({ id }),
      listRegexLocalSets: () => [],
      getRegexLocalSet: id => ({ id }),
      upsertRegexLocalSet: async set => set,
      removeRegexLocalSet: async id => id,
    });
  `;
  const registrations = extractBridgeContractRegistrationsFromSource({ source, filePath: 'app.js' });
  assert.deepEqual(
    registrations.map(item => [item.field, item.domain]),
    [
      ['queuePromptInjection', 'prompt-injection'],
      ['notify', 'prompt-injection'],
      ['processTextMacros', 'prompt-processing'],
      ['getActiveSessionId', 'session-state'],
      ['setActiveSession', 'session-state'],
      ['resolveRoleWorldBindings', 'role-world'],
      ['handleWorldLifecycle', 'role-world'],
      ['assignRoleWorldToPersona', 'role-world'],
      ['buildWorldDebugLabel', 'role-world'],
      ['explainWorldEntryActivation', 'role-world'],
      ['getWorldInfo', 'world-store'],
      ['saveWorldInfo', 'world-store'],
      ['listWorlds', 'world-store'],
      ['waitForWorldStoreReady', 'world-store'],
      ['loadStoredWorldInfo', 'world-store'],
      ['hasStoredWorldInfo', 'world-store'],
      ['bindWorldToSession', 'world-store'],
      ['deleteWorldInfo', 'world-store'],
      ['renameWorldInfo', 'world-store'],
      ['getConfig', 'config-runtime'],
      ['loadConfig', 'config-runtime'],
      ['reloadConfig', 'config-runtime'],
      ['ensureConfigStores', 'config-runtime'],
      ['getConfigProfiles', 'config-runtime'],
      ['getConfigProfileById', 'config-runtime'],
      ['getActiveConfigProfile', 'config-runtime'],
      ['getActiveConfigProfileId', 'config-runtime'],
      ['setActiveConfigProfile', 'config-runtime'],
      ['createConfigProfile', 'config-runtime'],
      ['setChatRuntimeConfig', 'config-runtime'],
      ['generate', 'generation'],
      ['buildMessages', 'generation'],
      ['backgroundChat', 'generation'],
      ['applyInputStoredRegex', 'regex-transform'],
      ['applyInputDisplayRegex', 'regex-transform'],
      ['applyOutputStoredRegex', 'regex-transform'],
      ['applyOutputDisplayRegex', 'regex-transform'],
      ['applyReasoningStoredRegex', 'regex-transform'],
      ['applyReasoningDisplayRegex', 'regex-transform'],
      ['getRegexStore', 'regex-store'],
      ['waitForRegexStoreReady', 'regex-store'],
      ['getRegexSession', 'regex-store'],
      ['listRegexLocalSets', 'regex-store'],
      ['getRegexLocalSet', 'regex-store'],
      ['upsertRegexLocalSet', 'regex-store'],
      ['removeRegexLocalSet', 'regex-store'],
    ],
  );
  console.log('ok - appBridge inventory extracts registered bridge contract names and domains');
}

{
  const scriptRoot = path.join(repoRoot, 'src/scripts');
  const files = await walkJsFiles(scriptRoot);
  const referenceSources = await Promise.all(files.map(readSourceInfo));
  const contractSources = [
    await readSourceInfo(path.join(repoRoot, 'src/scripts/ui/app.js')),
  ];
  const report = buildAppBridgeInventory({ referenceSources, contractSources });
  const registered = new Set(report.registrationStats.map(item => item.field));
  const gaps = new Map(report.gapFields.map(item => [item.field, item]));

  assert.ok(report.summary.references > 150, 'source inventory should see broad appBridge usage');
  assert.ok(report.summary.registeredFields >= 40, 'app.js should register the current bridge contract surface');
  assert.ok(report.summary.highRiskGaps <= 4, 'high-risk appBridge gaps should not regress past the current store-adapter boundary');
  assert.equal(registered.has('queuePromptInjection'), true);
  assert.equal(registered.has('switchPersona'), true);
  assert.equal(registered.has('processTextMacros'), true);
  assert.equal(registered.has('getActiveSessionId'), true);
  assert.equal(registered.has('setActiveSession'), true);
  assert.equal(registered.has('restoreMemoryForActiveThread'), true);
  assert.equal(registered.has('sendMessageFromPlugin'), true);
  assert.equal(registered.has('saveWorldInfo'), true);
  assert.equal(registered.has('waitForWorldStoreReady'), true);
  assert.equal(registered.has('loadStoredWorldInfo'), true);
  assert.equal(registered.has('hasStoredWorldInfo'), true);
  assert.equal(registered.has('bindWorldToSession'), true);
  assert.equal(registered.has('buildWorldDebugLabel'), true);
  assert.equal(registered.has('explainWorldEntryActivation'), true);
  assert.equal(registered.has('getConfig'), true);
  assert.equal(registered.has('loadConfig'), true);
  assert.equal(registered.has('reloadConfig'), true);
  assert.equal(registered.has('ensureConfigStores'), true);
  assert.equal(registered.has('getConfigProfiles'), true);
  assert.equal(registered.has('getConfigProfileById'), true);
  assert.equal(registered.has('getActiveConfigProfile'), true);
  assert.equal(registered.has('getActiveConfigProfileId'), true);
  assert.equal(registered.has('setActiveConfigProfile'), true);
  assert.equal(registered.has('createConfigProfile'), true);
  assert.equal(registered.has('setChatRuntimeConfig'), true);
  assert.equal(registered.has('generate'), true);
  assert.equal(registered.has('backgroundChat'), true);
  assert.equal(registered.has('applyOutputStoredRegex'), true);
  assert.equal(registered.has('getRegexStore'), true);
  assert.equal(registered.has('waitForRegexStoreReady'), true);
  assert.equal(registered.has('getRegexSession'), true);
  assert.equal(registered.has('listRegexLocalSets'), true);
  assert.equal(registered.has('getRegexLocalSet'), true);
  assert.equal(registered.has('upsertRegexLocalSet'), true);
  assert.equal(registered.has('removeRegexLocalSet'), true);
  assert.equal(gaps.has('queuePromptInjection'), false);
  assert.equal(gaps.has('saveWorldInfo'), false);
  assert.equal(gaps.has('waitForWorldStoreReady'), false);
  assert.equal(gaps.has('loadStoredWorldInfo'), false);
  assert.equal(gaps.has('hasStoredWorldInfo'), false);
  assert.equal(gaps.has('bindWorldToSession'), false);
  assert.equal(gaps.has('buildWorldDebugLabel'), false);
  assert.equal(gaps.has('explainWorldEntryActivation'), false);
  assert.equal(gaps.has('getConfig'), false);
  assert.equal(gaps.has('loadConfig'), false);
  assert.equal(gaps.has('reloadConfig'), false);
  assert.equal(gaps.has('ensureConfigStores'), false);
  assert.equal(gaps.has('getConfigProfiles'), false);
  assert.equal(gaps.has('getConfigProfileById'), false);
  assert.equal(gaps.has('getActiveConfigProfile'), false);
  assert.equal(gaps.has('getActiveConfigProfileId'), false);
  assert.equal(gaps.has('setActiveConfigProfile'), false);
  assert.equal(gaps.has('createConfigProfile'), false);
  assert.equal(gaps.has('setChatRuntimeConfig'), false);
  assert.equal(gaps.has('processTextMacros'), false);
  assert.equal(gaps.has('generate'), false);
  assert.equal(gaps.has('backgroundChat'), false);
  assert.equal(gaps.has('applyOutputStoredRegex'), false);
  assert.equal(gaps.has('getRegexStore'), false);
  assert.equal(gaps.has('waitForRegexStoreReady'), false);
  assert.equal(gaps.has('getRegexSession'), false);
  assert.equal(gaps.has('listRegexLocalSets'), false);
  assert.equal(gaps.has('getRegexLocalSet'), false);
  assert.equal(gaps.has('upsertRegexLocalSet'), false);
  assert.equal(gaps.has('removeRegexLocalSet'), false);

  assert.equal(gaps.has('contactsStore'), false);
  assert.equal(gaps.has('worldStore'), false);
  assert.equal(gaps.has('config'), false);
  assert.equal(gaps.has('client'), false);
  assert.equal(gaps.has('regex'), false);
  assert.equal(gaps.has('chatStore'), false);
  assert.equal(gaps.has('activeSessionId'), false);

  const text = formatAppBridgeInventoryReport(report, { limit: 8 });
  assert.match(text, /AppBridge inventory/);
  assert.match(text, /highRiskGaps=/);
  console.log(text);
  console.log('ok - appBridge inventory builds repo-wide covered and gap report');
}
