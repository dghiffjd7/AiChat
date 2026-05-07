import assert from 'node:assert/strict';

import {
  applyChatToRpMemoryShareSettings,
  applyRpToChatMemoryShareSettings,
  buildSessionMemoryShareDraft,
  createSessionMemoryShareSectionRuntime,
} from '../../src/scripts/ui/session-memory-share-section-runtime-utils.js';

{
  const allSocialDraft = buildSessionMemoryShareDraft({
    sessionId: 'rp:hero',
    sessionSettings: {
      chatBridgeSourceSessionId: '',
      chatBridgeAllSocialTableSettings: {
        chat_outline: { enabled: true, limit: 3 },
      },
    },
    isRpTarget: true,
  });
  assert.deepEqual(allSocialDraft, {
    sessionId: 'rp:hero',
    sourceId: '',
    tableSettings: {
      chat_outline: { enabled: true, limit: 3 },
    },
  });

  const singleSourceDraft = buildSessionMemoryShareDraft({
    sessionId: 'rp:hero',
    sessionSettings: {
      chatBridgeSourceSessionId: 'group:1',
      chatBridgeTableSettings: {
        group_outline: { enabled: true, limit: 4 },
      },
    },
    isRpTarget: true,
  });
  assert.deepEqual(singleSourceDraft, {
    sessionId: 'rp:hero',
    sourceId: 'group:1',
    tableSettings: {
      group_outline: { enabled: true, limit: 4 },
    },
  });

  const rpToChatDraft = buildSessionMemoryShareDraft({
    sessionId: 'chat:1',
    sessionSettings: {
      rpBridgeTableSettings: {
        rp_outline: { enabled: true, limit: 2 },
      },
    },
    isRpTarget: false,
  });
  assert.deepEqual(rpToChatDraft, {
    sessionId: 'chat:1',
    sourceId: '',
    tableSettings: {
      rp_outline: { enabled: true, limit: 2 },
    },
  });
  console.log('ok - buildSessionMemoryShareDraft resolves rp-target and rp-to-chat draft state');
}

{
  const nextSettings = applyChatToRpMemoryShareSettings({
    sessionSettings: {},
    draft: {
      sourceId: '',
      tableSettings: {
        chat_outline: { enabled: true, limit: 5 },
        group_outline: { enabled: false, limit: 0 },
      },
    },
    fallbackEnabled: true,
    fallbackLimit: 0,
  });
  assert.equal(nextSettings.chatBridgeSourceSessionId, '');
  assert.equal(nextSettings.chatBridgeAllSocialTableSettings.chat_outline.enabled, true);
  assert.equal(nextSettings.chatBridgeAllSocialTableSettings.chat_outline.limit, 5);
  assert.equal(nextSettings.chatBridgeEnabled, true);
  assert.equal(nextSettings.chatBridgeOutlineLimit, 5);
  console.log('ok - applyChatToRpMemoryShareSettings persists all-social chat-to-rp settings');
}

{
  const nextSettings = applyChatToRpMemoryShareSettings({
    sessionSettings: {},
    draft: {
      sourceId: 'group:2',
      tableSettings: {
        group_outline: { enabled: true, limit: 6 },
      },
    },
    fallbackEnabled: true,
    fallbackLimit: 0,
  });
  assert.equal(nextSettings.chatBridgeSourceSessionId, 'group:2');
  assert.equal(nextSettings.chatBridgeTableSettings.group_outline.enabled, true);
  assert.equal(nextSettings.chatBridgeTableSettings.group_outline.limit, 6);
  assert.equal(nextSettings.chatBridgeEnabled, true);
  assert.equal(nextSettings.chatBridgeOutlineLimit, 6);
  console.log('ok - applyChatToRpMemoryShareSettings persists single-source chat-to-rp settings');
}

{
  const nextSettings = applyRpToChatMemoryShareSettings({
    sessionSettings: {},
    draft: {
      tableSettings: {
        rp_outline: { enabled: true, limit: 8 },
      },
    },
    fallbackEnabled: true,
    fallbackLimit: 3,
  });
  assert.equal(nextSettings.rpBridgeTableSettings.rp_outline.enabled, true);
  assert.equal(nextSettings.rpBridgeTableSettings.rp_outline.limit, 8);
  assert.equal(nextSettings.rpBridgeEnabled, true);
  assert.equal(nextSettings.rpBridgeOutlineLimit, 8);
  console.log('ok - applyRpToChatMemoryShareSettings persists rp-to-chat memory-share settings');
}

