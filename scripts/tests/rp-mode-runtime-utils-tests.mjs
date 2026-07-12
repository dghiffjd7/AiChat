import assert from 'node:assert/strict';

import {
  LEGACY_SEND_MODE_STORAGE_KEY,
  UI_MODE_STORAGE_KEY,
  applyRpGreetingUpdateVariables,
  normalizeUiMode,
  readUiMode,
  removeLegacySendModeState,
  resetRpGreetingVariableState,
  resolveRpInitVarWorldIds,
  runEnterRpModeFlow,
  runExitRpModeFlow,
  writeUiMode,
} from '../../src/scripts/ui/chat/rp-mode-runtime-utils.js';

{
  const calls = [];
  const stored = { id: 'g1', role: 'assistant', raw: 'cleaned greeting' };
  const result = applyRpGreetingUpdateVariables({
    message: { id: 'g1', role: 'assistant', rawOriginal: '<UpdateVariable>...</UpdateVariable>' },
    sessionId: ' rp:hero ',
    resolveApply: () => (message, sessionId) => calls.push(['apply', message.id, sessionId]),
    getMessage: (messageId, sessionId) => {
      calls.push(['get', messageId, sessionId]);
      return stored;
    },
  });
  assert.equal(result, stored);
  assert.deepEqual(calls, [
    ['apply', 'g1', 'rp:hero'],
    ['get', 'g1', 'rp:hero'],
  ]);
  console.log('ok - rp greeting applies UpdateVariable before first render and reloads persisted message');
}

{
  let legacyRead = false;
  const ids = resolveRpInitVarWorldIds({
    bridge: {
      getResolvedWorldState(sessionId, options) {
        assert.equal(sessionId, 'rp:hero');
        assert.deepEqual(options, { uiMode: 'rp' });
        return { worldIds: ['global-book', 'role-book', 'role-book', ''] };
      },
      getWorldIdsForSession() {
        legacyRead = true;
        return ['wrong-session-only-book'];
      },
    },
    sessionId: ' rp:hero ',
    uiMode: 'rp',
  });
  assert.deepEqual(ids, ['global-book', 'role-book']);
  assert.equal(legacyRead, false);
  console.log('ok - RP init variables resolve role worldbooks through unified world state');
}

{
  const ids = resolveRpInitVarWorldIds({
    bridge: {
      getGlobalWorldId: () => 'global-book',
      getWorldIdsForSession: () => ['session-book', 'global-book'],
    },
    sessionId: 'rp:legacy',
  });
  assert.deepEqual(ids, ['global-book', 'session-book']);
  console.log('ok - RP init variable world resolution keeps legacy bridge fallback');
}

{
  const calls = [];
  assert.equal(resetRpGreetingVariableState({
    chatStore: {
      clearVariables: sessionId => calls.push(['clear-current', sessionId]),
      clearInitialVariables: sessionId => calls.push(['clear-initial', sessionId]),
    },
    sessionId: ' rp:hero ',
    applyMvuSchemaDefaults: (sessionId, options) => calls.push(['schema-defaults', sessionId, options]),
  }), true);
  assert.deepEqual(calls, [
    ['clear-current', 'rp:hero'],
    ['clear-initial', 'rp:hero'],
    ['schema-defaults', 'rp:hero', { reason: 'rp_greeting_reset' }],
  ]);
  console.log('ok - RP greeting reset rebuilds current and initial variable state before seeding');
}

const createStorage = () => {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
  };
};

{
  assert.equal(UI_MODE_STORAGE_KEY, 'chat_ui_mode_v1');
  assert.equal(LEGACY_SEND_MODE_STORAGE_KEY, 'chat_send_mode_v1');
  assert.equal(normalizeUiMode('rp'), 'rp');
  assert.equal(normalizeUiMode(' RP '), 'rp');
  assert.equal(normalizeUiMode('creative'), 'chat');
  assert.equal(normalizeUiMode(''), 'chat');
  console.log('ok - ui mode storage helpers preserve legacy keys and mode normalization');
}

{
  const storage = createStorage();
  assert.equal(writeUiMode('rp', { storage }), true);
  assert.equal(storage.values.get(UI_MODE_STORAGE_KEY), 'rp');
  assert.equal(readUiMode({ storage }), 'rp');
  assert.equal(writeUiMode('bad', { storage }), true);
  assert.equal(storage.values.get(UI_MODE_STORAGE_KEY), 'chat');
  storage.values.set(UI_MODE_STORAGE_KEY, 'RP');
  assert.equal(readUiMode({ storage }), 'rp');
  storage.values.set(LEGACY_SEND_MODE_STORAGE_KEY, 'creative');
  assert.equal(removeLegacySendModeState({ storage }), true);
  assert.equal(storage.values.has(LEGACY_SEND_MODE_STORAGE_KEY), false);
  console.log('ok - ui mode read write and legacy cleanup helpers preserve storage behavior');
}

{
  const storage = {
    getItem() { throw new Error('read failed'); },
    setItem() { throw new Error('write failed'); },
    removeItem() { throw new Error('remove failed'); },
  };
  assert.equal(readUiMode({ storage }), 'chat');
  assert.equal(writeUiMode('rp', { storage }), false);
  assert.equal(removeLegacySendModeState({ storage }), false);
  console.log('ok - ui mode storage helpers tolerate storage failures');
}

