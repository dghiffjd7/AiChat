import assert from 'node:assert/strict';

import {
  runEnterRpModeFlow,
  runExitRpModeFlow,
} from '../../src/scripts/ui/chat/rp-mode-runtime-utils.js';

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
