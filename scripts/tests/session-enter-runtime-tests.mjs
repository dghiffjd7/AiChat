import assert from 'node:assert/strict';

import {
  activateSessionEnterView,
  activateSessionShellState,
  applySavedUiRestoreState,
  applySessionEnterChatSettings,
  applySessionEnterLoadingState,
  applySessionEnterScrollMode,
  deactivateSessionEnterView,
  finalizeSessionEnterNavigation,
  finalizeSessionEnterUiState,
  loadSessionEnterHistoryStage,
  pickSavedUiStateSnapshot,
  readSavedUiStateFastSnapshot,
  reconcileHydratedStoreUiState,
  renderSessionChangedHistoryStage,
  renderSessionEnterInitialHistory,
  restoreSessionShellState,
  runHydratedUiRestoreFlow,
  runSessionEnterFlow,
  runSessionChangedFlow,
  runSessionEnterDeferredTasks,
  runSessionExitFlow,
  runSavedUiRestoreFlow,
  saveUiStateSnapshot,
} from '../../src/scripts/ui/chat/session-enter-runtime.js';

{
  const calls = [];
  const makeClassList = (label) => ({
    add(name) {
      calls.push([label, 'add', name]);
    },
    remove(name) {
      calls.push([label, 'remove', name]);
    },
  });
  const raf = fn => {
    calls.push(['raf']);
    fn?.();
  };
  const originPage = activateSessionEnterView({
    originPage: 'contacts',
    setChatOriginPage: value => calls.push(['origin', value]),
    cancelInitialHistoryFillJobs: () => calls.push(['cancel']),
    chatListEl: { classList: makeClassList('list') },
    chatRoomEl: { classList: makeClassList('room') },
    chatPageEl: { classList: makeClassList('page') },
    bodyEl: { classList: makeClassList('body') },
    setChatInputGapTweak: value => calls.push(['gap', value]),
    setStickerPanelOpen: value => calls.push(['sticker', value]),
    scheduleModeSwitchSync: () => calls.push(['mode-sync']),
    syncChatInputOffset: () => calls.push(['input-sync']),
    requestAnimationFrameFn: raf,
    messageTopbarEl: { style: {} },
    bottomNavEl: { style: {} },
  });
  assert.equal(originPage, 'contacts');
  assert.deepEqual(calls, [
    ['origin', 'contacts'],
    ['cancel'],
    ['list', 'add', 'hidden'],
    ['room', 'remove', 'hidden'],
    ['page', 'add', 'chat-room-active'],
    ['body', 'add', 'chat-room-active'],
    ['gap', 0],
    ['sticker', false],
    ['mode-sync'],
    ['raf'],
    ['input-sync'],
    ['raf'],
    ['input-sync'],
  ]);
  console.log('ok - activateSessionEnterView toggles shell state and schedules input sync');
}

{
  const calls = [];
  const makeClassList = (label) => ({
    add(name) {
      calls.push([label, 'add', name]);
    },
    remove(name) {
      calls.push([label, 'remove', name]);
    },
  });
  const ok = deactivateSessionEnterView({
    resetEnterRequest: value => calls.push(['reset', value]),
    cancelInitialHistoryFillJobs: () => calls.push(['cancel']),
    chatRoomEl: { classList: makeClassList('room') },
    chatListEl: { classList: makeClassList('list') },
    chatPageEl: { classList: makeClassList('page') },
    bodyEl: { classList: makeClassList('body') },
    clearStageTimeline: value => calls.push(['timeline', value]),
    setStickerPanelOpen: value => calls.push(['sticker', value]),
    setActionPanelOpen: value => calls.push(['action', value]),
    setReplyTarget: value => calls.push(['replyTarget', value]),
    scheduleModeSwitchSync: () => calls.push(['mode-sync']),
    scheduleWallpaperIdle: () => calls.push(['wallpaper']),
    messageTopbarEl: { style: {} },
    bottomNavEl: { style: {} },
    updateChatContentSearchVisibility: () => calls.push(['search']),
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['reset', ''],
    ['cancel'],
    ['room', 'add', 'hidden'],
    ['list', 'remove', 'hidden'],
    ['page', 'remove', 'chat-room-active'],
    ['body', 'remove', 'chat-room-active'],
    ['timeline', ''],
    ['sticker', false],
    ['action', false],
    ['replyTarget', null],
    ['mode-sync'],
    ['wallpaper'],
    ['search'],
  ]);
  console.log('ok - deactivateSessionEnterView restores list shell and clears room state');
}

