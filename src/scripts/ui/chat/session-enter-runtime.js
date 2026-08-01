import {
  buildInitialHistorySlice,
  buildEnterRestorePlan,
  resolveEnterPageSize,
  resolveEnterHydrationDelay,
  resolveEnterScrollMode,
  shouldUseProgressiveInitialRender,
} from './session-enter-utils.js';
import {
  emitLifecycleTraceEvent,
  normalizeLifecycleTraceDetails,
  normalizeLifecycleTraceText,
} from './lifecycle-trace-utils.js';

export const buildSessionEnterTraceEvent = ({
  phase = '',
  sessionId = '',
  status = 'info',
  summary = '',
  details,
} = {}) => {
  const event = {
    category: 'session',
    source: 'session-enter-runtime',
    phase: normalizeLifecycleTraceText(phase, 'event'),
    sessionId: normalizeLifecycleTraceText(sessionId, ''),
    status: normalizeLifecycleTraceText(status, 'info'),
    summary: normalizeLifecycleTraceText(summary, ''),
  };
  if (details !== undefined) event.details = normalizeLifecycleTraceDetails(details);
  return event;
};

const hasNonBlankText = value => String(value ?? '').trim().length > 0;

export const hasRecoverableActiveGenerationStream = (generation = null) => {
  if (!generation || typeof generation !== 'object') return false;
  if (hasNonBlankText(generation.streamText)) return true;
  const payload = generation.streamPayload && typeof generation.streamPayload === 'object'
    ? generation.streamPayload
    : null;
  const meta = generation.streamMeta && typeof generation.streamMeta === 'object'
    ? generation.streamMeta
    : null;
  const payloadMeta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : null;
  const candidates = [
    payload?.content,
    payload?.raw,
    payload?.rawSource,
    payload?.raw_source,
    payload?.rawOriginal,
    payload?.rawOriginalSource,
    payload?.reasoning,
    payload?.reasoningDisplay,
    payload?.reasoningSource,
    payloadMeta?.reasoning,
    payloadMeta?.reasoningDisplay,
    payloadMeta?.reasoningSource,
    meta?.reasoning,
    meta?.reasoningDisplay,
    meta?.reasoningSource,
  ];
  return candidates.some(hasNonBlankText);
};

export const buildSessionEnterStartTraceEvent = ({
  sessionId = '',
  originPage = '',
  isGroupSession = false,
  jumpTargetMessageId = '',
  suppressInitialAutoScroll = false,
} = {}) => ({
  phase: 'enter.start',
  sessionId: normalizeLifecycleTraceText(sessionId, ''),
  status: 'started',
  summary: 'session enter started',
  details: {
    originPage,
    isGroupSession: Boolean(isGroupSession),
    hasJumpTarget: Boolean(jumpTargetMessageId),
    suppressInitialAutoScroll,
  },
});

export const buildSessionEnterFinishTraceEvent = ({
  sessionId = '',
  status = 'success',
  jumpedToTarget = false,
} = {}) => {
  const normalizedStatus = normalizeLifecycleTraceText(status, 'success');
  if (normalizedStatus === 'stale') {
    return {
      phase: 'enter.finish',
      sessionId: normalizeLifecycleTraceText(sessionId, ''),
      status: 'stale',
      summary: 'session enter request became stale',
    };
  }
  return {
    phase: 'enter.finish',
    sessionId: normalizeLifecycleTraceText(sessionId, ''),
    status: 'success',
    summary: 'session enter completed',
    details: {
      jumpedToTarget: Boolean(jumpedToTarget),
    },
  };
};

export const buildSessionExitStartTraceEvent = ({
  sessionId = '',
  activePage = '',
  chatOriginPage = 'chat',
} = {}) => ({
  phase: 'exit.start',
  sessionId: normalizeLifecycleTraceText(sessionId, ''),
  status: 'started',
  summary: 'session exit started',
  details: {
    activePage,
    originPage: String(chatOriginPage || '').trim() || 'chat',
  },
});

export const buildSessionExitFinishTraceEvent = ({
  sessionId = '',
  activePage = '',
  originPage = 'chat',
} = {}) => {
  const normalizedOriginPage = String(originPage || '').trim() || 'chat';
  return {
    phase: 'exit.finish',
    sessionId: normalizeLifecycleTraceText(sessionId, ''),
    status: 'success',
    summary: 'session exit completed',
    details: {
      activePage,
      originPage: normalizedOriginPage,
      switchedPage: Boolean(normalizedOriginPage && normalizedOriginPage !== 'chat'),
    },
  };
};

export const buildSessionChangedStartTraceEvent = ({
  sessionId = '',
} = {}) => ({
  phase: 'changed.start',
  sessionId: normalizeLifecycleTraceText(sessionId, ''),
  status: 'started',
  summary: 'session change started',
});

export const buildSessionChangedFinishTraceEvent = ({
  sessionId = '',
  status = 'success',
  messageCount = 0,
} = {}) => {
  const normalizedStatus = normalizeLifecycleTraceText(status, 'success');
  if (normalizedStatus === 'stale') {
    return {
      phase: 'changed.finish',
      sessionId: normalizeLifecycleTraceText(sessionId, ''),
      status: 'stale',
      summary: 'session change request became stale',
      details: {
        messageCount: Number(messageCount || 0) || 0,
      },
    };
  }
  return {
    phase: 'changed.finish',
    sessionId: normalizeLifecycleTraceText(sessionId, ''),
    status: 'success',
    summary: 'session change completed',
    details: {
      messageCount: Number(messageCount || 0) || 0,
    },
  };
};

