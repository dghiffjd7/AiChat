import assert from 'node:assert/strict';

import { createContactMemoryShareRuntime } from '../../src/scripts/ui/contact-memory-share-runtime-utils.js';

{
  let capturedOptions = null;
  const proxiedCalls = [];
  const runtime = createContactMemoryShareRuntime({
    getSessionId: () => 'contact:1',
    getSummaryEl: () => ({ textContent: '' }),
    getSessionSettings: (sessionId) => (
      sessionId === 'rp:hero'
        ? {
            chatBridgeSourceSessionId: 'group:7',
            chatBridgeTableSettings: {
              group_outline: { enabled: true, limit: 4 },
            },
          }
        : {
            rpBridgeTableSettings: {
              rp_outline: { enabled: true, limit: 3 },
            },
          }
    ),
    setSessionSettings() {},
    getContact: (sessionId) => ({
      'contact:1': { id: 'contact:1', name: '好友甲' },
      'group:7': { id: 'group:7', name: '群聊甲' },
      'rp:hero': { id: 'rp:hero', name: '角色甲' },
    }[sessionId] || null),
    listSessions: () => ['contact:1', 'group:7', 'rp:hero'],
    memoryTableStore: {
      async getMemories({ group_id, contact_id }) {
        if (group_id === 'group:7') return [{ table_id: 'group_outline', is_active: true }];
        if (contact_id === 'rp:hero') return [{ table_id: 'rp_outline', is_active: true }];
        return [];
      },
    },
    resolveTemplateDefinition: async () => ({
      tables: [
        { id: 'group_outline', label: '群聊大纲' },
        { id: 'rp_outline', label: 'RP 大纲' },
      ],
    }),
    resolveTemplateId: async () => 'tpl:1',
    getRpCharacterNameForSession: (sessionId) => (sessionId === 'rp:hero' ? '角色甲' : ''),
    getRpSessionIdForSession: () => 'rp:hero',
    getRpSessionIdForActivePersona: () => 'rp:hero',
    bindSourceButton() {},
    refreshSourceButton() {},
    closeSourceMenu() {},
    documentRef: {},
    bodyEl: {},
    getGlobalSettings: () => ({
      memoryBridgeChatToRpEnabled: true,
      memoryBridgeRpToChatEnabled: true,
      memoryBridgeRpToChatLimit: 9,
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
  assert.equal(runtime.getSessionDisplayName('contact:1'), '好友甲');
  assert.deepEqual(runtime.listSocialSessions(), ['contact:1', 'group:7']);

  const chatToRpContext = await runtime.buildMemoryShareContext(
    'rp:hero',
    'group:7',
    { group_outline: { enabled: true, limit: 4 } },
  );
  assert.equal(chatToRpContext.mode, 'chat_to_rp');
  assert.equal(chatToRpContext.sourceLabel, '群聊甲');
  assert.equal(chatToRpContext.entries[0].rowCount, 1);

  const rpToChatContext = await runtime.buildMemoryShareContext(
    'contact:1',
    null,
    { rp_outline: { enabled: true, limit: 3 } },
  );
  assert.equal(rpToChatContext.mode, 'rp_to_chat');
  assert.equal(rpToChatContext.sourceLabel, '角色甲');
  assert.equal(rpToChatContext.entries[0].rowCount, 1);

  await runtime.refreshMemoryShareSummary('contact:1');
  runtime.ensureMemoryShareModal();
  runtime.closeMemoryShareManager();
  await runtime.renderMemoryShareManager();
  await runtime.openMemoryShareManager();
  await runtime.saveMemoryShareManager();

  assert.equal(typeof capturedOptions.buildMemoryShareContext, 'function');
  assert.deepEqual(proxiedCalls, [
    ['refresh', 'contact:1'],
    ['ensure'],
    ['close'],
    ['render'],
    ['open'],
    ['save'],
  ]);
  console.log('ok - createContactMemoryShareRuntime builds contact/rp contexts and proxies section runtime methods');
}
