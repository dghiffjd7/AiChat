export const runAppBootRestoreFlow = async ({
  restoreUiState = null,
  getActivePage = null,
  setActivePage = null,
  hasPage = null,
  isPageActive = null,
  switchPage = null,
  uiLog = null,
  getCurrentSessionId = null,
  isChatRoomVisible = null,
  applyMvuSchemaDefaults = null,
  updateWorldIndicator = null,
  refreshChatAndContacts = null,
  applyUiModeUI = null,
  getInitialUiMode = null,
  setUiMode = null,
  persistUiMode = null,
  setUiStateArmed = null,
  saveUiState = null,
} = {}) => {
  try {
    await restoreUiState?.();
  } catch {}
  let activePage = String(getActivePage?.() || '').trim();
  if (!activePage) {
    activePage = 'chat';
    setActivePage?.(activePage);
  }
  if (!hasPage?.(activePage)) {
    activePage = 'chat';
    setActivePage?.(activePage);
  }
  if (!isPageActive?.(activePage)) switchPage?.(activePage || 'chat');
  uiLog?.('boot: after restore', {
    activePage,
    sessionId: String(getCurrentSessionId?.() || '').trim(),
    inChatRoom: Boolean(isChatRoomVisible?.()),
  });
  applyMvuSchemaDefaults?.(getCurrentSessionId?.(), { reason: 'boot' });
  updateWorldIndicator?.();
  refreshChatAndContacts?.();
  applyUiModeUI?.();
  if (String(getInitialUiMode?.() || '').trim() === 'rp') {
    setUiMode?.('chat');
    persistUiMode?.();
    applyUiModeUI?.();
  }
  setUiStateArmed?.(true);
  try {
    saveUiState?.();
  } catch {}
};

export const registerHydratedUiRestoreListener = ({
  windowLike = null,
  onHydrated = null,
} = {}) => {
  windowLike?.addEventListener?.('store-hydrated', async (event) => {
    try {
      await onHydrated?.(event?.detail?.store, event);
    } catch {}
  });
};

export const registerUiLifecycleDiagnostics = ({
  windowLike = null,
  documentLike = null,
  uiLog = null,
  isIgnorableRuntimeNoise = null,
} = {}) => {
  const shouldIgnore = typeof isIgnorableRuntimeNoise === 'function'
    ? isIgnorableRuntimeNoise
    : (() => false);
  try {
    windowLike?.addEventListener?.('pageshow', event => uiLog?.('pageshow', { persisted: Boolean(event?.persisted) }));
    windowLike?.addEventListener?.('pagehide', event => uiLog?.('pagehide', { persisted: Boolean(event?.persisted) }));
    documentLike?.addEventListener?.('visibilitychange', () => uiLog?.('visibilitychange', { state: documentLike?.visibilityState }));
    windowLike?.addEventListener?.('beforeunload', () => uiLog?.('beforeunload'));
    windowLike?.addEventListener?.('unload', () => uiLog?.('unload'));
    windowLike?.addEventListener?.('error', event => {
      const error = event?.error;
      const msg = String(event?.message || error?.message || error || '');
      if (shouldIgnore(msg)) return;
      uiLog?.('window.error', {
        msg,
        file: event?.filename,
        line: event?.lineno,
        col: event?.colno,
        stack: error?.stack || '',
      });
    });
    windowLike?.addEventListener?.('unhandledrejection', event => {
      const msg = String(event?.reason?.message || event?.reason || '');
      if (shouldIgnore(msg)) return;
      uiLog?.('unhandledrejection', {
        reason: msg,
        stack: event?.reason?.stack || '',
      });
    });
  } catch {}
};