{
  const summaryCalls = [];
  const setCalls = [];
  let sourceChangeHandler = null;
  const mountCalls = [];
  const modal = {
    overlay: { style: {} },
    panel: { style: {} },
    hint: {},
    sourceWrap: { style: {} },
    sourceStatic: { style: {} },
    sourceSelect: { value: '', addEventListener() {} },
    sourceButton: {},
    rows: {},
    saveButton: { addEventListener() {} },
    closeButton: {},
    cancelButton: {},
  };
  const runtime = createSessionMemoryShareSectionRuntime({
    getSessionId: () => 'rp:hero',
    getSummaryEl: () => ({ textContent: '' }),
    getSessionSettings: () => ({ initial: true }),
    setSessionSettings: (sessionId, sessionSettings) => {
      setCalls.push([sessionId, sessionSettings]);
    },
    buildDraft: () => ({
      sessionId: 'rp:hero',
      sourceId: '',
      tableSettings: {},
    }),
    buildMemoryShareContext: async (sessionId, sourceId, tableSettings) => ({
      sessionId,
      sourceId,
      tableSettings,
      entries: [],
    }),
    createModal: () => modal,
    bodyEl: { appendChild() {} },
    getChatToRpFallbackEnabled: () => true,
    getRpToChatFallbackEnabled: () => false,
    notifySaveSuccess: () => summaryCalls.push('success'),
    notifySaveError: () => summaryCalls.push('error'),
    logger: { warn() {} },
    deps: {
      mountSessionMemoryShareModal: (options) => {
        mountCalls.push(options);
        sourceChangeHandler = options.onSourceChange;
        return true;
      },
      renderSessionMemoryShareManager: async (options) => {
        summaryCalls.push(['render', options.draft.sourceId]);
        return { entries: [] };
      },
      refreshSessionMemoryShareSummary: async (options) => {
        summaryCalls.push(['refresh', options.sessionId]);
        return true;
      },
      finalizeSessionMemoryShareSave: async ({ closeManager, refreshSummary, notifySuccess }) => {
        closeManager();
        await refreshSummary();
        notifySuccess();
        summaryCalls.push('finalized');
        return true;
      },
      applyChatToRpMemoryShareSettings: ({ sessionSettings, draft }) => ({
        ...sessionSettings,
        savedSourceId: draft.sourceId,
      }),
    },
  });

  await runtime.openMemoryShareManager();
  assert.equal(mountCalls.length, 1);
  assert.equal(modal.overlay.style.display, 'block');
  assert.equal(modal.panel.style.display, 'flex');

  modal.sourceSelect.value = 'group:99';
  await sourceChangeHandler();
  await runtime.saveMemoryShareManager();

  assert.deepEqual(summaryCalls, [
    ['render', ''],
    ['render', 'group:99'],
    ['refresh', 'rp:hero'],
    'success',
    'finalized',
  ]);
  assert.deepEqual(setCalls, [['rp:hero', { initial: true, savedSourceId: 'group:99' }]]);
  console.log('ok - createSessionMemoryShareSectionRuntime drives rp-target modal rerender and save flow');
}

{
  const setCalls = [];
  const runtime = createSessionMemoryShareSectionRuntime({
    getSessionId: () => 'group:7',
    getSummaryEl: () => ({ textContent: '' }),
    getSessionSettings: () => ({ initial: true }),
    setSessionSettings: (sessionId, sessionSettings) => {
      setCalls.push([sessionId, sessionSettings]);
    },
    buildDraft: () => ({
      sessionId: 'group:7',
      sourceId: '',
      tableSettings: {
        rp_outline: { enabled: true, limit: 9 },
      },
    }),
    buildMemoryShareContext: async () => ({ entries: [] }),
    createModal: () => ({
      overlay: { style: {} },
      panel: { style: {} },
      rows: {},
      sourceStatic: { style: {} },
      saveButton: { addEventListener() {} },
      closeButton: {},
      cancelButton: {},
    }),
    bodyEl: { appendChild() {} },
    getRpToChatFallbackEnabled: () => true,
    getRpToChatFallbackLimit: () => 2,
    notifySaveSuccess: () => {},
    deps: {
      mountSessionMemoryShareModal: () => true,
      renderSessionMemoryShareManager: async () => ({ entries: [] }),
      refreshSessionMemoryShareSummary: async () => true,
      finalizeSessionMemoryShareSave: async ({ closeManager, refreshSummary, notifySuccess }) => {
        closeManager();
        await refreshSummary();
        notifySuccess();
        return true;
      },
      applyRpToChatMemoryShareSettings: ({ sessionSettings, draft }) => ({
        ...sessionSettings,
        savedLimit: draft.tableSettings.rp_outline.limit,
      }),
    },
  });

  await runtime.openMemoryShareManager();
  await runtime.saveMemoryShareManager();
  assert.deepEqual(setCalls, [['group:7', { initial: true, savedLimit: 9 }]]);
  console.log('ok - createSessionMemoryShareSectionRuntime routes non-rp sessions through rp-to-chat save flow');
}
