import assert from 'node:assert/strict';

import { createDebugTraceTimeline } from '../../src/scripts/ui/debug-trace-timeline-utils.js';
import { createPageSwitchRuntime } from '../../src/scripts/ui/page-navigation-runtime-utils.js';
import {
  activateSessionEnterView,
  activateSessionShellState,
  applySessionEnterChatSettings,
  applySessionEnterLoadingState,
  deactivateSessionEnterView,
  finalizeSessionEnterNavigation,
  finalizeSessionEnterUiState,
  loadSessionEnterHistoryStage,
  reconcileHydratedStoreUiState,
  runSessionEnterFlow,
  runSessionExitFlow,
} from '../../src/scripts/ui/chat/session-enter-runtime.js';

const createClassList = (initial = []) => {
  const set = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    toggle: (token, force) => {
      if (force === true) {
        set.add(token);
        return true;
      }
      if (force === false) {
        set.delete(token);
        return false;
      }
      if (set.has(token)) {
        set.delete(token);
        return false;
      }
      set.add(token);
      return true;
    },
    contains: token => set.has(token),
  };
};

const createElement = ({ classes = [], dataset = {} } = {}) => ({
  classList: createClassList(classes),
  dataset: { ...dataset },
  style: {},
  addEventListener() {},
});

let now = 1000;
const timeline = createDebugTraceTimeline({
  maxEvents: 80,
  now: () => now,
});
const recordTraceEvent = (event) => {
  now += 11;
  return timeline.record(event);
};

const calls = [];
let activePage = 'chat';
let currentSessionId = 'default';
let chatOriginPage = 'chat';
let uiStateArmed = true;
let tick = 0;

const navChat = createElement({ dataset: { page: 'chat' }, classes: ['active'] });
const navContacts = createElement({ dataset: { page: 'contacts' } });
const pages = {
  chat: createElement({ classes: ['active'] }),
  contacts: createElement(),
  moments: createElement(),
};
const chatRoomEl = createElement({ classes: ['hidden'] });
const chatListEl = createElement();
const bodyEl = createElement();

const switchPage = createPageSwitchRuntime({
  getActivePage: () => activePage,
  setActivePage: value => {
    activePage = value;
  },
  pageOrder: { chat: 0, contacts: 1, moments: 2 },
  navButtons: [navChat, navContacts],
  pages,
  getReducedMotion: () => true,
  chatRoomEl,
  chatListEl,
  renderMoments: () => calls.push(['renderMoments']),
  updateChatContentSearchVisibility: () => calls.push(['chatSearch']),
  isUiStateArmed: () => uiStateArmed,
  saveUiState: () => calls.push(['saveUiState']),
  uiLog: (tag, payload) => calls.push(['pageLog', tag, payload]),
  scheduleModeSwitchSync: () => calls.push(['modeSync']),
});

const restoreResult = await reconcileHydratedStoreUiState({
  store: 'chat',
  refreshChatAndContacts: () => calls.push(['refreshList']),
  getCurrentSessionId: () => currentSessionId,
  readSavedStateFast: () => ({ sessionId: 'contact:42' }),
  hasSession: sid => sid === 'contact:42',
  pickSavedUiState: async () => ({ activePage: 'contacts', inChatRoom: false }),
  hasPage: page => Boolean(pages[page]),
  switchPage,
  restoreSessionShell: sid => {
    calls.push(['restoreShell', sid]);
    currentSessionId = sid;
    return sid === 'contact:42';
  },
  uiLog: (tag, payload) => calls.push(['restoreLog', tag, payload]),
});

const contact = { id: 'contact:42', name: 'Alice' };
const messages = [
  { id: 'm1', role: 'user', content: 'hello' },
  { id: 'm2', role: 'assistant', content: 'reply' },
  { id: 'm3', role: 'user', content: 'next' },
];
const renderState = new Map();
const scrolls = [];

