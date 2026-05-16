const BACK_SENTINEL_KEY = '__chatappBackSentinel';

const isEditableElement = (element) => {
  if (!element || typeof element !== 'object') return false;
  const tag = String(element.tagName || '').toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const type = String(element.type || 'text').toLowerCase();
    return !['button', 'checkbox', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(type);
  }
  return Boolean(element.isContentEditable);
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

export const createAppBackNavigationRuntime = ({
  windowRef = typeof window !== 'undefined' ? window : null,
  historyRef = null,
  documentRef = typeof document !== 'undefined' ? document : null,
  getActivePage = null,
  rootPage = 'chat',
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
  logger = null,
} = {}) => {
  const historyObj = historyRef || windowRef?.history || null;
  let started = false;
  let lastRootBackAt = 0;
  let rootExitHintTimer = null;

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
    const action = resolveAppBackNavigationAction({
      hasFocusedEditable: isEditableElement(focused),
      hasClosableLayer: hasClosableLayer(),
      isChatRoomVisible: Boolean(isChatRoomVisible?.()),
      activePage: getActivePage?.(),
      rootPage,
      now,
      lastRootBackAt,
      doublePressMs,
    });

    if (action === 'blur-active-element') {
      return { handled: blurFocusedElement(), action, source };
    }
    if (action === 'close-layer') {
      return { handled: Boolean(closeTopLayer?.({ dryRun: false })), action, source };
    }
    if (action === 'exit-chat-room') {
      exitChatRoom?.();
      lastRootBackAt = 0;
      return { handled: true, action, source };
    }
    if (action === 'switch-root-page') {
      switchPage?.(rootPage, { animate: false });
      lastRootBackAt = 0;
      return { handled: true, action, source };
    }
    if (action === 'show-root-exit-hint') {
      lastRootBackAt = now;
      showExitHint?.();
      return { handled: true, action, source };
    }
    return { handled: false, action, source };
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

  const handleCustomBackEvent = (event) => {
    const result = handleBack('custom-event');
    if (result.handled) {
      try {
        event?.preventDefault?.();
      } catch {}
      clearRootExitHintTimer();
      ensureSentinel();
    }
    return result;
  };

  const start = () => {
    if (started || !windowRef) return false;
    started = true;
    ensureSentinel();
    windowRef.addEventListener?.('popstate', handlePopState);
    windowRef.addEventListener?.('chatapp-android-back', handleCustomBackEvent);
    return true;
  };

  const stop = () => {
    if (!started || !windowRef) return;
    started = false;
    clearRootExitHintTimer();
    windowRef.removeEventListener?.('popstate', handlePopState);
    windowRef.removeEventListener?.('chatapp-android-back', handleCustomBackEvent);
  };

  return {
    start,
    stop,
    ensureSentinel,
    handleBack,
    getLastRootBackAt: () => lastRootBackAt,
  };
};
