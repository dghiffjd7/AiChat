const normalizeSessionId = (value = '') => String(value || '').trim();

export const runEnterRpModeFlow = async ({
  uiMode = 'chat',
  captureSocial = true,
  activePage = 'chat',
  currentSessionId = '',
  isChatRoomVisible = () => false,
  setLastChatState = () => {},
  setUiMode = () => {},
  vibrate = () => {},
  persistUiMode = () => {},
  applyUiModeUI = () => {},
  waitForRpSessionReady = async () => {},
  setStickerPanelOpen = () => {},
  setActionPanelOpen = () => {},
  switchPage = () => {},
  getRpSessionId = () => '',
  activePersonaId = '',
  ensureSession = () => {},
  getSessionSettings = () => ({}),
  setSessionSettings = () => {},
  persistChatStore = () => {},
  applyMvuSchemaDefaults = () => {},
  enterChatRoom = async () => {},
  getRpTitle = () => '',
  setCurrentChatTitle = () => {},
  hydrateRpCharacterName = async () => {},
  seedRpGreetingIfNeeded = async () => {},
  refreshRpToolbar = () => {},
  setBackToListVisible = () => {},
} = {}) => {
  if (uiMode === 'rp') return { entered: false, rpSessionId: '' };
  if (captureSocial) {
    setLastChatState({
      activePage,
      sessionId: currentSessionId,
      inChatRoom: Boolean(isChatRoomVisible?.()),
    });
  }
  setUiMode('rp');
  try { vibrate?.(10); } catch {}
  persistUiMode?.();
  applyUiModeUI?.();
  try {
    await waitForRpSessionReady?.();
  } catch {}
  setStickerPanelOpen?.(false);
  setActionPanelOpen?.(false);
  if (activePage !== 'chat') {
    switchPage?.('chat', { animate: false });
  }
  const rpSessionId = normalizeSessionId(getRpSessionId?.(activePersonaId));
  if (rpSessionId) {
    ensureSession?.(rpSessionId);
    const settings = getSessionSettings?.(rpSessionId) || {};
    setSessionSettings?.(rpSessionId, {
      ...settings,
      sharedVariables: true,
      sharedMemory: false,
    });
    persistChatStore?.();
    applyMvuSchemaDefaults?.(rpSessionId, { reason: 'rp_enter' });
    const rpTitle = String(getRpTitle?.() || '').trim();
    await enterChatRoom?.(rpSessionId, rpTitle, 'chat');
    setCurrentChatTitle?.(rpTitle);
    try {
      await hydrateRpCharacterName?.();
    } catch {}
    await seedRpGreetingIfNeeded?.(rpSessionId);
    refreshRpToolbar?.(rpSessionId);
  }
  setBackToListVisible?.(false);
  return { entered: true, rpSessionId };
};

export const runExitRpModeFlow = ({
  uiMode = 'chat',
  lastChatState = {},
  setUiMode = () => {},
  vibrate = () => {},
  persistUiMode = () => {},
  applyUiModeUI = () => {},
  hideRpToolbar = () => {},
  setBackToListVisible = () => {},
  setChatOriginPage = () => {},
  exitChatRoom = () => {},
  getContact = () => null,
  switchPage = () => {},
  enterChatRoom = () => {},
} = {}) => {
  if (uiMode !== 'rp') {
    return {
      exited: false,
      restorePage: '',
      restoreSession: '',
      restoreInRoom: false,
    };
  }
  setUiMode('chat');
  try { vibrate?.(10); } catch {}
  persistUiMode?.();
  applyUiModeUI?.();
  hideRpToolbar?.();
  setBackToListVisible?.(true);

  const restorePage = String(lastChatState?.activePage || 'chat').trim() || 'chat';
  const restoreSession = normalizeSessionId(lastChatState?.sessionId);
  const restoreInRoom = Boolean(lastChatState?.inChatRoom);

  setChatOriginPage?.(restorePage);
  exitChatRoom?.({ animate: false });

  if (restoreInRoom && restoreSession) {
    const contact = getContact?.(restoreSession);
    switchPage?.(restorePage, { animate: false });
    enterChatRoom?.(restoreSession, contact?.name || restoreSession, restorePage);
  } else {
    switchPage?.(restorePage, { animate: false });
  }

  return {
    exited: true,
    restorePage,
    restoreSession,
    restoreInRoom,
  };
};