const enterResult = await runSessionEnterFlow({
  sessionId: 'contact:42',
  sessionName: 'Alice',
  originPage: activePage,
  contact,
  isGroupSession: false,
  options: { suppressInitialAutoScroll: false },
  activateView: ({ originPage }) => activateSessionEnterView({
    originPage,
    setChatOriginPage: value => {
      chatOriginPage = value;
      calls.push(['origin', value]);
    },
    cancelInitialHistoryFillJobs: () => calls.push(['cancelFill']),
    chatListEl,
    chatRoomEl,
    chatPageEl: pages.chat,
    bodyEl,
    setChatInputGapTweak: value => calls.push(['gap', value]),
    setStickerPanelOpen: value => calls.push(['sticker', value]),
    scheduleModeSwitchSync: () => calls.push(['modeSyncEnter']),
    syncChatInputOffset: () => calls.push(['syncInput']),
    requestAnimationFrameFn: fn => fn?.(),
    messageTopbarEl: createElement(),
    bottomNavEl: createElement(),
  }),
  activateShellStateFn: ({ sessionId }) => activateSessionShellState({
    sessionId,
    switchSession: sid => {
      calls.push(['switchSession', sid]);
      currentSessionId = sid;
    },
    setStageSession: sid => calls.push(['stage', sid]),
    setTimelineSession: sid => calls.push(['timeline', sid]),
    setActiveSession: sid => calls.push(['bridgeActive', sid]),
    syncUserPersonaUI: sid => calls.push(['persona', sid]),
    getContact: () => contact,
    renderSessionNameHtml: (sid, item) => `${item?.name || sid}`,
    setChatTitleHtml: html => calls.push(['title', html]),
  }),
  applyChatSettingsFn: ({ sessionId }) => applySessionEnterChatSettings({
    sessionId,
    chatSettingsReady: true,
    getSessionSettings: sid => ({ sid, theme: 'default' }),
    normalizeChatSettings: raw => ({ ...raw, normalized: true }),
    applyChatSettings: (sid, settings) => calls.push(['settings', sid, settings.normalized]),
  }),
  applyLoadingStateFn: ({ sessionId, contact, sessionName }) => applySessionEnterLoadingState({
    sessionId,
    contact,
    sessionName,
    showConversationLoading: payload => calls.push(['loading', payload.title, payload.isGroup]),
    getDraft: () => '',
    getMirrorDraft: sid => `mirror:${sid}`,
    setInputText: value => calls.push(['input', value]),
    syncReplyTargetComposer: sid => calls.push(['replyComposer', sid]),
    setSessionLabel: sid => calls.push(['label', sid]),
    updatePendingFloat: sid => calls.push(['pending', sid]),
  }),
  loadHistoryStageFn: ({ sessionId, isGroupSession, jumpTargetMessageId }) => loadSessionEnterHistoryStage({
    sessionId,
    isGroupSession,
    jumpTargetMessageId,
    ensureRecentMessagesLoaded: async sid => {
      calls.push(['loadHistory', sid]);
      return messages;
    },
    isRequestStale: () => false,
    getFirstUnreadMessageId: () => 'm2',
    injectUnreadDivider: (list, firstUnreadId) => ({
      list: [list[0], { id: `unread-${firstUnreadId}`, type: 'divider' }, ...list.slice(1)],
      dividerId: `unread-${firstUnreadId}`,
    }),
    clearMessages: () => calls.push(['clearMessages']),
    hideTyping: () => calls.push(['hideTyping']),
    decorateMessagesForDisplay: (list, options) => {
      calls.push(['decorate', list.map(item => item.id), options.sessionId]);
      return list;
    },
    preloadHistory: (list, options) => calls.push(['preload', list.map(item => item.id), options.keepScroll]),
    nowPerfMs: () => {
      tick += 5;
      return tick;
    },
    setRenderState: (sid, state) => renderState.set(sid, state),
    scheduleHydration: async (sid, options) => calls.push(['hydrate', sid, options.delayMs]),
    restoreTailMemory: async (sid, options) => calls.push(['restoreTail', sid, options.source]),
    prefetchRawOriginals: async sid => calls.push(['prefetch', sid]),
  }),
  finalizeNavigationFn: payload => finalizeSessionEnterNavigation({
    ...payload,
    scrollToMessage: (id, options) => {
      scrolls.push([id, options.kind]);
      return id.startsWith('unread-');
    },
    scrollToBottom: () => scrolls.push(['bottom']),
    syncChatBottomGap: () => calls.push(['bottomGap']),
    requestAnimationFrameFn: fn => fn?.(),
    setTimeoutFn: fn => fn?.(),
  }),
  finalizeUiStateFn: ({ sessionId }) => finalizeSessionEnterUiState({
    sessionId,
    markRead: sid => calls.push(['markRead', sid]),
    refreshChatAndContacts: () => calls.push(['refreshAfterEnter']),
    nowPerfMs: () => {
      tick += 3;
      return tick;
    },
    getDraft: () => '',
    getMirrorDraft: () => '',
    setInputText: value => calls.push(['finalInput', value]),
    syncReplyTargetComposer: sid => calls.push(['finalReply', sid]),
    setSessionLabel: sid => calls.push(['finalLabel', sid]),
    uiStateArmed,
    saveUiState: () => calls.push(['saveEnterState']),
    updatePendingFloat: sid => calls.push(['finalPending', sid]),
  }),
  getChatOriginPage: () => chatOriginPage,
  recordTraceEvent,
  uiLog: (tag, payload) => calls.push(['enterLog', tag, payload]),
});