{
  const calls = [];
  const result = applySessionEnterLoadingState({
    sessionId: 'group:1',
    contact: { name: '群聊A', isGroup: true },
    showConversationLoading: payload => calls.push(['loading', payload]),
    getDraft: () => '',
    getMirrorDraft: sid => `mirror:${sid}`,
    setInputText: value => calls.push(['draft', value]),
    syncReplyTargetComposer: sid => calls.push(['reply', sid]),
    setSessionLabel: sid => calls.push(['label', sid]),
    updatePendingFloat: sid => calls.push(['pending', sid]),
  });
  assert.equal(result, '群聊A');
  assert.deepEqual(calls, [
    ['loading', { title: '群聊A', isGroup: true }],
    ['draft', 'mirror:group:1'],
    ['reply', 'group:1'],
    ['label', 'group:1'],
    ['pending', 'group:1'],
  ]);
  console.log('ok - applySessionEnterLoadingState restores draft fallback and updates loading ui');
}

{
  const calls = [];
  const result = applySessionEnterChatSettings({
    sessionId: 's1',
    chatSettingsReady: true,
    getSessionSettings: sid => {
      calls.push(['get', sid]);
      return { foo: 1 };
    },
    normalizeChatSettings: value => {
      calls.push(['normalize', value]);
      return { ...value, normalized: true };
    },
    applyChatSettings: (sid, value) => calls.push(['apply', sid, value]),
  });
  assert.deepEqual(result, { applied: true, pending: false });
  assert.deepEqual(calls, [
    ['get', 's1'],
    ['normalize', { foo: 1 }],
    ['apply', 's1', { foo: 1, normalized: true }],
  ]);
  console.log('ok - applySessionEnterChatSettings normalizes and applies ready session settings');
}

{
  const calls = [];
  const result = applySessionEnterChatSettings({
    sessionId: 's2',
    chatSettingsReady: false,
    setPendingChatSettingsSessionId: sid => calls.push(['pending', sid]),
  });
  assert.deepEqual(result, { applied: false, pending: true });
  assert.deepEqual(calls, [['pending', 's2']]);
  console.log('ok - applySessionEnterChatSettings defers when settings are not ready');
}

{
  const calls = [];
  const result = runSessionEnterDeferredTasks({
    sessionId: 's1',
    isGroupSession: true,
    currentArchiveId: 'arc1',
    cancelScheduledHydration: sid => calls.push(['cancel', sid]),
    scheduleHydration: async (sid, options) => calls.push(['hydrate', sid, options]),
    restoreArchivePointer: async (sid, options) => calls.push(['archive', sid, options]),
    restoreTailMemory: async (sid, options) => calls.push(['tail', sid, options]),
    prefetchRawOriginals: async sid => calls.push(['prefetch', sid]),
  });
  assert.deepEqual(result, { hydrateDelay: 720, restoreMode: 'archive' });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(calls, [
    ['cancel', 's1'],
    ['hydrate', 's1', { onlyMissing: true, delayMs: 720 }],
    ['archive', 's1', { refreshBaselineWhenNoTail: true, source: 'enter_chat_room_archive' }],
    ['prefetch', 's1'],
  ]);
  console.log('ok - runSessionEnterDeferredTasks schedules hydrate archive restore and prefetch');
}

