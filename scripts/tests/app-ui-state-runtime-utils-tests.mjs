import assert from 'node:assert/strict';

import { createAppUiStateRuntime } from '../../src/scripts/ui/app-ui-state-runtime-utils.js';

{
  const calls = [];
  const runtime = createAppUiStateRuntime({
    key: 'ui-key',
    kvName: 'ui-kv',
    sessionStorageLike: 'session-storage',
    localStorageLike: 'local-storage',
    uiLog: () => {},
    getActivePage: () => 'contacts',
    isChatRoomVisible: () => true,
    getCurrentSessionId: () => 'session-1',
    nowFn: () => 123456,
    saveSnapshot: (payload) => {
      calls.push(payload);
      return 'timer-1';
    },
  });

  const timer = runtime.saveUiState('timer-0');
  assert.equal(timer, 'timer-1');
  assert.deepEqual(calls, [{
    state: {
      activePage: 'contacts',
      inChatRoom: true,
      sessionId: 'session-1',
      at: 123456,
    },
    key: 'ui-key',
    kvName: 'ui-kv',
    sessionStorageLike: 'session-storage',
    localStorageLike: 'local-storage',
    clearTimerFn: calls[0]?.clearTimerFn,
    existingTimer: 'timer-0',
    setTimerFn: calls[0]?.setTimerFn,
    persistDiskState: null,
    uiLog: calls[0]?.uiLog,
    delayMs: 400,
  }]);
  console.log('ok - createAppUiStateRuntime saveUiState composes storage snapshot payload');
}

{
  const calls = [];
  const runtime = createAppUiStateRuntime({
    key: 'ui-key',
    sessionStorageLike: 'session-storage',
    localStorageLike: 'local-storage',
    loadDiskState: () => 'disk-state',
    hasKnownSession: (sessionId) => sessionId === 'session-1',
    activateShellStateFn: (sessionId) => {
      calls.push(['activate', sessionId]);
      return true;
    },
    pickSnapshot: async (payload) => {
      calls.push(['pick', payload]);
      return { activePage: 'chat' };
    },
    readFastSnapshot: (payload) => {
      calls.push(['read-fast', payload]);
      return { activePage: 'moments' };
    },
    restoreShell: (payload) => {
      calls.push(['restore-shell', payload]);
      return payload.sessionId === 'session-1';
    },
  });

  const picked = await runtime.pickSavedUiState();
  const fast = runtime.readSavedUiStateFast();
  const restored = runtime.applyRestoredSessionShell('session-1');

  assert.deepEqual(picked, { activePage: 'chat' });
  assert.deepEqual(fast, { activePage: 'moments' });
  assert.equal(restored, true);
  assert.deepEqual(calls, [
    ['pick', {
      key: 'ui-key',
      sessionStorageLike: 'session-storage',
      localStorageLike: 'local-storage',
      loadDiskState: calls[0]?.[1]?.loadDiskState,
    }],
    ['read-fast', {
      key: 'ui-key',
      sessionStorageLike: 'session-storage',
      localStorageLike: 'local-storage',
    }],
    ['restore-shell', {
      sessionId: 'session-1',
      hasKnownSession: calls[2]?.[1]?.hasKnownSession,
      activateShellStateFn: calls[2]?.[1]?.activateShellStateFn,
    }],
  ]);
  console.log('ok - createAppUiStateRuntime delegates saved-state read and shell restore helpers');
}

{
  let scope = 'default';
  const calls = [];
  const runtime = createAppUiStateRuntime({
    key: () => `ui-key__${scope}`,
    kvName: () => `ui-kv__${scope}`,
    sessionStorageLike: 'session-storage',
    localStorageLike: 'local-storage',
    getActivePage: () => 'chat',
    isChatRoomVisible: () => false,
    getCurrentSessionId: () => 'session-1',
    nowFn: () => 1,
    saveSnapshot: (payload) => {
      calls.push(['save', payload.key, payload.kvName]);
      return 'timer';
    },
    pickSnapshot: async (payload) => {
      calls.push(['pick', payload.key]);
      return null;
    },
    readFastSnapshot: (payload) => {
      calls.push(['read-fast', payload.key]);
      return null;
    },
  });

  runtime.saveUiState();
  scope = 'persona_1';
  await runtime.pickSavedUiState();
  runtime.readSavedUiStateFast();

  assert.deepEqual(calls, [
    ['save', 'ui-key__default', 'ui-kv__default'],
    ['pick', 'ui-key__persona_1'],
    ['read-fast', 'ui-key__persona_1'],
  ]);
  console.log('ok - createAppUiStateRuntime resolves dynamic storage keys per call');
}

{
  const calls = [];
  const runtime = createAppUiStateRuntime({
    key: 'ui-key',
    uiLog: (...args) => calls.push(['ui-log', ...args]),
    hasPage: (page) => page === 'chat',
    switchPage: (page) => calls.push(['switch-page', page]),
    runSavedRestoreFlow: async (payload) => {
      calls.push(['run-restore', payload]);
      const applied = payload.applySavedState({ activePage: 'chat', sessionId: 'session-1' });
      calls.push(['applied', applied]);
      return { restored: true };
    },
    applySavedState: (payload) => {
      calls.push(['apply-saved', payload]);
      return { page: payload.savedState.activePage, session: payload.savedState.sessionId };
    },
    restoreShell: (payload) => {
      calls.push(['restore-shell', payload]);
      return true;
    },
    pickSnapshot: async () => ({ activePage: 'chat', sessionId: 'session-1' }),
  });

  const restored = await runtime.restoreUiState();
  assert.equal(restored, true);
  assert.equal(calls[0][0], 'run-restore');
  assert.equal(typeof calls[0][1].pickSavedUiState, 'function');
  assert.deepEqual(calls[1], ['apply-saved', {
    savedState: { activePage: 'chat', sessionId: 'session-1' },
    hasPage: calls[1][1].hasPage,
    switchPage: calls[1][1].switchPage,
    restoreSessionShell: calls[1][1].restoreSessionShell,
    uiLog: calls[1][1].uiLog,
  }]);
  assert.deepEqual(calls[2], ['applied', { page: 'chat', session: 'session-1' }]);
  console.log('ok - createAppUiStateRuntime restoreUiState wires saved-state restore flow');
}

{
  const runtime = createAppUiStateRuntime({
    runSavedRestoreFlow: async () => {
      throw new Error('boom');
    },
  });
  const restored = await runtime.restoreUiState();
  assert.equal(restored, false);
  console.log('ok - createAppUiStateRuntime restoreUiState returns false on restore errors');
}