const emitSessionEnterTrace = (recordTraceEvent, event) => {
  emitLifecycleTraceEvent(recordTraceEvent, buildSessionEnterTraceEvent(event));
};

const sessionSwitchAnimationState = new WeakMap();

export const restartSessionSwitchAnimation = ({
  chatRoomEl = null,
  requestAnimationFrameFn = null,
  setTimeoutFn = null,
  clearTimeoutFn = typeof globalThis.clearTimeout === 'function' ? globalThis.clearTimeout : null,
} = {}) => {
  if (!chatRoomEl?.classList) return false;
  const previous = sessionSwitchAnimationState.get(chatRoomEl);
  previous?.cancel?.();
  try {
    chatRoomEl.classList.remove('is-session-switching');
  } catch {
    return false;
  }

  const state = {
    timer: null,
    onAnimationEnd: null,
    cancel: null,
  };
  const finish = () => {
    if (sessionSwitchAnimationState.get(chatRoomEl) !== state) return;
    if (state.onAnimationEnd) {
      try {
        chatRoomEl.removeEventListener?.('animationend', state.onAnimationEnd);
      } catch {}
    }
    if (state.timer !== null && typeof clearTimeoutFn === 'function') {
      try {
        clearTimeoutFn(state.timer);
      } catch {}
    }
    try {
      chatRoomEl.classList.remove('is-session-switching');
    } catch {}
    sessionSwitchAnimationState.delete(chatRoomEl);
  };
  state.cancel = () => {
    if (state.onAnimationEnd) {
      try {
        chatRoomEl.removeEventListener?.('animationend', state.onAnimationEnd);
      } catch {}
    }
    if (state.timer !== null && typeof clearTimeoutFn === 'function') {
      try {
        clearTimeoutFn(state.timer);
      } catch {}
    }
    if (sessionSwitchAnimationState.get(chatRoomEl) === state) {
      sessionSwitchAnimationState.delete(chatRoomEl);
    }
  };
  sessionSwitchAnimationState.set(chatRoomEl, state);

  const start = () => {
    if (sessionSwitchAnimationState.get(chatRoomEl) !== state) return;
    try {
      chatRoomEl.classList.add('is-session-switching');
    } catch {}
    state.onAnimationEnd = event => {
      if (String(event?.animationName || '') !== 'social-session-content-in') return;
      finish();
    };
    try {
      chatRoomEl.addEventListener?.('animationend', state.onAnimationEnd);
    } catch {}
    if (typeof setTimeoutFn === 'function') {
      try {
        state.timer = setTimeoutFn(finish, 320);
      } catch {}
    }
  };
  if (typeof requestAnimationFrameFn === 'function') {
    try {
      requestAnimationFrameFn(start);
    } catch {
      start();
    }
  } else {
    start();
  }
  return true;
};

export const activateSessionEnterView = ({
  originPage = '',
  setChatOriginPage = null,
  cancelInitialHistoryFillJobs = null,
  chatListEl = null,
  chatRoomEl = null,
  chatPageEl = null,
  bodyEl = null,
  setChatInputGapTweak = null,
  setStickerPanelOpen = null,
  scheduleModeSwitchSync = null,
  syncChatInputOffset = null,
  requestAnimationFrameFn = null,
  setTimeoutFn = null,
  messageTopbarEl = null,
  bottomNavEl = null,
} = {}) => {
  const nextOriginPage = String(originPage || '').trim() || 'chat';
  try {
    setChatOriginPage?.(nextOriginPage);
  } catch {}
  try {
    cancelInitialHistoryFillJobs?.();
  } catch {}
  try {
    chatListEl?.classList?.add?.('hidden');
  } catch {}
  try {
    chatRoomEl?.classList?.remove?.('hidden');
  } catch {}
  restartSessionSwitchAnimation({ chatRoomEl, requestAnimationFrameFn, setTimeoutFn });
  try {
    chatPageEl?.classList?.add?.('chat-room-active');
  } catch {}
  try {
    bodyEl?.classList?.add?.('chat-room-active');
  } catch {}
  try {
    setChatInputGapTweak?.(0);
  } catch {}
  try {
    setStickerPanelOpen?.(false);
  } catch {}
  try {
    scheduleModeSwitchSync?.();
  } catch {}
  if (typeof requestAnimationFrameFn === 'function') {
    try {
      requestAnimationFrameFn(() => {
        syncChatInputOffset?.();
        requestAnimationFrameFn(syncChatInputOffset);
      });
    } catch {}
  } else if (typeof setTimeoutFn === 'function') {
    try {
      setTimeoutFn(syncChatInputOffset, 0);
    } catch {}
  }
  try {
    if (messageTopbarEl?.style) messageTopbarEl.style.display = 'none';
  } catch {}
  try {
    if (bottomNavEl?.style) bottomNavEl.style.display = 'none';
  } catch {}
  return nextOriginPage;
};