{
  let tick = 0;
  const calls = [];
  const result = await loadSessionEnterHistoryStage({
    sessionId: 'group:1',
    isGroupSession: true,
    isAndroid: true,
    jumpTargetMessageId: '',
    ensureRecentMessagesLoaded: async sid => {
      calls.push(['load', sid]);
      return [
        { id: 'm1', role: 'user', content: '1' },
        { id: 'm2', role: 'assistant', content: '2' },
      ];
    },
    isRequestStale: () => false,
    getFirstUnreadMessageId: sid => {
      calls.push(['firstUnread', sid]);
      return 'm2';
    },
    injectUnreadDivider: (messages, firstUnreadId) => {
      calls.push(['inject', firstUnreadId, messages.map(message => message.id)]);
      return {
        list: [
          messages[0],
          { id: `unread-divider-${firstUnreadId}`, type: 'divider' },
          messages[1],
        ],
        dividerId: `unread-divider-${firstUnreadId}`,
      };
    },
    clearMessages: () => calls.push(['clear']),
    hideTyping: () => calls.push(['hideTyping']),
    renderInitialHistoryProgressive: () => {
      throw new Error('should not render progressive when unread marker is present');
    },
    decorateMessagesForDisplay: (messages, options) => {
      calls.push(['decorate', messages.map(message => message.id), options]);
      return messages.map(message => ({ ...message, decorated: true }));
    },
    preloadHistory: (messages, options) => {
      calls.push(['preload', messages.map(message => message.id), options]);
    },
    nowPerfMs: () => {
      tick += 11;
      return tick;
    },
    currentArchiveId: 'arc1',
    cancelScheduledHydration: sid => calls.push(['cancel', sid]),
    scheduleHydration: async (sid, options) => calls.push(['hydrate', sid, options]),
    restoreArchivePointer: async (sid, options) => calls.push(['archive', sid, options]),
    restoreTailMemory: async () => calls.push(['tail']),
    prefetchRawOriginals: async sid => calls.push(['prefetch', sid]),
    setRenderState: (sid, state) => calls.push(['renderState', sid, state]),
  });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(result, {
    stale: false,
    loadHistoryMs: 11,
    firstUnreadId: 'm2',
    dividerId: 'unread-divider-m2',
    renderMetrics: { decorateMs: 11, preloadMs: 11, deferred: false, deferredCount: 0 },
  });
  assert.deepEqual(calls, [
    ['load', 'group:1'],
    ['firstUnread', 'group:1'],
    ['inject', 'm2', ['m1', 'm2']],
    ['clear'],
    ['hideTyping'],
    ['decorate', ['m1', 'unread-divider-m2', 'm2'], { sessionId: 'group:1' }],
    ['preload', ['m1', 'unread-divider-m2', 'm2'], { keepScroll: true }],
    ['cancel', 'group:1'],
    ['hydrate', 'group:1', { onlyMissing: true, delayMs: 720 }],
    ['archive', 'group:1', { refreshBaselineWhenNoTail: true, source: 'enter_chat_room_archive' }],
    ['prefetch', 'group:1'],
    ['renderState', 'group:1', { start: 0 }],
  ]);
  console.log('ok - loadSessionEnterHistoryStage loads slices renders first screen and schedules restore tasks');
}

{
  const calls = [];
  const result = await runSessionEnterFlow({
    sessionId: 's-enter',
    sessionName: '会话A',
    originPage: 'contacts',
    options: {
      jumpTargetMessageId: 'm9',
      jumpKeyword: 'kw',
      jumpKind: 'search',
      suppressInitialAutoScroll: true,
    },
    contact: { id: 's-enter', name: '会话A' },
    isGroupSession: false,
    activateView: ({ originPage }) => calls.push(['view', originPage]),
    activateShellStateFn: ({ sessionId }) => calls.push(['shell', sessionId]),
    applyChatSettingsFn: ({ sessionId }) => calls.push(['settings', sessionId]),
    applyLoadingStateFn: ({ sessionId, contact, sessionName }) => calls.push(['loading', sessionId, contact?.name, sessionName]),
    loadHistoryStageFn: async ({ sessionId, isGroupSession, jumpTargetMessageId }) => {
      calls.push(['history', sessionId, isGroupSession, jumpTargetMessageId]);
      return { stale: false, dividerId: 'divider-1', firstUnreadId: 'm2' };
    },
    finalizeNavigationFn: (payload) => {
      calls.push(['nav', payload]);
      return { jumpedToTarget: true };
    },
    finalizeUiStateFn: ({ sessionId }) => calls.push(['finalize', sessionId]),
    getChatOriginPage: () => 'chat',
    uiLog: (tag, payload) => calls.push(['log', tag, payload]),
  });
  assert.deepEqual(result, { jumpedToTarget: true });
  assert.deepEqual(calls, [
    ['view', 'contacts'],
    ['shell', 's-enter'],
    ['settings', 's-enter'],
    ['loading', 's-enter', '会话A', '会话A'],
    ['history', 's-enter', false, 'm9'],
    ['nav', {
      jumpTargetMessageId: 'm9',
      jumpKeyword: 'kw',
      jumpKind: 'search',
      dividerId: 'divider-1',
      firstUnreadId: 'm2',
      suppressInitialAutoScroll: true,
    }],
    ['finalize', 's-enter'],
    ['log', 'enterChatRoom', { sessionId: 's-enter', originPage: 'chat' }],
  ]);
  console.log('ok - runSessionEnterFlow preserves session-enter orchestration order and passes navigation payload');
}

