import assert from 'node:assert/strict';

import { createGroupMemoryShareRuntime } from '../../src/scripts/ui/group-memory-share-runtime-utils.js';

{
  let capturedOptions = null;
  const proxiedCalls = [];
  const runtime = createGroupMemoryShareRuntime({
    getSessionId: () => 'group:7',
    getSummaryEl: () => ({ textContent: '' }),
    getSessionSettings: () => ({
      rpBridgeTableSettings: {
        rp_outline: { enabled: true, limit: 2 },
      },
    }),
    setSessionSettings() {},
    getContact: (sessionId) => ({
      'rp:hero': { id: 'rp:hero', name: '角色甲' },
    }[sessionId] || null),
    memoryTableStore: {
      async getMemories({ contact_id }) {
        if (contact_id === 'rp:hero') return [{ table_id: 'rp_outline', is_active: true }];
        return [];
      },
    },
    resolveTemplateDefinition: async () => ({
      tables: [
        { id: 'rp_outline', label: 'RP 大纲' },
      ],
    }),
    resolveTemplateId: async () => 'tpl:1',
    getRpCharacterNameForSession: (sessionId) => (sessionId === 'rp:hero' ? '角色甲' : ''),
    getRpSessionIdForSession: () => 'rp:hero',
    getRpSessionIdForActivePersona: () => 'rp:hero',
    documentRef: {},
    bodyEl: {},
    getGlobalSettings: () => ({
      memoryBridgeRpToChatEnabled: true,
      memoryBridgeRpToChatLimit: 6,
    }),
    notifySaveSuccess() {},
    notifySaveError() {},
    logger: { warn() {} },
    deps: {
      createSessionMemoryShareSectionRuntime: (options) => {
        capturedOptions = options;
        return {
          refreshMemoryShareSummary: async (sessionId) => {
            proxiedCalls.push(['refresh', sessionId]);
            return true;
          },
          ensureMemoryShareModal: () => {
            proxiedCalls.push(['ensure']);
            return { ok: true };
          },
          closeMemoryShareManager: () => {
            proxiedCalls.push(['close']);
            return true;
          },
          renderMemoryShareManager: async () => {
            proxiedCalls.push(['render']);
            return true;
          },
          openMemoryShareManager: async () => {
            proxiedCalls.push(['open']);
            return true;
          },
          saveMemoryShareManager: async () => {
            proxiedCalls.push(['save']);
            return true;
          },
        };
      },
    },
  });

  assert.equal(runtime.getRpDisplayName('rp:hero'), '角色甲');
  assert.equal(runtime.getDefaultRpBridgeSourceId('group:7'), 'rp:hero');

  const context = await runtime.buildMemoryShareContext(
    'group:7',
    { rp_outline: { enabled: true, limit: 2 } },
  );
  assert.equal(context.mode, 'rp_to_chat');
  assert.equal(context.sourceLabel, '角色甲');
  assert.equal(context.entries[0].rowCount, 1);

  await runtime.refreshMemoryShareSummary('group:7');
  runtime.ensureMemoryShareModal();
  runtime.closeMemoryShareManager();
  await runtime.renderMemoryShareManager();
  await runtime.openMemoryShareManager();
  await runtime.saveMemoryShareManager();

  assert.equal(typeof capturedOptions.buildMemoryShareContext, 'function');
  assert.deepEqual(proxiedCalls, [
    ['refresh', 'group:7'],
    ['ensure'],
    ['close'],
    ['render'],
    ['open'],
    ['save'],
  ]);
  console.log('ok - createGroupMemoryShareRuntime builds rp-to-chat context and proxies section runtime methods');
}
