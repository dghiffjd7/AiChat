import { createDebugTraceTimeline } from './debug-trace-timeline-utils.js';

const VIEWPORT_KEYBOARD_DIAGNOSTIC_EVENT_LIMIT = 120;

const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const roundPx = (value) => Math.max(0, Math.round(toFiniteNumber(value, 0)));

const readViewportValue = (source, key) => {
  if (!source || typeof source !== 'object') return 0;
  return roundPx(source[key]);
};

const normalizeNativeImeState = (payload = null) => {
  if (!payload || typeof payload !== 'object') {
    return {
      visible: false,
      insetBottom: 0,
      rawInsetBottom: 0,
      density: 0,
      source: '',
      timestamp: '',
    };
  }
  const insetBottom = roundPx(payload.insetBottom);
  const rawInsetBottom = roundPx(payload.rawInsetBottom ?? payload.insetBottom);
  return {
    visible: Boolean(payload.visible),
    insetBottom,
    rawInsetBottom: rawInsetBottom || insetBottom,
    density: toFiniteNumber(payload.density, 0),
    source: String(payload.source || ''),
    timestamp: String(payload.timestamp || ''),
  };
};

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

const shouldUseScreenHeightBaseline = (windowRef) => {
  const nav = windowRef?.navigator || {};
  const ua = String(nav.userAgent || '').toLowerCase();
  const platform = String(nav.platform || '').toLowerCase();
  if (/(android|iphone|ipad|ipod|mobile)/i.test(`${ua} ${platform}`)) return true;
  return false;
};

export const normalizeViewportSnapshot = ({
  innerWidth = 0,
  innerHeight = 0,
  documentClientWidth = 0,
  documentClientHeight = 0,
  visualViewport = null,
  screenWidth = 0,
  screenHeight = 0,
  previousBaseHeight = 0,
  previousBaseWidth = 0,
  hasFocusedEditable = false,
  keyboardThreshold = 80,
  useScreenHeightBaseline = true,
  nativeIme = null,
} = {}) => {
  const nativeImeState = normalizeNativeImeState(nativeIme);
  const vvWidth = readViewportValue(visualViewport, 'width');
  const vvHeight = readViewportValue(visualViewport, 'height');
  const visualOffsetTop = readViewportValue(visualViewport, 'offsetTop');
  const visualOffsetLeft = readViewportValue(visualViewport, 'offsetLeft');
  const layoutWidth = Math.max(roundPx(innerWidth), roundPx(documentClientWidth), vvWidth);
  const layoutHeight = Math.max(roundPx(innerHeight), roundPx(documentClientHeight), vvHeight);
  const visualWidth = vvWidth || layoutWidth;
  const visualHeight = vvHeight || layoutHeight;
  const widthChanged = previousBaseWidth > 0 && Math.abs(layoutWidth - previousBaseWidth) > 24;
  const retainedBaseHeight = widthChanged ? 0 : roundPx(previousBaseHeight);
  const screenHeightCandidate = hasFocusedEditable && useScreenHeightBaseline
    ? Math.max(roundPx(screenHeight), roundPx(screenWidth))
    : 0;
  let baseHeight = Math.max(retainedBaseHeight, layoutHeight, visualHeight, screenHeightCandidate);
  const viewportKeyboardInsetBottom = Math.max(0, roundPx(baseHeight - visualHeight - visualOffsetTop));
  const nativeKeyboardInsetBottom = nativeImeState.visible ? nativeImeState.insetBottom : 0;
  const keyboardInsetBottom = Math.max(viewportKeyboardInsetBottom, nativeKeyboardInsetBottom);
  const keyboardVisible = Boolean(
    hasFocusedEditable && (keyboardInsetBottom >= keyboardThreshold || visualOffsetTop >= 24),
  );

  if (!keyboardVisible) {
    baseHeight = Math.max(layoutHeight, visualHeight);
  }
  const shouldApplyNativeVisibleHeight = keyboardVisible
    && nativeKeyboardInsetBottom >= keyboardThreshold
    && viewportKeyboardInsetBottom < keyboardThreshold;
  const appliedVisualHeight = shouldApplyNativeVisibleHeight
    ? Math.max(0, roundPx(layoutHeight - nativeKeyboardInsetBottom - visualOffsetTop))
    : visualHeight;

  return {
    layoutWidth,
    layoutHeight,
    visualWidth,
    visualHeight: appliedVisualHeight,
    rawVisualHeight: visualHeight,
    visualOffsetTop,
    visualOffsetLeft,
    baseHeight,
    baseWidth: layoutWidth,
    keyboardInsetBottom: keyboardVisible ? keyboardInsetBottom : 0,
    rawKeyboardInsetBottom: Math.max(viewportKeyboardInsetBottom, nativeImeState.rawInsetBottom),
    viewportKeyboardInsetBottom,
    nativeImeVisible: nativeImeState.visible,
    nativeImeInsetBottom: nativeImeState.insetBottom,
    nativeImeRawInsetBottom: nativeImeState.rawInsetBottom,
    keyboardVisible,
    hasFocusedEditable: Boolean(hasFocusedEditable),
  };
};