{
  const traces = [];
  const result = await runSessionEnterFlow({
    sessionId: 's-stale',
    originPage: 'chat',
    isGroupSession: true,
    options: { suppressInitialAutoScroll: true },
    loadHistoryStageFn: async () => ({ stale: true }),
    recordTraceEvent: event => traces.push(event),
  });
  assert.deepEqual(result, { jumpedToTarget: false, stale: true });
  assert.deepEqual(traces, [
    {
      category: 'session',
      source: 'session-enter-runtime',
      phase: 'enter.start',
      sessionId: 's-stale',
      status: 'started',
      summary: 'session enter started',
      details: {
        originPage: 'chat',
        isGroupSession: true,
        hasJumpTarget: false,
        suppressInitialAutoScroll: true,
      },
    },
    {
      category: 'session',
      source: 'session-enter-runtime',
      phase: 'enter.finish',
      sessionId: 's-stale',
      status: 'stale',
      summary: 'session enter request became stale',
    },
  ]);
  console.log('ok - runSessionEnterFlow can emit optional structured trace events for stale enters');
}

{
  const calls = [];
  const traces = [];
  const result = runSessionExitFlow({
    options: { keep: true },
    deactivateView: () => calls.push(['deactivate']),
    chatOriginPage: 'moments',
    switchPage: (page, options) => calls.push(['switch', page, options]),
    setChatOriginPage: value => calls.push(['origin', value]),
    updatePendingFloat: () => calls.push(['pending']),
    uiStateArmed: true,
    saveUiState: () => calls.push(['save']),
    uiLog: (tag, payload) => calls.push(['log', tag, payload]),
    activePage: 'chat',
    getCurrentSessionId: () => 's-exit',
    recordTraceEvent: event => traces.push(event),
  });
  assert.deepEqual(result, { originPage: 'moments' });
  assert.deepEqual(calls, [
    ['deactivate'],
    ['switch', 'moments', { keep: true, animate: false }],
    ['origin', 'chat'],
    ['pending'],
    ['save'],
    ['log', 'exitChatRoom', { activePage: 'chat', sessionId: 's-exit' }],
  ]);
  assert.deepEqual(traces, [
    {
      category: 'session',
      source: 'session-enter-runtime',
      phase: 'exit.start',
      sessionId: 's-exit',
      status: 'started',
      summary: 'session exit started',
      details: { activePage: 'chat', originPage: 'moments' },
    },
    {
      category: 'session',
      source: 'session-enter-runtime',
      phase: 'exit.finish',
      sessionId: 's-exit',
      status: 'success',
      summary: 'session exit completed',
      details: { activePage: 'chat', originPage: 'moments', switchedPage: true },
    },
  ]);
  console.log('ok - runSessionExitFlow restores list page saves state and logs current session');
}

{
  const calls = [];
  const result = await runSessionChangedFlow({
    sessionId: 's-changed',
    beginEnterRequest: sid => {
      calls.push(['begin', sid]);
      return { sid };
    },
    cancelInitialHistoryFillJobs: () => calls.push(['cancel']),
    syncScriptContext: payload => calls.push(['script', payload]),
    getContact: sid => ({ id: sid, name: '会话B' }),
    activateShellStateFn: ({ sessionId, contact }) => calls.push(['shell', sessionId, contact?.name]),
    applyLoadingStateFn: ({ sessionId, contact, sessionName }) =>
      calls.push(['loading', sessionId, contact?.name, sessionName]),
    ensureRecentMessagesLoaded: async sid => {
      calls.push(['load', sid]);
      return [{ id: 'm1' }, { id: 'm2' }];
    },
    isRequestStale: request => {
      calls.push(['stale?', request]);
      return false;
    },
    renderChangedHistoryStageFn: ({ sessionId, contact, messages }) =>
      calls.push(['render', sessionId, contact?.name, messages.map(message => message.id)]),
  });
  assert.deepEqual(result, { handled: true, stale: false, messageCount: 2 });
  assert.deepEqual(calls, [
    ['begin', 's-changed'],
    ['cancel'],
    ['script', { sessionId: 's-changed' }],
    ['shell', 's-changed', '会话B'],
    ['loading', 's-changed', '会话B', '会话B'],
    ['load', 's-changed'],
    ['stale?', { sid: 's-changed' }],
    ['render', 's-changed', '会话B', ['m1', 'm2']],
  ]);
  console.log('ok - runSessionChangedFlow reloads session history and re-renders current session shell');
}

