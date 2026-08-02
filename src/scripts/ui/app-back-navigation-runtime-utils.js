const BACK_SENTINEL_KEY = '__chatappBackSentinel';
const BACK_DIAGNOSTICS_STORAGE_KEY = 'chatapp_android_back_diagnostics_v1';
const MAX_BACK_DIAGNOSTIC_EVENTS = 40;

const isEditableElement = (element) => {
  if (!element || typeof element !== 'object') return false;
  try {
    if (typeof element.checkVisibility === 'function' && !element.checkVisibility({
      checkOpacity: true,
      checkVisibilityCSS: true,
    })) return false;
  } catch {}
  if (typeof element.getClientRects === 'function' && element.getClientRects().length === 0) return false;
  const tag = String(element.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = String(element.type || 'text').toLowerCase();
    return !['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
  }
  return Boolean(element.isContentEditable);
};

export const isAppBackLayerVisible = (
  element,
  { getComputedStyleFn = globalThis.getComputedStyle } = {},
) => {
  if (!element || element.classList?.contains?.('extensions-embedded-root')) return false;
  if (typeof getComputedStyleFn !== 'function') return false;
  try {
    const style = getComputedStyleFn(element);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) === 0) return false;
    return element.getClientRects?.().length > 0 || style.position === 'fixed';
  } catch {
    return false;
  }
};

export const resolveAppBackNavigationAction = ({
  hasFocusedEditable = false,
  hasClosableLayer = false,
  isChatRoomVisible = false,
  activePage = '',
  rootPage = 'chat',
  now = 0,
  lastRootBackAt = 0,
  doublePressMs = 1400,
} = {}) => {
  if (hasFocusedEditable) return 'blur-active-element';
  if (hasClosableLayer) return 'close-layer';
  if (isChatRoomVisible) return 'exit-chat-room';
  if (String(activePage || rootPage) !== String(rootPage || 'chat')) return 'switch-root-page';
  if (lastRootBackAt > 0 && Number(now) - Number(lastRootBackAt) <= doublePressMs) return 'allow-native-exit';
  return 'show-root-exit-hint';
};

const normalizeState = (state) => (state && typeof state === 'object' ? state : {});

const toIsoTimestamp = (value) => {
  const numeric = Number(value);
  try {
    return new Date(Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now()).toISOString();
  } catch {
    return '';
  }
};