const setStyleVar = (element, name, value) => {
  try {
    element?.style?.setProperty?.(name, value);
  } catch {}
};

const removeStyleVar = (element, name) => {
  try {
    element?.style?.removeProperty?.(name);
  } catch {}
};

const getTargetElement = (target) => {
  if (!target) return null;
  if (typeof target.element === 'function') return target.element();
  return target.element || null;
};

const applyTargetSnapshot = (target, snapshot) => {
  const element = getTargetElement(target);
  if (!element) return;
  const activeClass = target.activeClass || 'keyboard-visible';
  element.classList?.toggle?.(activeClass, snapshot.keyboardVisible);
  if (target.fixedToVisualViewport !== false && snapshot.keyboardVisible) {
    element.style.top = `${snapshot.visualOffsetTop}px`;
    element.style.bottom = 'auto';
    element.style.height = `${snapshot.visualHeight}px`;
  } else if (target.fixedToVisualViewport !== false) {
    element.style.top = '';
    element.style.bottom = '';
    element.style.height = '';
  }
  try {
    target.onApply?.(snapshot, element);
  } catch {}
};

const scheduleWithRaf = (requestAnimationFrameFn, callback) => {
  if (typeof requestAnimationFrameFn === 'function') {
    requestAnimationFrameFn(() => requestAnimationFrameFn(callback));
    return;
  }
  callback();
};

const readCssVar = (rootEl, name) => {
  try {
    const view = rootEl?.ownerDocument?.defaultView;
    return String(view?.getComputedStyle?.(rootEl)?.getPropertyValue?.(name) || '').trim();
  } catch {
    return '';
  }
};

const buildActiveElementDebug = (element) => {
  if (!element) return null;
  return {
    tagName: String(element.tagName || '').toLowerCase(),
    id: String(element.id || ''),
    className: String(element.className || ''),
    type: String(element.type || ''),
    isEditable: isEditableElement(element),
    diagnosticSurface: String(element?.dataset?.viewportKeyboardDiagnostic || ''),
  };
};

const roundDiagnosticValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric * 100) / 100 : 0;
};

const readDiagnosticRect = (element) => {
  try {
    const rect = element?.getBoundingClientRect?.();
    if (!rect) return null;
    return {
      top: roundDiagnosticValue(rect.top),
      right: roundDiagnosticValue(rect.right),
      bottom: roundDiagnosticValue(rect.bottom),
      left: roundDiagnosticValue(rect.left),
      width: roundDiagnosticValue(rect.width),
      height: roundDiagnosticValue(rect.height),
    };
  } catch {
    return null;
  }
};

const getViewportKeyboardDiagnosticSurface = (element) => String(
  element?.dataset?.viewportKeyboardDiagnostic
  || element?.getAttribute?.('data-viewport-keyboard-diagnostic')
  || '',
).trim();

