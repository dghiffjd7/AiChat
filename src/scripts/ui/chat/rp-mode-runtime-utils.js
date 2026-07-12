const normalizeSessionId = (value = '') => String(value || '').trim();
export const UI_MODE_STORAGE_KEY = 'chat_ui_mode_v1';
export const LEGACY_SEND_MODE_STORAGE_KEY = 'chat_send_mode_v1';

const getDefaultLocalStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const normalizeUiMode = (value = '') => (
  String(value || '').trim().toLowerCase() === 'rp' ? 'rp' : 'chat'
);

export const readUiMode = ({
  storage = getDefaultLocalStorage(),
  key = UI_MODE_STORAGE_KEY,
} = {}) => {
  try {
    return normalizeUiMode(storage?.getItem?.(key));
  } catch {
    return 'chat';
  }
};

export const writeUiMode = (
  value = 'chat',
  {
    storage = getDefaultLocalStorage(),
    key = UI_MODE_STORAGE_KEY,
  } = {},
) => {
  try {
    storage?.setItem?.(key, normalizeUiMode(value));
    return true;
  } catch {
    return false;
  }
};

export const removeLegacySendModeState = ({
  storage = getDefaultLocalStorage(),
  key = LEGACY_SEND_MODE_STORAGE_KEY,
} = {}) => {
  try {
    storage?.removeItem?.(key);
    return true;
  } catch {
    return false;
  }
};

export const applyRpGreetingUpdateVariables = ({
  message = null,
  sessionId = '',
  resolveApply = () => null,
  getMessage = () => null,
  logger = console,
} = {}) => {
  const sid = normalizeSessionId(sessionId);
  if (!message || message.role !== 'assistant' || !sid) return message;
  const apply = typeof resolveApply === 'function' ? resolveApply() : null;
  if (typeof apply !== 'function') return message;
  try {
    apply(message, sid);
    return getMessage(message.id, sid) || message;
  } catch (error) {
    logger?.warn?.('[rp-greeting] UpdateVariable apply failed', error);
    return message;
  }
};

export const resolveRpInitVarWorldIds = ({
  bridge = null,
  sessionId = '',
  uiMode = 'rp',
} = {}) => {
  const sid = normalizeSessionId(sessionId);
  const normalizeIds = (value) => Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map(item => String(item || '').trim())
      .filter(Boolean),
  ));
  if (typeof bridge?.getResolvedWorldState === 'function') {
    try {
      const resolved = bridge.getResolvedWorldState(sid, { uiMode: normalizeUiMode(uiMode) });
      if (Array.isArray(resolved?.worldIds)) return normalizeIds(resolved.worldIds);
    } catch {}
  }
  const fallback = [];
  try {
    fallback.push(bridge?.getGlobalWorldId?.());
  } catch {}
  try {
    fallback.push(...(bridge?.getWorldIdsForSession?.(sid) || []));
  } catch {}
  return normalizeIds(fallback);
};

export const resetRpGreetingVariableState = ({
  chatStore = null,
  sessionId = '',
  applyMvuSchemaDefaults = () => false,
} = {}) => {
  const sid = normalizeSessionId(sessionId);
  if (!sid || !chatStore) return false;
  chatStore.clearVariables?.(sid);
  chatStore.clearInitialVariables?.(sid);
  applyMvuSchemaDefaults?.(sid, { reason: 'rp_greeting_reset' });
  return true;
};

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