export const deactivateSessionEnterView = ({
  resetEnterRequest = null,
  cancelInitialHistoryFillJobs = null,
  chatRoomEl = null,
  chatListEl = null,
  chatPageEl = null,
  bodyEl = null,
  clearStageTimeline = null,
  setStickerPanelOpen = null,
  setActionPanelOpen = null,
  setReplyTarget = null,
  scheduleModeSwitchSync = null,
  scheduleWallpaperIdle = null,
  clearMessages = null,
  clearChatTitle = null,
  messageTopbarEl = null,
  bottomNavEl = null,
  updateChatContentSearchVisibility = null,
} = {}) => {
  try {
    resetEnterRequest?.('');
  } catch {}
  try {
    cancelInitialHistoryFillJobs?.();
  } catch {}
  try {
    chatRoomEl?.classList?.add?.('hidden');
  } catch {}
  try {
    chatListEl?.classList?.remove?.('hidden');
  } catch {}
  try {
    chatPageEl?.classList?.remove?.('chat-room-active');
  } catch {}
  try {
    bodyEl?.classList?.remove?.('chat-room-active');
  } catch {}
  try {
    clearStageTimeline?.('');
  } catch {}
  try {
    setStickerPanelOpen?.(false);
  } catch {}
  try {
    setActionPanelOpen?.(false);
  } catch {}
  try {
    setReplyTarget?.(null);
  } catch {}
  try {
    scheduleModeSwitchSync?.();
  } catch {}
  try {
    scheduleWallpaperIdle?.();
  } catch {}
  try {
    clearMessages?.();
  } catch {}
  try {
    clearChatTitle?.();
  } catch {}
  try {
    if (messageTopbarEl?.style) messageTopbarEl.style.display = '';
  } catch {}
  try {
    if (bottomNavEl?.style) bottomNavEl.style.display = '';
  } catch {}
  try {
    updateChatContentSearchVisibility?.();
  } catch {}
  return true;
};