{
  const calls = [];
  let savedState = null;
  let nextMode = 'chat';
  const result = await runEnterRpModeFlow({
    uiMode: 'chat',
    captureSocial: true,
    activePage: 'contacts',
    currentSessionId: 'contact:1',
    isChatRoomVisible: () => true,
    setLastChatState: (value) => {
      savedState = value;
      calls.push(['state', value]);
    },
    setUiMode: (value) => {
      nextMode = value;
      calls.push(['mode', value]);
    },
    vibrate: (value) => calls.push(['vibrate', value]),
    persistUiMode: () => calls.push(['persist']),
    applyUiModeUI: () => calls.push(['apply-ui']),
    waitForRpSessionReady: async () => calls.push(['ready']),
    setStickerPanelOpen: (value) => calls.push(['sticker', value]),
    setActionPanelOpen: (value) => calls.push(['action', value]),
    switchPage: (page, options) => calls.push(['page', page, options]),
    getRpSessionId: (personaId) => `rp:${personaId}`,
    activePersonaId: 'hero',
    ensureSession: (sessionId) => calls.push(['ensure', sessionId]),
    getSessionSettings: () => ({ alpha: 1 }),
    setSessionSettings: (sessionId, settings) => calls.push(['settings', sessionId, settings]),
    persistChatStore: () => calls.push(['store-persist']),
    applyMvuSchemaDefaults: (sessionId, payload) => calls.push(['mvu', sessionId, payload]),
    enterChatRoom: async (sessionId, title, origin) => calls.push(['enter', sessionId, title, origin]),
    getRpTitle: () => '角色甲',
    setCurrentChatTitle: (value) => calls.push(['title', value]),
    hydrateRpCharacterName: async () => calls.push(['hydrate']),
    seedRpGreetingIfNeeded: async (sessionId) => calls.push(['greet', sessionId]),
    refreshRpToolbar: (sessionId) => calls.push(['toolbar', sessionId]),
    setBackToListVisible: (visible) => calls.push(['back', visible]),
  });

  assert.equal(result.entered, true);
  assert.equal(result.rpSessionId, 'rp:hero');
  assert.equal(nextMode, 'rp');
  assert.deepEqual(savedState, {
    activePage: 'contacts',
    sessionId: 'contact:1',
    inChatRoom: true,
  });
  assert.deepEqual(calls, [
    ['state', { activePage: 'contacts', sessionId: 'contact:1', inChatRoom: true }],
    ['mode', 'rp'],
    ['vibrate', 10],
    ['persist'],
    ['apply-ui'],
    ['ready'],
    ['sticker', false],
    ['action', false],
    ['page', 'chat', { animate: false }],
    ['ensure', 'rp:hero'],
    ['settings', 'rp:hero', { alpha: 1, sharedVariables: true, sharedMemory: false }],
    ['store-persist'],
    ['mvu', 'rp:hero', { reason: 'rp_enter' }],
    ['enter', 'rp:hero', '角色甲', 'chat'],
    ['title', '角色甲'],
    ['hydrate'],
    ['greet', 'rp:hero'],
    ['toolbar', 'rp:hero'],
    ['back', false],
  ]);
  console.log('ok - runEnterRpModeFlow captures social state switches page and enters rp session');
}

{
  const calls = [];
  const result = await runEnterRpModeFlow({
    uiMode: 'chat',
    captureSocial: false,
    activePage: 'chat',
    getRpSessionId: () => 'rp:hero',
    getRpTitle: () => '角色甲',
    setLastChatState: () => calls.push('state'),
    switchPage: () => calls.push('page'),
    enterChatRoom: async () => calls.push('enter'),
    setBackToListVisible: (visible) => calls.push(['back', visible]),
  });

  assert.equal(result.entered, true);
  assert.deepEqual(calls, ['enter', ['back', false]]);
  console.log('ok - runEnterRpModeFlow skips social capture and page switch when already on chat page');
}

{
  const calls = [];
  let nextMode = 'rp';
  const result = runExitRpModeFlow({
    uiMode: 'rp',
    lastChatState: {
      activePage: 'contacts',
      sessionId: 'contact:9',
      inChatRoom: true,
    },
    setUiMode: (value) => {
      nextMode = value;
      calls.push(['mode', value]);
    },
    vibrate: (value) => calls.push(['vibrate', value]),
    persistUiMode: () => calls.push(['persist']),
    applyUiModeUI: () => calls.push(['apply-ui']),
    hideRpToolbar: () => calls.push(['hide-toolbar']),
    setBackToListVisible: (visible) => calls.push(['back', visible]),
    setChatOriginPage: (value) => calls.push(['origin', value]),
    exitChatRoom: (options) => calls.push(['exit-room', options]),
    getContact: () => ({ name: '好友九' }),
    switchPage: (page, options) => calls.push(['page', page, options]),
    enterChatRoom: (sessionId, name, origin) => calls.push(['enter', sessionId, name, origin]),
  });

  assert.equal(result.exited, true);
  assert.equal(nextMode, 'chat');
  assert.deepEqual(calls, [
    ['mode', 'chat'],
    ['vibrate', 10],
    ['persist'],
    ['apply-ui'],
    ['hide-toolbar'],
    ['back', true],
    ['origin', 'contacts'],
    ['exit-room', { animate: false }],
    ['page', 'contacts', { animate: false }],
    ['enter', 'contact:9', '好友九', 'contacts'],
  ]);
  console.log('ok - runExitRpModeFlow restores previous room and page after leaving rp mode');
}