const buildViewportKeyboardDiagnosticElement = (element) => {
  if (!element) return null;
  return {
    ...buildActiveElementDebug(element),
    rect: readDiagnosticRect(element),
    clientHeight: roundPx(element.clientHeight),
    scrollHeight: roundPx(element.scrollHeight),
    inlineHeight: String(element?.style?.height || ''),
  };
};

const buildViewportKeyboardDiagnosticDetails = ({
  snapshot = null,
  element = null,
  surface = '',
  body = null,
  nativeIme = null,
} = {}) => ({
  surface: String(surface || getViewportKeyboardDiagnosticSurface(element) || ''),
  uiMode: String(body?.dataset?.uiMode || ''),
  bodyKeyboardVisible: String(body?.dataset?.keyboardVisible || ''),
  snapshot: snapshot ? { ...snapshot } : null,
  nativeIme: snapshot ? {
    density: toFiniteNumber(nativeIme?.density, 0),
    source: String(nativeIme?.source || ''),
    timestamp: String(nativeIme?.timestamp || ''),
  } : null,
  element: buildViewportKeyboardDiagnosticElement(element),
});

const buildViewportKeyboardElementLayoutSignature = (element, surface = '') => {
  if (!element) return '';
  return JSON.stringify({
    surface,
    clientHeight: roundPx(element.clientHeight),
    scrollHeight: roundPx(element.scrollHeight),
    inlineHeight: String(element?.style?.height || ''),
  });
};