export const applySessionEnterLoadingState = ({
  sessionId = '',
  contact = null,
  sessionName = '',
  showConversationLoading = null,
  getDraft = null,
  getMirrorDraft = null,
  setInputText = null,
  syncReplyTargetComposer = null,
  setSessionLabel = null,
  updatePendingFloat = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const displayName = String(contact?.name || sessionName || sid).trim();
  try {
    showConversationLoading?.({
      title: displayName,
      isGroup: Boolean(contact?.isGroup) || sid.startsWith('group:'),
    });
  } catch {}
  try {
    const draft = getDraft?.(sid);
    if (draft) {
      setInputText?.(draft);
    } else {
      setInputText?.(getMirrorDraft?.(sid) || '');
    }
  } catch {}
  try {
    syncReplyTargetComposer?.(sid);
  } catch {}
  try {
    setSessionLabel?.(sid);
  } catch {}
  try {
    updatePendingFloat?.(sid);
  } catch {}
  return displayName;
};

export const applySessionEnterChatSettings = ({
  sessionId = '',
  chatSettingsReady = false,
  getSessionSettings = null,
  normalizeChatSettings = null,
  applyChatSettings = null,
  setPendingChatSettingsSessionId = null,
  logger = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { applied: false, pending: false };
  if (!chatSettingsReady) {
    try {
      setPendingChatSettingsSessionId?.(sid);
    } catch {}
    return { applied: false, pending: true };
  }
  try {
    const raw = getSessionSettings?.(sid) || {};
    const normalized = typeof normalizeChatSettings === 'function'
      ? normalizeChatSettings(raw)
      : raw;
    applyChatSettings?.(sid, normalized);
    return { applied: true, pending: false };
  } catch (err) {
    logger?.warn?.('应用会话聊天设置失败', err);
  }
  return { applied: false, pending: false };
};

export const runSessionEnterDeferredTasks = ({
  sessionId = '',
  isGroupSession = false,
  currentArchiveId = '',
  cancelScheduledHydration = null,
  scheduleHydration = null,
  restoreArchivePointer = null,
  restoreTailMemory = null,
  prefetchRawOriginals = null,
  logger = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { hydrateDelay: 0, restoreMode: '' };
  const hydrateDelay = resolveEnterHydrationDelay({ isGroupSession });
  try {
    if (typeof cancelScheduledHydration === 'function') {
      cancelScheduledHydration(sid);
    }
  } catch {}
  try {
    if (typeof scheduleHydration === 'function') {
      Promise.resolve(scheduleHydration(sid, {
        onlyMissing: true,
        delayMs: hydrateDelay,
      })).catch(err => {
        logger?.warn?.('schedule hydrate turn checkpoints from loaded messages failed', err);
      });
    }
  } catch {}
  const restorePlan = buildEnterRestorePlan({ currentArchiveId });
  try {
    const restoreTask = restorePlan.mode === 'archive'
      ? (typeof restoreArchivePointer === 'function'
        ? restoreArchivePointer(sid, {
          refreshBaselineWhenNoTail: restorePlan.refreshBaselineWhenNoTail,
          source: restorePlan.source,
        })
        : null)
      : (typeof restoreTailMemory === 'function'
        ? restoreTailMemory(sid, {
          refreshBaselineWhenNoTail: restorePlan.refreshBaselineWhenNoTail,
          source: restorePlan.source,
        })
        : null);
    Promise.resolve(restoreTask).catch(err => {
      logger?.warn?.('restore tail assistant memory state on enter failed', err);
    });
  } catch {}
  try {
    Promise.resolve(prefetchRawOriginals?.(sid)).catch(() => {});
  } catch {}
  return {
    hydrateDelay,
    restoreMode: restorePlan.mode,
  };
};

export const applySessionEnterScrollMode = (
  mode,
  {
    jumpToUnread = null,
    scrollToBottom = null,
    syncChatBottomGap = null,
    requestAnimationFrameFn = null,
    setTimeoutFn = null,
    windowObject = null,
  } = {},
) => {
  const scheduleGap = () => {
    try {
      if (typeof requestAnimationFrameFn === 'function') {
        requestAnimationFrameFn(syncChatBottomGap);
      } else if (typeof setTimeoutFn === 'function') {
        setTimeoutFn(syncChatBottomGap, 0);
      }
    } catch {
      if (typeof setTimeoutFn === 'function') {
        setTimeoutFn(syncChatBottomGap, 0);
      }
    }
  };
  if (mode === 'target' || mode === 'keep') {
    scheduleGap();
    return mode;
  }
  if (mode === 'unread') {
    try {
      if (windowObject && typeof windowObject.requestAnimationFrame === 'function') {
        windowObject.requestAnimationFrame(() => {
          if (typeof jumpToUnread === 'function' && !jumpToUnread() && typeof setTimeoutFn === 'function') {
            setTimeoutFn(jumpToUnread, 80);
          }
          if (typeof requestAnimationFrameFn === 'function') {
            requestAnimationFrameFn(syncChatBottomGap);
          } else if (typeof setTimeoutFn === 'function') {
            setTimeoutFn(syncChatBottomGap, 0);
          }
        });
      } else if (typeof setTimeoutFn === 'function') {
        setTimeoutFn(() => {
          if (typeof jumpToUnread === 'function' && !jumpToUnread()) {
            setTimeoutFn(jumpToUnread, 80);
          }
          setTimeoutFn(syncChatBottomGap, 0);
        }, 0);
      }
    } catch {
      if (typeof setTimeoutFn === 'function') {
        setTimeoutFn(() => {
          if (typeof jumpToUnread === 'function' && !jumpToUnread()) {
            setTimeoutFn(jumpToUnread, 80);
          }
          setTimeoutFn(syncChatBottomGap, 0);
        }, 0);
      }
    }
    return mode;
  }
  if (typeof setTimeoutFn === 'function') {
    setTimeoutFn(() => {
      scrollToBottom?.();
      if (typeof requestAnimationFrameFn === 'function') {
        requestAnimationFrameFn(syncChatBottomGap);
      } else if (typeof setTimeoutFn === 'function') {
        setTimeoutFn(syncChatBottomGap, 0);
      }
    }, 0);
  }
  return 'bottom';
};

export const renderSessionEnterInitialHistory = ({
  sessionId = '',
  initialMessages = [],
  useProgressiveInitialRender = false,
  renderInitialHistoryProgressive = null,
  decorateMessagesForDisplay = null,
  preloadHistory = null,
  nowPerfMs = () => 0,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const list = Array.isArray(initialMessages) ? initialMessages : [];
  if (useProgressiveInitialRender && typeof renderInitialHistoryProgressive === 'function') {
    return renderInitialHistoryProgressive(sid, list, {
      keepScroll: true,
      recentCount: 24,
      chunkSize: 12,
    });
  }
  const decorateStart = nowPerfMs();
  const decoratedInitial = typeof decorateMessagesForDisplay === 'function'
    ? decorateMessagesForDisplay(list, { sessionId: sid })
    : list;
  const decorateMs = Math.round(nowPerfMs() - decorateStart);
  const preloadStart = nowPerfMs();
  if (typeof preloadHistory === 'function') {
    preloadHistory(decoratedInitial, { keepScroll: true });
  }
  const preloadMs = Math.round(nowPerfMs() - preloadStart);
  return {
    decorateMs,
    preloadMs,
    deferred: false,
    deferredCount: 0,
  };
};

export const loadSessionEnterHistoryStage = async ({
  sessionId = '',
  isGroupSession = false,
  isAndroid = false,
  jumpTargetMessageId = '',
  ensureRecentMessagesLoaded = null,
  isRequestStale = null,
  getFirstUnreadMessageId = null,
  injectUnreadDivider = null,
  clearMessages = null,
  hideTyping = null,
  renderInitialHistoryProgressive = null,
  decorateMessagesForDisplay = null,
  preloadHistory = null,
  nowPerfMs = () => 0,
  currentArchiveId = '',
  cancelScheduledHydration = null,
  scheduleHydration = null,
  restoreArchivePointer = null,
  restoreTailMemory = null,
  prefetchRawOriginals = null,
  setRenderState = null,
  logger = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) {
    return {
      stale: false,
      loadHistoryMs: 0,
      firstUnreadId: '',
      dividerId: '',
      renderMetrics: {
        decorateMs: 0,
        preloadMs: 0,
        deferred: false,
        deferredCount: 0,
      },
    };
  }
  const loadStart = nowPerfMs();
  const history = await Promise.resolve(ensureRecentMessagesLoaded?.(sid));
  if (typeof isRequestStale === 'function' && isRequestStale() === true) {
    return { stale: true };
  }
  const loadHistoryMs = Math.round(nowPerfMs() - loadStart);
  const firstUnreadId = String(getFirstUnreadMessageId?.(sid) || '').trim();
  const pageSize = resolveEnterPageSize({ isGroupSession, isAndroid });
  const {
    start,
    list: initialWithDivider,
    dividerId,
  } = buildInitialHistorySlice(Array.isArray(history) ? history : [], {
    firstUnreadId,
    pageSize,
    unreadLead: 10,
    injectUnreadDivider,
  });
  try {
    clearMessages?.();
  } catch {}
  try {
    hideTyping?.();
  } catch {}
  const renderMetrics = renderSessionEnterInitialHistory({
    sessionId: sid,
    initialMessages: initialWithDivider,
    useProgressiveInitialRender: shouldUseProgressiveInitialRender({
      isGroupSession,
      isAndroid,
      jumpTargetMessageId,
      firstUnreadId,
      initialCount: initialWithDivider.length,
    }),
    renderInitialHistoryProgressive,
    decorateMessagesForDisplay,
    preloadHistory,
    nowPerfMs,
  });
  runSessionEnterDeferredTasks({
    sessionId: sid,
    isGroupSession,
    currentArchiveId,
    cancelScheduledHydration,
    scheduleHydration,
    restoreArchivePointer,
    restoreTailMemory,
    prefetchRawOriginals,
    logger,
  });
  try {
    setRenderState?.(sid, { start });
  } catch {}
  return {
    stale: false,
    loadHistoryMs,
    firstUnreadId,
    dividerId,
    renderMetrics,
  };
};

export const renderSessionChangedHistoryStage = ({
  sessionId = '',
  messages = [],
  pageSize = 90,
  clearMessages = null,
  decorateMessagesForDisplay = null,
  preloadHistory = null,
  setRenderState = null,
  getDraft = null,
  setInputText = null,
  syncReplyTargetComposer = null,
  setSessionLabel = null,
  applyMvuSchemaDefaults = null,
  uiMode = '',
  refreshRpToolbar = null,
  refreshChatAndContacts = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const list = Array.isArray(messages) ? messages : [];
  try {
    clearMessages?.();
  } catch {}
  const normalizedPageSize = Math.max(0, Number(pageSize) || 0);
  const start = Math.max(0, list.length - normalizedPageSize);
  try {
    const decorated = typeof decorateMessagesForDisplay === 'function'
      ? decorateMessagesForDisplay(list.slice(start), { sessionId: sid })
      : list.slice(start);
    preloadHistory?.(decorated);
  } catch {}
  try {
    setRenderState?.(sid, { start });
  } catch {}
  try {
    setInputText?.(getDraft?.(sid) || '');
  } catch {}
  try {
    syncReplyTargetComposer?.(sid);
  } catch {}
  try {
    setSessionLabel?.(sid);
  } catch {}
  try {
    applyMvuSchemaDefaults?.(sid, { reason: 'session' });
  } catch {}
  try {
    if (String(uiMode || '').trim() === 'rp') refreshRpToolbar?.(sid);
  } catch {}
  try {
    refreshChatAndContacts?.();
  } catch {}
  return {
    start,
    renderedCount: Math.max(0, list.length - start),
  };
};

export const applySavedUiRestoreState = ({
  savedState = null,
  hasPage = null,
  switchPage = null,
  setUiMode = null,
  persistUiMode = null,
  applyUiModeUI = null,
  restoreSessionShell = null,
  restoreChatRoom = null,
  uiLog = null,
} = {}) => {
  if (!savedState || typeof savedState !== 'object') {
    return {
      restored: false,
      page: '',
      sessionId: '',
      inChatRoom: false,
      uiMode: '',
      sidKnown: false,
      roomRestored: false,
    };
  }
  const page = String(savedState?.activePage || '').trim();
  const sid = String(savedState?.sessionId || '').trim();
  const inChatRoom = Boolean(savedState?.inChatRoom);
  const rawSavedUiMode = Object.prototype.hasOwnProperty.call(savedState, 'uiMode')
    ? String(savedState?.uiMode || '').trim().toLowerCase()
    : '';
  const shouldRestoreUiMode = Boolean(rawSavedUiMode) || sid.startsWith('rp:');
  const uiMode = rawSavedUiMode === 'rp' || (!rawSavedUiMode && sid.startsWith('rp:')) ? 'rp' : 'chat';
  try {
    uiLog?.('restoreUiState: picked', {
      page,
      sid,
      inChatRoom,
      ...(shouldRestoreUiMode ? { uiMode } : {}),
      at: savedState?.at || 0,
    });
  } catch {}
  if (shouldRestoreUiMode) {
    try {
      setUiMode?.(uiMode);
    } catch {}
    try {
      persistUiMode?.();
    } catch {}
    try {
      applyUiModeUI?.();
    } catch {}
  }
  try {
    if (page && hasPage?.(page)) switchPage?.(page);
  } catch {}
  const sidKnown = sid ? Boolean(restoreSessionShell?.(sid)) : false;
  const result = {
    restored: true,
    page,
    sessionId: sid,
    inChatRoom,
    uiMode: shouldRestoreUiMode ? uiMode : '',
    sidKnown,
    roomRestored: false,
  };
  if (inChatRoom && sidKnown && typeof restoreChatRoom === 'function') {
    try {
      const restored = restoreChatRoom({ sessionId: sid, page, uiMode });
      if (restored && typeof restored.then === 'function') {
        return restored.then(value => ({
          ...result,
          roomRestored: Boolean(value),
        })).catch(() => result);
      }
      result.roomRestored = Boolean(restored);
    } catch {}
  }
  try {
    if (sid && !sidKnown) {
      uiLog?.('restoreUiState: sid not yet known (skip switchSession)', { sid });
    }
  } catch {}
  return result;
};

export const reconcileHydratedStoreUiState = async ({
  store = '',
  refreshChatAndContacts = null,
  getCurrentSessionId = null,
  readSavedStateFast = null,
  hasSession = null,
  pickSavedUiState = null,
  hasPage = null,
  switchPage = null,
  restoreSessionShell = null,
  uiLog = null,
} = {}) => {
  const normalizedStore = String(store || '').trim();
  if (!normalizedStore || (normalizedStore !== 'chat' && normalizedStore !== 'contacts')) {
    return { handled: false, restored: false };
  }
  try {
    uiLog?.('store-hydrated', { store: normalizedStore });
  } catch {}
  try {
    refreshChatAndContacts?.();
  } catch {}
  const cur = String(getCurrentSessionId?.() || '').trim();
  const fastState = (() => {
    try {
      return readSavedStateFast?.() || null;
    } catch {}
    return null;
  })();
  const want = String(fastState?.sessionId || '').trim();
  const curKnown = Boolean(hasSession?.(cur));
  try {
    uiLog?.('store-hydrated: check restore', { cur, want, curKnown });
  } catch {}
  if (want && want !== cur && (cur === 'default' || !curKnown)) {
    const saved = await Promise.resolve(pickSavedUiState?.());
    const page = String(saved?.activePage || '').trim();
    const inChatRoom = Boolean(saved?.inChatRoom);
    try {
      if (page && hasPage?.(page)) switchPage?.(page);
    } catch {}
    const shellRestored = Boolean(restoreSessionShell?.(want));
    return {
      handled: true,
      restored: shellRestored,
      page,
      sessionId: want,
      inChatRoom,
    };
  }
  return {
    handled: true,
    restored: false,
    page: '',
    sessionId: want,
    inChatRoom: false,
  };
};

export const finalizeSessionEnterNavigation = ({
  jumpTargetMessageId = '',
  jumpKeyword = '',
  jumpKind = 'anchor',
  scrollToMessage = null,
  dividerId = '',
  firstUnreadId = '',
  suppressInitialAutoScroll = false,
  scrollToBottom = null,
  syncChatBottomGap = null,
  requestAnimationFrameFn = null,
  setTimeoutFn = null,
  windowObject = null,
} = {}) => {
  const targetId = String(jumpTargetMessageId || '').trim();
  const keyword = String(jumpKeyword || '').trim();
  const kind = String(jumpKind || '').trim() || 'anchor';
  const normalizedDividerId = String(dividerId || '').trim();
  const normalizedFirstUnreadId = String(firstUnreadId || '').trim();
  const jumpedToTarget = targetId
    ? Boolean(scrollToMessage?.(targetId, {
      keyword,
      kind,
      dismissOnScroll: true,
    }))
    : false;
  const jumpToUnread = () => {
    if (normalizedDividerId && scrollToMessage?.(normalizedDividerId, { kind: 'unread', dismissOnScroll: true })) {
      return true;
    }
    if (normalizedFirstUnreadId) {
      return Boolean(scrollToMessage?.(normalizedFirstUnreadId, { kind: 'unread', dismissOnScroll: true }));
    }
    return false;
  };
  const scrollMode = resolveEnterScrollMode({
    jumpedToTarget,
    suppressInitialAutoScroll,
    dividerId: normalizedDividerId,
    firstUnreadId: normalizedFirstUnreadId,
  });
  applySessionEnterScrollMode(scrollMode, {
    jumpToUnread,
    scrollToBottom,
    syncChatBottomGap,
    requestAnimationFrameFn,
    setTimeoutFn,
    windowObject,
  });
  return { jumpedToTarget, scrollMode };
};

export const activateSessionShellState = ({
  sessionId = '',
  switchSession = null,
  setStageSession = null,
  setTimelineSession = null,
  setActiveSession = null,
  syncUserPersonaUI = null,
  getContact = null,
  renderSessionNameHtml = null,
  setChatTitleHtml = null,
  getDraft = null,
  setInputText = null,
  syncReplyTargetComposer = null,
  setSessionLabel = null,
  restoreDraft = false,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  try {
    switchSession?.(sid);
  } catch {}
  try {
    setStageSession?.(sid);
  } catch {}
  try {
    setTimelineSession?.(sid);
  } catch {}
  try {
    setActiveSession?.(sid);
  } catch {}
  try {
    syncUserPersonaUI?.(sid);
  } catch {}
  try {
    const contact = typeof getContact === 'function' ? getContact(sid) : null;
    if (typeof renderSessionNameHtml === 'function' && typeof setChatTitleHtml === 'function') {
      setChatTitleHtml(renderSessionNameHtml(sid, contact));
    }
  } catch {}
  if (restoreDraft) {
    try {
      const draft = typeof getDraft === 'function' ? getDraft(sid) : '';
      setInputText?.(draft || '');
    } catch {}
  }
  try {
    syncReplyTargetComposer?.(sid);
  } catch {}
  try {
    setSessionLabel?.(sid);
  } catch {}
  return true;
};

export const runSessionEnterFlow = async ({
  sessionId = '',
  sessionName = '',
  originPage = '',
  options = null,
  contact = null,
  isGroupSession = false,
  activateView = null,
  activateShellStateFn = null,
  applyChatSettingsFn = null,
  applyLoadingStateFn = null,
  loadHistoryStageFn = null,
  finalizeNavigationFn = null,
  finalizeUiStateFn = null,
  getChatOriginPage = null,
  recordTraceEvent = null,
  uiLog = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { jumpedToTarget: false, stale: false };
  const payload = options && typeof options === 'object' ? options : {};
  const suppressInitialAutoScroll = payload.suppressInitialAutoScroll === true;
  const jumpTargetMessageId = String(payload.jumpTargetMessageId || '').trim();
  const jumpKeyword = String(payload.jumpKeyword || '').trim();
  const jumpKind = String(payload.jumpKind || (jumpKeyword ? 'search' : 'anchor')).trim() || 'anchor';

  emitSessionEnterTrace(recordTraceEvent, buildSessionEnterStartTraceEvent({
    sessionId: sid,
    originPage,
    isGroupSession,
    jumpTargetMessageId,
    suppressInitialAutoScroll,
  }));

  try {
    activateView?.({ originPage });
  } catch {}
  try {
    activateShellStateFn?.({ sessionId: sid });
  } catch {}
  try {
    applyChatSettingsFn?.({ sessionId: sid });
  } catch {}
  try {
    applyLoadingStateFn?.({ sessionId: sid, contact, sessionName });
  } catch {}

  const historyStage = await Promise.resolve(loadHistoryStageFn?.({
    sessionId: sid,
    isGroupSession,
    jumpTargetMessageId,
  }));
  if (historyStage?.stale) {
    emitSessionEnterTrace(recordTraceEvent, buildSessionEnterFinishTraceEvent({
      sessionId: sid,
      status: 'stale',
    }));
    return { jumpedToTarget: false, stale: true };
  }

  const { jumpedToTarget = false } = finalizeNavigationFn?.({
    jumpTargetMessageId,
    jumpKeyword,
    jumpKind,
    dividerId: historyStage?.dividerId,
    firstUnreadId: historyStage?.firstUnreadId,
    suppressInitialAutoScroll,
  }) || { jumpedToTarget: false };

  try {
    finalizeUiStateFn?.({ sessionId: sid });
  } catch {}
  try {
    uiLog?.('enterChatRoom', {
      sessionId: sid,
      originPage: typeof getChatOriginPage === 'function' ? getChatOriginPage() : originPage,
    });
  } catch {}
  emitSessionEnterTrace(recordTraceEvent, buildSessionEnterFinishTraceEvent({
    sessionId: sid,
    jumpedToTarget,
  }));
  return { jumpedToTarget };
};

export const runSessionExitFlow = ({
  options = null,
  deactivateView = null,
  chatOriginPage = 'chat',
  switchPage = null,
  setChatOriginPage = null,
  updatePendingFloat = null,
  uiStateArmed = false,
  saveUiState = null,
  uiLog = null,
  activePage = '',
  getCurrentSessionId = null,
  recordTraceEvent = null,
} = {}) => {
  const sessionId = (() => {
    try {
      return typeof getCurrentSessionId === 'function' ? String(getCurrentSessionId() || '').trim() : '';
    } catch {
      return '';
    }
  })();
  emitSessionEnterTrace(recordTraceEvent, buildSessionExitStartTraceEvent({
    sessionId,
    activePage,
    chatOriginPage,
  }));
  try {
    deactivateView?.();
  } catch {}
  const origin = String(chatOriginPage || '').trim() || 'chat';
  if (origin && origin !== 'chat') {
    try {
      switchPage?.(origin, { ...(options || {}), animate: false });
    } catch {}
  }
  try {
    setChatOriginPage?.('chat');
  } catch {}
  try {
    updatePendingFloat?.();
  } catch {}
  try {
    if (uiStateArmed) saveUiState?.();
  } catch {}
  try {
    uiLog?.('exitChatRoom', {
      activePage,
      sessionId: typeof getCurrentSessionId === 'function' ? getCurrentSessionId() : '',
    });
  } catch {}
  emitSessionEnterTrace(recordTraceEvent, buildSessionExitFinishTraceEvent({
    sessionId,
    activePage,
    originPage: origin,
  }));
  return { originPage: origin };
};

export const runSessionChangedFlow = async ({
  sessionId = '',
  beginEnterRequest = null,
  cancelInitialHistoryFillJobs = null,
  syncScriptContext = null,
  getContact = null,
  activateShellStateFn = null,
  applyLoadingStateFn = null,
  ensureRecentMessagesLoaded = null,
  isRequestStale = null,
  renderChangedHistoryStageFn = null,
  recordTraceEvent = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { handled: false, stale: false, messageCount: 0 };
  emitSessionEnterTrace(recordTraceEvent, buildSessionChangedStartTraceEvent({
    sessionId: sid,
  }));
  const enterRequest = beginEnterRequest?.(sid);
  try {
    cancelInitialHistoryFillJobs?.();
  } catch {}
  try {
    Promise.resolve(syncScriptContext?.({ sessionId: sid })).catch(() => {});
  } catch {}
  const contact = (() => {
    try {
      return getContact?.(sid) || null;
    } catch {
      return null;
    }
  })();
  try {
    activateShellStateFn?.({ sessionId: sid, contact });
  } catch {}
  try {
    applyLoadingStateFn?.({ sessionId: sid, contact, sessionName: contact?.name || sid });
  } catch {}
  const messages = await Promise.resolve(ensureRecentMessagesLoaded?.(sid));
  const messageCount = Array.isArray(messages) ? messages.length : 0;
  if (typeof isRequestStale === 'function' && isRequestStale(enterRequest) === true) {
    emitSessionEnterTrace(recordTraceEvent, buildSessionChangedFinishTraceEvent({
      sessionId: sid,
      status: 'stale',
      messageCount,
    }));
    return {
      handled: true,
      stale: true,
      messageCount,
    };
  }
  try {
    renderChangedHistoryStageFn?.({
      sessionId: sid,
      contact,
      messages: Array.isArray(messages) ? messages : [],
    });
  } catch {}
  emitSessionEnterTrace(recordTraceEvent, buildSessionChangedFinishTraceEvent({
    sessionId: sid,
    messageCount,
  }));
  return {
    handled: true,
    stale: false,
    messageCount,
  };
};

export const runSavedUiRestoreFlow = async ({
  pickSavedUiState = null,
  applySavedState = null,
  uiLog = null,
} = {}) => {
  const savedState = await Promise.resolve(pickSavedUiState?.());
  if (!savedState) {
    try {
      uiLog?.('restoreUiState: no saved state');
    } catch {}
    return { restored: false, missing: true };
  }
  const result = typeof applySavedState === 'function'
    ? ((await Promise.resolve(applySavedState(savedState))) || { restored: false })
    : { restored: false };
  return {
    missing: false,
    ...result,
  };
};

export const runHydratedUiRestoreFlow = async ({
  store = '',
  reconcileHydratedState = null,
} = {}) => {
  return (await Promise.resolve(reconcileHydratedState?.({
    store: String(store || '').trim(),
  }))) || { handled: false, restored: false };
};

export const readSavedUiStateFastSnapshot = ({
  key = '',
  sessionStorageLike = null,
  localStorageLike = null,
} = {}) => {
  const storageKey = String(key || '').trim();
  if (!storageKey) return null;
  try {
    const raw = sessionStorageLike?.getItem?.(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!(parsed && typeof parsed === 'object' && parsed._tooLarge)) return parsed;
    }
  } catch {}
  try {
    const raw = localStorageLike?.getItem?.(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (!(parsed && typeof parsed === 'object' && parsed._tooLarge)) return parsed;
    }
  } catch {}
  return null;
};

export const pickSavedUiStateSnapshot = async ({
  key = '',
  sessionStorageLike = null,
  localStorageLike = null,
  loadDiskState = null,
} = {}) => {
  const fastState = readSavedUiStateFastSnapshot({
    key,
    sessionStorageLike,
    localStorageLike,
  });
  if (fastState) return fastState;
  try {
    const diskState = await Promise.resolve(loadDiskState?.());
    if (diskState && typeof diskState === 'object' && !diskState._tooLarge) return diskState;
  } catch {}
  return null;
};

export const saveUiStateSnapshot = ({
  state = null,
  key = '',
  kvName = '',
  sessionStorageLike = null,
  localStorageLike = null,
  clearTimerFn = null,
  existingTimer = null,
  setTimerFn = null,
  persistDiskState = null,
  uiLog = null,
  delayMs = 400,
} = {}) => {
  if (!state || typeof state !== 'object') return existingTimer;
  const storageKey = String(key || '').trim();
  const diskKey = String(kvName || '').trim();
  const raw = JSON.stringify(state);
  try {
    sessionStorageLike?.setItem?.(storageKey, raw);
  } catch {}
  try {
    localStorageLike?.setItem?.(storageKey, raw);
  } catch {}
  try {
    if (existingTimer != null) clearTimerFn?.(existingTimer);
  } catch {}
  let nextTimer = existingTimer;
  if (typeof setTimerFn === 'function') {
    nextTimer = setTimerFn(() => {
      try {
        persistDiskState?.({ name: diskKey, data: state });
      } catch {}
    }, Number(delayMs || 0));
  }
  try {
    uiLog?.('saveUiState', state);
  } catch {}
  return nextTimer;
};

export const restoreSessionShellState = ({
  sessionId = '',
  hasKnownSession = null,
  activateShellStateFn = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const known = typeof hasKnownSession === 'function' ? hasKnownSession(sid) : false;
  if (!known) return false;
  return activateShellStateFn?.(sid) === true;
};

export const finalizeSessionEnterUiState = ({
  sessionId = '',
  markRead = null,
  refreshChatAndContacts = null,
  nowPerfMs = () => 0,
  getDraft = null,
  getMirrorDraft = null,
  setInputText = null,
  syncReplyTargetComposer = null,
  setSessionLabel = null,
  uiStateArmed = false,
  saveUiState = null,
  updatePendingFloat = null,
  activeGeneration = null,
  showTyping = null,
  getAssistantAvatarForSession = null,
  getGroupTypingMembers = null,
  logger = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { refreshMs: 0, reattached: false };
  try {
    markRead?.(sid);
  } catch {}
  const refreshStart = nowPerfMs();
  try {
    refreshChatAndContacts?.();
  } catch {}
  const refreshMs = Math.round(nowPerfMs() - refreshStart);
  try {
    const draft = getDraft?.(sid);
    if (draft) {
      setInputText?.(draft);
    } else {
      const mirrorDraft = getMirrorDraft?.(sid) || '';
      if (mirrorDraft) setInputText?.(mirrorDraft);
    }
  } catch {}
  try {
    syncReplyTargetComposer?.(sid);
  } catch {}
  try {
    setSessionLabel?.(sid);
  } catch {}
  try {
    if (uiStateArmed) saveUiState?.();
  } catch {}
  try {
    updatePendingFloat?.(sid);
  } catch {}
  let reattached = false;
  if (activeGeneration && !activeGeneration.cancelled && activeGeneration.sessionId === sid) {
    const hasRecoverableStream = hasRecoverableActiveGenerationStream(activeGeneration);
    if (hasRecoverableStream && typeof activeGeneration.reattachStream === 'function') {
      try {
        reattached = activeGeneration.reattachStream() === true;
      } catch (err) {
        logger?.warn?.('assistant stream reattach failed', err);
      }
    }
    if (!reattached) {
      try {
        showTyping?.(
          typeof getAssistantAvatarForSession === 'function' ? getAssistantAvatarForSession(sid) : '',
          typeof getGroupTypingMembers === 'function' ? (getGroupTypingMembers(sid) || {}) : {},
        );
      } catch {}
    }
  }
  return { refreshMs, reattached };
};