{
  const calls = [];
  const result = await runSessionChangedFlow({
    sessionId: 's-stale',
    beginEnterRequest: sid => sid,
    cancelInitialHistoryFillJobs: () => calls.push(['cancel']),
    syncScriptContext: () => calls.push(['script']),
    getContact: sid => ({ id: sid, name: '会话C' }),
    activateShellStateFn: () => calls.push(['shell']),
    applyLoadingStateFn: () => calls.push(['loading']),
    ensureRecentMessagesLoaded: async () => [{ id: 'm1' }],
    isRequestStale: () => true,
    renderChangedHistoryStageFn: () => calls.push(['render']),
  });
  assert.deepEqual(result, { handled: true, stale: true, messageCount: 1 });
  assert.deepEqual(calls, [
    ['cancel'],
    ['script'],
    ['shell'],
    ['loading'],
  ]);
  console.log('ok - runSessionChangedFlow skips render when the session-change request has gone stale');
}

{
  const calls = [];
  const result = await runSavedUiRestoreFlow({
    pickSavedUiState: async () => ({ activePage: 'chat', sessionId: 's-restore' }),
    applySavedState: (savedState) => {
      calls.push(['apply', savedState]);
      return { restored: true, sessionId: savedState.sessionId };
    },
    uiLog: (tag) => calls.push(['log', tag]),
  });
  assert.deepEqual(result, {
    missing: false,
    restored: true,
    sessionId: 's-restore',
  });
  assert.deepEqual(calls, [
    ['apply', { activePage: 'chat', sessionId: 's-restore' }],
  ]);
  console.log('ok - runSavedUiRestoreFlow applies saved state when persisted ui state exists');
}

{
  const calls = [];
  const result = await runSavedUiRestoreFlow({
    pickSavedUiState: async () => null,
    applySavedState: () => calls.push(['apply']),
    uiLog: (tag) => calls.push(['log', tag]),
  });
  assert.deepEqual(result, { restored: false, missing: true });
  assert.deepEqual(calls, [['log', 'restoreUiState: no saved state']]);
  console.log('ok - runSavedUiRestoreFlow logs and exits cleanly when no saved ui state exists');
}

{
  const calls = [];
  const result = await runHydratedUiRestoreFlow({
    store: 'chat',
    reconcileHydratedState: ({ store }) => {
      calls.push(['reconcile', store]);
      return { handled: true, restored: true };
    },
  });
  assert.deepEqual(result, { handled: true, restored: true });
  assert.deepEqual(calls, [['reconcile', 'chat']]);
  console.log('ok - runHydratedUiRestoreFlow forwards hydrated store name into restore reconcile flow');
}

{
  const state = readSavedUiStateFastSnapshot({
    key: 'ui',
    sessionStorageLike: {
      getItem(key) {
        assert.equal(key, 'ui');
        return JSON.stringify({ source: 'session' });
      },
    },
    localStorageLike: {
      getItem() {
        return JSON.stringify({ source: 'local' });
      },
    },
  });
  assert.deepEqual(state, { source: 'session' });
  console.log('ok - readSavedUiStateFastSnapshot prefers session storage before local storage');
}

{
  const state = await pickSavedUiStateSnapshot({
    key: 'ui',
    sessionStorageLike: { getItem: () => null },
    localStorageLike: { getItem: () => null },
    loadDiskState: async () => ({ source: 'disk' }),
  });
  assert.deepEqual(state, { source: 'disk' });
  console.log('ok - pickSavedUiStateSnapshot falls back to async disk state when fast storage is empty');
}

{
  const calls = [];
  const timer = saveUiStateSnapshot({
    state: { activePage: 'chat' },
    key: 'ui',
    kvName: 'ui-kv',
    sessionStorageLike: { setItem: (key, value) => calls.push(['session', key, JSON.parse(value)]) },
    localStorageLike: { setItem: (key, value) => calls.push(['local', key, JSON.parse(value)]) },
    clearTimerFn: (value) => calls.push(['clear', value]),
    existingTimer: 7,
    setTimerFn: (fn, delay) => {
      calls.push(['timer', delay]);
      fn();
      return 9;
    },
    persistDiskState: payload => calls.push(['disk', payload]),
    uiLog: (tag, payload) => calls.push(['log', tag, payload]),
    delayMs: 123,
  });
  assert.equal(timer, 9);
  assert.deepEqual(calls, [
    ['session', 'ui', { activePage: 'chat' }],
    ['local', 'ui', { activePage: 'chat' }],
    ['clear', 7],
    ['timer', 123],
    ['disk', { name: 'ui-kv', data: { activePage: 'chat' } }],
    ['log', 'saveUiState', { activePage: 'chat' }],
  ]);
  console.log('ok - saveUiStateSnapshot writes both storages, reschedules disk save, and logs snapshot');
}

