import assert from 'node:assert/strict';

import {
  registerHydratedUiRestoreListener,
  registerUiLifecycleDiagnostics,
  runAppBootRestoreFlow,
} from '../../src/scripts/ui/app-boot-runtime-utils.js';

{
  let activePage = '';
  let uiMode = 'rp';
  const calls = [];
  await runAppBootRestoreFlow({
    restoreUiState: async () => calls.push('restore'),
    getActivePage: () => activePage,
    setActivePage: value => {
      activePage = value;
      calls.push(['setActivePage', value]);
    },
    hasPage: page => page === 'chat' || page === 'contacts',
    isPageActive: () => false,
    switchPage: page => calls.push(['switchPage', page]),
    uiLog: (event, payload) => calls.push([event, payload]),
    getCurrentSessionId: () => 's1',
    isChatRoomVisible: () => true,
    applyMvuSchemaDefaults: (sessionId, payload) => calls.push(['mvu', sessionId, payload]),
    updateWorldIndicator: () => calls.push('world'),
    refreshChatAndContacts: () => calls.push('refresh'),
    applyUiModeUI: () => calls.push('applyUiModeUI'),
    getInitialUiMode: () => 'rp',
    setUiMode: value => {
      uiMode = value;
      calls.push(['setUiMode', value]);
    },
    persistUiMode: () => calls.push('persistUiMode'),
    setUiStateArmed: value => calls.push(['uiStateArmed', value]),
    saveUiState: () => calls.push('saveUiState'),
  });
  assert.equal(uiMode, 'chat');
  assert.deepEqual(calls, [
    'restore',
    ['setActivePage', 'chat'],
    ['switchPage', 'chat'],
    ['boot: after restore', { activePage: 'chat', sessionId: 's1', inChatRoom: true }],
    ['mvu', 's1', { reason: 'boot' }],
    'world',
    'refresh',
    'applyUiModeUI',
    ['setUiMode', 'chat'],
    'persistUiMode',
    'applyUiModeUI',
    ['uiStateArmed', true],
    'saveUiState',
  ]);
  console.log('ok - runAppBootRestoreFlow restores page shell and reapplies boot ui state');
}

{
  const listeners = new Map();
  registerHydratedUiRestoreListener({
    windowLike: {
      addEventListener(type, handler) {
        listeners.set(type, handler);
      },
    },
    onHydrated: async (store) => {
      listeners.set('seen', store);
    },
  });
  await listeners.get('store-hydrated')({ detail: { store: 'chat-store' } });
  assert.equal(listeners.get('seen'), 'chat-store');
  console.log('ok - registerHydratedUiRestoreListener forwards hydrated store names');
}

{
  const windowListeners = new Map();
  const documentListeners = new Map();
  const logs = [];
  registerUiLifecycleDiagnostics({
    windowLike: {
      addEventListener(type, handler) {
        windowListeners.set(type, handler);
      },
    },
    documentLike: {
      visibilityState: 'hidden',
      addEventListener(type, handler) {
        documentListeners.set(type, handler);
      },
    },
    uiLog: (event, payload) => logs.push([event, payload]),
    isIgnorableRuntimeNoise: value => value === 'ignore-me',
  });
  windowListeners.get('pageshow')({ persisted: true });
  windowListeners.get('pagehide')({ persisted: false });
  documentListeners.get('visibilitychange')();
  windowListeners.get('beforeunload')();
  windowListeners.get('unload')();
  windowListeners.get('error')({
    message: 'boom',
    filename: 'app.js',
    lineno: 10,
    colno: 20,
    error: { message: 'boom', stack: 'stack-trace' },
  });
  windowListeners.get('error')({
    message: 'ignore-me',
    error: { message: 'ignore-me', stack: 'ignored' },
  });
  windowListeners.get('unhandledrejection')({ reason: { message: 'reject', stack: 'reject-stack' } });
  assert.deepEqual(logs, [
    ['pageshow', { persisted: true }],
    ['pagehide', { persisted: false }],
    ['visibilitychange', { state: 'hidden' }],
    ['beforeunload', undefined],
    ['unload', undefined],
    ['window.error', { msg: 'boom', file: 'app.js', line: 10, col: 20, stack: 'stack-trace' }],
    ['unhandledrejection', { reason: 'reject', stack: 'reject-stack' }],
  ]);
  console.log('ok - registerUiLifecycleDiagnostics wires lifecycle and error diagnostics through uiLog');
}