const exitResult = runSessionExitFlow({
  options: { reason: 'integration' },
  deactivateView: () => deactivateSessionEnterView({
    resetEnterRequest: value => calls.push(['resetEnter', value]),
    cancelInitialHistoryFillJobs: () => calls.push(['cancelFillExit']),
    chatRoomEl,
    chatListEl,
    chatPageEl: pages.chat,
    bodyEl,
    clearStageTimeline: value => calls.push(['clearTimeline', value]),
    setStickerPanelOpen: value => calls.push(['stickerExit', value]),
    setActionPanelOpen: value => calls.push(['actionExit', value]),
    setReplyTarget: value => calls.push(['replyTargetExit', value]),
    scheduleModeSwitchSync: () => calls.push(['modeSyncExit']),
    scheduleWallpaperIdle: () => calls.push(['wallpaper']),
    messageTopbarEl: createElement(),
    bottomNavEl: createElement(),
    updateChatContentSearchVisibility: () => calls.push(['searchVisibility']),
  }),
  chatOriginPage,
  switchPage,
  setChatOriginPage: value => {
    chatOriginPage = value;
    calls.push(['originReset', value]);
  },
  updatePendingFloat: () => calls.push(['pendingExit']),
  uiStateArmed,
  saveUiState: () => calls.push(['saveExitState']),
  uiLog: (tag, payload) => calls.push(['exitLog', tag, payload]),
  activePage,
  getCurrentSessionId: () => currentSessionId,
  recordTraceEvent,
});

await Promise.resolve();

assert.deepEqual(restoreResult, {
  handled: true,
  restored: true,
  page: 'contacts',
  sessionId: 'contact:42',
  inChatRoom: false,
});
assert.deepEqual(enterResult, { jumpedToTarget: false });
assert.deepEqual(exitResult, { originPage: 'contacts' });
assert.equal(activePage, 'contacts');
assert.equal(currentSessionId, 'contact:42');
assert.equal(chatOriginPage, 'chat');
assert.equal(chatRoomEl.classList.contains('hidden'), true);
assert.equal(chatListEl.classList.contains('hidden'), false);
assert.equal(bodyEl.classList.contains('chat-room-active'), false);
assert.deepEqual(renderState.get('contact:42'), { start: 0 });
assert.deepEqual(scrolls, [['unread-m2', 'unread']]);
assert.equal(calls.some(call => call[0] === 'restoreShell' && call[1] === 'contact:42'), true);
assert.equal(calls.some(call => call[0] === 'loadHistory' && call[1] === 'contact:42'), true);
assert.equal(calls.some(call => call[0] === 'markRead' && call[1] === 'contact:42'), true);
assert.equal(calls.some(call => call[0] === 'exitLog' && call[2]?.sessionId === 'contact:42'), true);

assert.deepEqual(
  timeline.snapshot({ category: 'session', sessionId: 'contact:42' }).map(event => [event.phase, event.status]),
  [
    ['enter.start', 'started'],
    ['enter.finish', 'success'],
    ['exit.start', 'started'],
    ['exit.finish', 'success'],
  ],
);

console.log('ok - session enter lifecycle integration restores page state enters room and exits with trace events');