{
  const result = restoreSessionShellState({
    sessionId: 's-shell',
    hasKnownSession: sid => sid === 's-shell',
    activateShellStateFn: sid => sid === 's-shell',
  });
  assert.equal(result, true);
  assert.equal(
    restoreSessionShellState({
      sessionId: 'missing',
      hasKnownSession: () => false,
      activateShellStateFn: () => true,
    }),
    false,
  );
  console.log('ok - restoreSessionShellState only activates known sessions');
}

{
  const calls = [];
  const result = renderSessionChangedHistoryStage({
    sessionId: 's9',
    messages: [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }],
    pageSize: 2,
    clearMessages: () => calls.push(['clear']),
    decorateMessagesForDisplay: (messages, options) => {
      calls.push(['decorate', messages.map(message => message.id), options]);
      return messages.map(message => ({ ...message, decorated: true }));
    },
    preloadHistory: messages => calls.push(['preload', messages.map(message => message.id)]),
    setRenderState: (sid, state) => calls.push(['renderState', sid, state]),
    getDraft: sid => `draft:${sid}`,
    setInputText: value => calls.push(['draft', value]),
    syncReplyTargetComposer: sid => calls.push(['reply', sid]),
    setSessionLabel: sid => calls.push(['label', sid]),
    applyMvuSchemaDefaults: (sid, options) => calls.push(['mvu', sid, options]),
    uiMode: 'rp',
    refreshRpToolbar: sid => calls.push(['rpToolbar', sid]),
    refreshChatAndContacts: () => calls.push(['refresh']),
  });
  assert.deepEqual(result, { start: 1, renderedCount: 2 });
  assert.deepEqual(calls, [
    ['clear'],
    ['decorate', ['m2', 'm3'], { sessionId: 's9' }],
    ['preload', ['m2', 'm3']],
    ['renderState', 's9', { start: 1 }],
    ['draft', 'draft:s9'],
    ['reply', 's9'],
    ['label', 's9'],
    ['mvu', 's9', { reason: 'session' }],
    ['rpToolbar', 's9'],
    ['refresh'],
  ]);
  console.log('ok - renderSessionChangedHistoryStage redraws current window and restores session ui state');
}

{
  const calls = [];
  const result = applySavedUiRestoreState({
    savedState: {
      activePage: 'contacts',
      sessionId: 's7',
      inChatRoom: true,
      at: 123,
    },
    hasPage: page => page === 'contacts',
    switchPage: page => calls.push(['page', page]),
    restoreSessionShell: sid => {
      calls.push(['shell', sid]);
      return false;
    },
    uiLog: (tag, payload) => calls.push(['log', tag, payload]),
  });
  assert.deepEqual(result, {
    restored: true,
    page: 'contacts',
    sessionId: 's7',
    inChatRoom: true,
    sidKnown: false,
  });
  assert.deepEqual(calls, [
    ['log', 'restoreUiState: picked', { page: 'contacts', sid: 's7', inChatRoom: true, at: 123 }],
    ['page', 'contacts'],
    ['shell', 's7'],
    ['log', 'restoreUiState: sid not yet known (skip switchSession)', { sid: 's7' }],
  ]);
  console.log('ok - applySavedUiRestoreState restores page and logs unresolved shell state');
}

{
  const calls = [];
  const result = await reconcileHydratedStoreUiState({
    store: 'chat',
    refreshChatAndContacts: () => calls.push(['refresh']),
    getCurrentSessionId: () => 'default',
    readSavedStateFast: () => ({ sessionId: 's8' }),
    hasSession: sid => sid === 's8',
    pickSavedUiState: async () => ({ activePage: 'moments', inChatRoom: false }),
    hasPage: page => page === 'moments',
    switchPage: page => calls.push(['page', page]),
    restoreSessionShell: sid => {
      calls.push(['shell', sid]);
      return true;
    },
    uiLog: (tag, payload) => calls.push(['log', tag, payload]),
  });
  assert.deepEqual(result, {
    handled: true,
    restored: true,
    page: 'moments',
    sessionId: 's8',
    inChatRoom: false,
  });
  assert.deepEqual(calls, [
    ['log', 'store-hydrated', { store: 'chat' }],
    ['refresh'],
    ['log', 'store-hydrated: check restore', { cur: 'default', want: 's8', curKnown: false }],
    ['page', 'moments'],
    ['shell', 's8'],
  ]);
  console.log('ok - reconcileHydratedStoreUiState refreshes and restores saved shell after hydration');
}