const cloneJson = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const readStoredBackDiagnostics = (storageRef, key) => {
  if (!storageRef || !key) return null;
  try {
    const raw = storageRef.getItem?.(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const writeStoredBackDiagnostics = (storageRef, key, value) => {
  if (!storageRef || !key) return false;
  try {
    storageRef.setItem?.(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
};

export const createAppBackNavigationRuntime = ({
  windowRef = typeof window !== 'undefined' ? window : null,
  historyRef = null,
  documentRef = typeof document !== 'undefined' ? document : null,
  getActivePage = null,
  rootPage = 'chat',
  getUiMode = null,
  switchPage = null,
  isChatRoomVisible = null,
  exitChatRoom = null,
  closeTopLayer = null,
  getFocusedElement = null,
  showExitHint = null,
  nowFn = () => Date.now(),
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
  clearTimeoutFn = timer => clearTimeout(timer),
  doublePressMs = 1400,
  registerNativeBackButton = null,
  exitNativeApp = null,
  storageRef = null,
  diagnosticStorageKey = BACK_DIAGNOSTICS_STORAGE_KEY,
  logger = null,
} = {}) => {
  const historyObj = historyRef || windowRef?.history || null;
  const diagnosticStorageRef = storageRef || windowRef?.localStorage || null;
  let started = false;
  let lastRootBackAt = 0;
  let rootExitHintTimer = null;
  let nativeBackUnlisten = null;
  let nativeBackStatus = typeof registerNativeBackButton === 'function' ? 'pending' : 'missing';
  let nativeBackStatusDetail = '';
  const storedDiagnostics = readStoredBackDiagnostics(diagnosticStorageRef, diagnosticStorageKey);
  const diagnostics = {
    version: 1,
    createdAt: storedDiagnostics?.createdAt || toIsoTimestamp(Date.now()),
    updatedAt: storedDiagnostics?.updatedAt || '',
    nativeBack: {
      ...(storedDiagnostics?.nativeBack && typeof storedDiagnostics.nativeBack === 'object'
        ? storedDiagnostics.nativeBack
        : {}),
      status: nativeBackStatus,
      detail: nativeBackStatusDetail,
    },
    events: Array.isArray(storedDiagnostics?.events)
      ? storedDiagnostics.events.slice(-MAX_BACK_DIAGNOSTIC_EVENTS)
      : [],
    lastKnown: storedDiagnostics?.lastKnown && typeof storedDiagnostics.lastKnown === 'object'
      ? storedDiagnostics.lastKnown
      : null,
  };

  const getHistorySentinelState = () => {
    try {
      return normalizeState(historyObj?.state)[BACK_SENTINEL_KEY] === true;
    } catch {
      return false;
    }
  };

  const summarizeElement = (element) => {
    if (!element || typeof element !== 'object') return null;
    return {
      tagName: String(element.tagName || '').toLowerCase(),
      id: String(element.id || '').trim(),
      className: String(element.className || '').trim().slice(0, 160),
      type: String(element.type || '').trim(),
      isEditable: isEditableElement(element),
    };
  };

  const buildDiagnosticSnapshot = (extra = {}) => {
    const now = Number(nowFn?.() || Date.now());
    const focused = typeof getFocusedElement === 'function'
      ? getFocusedElement()
      : documentRef?.activeElement;
    let activePage = '';
    let uiMode = '';
    let chatRoomVisible = false;
    try { activePage = String(getActivePage?.() || ''); } catch {}
    try { uiMode = String(getUiMode?.() || ''); } catch {}
    try { chatRoomVisible = Boolean(isChatRoomVisible?.()); } catch {}
    return {
      timestamp: toIsoTimestamp(now),
      started,
      activePage,
      rootPage,
      uiMode,
      isChatRoomVisible: chatRoomVisible,
      documentVisibility: String(documentRef?.visibilityState || ''),
      history: {
        length: Number(historyObj?.length || 0) || 0,
        hasSentinel: getHistorySentinelState(),
        stateKeys: Object.keys(normalizeState(historyObj?.state)).slice(0, 20),
      },
      nativeBack: {
        status: nativeBackStatus,
        detail: nativeBackStatusDetail,
        hasUnlisten: Boolean(nativeBackUnlisten),
      },
      focusedElement: summarizeElement(focused),
      lastRootBackAt,
      doublePressMs,
      ...extra,
    };
  };

  const persistDiagnostics = () => {
    const now = Number(nowFn?.() || Date.now());
    diagnostics.updatedAt = toIsoTimestamp(now);
    diagnostics.nativeBack = {
      status: nativeBackStatus,
      detail: nativeBackStatusDetail,
      hasUnlisten: Boolean(nativeBackUnlisten),
    };
    diagnostics.lastKnown = buildDiagnosticSnapshot();
    writeStoredBackDiagnostics(diagnosticStorageRef, diagnosticStorageKey, diagnostics);
    try {
      if (windowRef) windowRef.__chatappBackNavigationDiagnostics = () => cloneJson(getDiagnostics(), {});
    } catch {}
  };

  const setNativeBackStatus = (status, detail = '') => {
    nativeBackStatus = String(status || 'unknown');
    nativeBackStatusDetail = String(detail || '');
    persistDiagnostics();
  };

  const recordBackDiagnosticEvent = (event = {}) => {
    const now = Number(nowFn?.() || Date.now());
    const entry = {
      timestamp: toIsoTimestamp(now),
      ...event,
      snapshot: buildDiagnosticSnapshot(event?.snapshot || {}),
    };
    diagnostics.events = [...diagnostics.events, entry].slice(-MAX_BACK_DIAGNOSTIC_EVENTS);
    persistDiagnostics();
    return entry;
  };

  const getDiagnostics = () => cloneJson({
    ...diagnostics,
    updatedAt: toIsoTimestamp(Number(nowFn?.() || Date.now())),
    nativeBack: {
      status: nativeBackStatus,
      detail: nativeBackStatusDetail,
      hasUnlisten: Boolean(nativeBackUnlisten),
    },
    current: buildDiagnosticSnapshot(),
    events: diagnostics.events.slice(-MAX_BACK_DIAGNOSTIC_EVENTS),
  }, {
    version: 1,
    nativeBack: { status: nativeBackStatus },
    events: [],
  });

  const ensureSentinel = () => {
    if (!historyObj || typeof historyObj.pushState !== 'function') return false;
    try {
      const state = normalizeState(historyObj.state);
      if (state[BACK_SENTINEL_KEY] === true) return false;
      historyObj.pushState({ ...state, [BACK_SENTINEL_KEY]: true }, '');
      return true;
    } catch (err) {
      try {
        logger?.warn?.('install android back sentinel failed', err);
      } catch {}
      return false;
    }
  };

  const blurFocusedElement = () => {
    const focused = typeof getFocusedElement === 'function'
      ? getFocusedElement()
      : documentRef?.activeElement;
    if (!isEditableElement(focused)) return false;
    try {
      focused.blur?.();
      return true;
    } catch {
      return false;
    }
  };

  const hasClosableLayer = () => {
    try {
      return Boolean(closeTopLayer?.({ dryRun: true }));
    } catch {
      return false;
    }
  };

  const handleBack = (source = 'history') => {
    const now = Number(nowFn?.() || Date.now());
    const focused = typeof getFocusedElement === 'function'
      ? getFocusedElement()
      : documentRef?.activeElement;
    const focusedEditable = isEditableElement(focused);
    const closableLayer = hasClosableLayer();
    const chatRoomVisible = Boolean(isChatRoomVisible?.());
    const activePage = getActivePage?.();
    const action = resolveAppBackNavigationAction({
      hasFocusedEditable: focusedEditable,
      hasClosableLayer: closableLayer,
      isChatRoomVisible: chatRoomVisible,
      activePage,
      rootPage,
      now,
      lastRootBackAt,
      doublePressMs,
    });
    const diagnosticContext = {
      hasFocusedEditable: focusedEditable,
      hasClosableLayer: closableLayer,
      isChatRoomVisible: chatRoomVisible,
      activePage: String(activePage || ''),
      focusedElement: summarizeElement(focused),
    };
    let result = null;

    if (action === 'blur-active-element') {
      result = { handled: blurFocusedElement(), action, source };
    } else if (action === 'close-layer') {
      result = { handled: Boolean(closeTopLayer?.({ dryRun: false })), action, source };
    } else if (action === 'exit-chat-room') {
      exitChatRoom?.();
      lastRootBackAt = 0;
      result = { handled: true, action, source };
    } else if (action === 'switch-root-page') {
      switchPage?.(rootPage, { animate: false });
      lastRootBackAt = 0;
      result = { handled: true, action, source };
    } else if (action === 'show-root-exit-hint') {
      lastRootBackAt = now;
      showExitHint?.();
      result = { handled: true, action, source };
    } else {
      result = { handled: false, action, source };
    }
    recordBackDiagnosticEvent({
      phase: 'handle-back',
      source,
      action,
      handled: Boolean(result.handled),
      context: diagnosticContext,
    });
    return result;
  };

  const clearRootExitHintTimer = () => {
    if (!rootExitHintTimer) return;
    try {
      clearTimeoutFn?.(rootExitHintTimer);
    } catch {}
    rootExitHintTimer = null;
  };

  const rearmSentinelAfterExitWindow = () => {
    clearRootExitHintTimer();
    try {
      rootExitHintTimer = setTimeoutFn?.(() => {
        rootExitHintTimer = null;
        ensureSentinel();
      }, doublePressMs + 80) || null;
    } catch {
      rootExitHintTimer = null;
    }
  };

  const normalizeNativeUnlisten = (listener) => {
    if (typeof listener === 'function') return listener;
    if (listener && typeof listener.unregister === 'function') {
      return () => listener.unregister();
    }
    return null;
  };

  const requestNativeExit = () => {
    if (typeof exitNativeApp !== 'function') return false;
    try {
      return exitNativeApp() !== false;
    } catch (err) {
      try {
        logger?.warn?.('android native back exit failed', err);
      } catch {}
      return false;
    }
  };

  const handleNativeBackButton = (event) => {
    recordBackDiagnosticEvent({
      phase: 'native-back-event',
      source: 'native-back-button',
      payload: event?.payload || null,
    });
    const result = handleBack('native-back-button');
    if (result.handled) {
      clearRootExitHintTimer();
      ensureSentinel();
      return result;
    }
    if (result.action === 'allow-native-exit') {
      clearRootExitHintTimer();
      const exitRequested = requestNativeExit();
      recordBackDiagnosticEvent({
        phase: 'native-exit-request',
        source: 'native-back-button',
        action: result.action,
        handled: Boolean(result.handled),
        nativeExitRequested: exitRequested,
        payload: event?.payload || null,
      });
      return { ...result, nativeExitRequested: exitRequested, payload: event?.payload || null };
    }
    return result;
  };

  const handlePopState = () => {
    const result = handleBack('popstate');
    if (result.handled) {
      if (result.action === 'show-root-exit-hint') rearmSentinelAfterExitWindow();
      else {
        clearRootExitHintTimer();
        ensureSentinel();
      }
    }
    return result;
  };

  const installNativeBackButtonListener = () => {
    if (typeof registerNativeBackButton !== 'function') {
      setNativeBackStatus('missing', 'registerNativeBackButton unavailable');
      return false;
    }
    setNativeBackStatus('registering');
    try {
      const registered = registerNativeBackButton(handleNativeBackButton);
      if (registered && typeof registered.then === 'function') {
        registered
          .then((listener) => {
            const unlisten = normalizeNativeUnlisten(listener);
            if (!started) {
              try {
                unlisten?.();
              } catch {}
              return;
            }
            nativeBackUnlisten = unlisten;
            setNativeBackStatus(unlisten ? 'installed' : 'installed-no-unlisten');
          })
          .catch((err) => {
            try {
              logger?.warn?.('install android native back listener failed', err);
            } catch {}
            setNativeBackStatus('failed', err?.message || String(err || 'unknown error'));
          });
      } else {
        nativeBackUnlisten = normalizeNativeUnlisten(registered);
        setNativeBackStatus(nativeBackUnlisten ? 'installed' : 'installed-no-unlisten');
      }
      return true;
    } catch (err) {
      try {
        logger?.warn?.('install android native back listener failed', err);
      } catch {}
      setNativeBackStatus('failed', err?.message || String(err || 'unknown error'));
      return false;
    }
  };

  const handleCustomBackEvent = (event) => {
    const result = handleBack('custom-event');
    if (result.handled) {
      try {
        event?.preventDefault?.();
      } catch {}
      clearRootExitHintTimer();
      ensureSentinel();
      return result;
    }
    if (result.action === 'allow-native-exit') {
      const exitRequested = requestNativeExit();
      recordBackDiagnosticEvent({
        phase: 'native-exit-request',
        source: 'custom-event',
        action: result.action,
        handled: Boolean(result.handled),
        nativeExitRequested: exitRequested,
        payload: event?.detail || null,
      });
      return { ...result, nativeExitRequested: exitRequested, payload: event?.detail || null };
    }
    return result;
  };

  const start = () => {
    if (started || !windowRef) return false;
    started = true;
    ensureSentinel();
    windowRef.addEventListener?.('popstate', handlePopState);
    windowRef.addEventListener?.('chatapp-android-back', handleCustomBackEvent);
    installNativeBackButtonListener();
    recordBackDiagnosticEvent({
      phase: 'runtime-start',
      source: 'start',
      handled: true,
    });
    return true;
  };

  const stop = () => {
    if (!started || !windowRef) return;
    started = false;
    clearRootExitHintTimer();
    try {
      nativeBackUnlisten?.();
    } catch {}
    nativeBackUnlisten = null;
    windowRef.removeEventListener?.('popstate', handlePopState);
    windowRef.removeEventListener?.('chatapp-android-back', handleCustomBackEvent);
    recordBackDiagnosticEvent({
      phase: 'runtime-stop',
      source: 'stop',
      handled: true,
    });
  };

  return {
    start,
    stop,
    ensureSentinel,
    handleBack,
    handleNativeBackButton,
    getDiagnostics,
    getLastRootBackAt: () => lastRootBackAt,
  };
};