export const createViewportKeyboardRuntime = ({
  windowRef = typeof window !== 'undefined' ? window : null,
  documentRef = typeof document !== 'undefined' ? document : null,
  rootEl = null,
  bodyEl = null,
  targets = [],
  getFocusedElement = null,
  onSnapshot = null,
  requestAnimationFrameFn = null,
  setTimeoutFn = null,
  logger = null,
  keyboardThreshold = 80,
  diagnosticTimelineLimit = VIEWPORT_KEYBOARD_DIAGNOSTIC_EVENT_LIMIT,
  recordTraceEvent = null,
  nowFn = Date.now,
} = {}) => {
  const docEl = rootEl || documentRef?.documentElement || null;
  const body = bodyEl || documentRef?.body || null;
  const raf = requestAnimationFrameFn || windowRef?.requestAnimationFrame?.bind?.(windowRef) || null;
  const setTimer = setTimeoutFn || windowRef?.setTimeout?.bind?.(windowRef) || null;
  let started = false;
  let baseHeight = 0;
  let baseWidth = 0;
  let lastSnapshot = null;
  let pendingRefresh = false;
  let nativeImeState = normalizeNativeImeState();
  let previousNativeImeHandler = null;
  let nativeImeBridgeInstalled = false;
  const diagnosticTimeline = createDebugTraceTimeline({
    maxEvents: diagnosticTimelineLimit,
    now: nowFn,
  });
  const surfaceLayoutSignatures = new Map();
  let pendingRefreshDiagnostic = null;

  const getCurrentFocusedElement = () => (
    typeof getFocusedElement === 'function'
      ? getFocusedElement()
      : documentRef?.activeElement
  );

  const recordDiagnosticEvent = ({
    phase = 'snapshot',
    snapshot = lastSnapshot,
    element = null,
    surface = '',
  } = {}) => {
    const target = element || getCurrentFocusedElement();
    const resolvedSurface = String(surface || getViewportKeyboardDiagnosticSurface(target) || '').trim();
    const details = buildViewportKeyboardDiagnosticDetails({
      snapshot,
      element: target,
      surface: resolvedSurface,
      body,
      nativeIme: nativeImeState,
    });
    const traceEvent = {
      category: 'viewport-keyboard',
      phase,
      source: 'viewport-keyboard-runtime',
      status: 'info',
      summary: resolvedSurface ? `surface=${resolvedSurface}` : '',
      details,
    };
    const recorded = diagnosticTimeline.record(traceEvent);
    try {
      recordTraceEvent?.(traceEvent);
    } catch {}
    return recorded;
  };

  const readSnapshot = () => {
    const focusedElement = getCurrentFocusedElement();
    const snapshot = normalizeViewportSnapshot({
      innerWidth: windowRef?.innerWidth,
      innerHeight: windowRef?.innerHeight,
      documentClientWidth: docEl?.clientWidth,
      documentClientHeight: docEl?.clientHeight,
      visualViewport: windowRef?.visualViewport,
      screenWidth: windowRef?.screen?.width || windowRef?.screen?.availWidth,
      screenHeight: windowRef?.screen?.height || windowRef?.screen?.availHeight,
      previousBaseHeight: baseHeight,
      previousBaseWidth: baseWidth,
      hasFocusedEditable: isEditableElement(focusedElement),
      keyboardThreshold,
      useScreenHeightBaseline: shouldUseScreenHeightBaseline(windowRef),
      nativeIme: nativeImeState,
    });
    baseHeight = snapshot.baseHeight;
    baseWidth = snapshot.baseWidth;
    return snapshot;
  };

  const applySnapshot = (snapshot) => {
    if (docEl) {
      setStyleVar(docEl, '--app-layout-height', `${snapshot.layoutHeight}px`);
      setStyleVar(docEl, '--app-visual-height', `${snapshot.visualHeight}px`);
      setStyleVar(docEl, '--app-visual-width', `${snapshot.visualWidth}px`);
      setStyleVar(docEl, '--app-visual-offset-top', `${snapshot.visualOffsetTop}px`);
      setStyleVar(docEl, '--app-visual-offset-left', `${snapshot.visualOffsetLeft}px`);
      setStyleVar(docEl, '--app-keyboard-inset-bottom', `${snapshot.keyboardInsetBottom}px`);
    }
    if (body?.dataset) {
      body.dataset.keyboardVisible = snapshot.keyboardVisible ? 'true' : 'false';
    }
    targets.forEach(target => applyTargetSnapshot(target, snapshot));
    if (snapshot.keyboardVisible) {
      scheduleWithRaf(raf, () => {
        const focusedElement = getCurrentFocusedElement();
        if (isEditableElement(focusedElement)) {
          focusedElement.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }
      });
    }
    try {
      onSnapshot?.(snapshot);
    } catch {}
  };

  const refresh = (phase = 'manual-refresh', element = null, surface = '') => {
    const queued = pendingRefreshDiagnostic;
    pendingRefresh = false;
    pendingRefreshDiagnostic = null;
    const snapshot = readSnapshot();
    lastSnapshot = snapshot;
    applySnapshot(snapshot);
    recordDiagnosticEvent({
      phase: queued?.phases?.join('+') || String(phase || 'manual-refresh'),
      snapshot,
      element: queued?.element || element || getCurrentFocusedElement(),
      surface: queued?.surface || surface,
    });
    return snapshot;
  };

  const scheduleRefresh = (phase = 'scheduled-refresh', element = null, surface = '') => {
    const nextPhase = String(phase || 'scheduled-refresh');
    if (pendingRefreshDiagnostic) {
      if (!pendingRefreshDiagnostic.phases.includes(nextPhase)) {
        pendingRefreshDiagnostic.phases.push(nextPhase);
      }
      if (element) pendingRefreshDiagnostic.element = element;
      if (surface) pendingRefreshDiagnostic.surface = String(surface);
    } else {
      pendingRefreshDiagnostic = {
        phases: [nextPhase],
        element,
        surface: String(surface || ''),
      };
    }
    if (pendingRefresh) return;
    pendingRefresh = true;
    if (typeof raf === 'function') {
      raf(() => refresh());
    } else if (typeof setTimer === 'function') {
      setTimer(() => refresh(), 0);
    } else {
      refresh();
    }
  };

  const handleTrackedSurfaceInput = (event) => {
    const element = event?.target || null;
    const surface = getViewportKeyboardDiagnosticSurface(element);
    if (!surface) return;
    const signature = buildViewportKeyboardElementLayoutSignature(element, surface);
    if (signature && surfaceLayoutSignatures.get(surface) === signature) return;
    if (signature) surfaceLayoutSignatures.set(surface, signature);
    recordDiagnosticEvent({ phase: 'surface-input-layout', element, surface });
  };

  const handleWindowResize = () => scheduleRefresh('window-resize');
  const handleOrientationChange = () => scheduleRefresh('orientation-change');
  const handleVisualViewportResize = () => scheduleRefresh('visual-viewport-resize');
  const handleVisualViewportScroll = () => scheduleRefresh('visual-viewport-scroll');
  const handleDocumentFocusIn = (event) => {
    const element = event?.target || null;
    const surface = getViewportKeyboardDiagnosticSurface(element);
    if (surface) surfaceLayoutSignatures.delete(surface);
    scheduleRefresh(surface ? 'surface-focusin' : 'document-focusin', element, surface);
  };
  const handleDocumentFocusOut = (event) => {
    const element = event?.target || null;
    const surface = getViewportKeyboardDiagnosticSurface(element);
    scheduleRefresh(surface ? 'surface-focusout' : 'document-focusout', element, surface);
  };
  const handleTrackedSurfaceCompositionStart = (event) => {
    const element = event?.target || null;
    const surface = getViewportKeyboardDiagnosticSurface(element);
    if (!surface) return;
    recordDiagnosticEvent({ phase: 'surface-compositionstart', element, surface });
  };
  const handleTrackedSurfaceCompositionEnd = (event) => {
    const element = event?.target || null;
    const surface = getViewportKeyboardDiagnosticSurface(element);
    if (!surface) return;
    recordDiagnosticEvent({ phase: 'surface-compositionend', element, surface });
  };

  const handleNativeImeInsets = (payload = null) => {
    nativeImeState = normalizeNativeImeState(payload);
    if (typeof previousNativeImeHandler === 'function') {
      try { previousNativeImeHandler(payload); } catch {}
    }
    scheduleRefresh('native-ime-insets');
  };

  const installNativeImeBridge = () => {
    if (!windowRef || nativeImeBridgeInstalled) return;
    nativeImeBridgeInstalled = true;
    previousNativeImeHandler = typeof windowRef.__chatappAndroidImeInsets === 'function'
      ? windowRef.__chatappAndroidImeInsets
      : null;
    try {
      windowRef.__chatappAndroidImeInsets = handleNativeImeInsets;
    } catch {}
  };

  const removeNativeImeBridge = () => {
    if (!windowRef || !nativeImeBridgeInstalled) return;
    nativeImeBridgeInstalled = false;
    try {
      if (windowRef.__chatappAndroidImeInsets === handleNativeImeInsets) {
        if (previousNativeImeHandler) windowRef.__chatappAndroidImeInsets = previousNativeImeHandler;
        else delete windowRef.__chatappAndroidImeInsets;
      }
    } catch {}
    previousNativeImeHandler = null;
  };

  const start = () => {
    if (started || !windowRef || !documentRef) return refresh('runtime-refresh');
    started = true;
    installNativeImeBridge();
    windowRef.addEventListener?.('resize', handleWindowResize, { passive: true });
    windowRef.addEventListener?.('orientationchange', handleOrientationChange, { passive: true });
    windowRef.visualViewport?.addEventListener?.('resize', handleVisualViewportResize, { passive: true });
    windowRef.visualViewport?.addEventListener?.('scroll', handleVisualViewportScroll, { passive: true });
    documentRef.addEventListener?.('focusin', handleDocumentFocusIn, true);
    documentRef.addEventListener?.('focusout', handleDocumentFocusOut, true);
    documentRef.addEventListener?.('input', handleTrackedSurfaceInput);
    documentRef.addEventListener?.('compositionstart', handleTrackedSurfaceCompositionStart);
    documentRef.addEventListener?.('compositionend', handleTrackedSurfaceCompositionEnd);
    return refresh('runtime-start');
  };

  const stop = () => {
    if (!started || !windowRef || !documentRef) return;
    started = false;
    windowRef.removeEventListener?.('resize', handleWindowResize, { passive: true });
    windowRef.removeEventListener?.('orientationchange', handleOrientationChange, { passive: true });
    windowRef.visualViewport?.removeEventListener?.('resize', handleVisualViewportResize, { passive: true });
    windowRef.visualViewport?.removeEventListener?.('scroll', handleVisualViewportScroll, { passive: true });
    documentRef.removeEventListener?.('focusin', handleDocumentFocusIn, true);
    documentRef.removeEventListener?.('focusout', handleDocumentFocusOut, true);
    documentRef.removeEventListener?.('input', handleTrackedSurfaceInput);
    documentRef.removeEventListener?.('compositionstart', handleTrackedSurfaceCompositionStart);
    documentRef.removeEventListener?.('compositionend', handleTrackedSurfaceCompositionEnd);
    removeNativeImeBridge();
    if (docEl) {
      removeStyleVar(docEl, '--app-keyboard-inset-bottom');
      removeStyleVar(docEl, '--app-visual-offset-top');
      removeStyleVar(docEl, '--app-visual-offset-left');
    }
    targets.forEach((target) => {
      const element = getTargetElement(target);
      if (!element) return;
      element.classList?.remove?.(target.activeClass || 'keyboard-visible');
      if (target.fixedToVisualViewport !== false) {
        element.style.top = '';
        element.style.bottom = '';
        element.style.height = '';
      }
    });
  };

  const getDebugInfo = () => {
    const snapshot = lastSnapshot || refresh('debug-initial-snapshot');
    const activeElement = getCurrentFocusedElement();
    return {
      timestamp: new Date().toISOString(),
      userAgent: String(windowRef?.navigator?.userAgent || ''),
      platform: String(windowRef?.navigator?.platform || ''),
      devicePixelRatio: toFiniteNumber(windowRef?.devicePixelRatio, 1),
      screen: {
        width: roundPx(windowRef?.screen?.width),
        height: roundPx(windowRef?.screen?.height),
        availWidth: roundPx(windowRef?.screen?.availWidth),
        availHeight: roundPx(windowRef?.screen?.availHeight),
        orientation: String(windowRef?.screen?.orientation?.type || ''),
      },
      window: {
        innerWidth: roundPx(windowRef?.innerWidth),
        innerHeight: roundPx(windowRef?.innerHeight),
      },
      documentElement: {
        clientWidth: roundPx(docEl?.clientWidth),
        clientHeight: roundPx(docEl?.clientHeight),
      },
      visualViewport: {
        width: roundPx(windowRef?.visualViewport?.width),
        height: roundPx(windowRef?.visualViewport?.height),
        offsetTop: roundPx(windowRef?.visualViewport?.offsetTop),
        offsetLeft: roundPx(windowRef?.visualViewport?.offsetLeft),
        scale: toFiniteNumber(windowRef?.visualViewport?.scale, 1),
      },
      cssVars: {
        appVisualHeight: readCssVar(docEl, '--app-visual-height'),
        appKeyboardInsetBottom: readCssVar(docEl, '--app-keyboard-inset-bottom'),
        appVisualOffsetTop: readCssVar(docEl, '--app-visual-offset-top'),
        safeAreaTop: readCssVar(docEl, '--safe-area-top'),
        safeAreaBottom: readCssVar(docEl, '--safe-area-bottom'),
      },
      keyboard: {
        visible: snapshot.keyboardVisible,
        insetBottom: snapshot.keyboardInsetBottom,
        rawInsetBottom: snapshot.rawKeyboardInsetBottom,
        hasFocusedEditable: snapshot.hasFocusedEditable,
      },
      nativeIme: {
        visible: snapshot.nativeImeVisible,
        insetBottom: snapshot.nativeImeInsetBottom,
        rawInsetBottom: snapshot.nativeImeRawInsetBottom,
        density: nativeImeState.density,
        source: nativeImeState.source,
        timestamp: nativeImeState.timestamp,
      },
      activeElement: buildActiveElementDebug(activeElement),
      eventTimeline: {
        capturesText: false,
        maxEvents: diagnosticTimeline.maxEvents,
        events: diagnosticTimeline.snapshot(),
      },
    };
  };

  return {
    start,
    stop,
    refresh,
    scheduleRefresh,
    getSnapshot: () => lastSnapshot,
    getDebugInfo,
  };
};