{
  const calls = [];
  const result = finalizeSessionEnterNavigation({
    jumpTargetMessageId: 'm9',
    jumpKeyword: 'kw',
    jumpKind: 'search',
    scrollToMessage: (id, options) => {
      calls.push(['scrollToMessage', id, options]);
      if (id === 'm9') return false;
      return true;
    },
    dividerId: 'unread-divider-m2',
    firstUnreadId: 'm2',
    suppressInitialAutoScroll: false,
    scrollToBottom: () => calls.push(['bottom']),
    syncChatBottomGap: () => calls.push(['gap']),
    requestAnimationFrameFn: fn => {
      calls.push(['raf']);
      fn?.();
    },
    setTimeoutFn: (fn, delay) => {
      calls.push(['timeout', delay]);
      fn?.();
    },
    windowObject: {
      requestAnimationFrame(fn) {
        calls.push(['window-raf']);
        fn?.();
      },
    },
  });
  assert.deepEqual(result, { jumpedToTarget: false, scrollMode: 'unread' });
  assert.deepEqual(calls, [
    ['scrollToMessage', 'm9', { keyword: 'kw', kind: 'search', dismissOnScroll: true }],
    ['window-raf'],
    ['scrollToMessage', 'unread-divider-m2', { kind: 'unread', dismissOnScroll: true }],
    ['raf'],
    ['gap'],
  ]);
  console.log('ok - finalizeSessionEnterNavigation falls back from jump target to unread flow');
}

{
  const calls = [];
  const raf = fn => {
    calls.push(['raf']);
    fn?.();
  };
  const timeout = (fn, delay) => {
    calls.push(['timeout', delay]);
    fn?.();
  };
  applySessionEnterScrollMode('target', {
    syncChatBottomGap: () => calls.push(['gap']),
    requestAnimationFrameFn: raf,
    setTimeoutFn: timeout,
  });
  assert.deepEqual(calls, [['raf'], ['gap']]);
  console.log('ok - applySessionEnterScrollMode target mode schedules bottom gap sync');
}

{
  const calls = [];
  const timeout = (fn, delay) => {
    calls.push(['timeout', delay]);
    fn?.();
  };
  const windowObject = {
    requestAnimationFrame(fn) {
      calls.push(['window-raf']);
      fn?.();
    },
  };
  let first = true;
  applySessionEnterScrollMode('unread', {
    jumpToUnread: () => {
      calls.push(['jump']);
      if (first) {
        first = false;
        return false;
      }
      return true;
    },
    syncChatBottomGap: () => calls.push(['gap']),
    requestAnimationFrameFn: fn => {
      calls.push(['raf']);
      fn?.();
    },
    setTimeoutFn: timeout,
    windowObject,
  });
  assert.deepEqual(calls, [
    ['window-raf'],
    ['jump'],
    ['timeout', 80],
    ['jump'],
    ['raf'],
    ['gap'],
  ]);
  console.log('ok - applySessionEnterScrollMode unread mode retries unread jump then syncs gap');
}

{
  const calls = [];
  applySessionEnterScrollMode('bottom', {
    scrollToBottom: () => calls.push(['bottom']),
    syncChatBottomGap: () => calls.push(['gap']),
    requestAnimationFrameFn: fn => {
      calls.push(['raf']);
      fn?.();
    },
    setTimeoutFn: (fn, delay) => {
      calls.push(['timeout', delay]);
      fn?.();
    },
  });
  assert.deepEqual(calls, [
    ['timeout', 0],
    ['bottom'],
    ['raf'],
    ['gap'],
  ]);
  console.log('ok - applySessionEnterScrollMode bottom mode scrolls then syncs gap');
}

{
  const result = renderSessionEnterInitialHistory({
    sessionId: 's1',
    initialMessages: [{ id: 'm1' }],
    useProgressiveInitialRender: true,
    renderInitialHistoryProgressive: (sessionId, messages, options) => ({
      sessionId,
      count: messages.length,
      options,
      deferred: true,
    }),
  });
  assert.deepEqual(result, {
    sessionId: 's1',
    count: 1,
    options: { keepScroll: true, recentCount: 24, chunkSize: 12 },
    deferred: true,
  });
  console.log('ok - renderSessionEnterInitialHistory delegates to progressive renderer when enabled');
}

{
  let tick = 0;
  const calls = [];
  const result = renderSessionEnterInitialHistory({
    sessionId: 's2',
    initialMessages: [{ id: 'm2' }],
    useProgressiveInitialRender: false,
    decorateMessagesForDisplay: (messages, options) => {
      calls.push(['decorate', options]);
      return messages.map(message => ({ ...message, decorated: true }));
    },
    preloadHistory: (messages, options) => {
      calls.push(['preload', messages, options]);
    },
    nowPerfMs: () => {
      tick += 5;
      return tick;
    },
  });
  assert.deepEqual(calls, [
    ['decorate', { sessionId: 's2' }],
    ['preload', [{ id: 'm2', decorated: true }], { keepScroll: true }],
  ]);
  assert.deepEqual(result, {
    decorateMs: 5,
    preloadMs: 5,
    deferred: false,
    deferredCount: 0,
  });
  console.log('ok - renderSessionEnterInitialHistory decorates and preloads in non-progressive mode');
}

{
  const calls = [];
  const ok = activateSessionShellState({
    sessionId: 's1',
    switchSession: sid => calls.push(['switch', sid]),
    setStageSession: sid => calls.push(['stage', sid]),
    setTimelineSession: sid => calls.push(['timeline', sid]),
    setActiveSession: sid => calls.push(['active', sid]),
    syncUserPersonaUI: sid => calls.push(['persona', sid]),
    getContact: sid => ({ id: sid, name: '会话A' }),
    renderSessionNameHtml: (sid, contact) => `${sid}:${contact.name}`,
    setChatTitleHtml: html => calls.push(['title', html]),
    getDraft: sid => `draft:${sid}`,
    setInputText: value => calls.push(['draft', value]),
    syncReplyTargetComposer: sid => calls.push(['reply', sid]),
    setSessionLabel: sid => calls.push(['label', sid]),
    restoreDraft: true,
  });
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['switch', 's1'],
    ['stage', 's1'],
    ['timeline', 's1'],
    ['active', 's1'],
    ['persona', 's1'],
    ['title', 's1:会话A'],
    ['draft', 'draft:s1'],
    ['reply', 's1'],
    ['label', 's1'],
  ]);
  console.log('ok - activateSessionShellState syncs active session title and optional draft state');
}

{
  const calls = [];
  const result = finalizeSessionEnterUiState({
    sessionId: 's1',
    markRead: sid => calls.push(['read', sid]),
    refreshChatAndContacts: () => calls.push(['refresh']),
    nowPerfMs: (() => {
      let tick = 0;
      return () => {
        tick += 7;
        return tick;
      };
    })(),
    getDraft: () => '',
    getMirrorDraft: sid => `mirror:${sid}`,
    setInputText: value => calls.push(['draft', value]),
    syncReplyTargetComposer: sid => calls.push(['reply', sid]),
    setSessionLabel: sid => calls.push(['label', sid]),
    uiStateArmed: true,
    saveUiState: () => calls.push(['save']),
    updatePendingFloat: sid => calls.push(['pending', sid]),
    activeGeneration: {
      sessionId: 's1',
      cancelled: false,
      streamText: 'streaming',
      reattachStream: () => {
        calls.push(['reattach']);
        return false;
      },
    },
    showTyping: (avatar, members) => calls.push(['typing', avatar, members]),
    getAssistantAvatarForSession: sid => `avatar:${sid}`,
    getGroupTypingMembers: sid => ({ sid }),
  });
  assert.deepEqual(result, { refreshMs: 7, reattached: false });
  assert.deepEqual(calls, [
    ['read', 's1'],
    ['refresh'],
    ['draft', 'mirror:s1'],
    ['reply', 's1'],
    ['label', 's1'],
    ['save'],
    ['pending', 's1'],
    ['reattach'],
    ['typing', 'avatar:s1', { sid: 's1' }],
  ]);
  console.log('ok - finalizeSessionEnterUiState restores ui state and reattaches typing');
}
