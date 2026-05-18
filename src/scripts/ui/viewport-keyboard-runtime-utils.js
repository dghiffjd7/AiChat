const toFiniteNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const roundPx = (value) => Math.max(0, Math.round(toFiniteNumber(value, 0)));

const readViewportValue = (source, key) => {
  if (!source || typeof source !== 'object') return 0;
  return roundPx(source[key]);
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
} = {}) => {
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
  const keyboardInsetBottom = Math.max(0, roundPx(baseHeight - visualHeight - visualOffsetTop));
  const keyboardVisible = Boolean(
    hasFocusedEditable && (keyboardInsetBottom >= keyboardThreshold || visualOffsetTop >= 24),
  );

  if (!keyboardVisible) {
    baseHeight = Math.max(layoutHeight, visualHeight);
  }

  return {
    layoutWidth,
    layoutHeight,
    visualWidth,
    visualHeight,
    visualOffsetTop,
    visualOffsetLeft,
    baseHeight,
    baseWidth: layoutWidth,
    keyboardInsetBottom: keyboardVisible ? keyboardInsetBottom : 0,
    rawKeyboardInsetBottom: keyboardInsetBottom,
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
  };
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

  const readSnapshot = () => {
    const focusedElement = typeof getFocusedElement === 'function'
      ? getFocusedElement()
      : documentRef?.activeElement;
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
        const focusedElement = typeof getFocusedElement === 'function'
          ? getFocusedElement()
          : documentRef?.activeElement;
        if (isEditableElement(focusedElement)) {
          focusedElement.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
        }
      });
    }
    try {
      onSnapshot?.(snapshot);
    } catch {}
  };

  const refresh = () => {
    pendingRefresh = false;
    const snapshot = readSnapshot();
    lastSnapshot = snapshot;
    applySnapshot(snapshot);
    return snapshot;
  };

  const scheduleRefresh = () => {
    if (pendingRefresh) return;
    pendingRefresh = true;
    if (typeof raf === 'function') {
      raf(refresh);
    } else if (typeof setTimer === 'function') {
      setTimer(refresh, 0);
    } else {
      refresh();
    }
  };

  const start = () => {
    if (started || !windowRef || !documentRef) return refresh();
    started = true;
    windowRef.addEventListener?.('resize', scheduleRefresh, { passive: true });
    windowRef.addEventListener?.('orientationchange', scheduleRefresh, { passive: true });
    windowRef.visualViewport?.addEventListener?.('resize', scheduleRefresh, { passive: true });
    windowRef.visualViewport?.addEventListener?.('scroll', scheduleRefresh, { passive: true });
    documentRef.addEventListener?.('focusin', scheduleRefresh, true);
    documentRef.addEventListener?.('focusout', scheduleRefresh, true);
    return refresh();
  };

  const stop = () => {
    if (!started || !windowRef || !documentRef) return;
    started = false;
    windowRef.removeEventListener?.('resize', scheduleRefresh, { passive: true });
    windowRef.removeEventListener?.('orientationchange', scheduleRefresh, { passive: true });
    windowRef.visualViewport?.removeEventListener?.('resize', scheduleRefresh, { passive: true });
    windowRef.visualViewport?.removeEventListener?.('scroll', scheduleRefresh, { passive: true });
    documentRef.removeEventListener?.('focusin', scheduleRefresh, true);
    documentRef.removeEventListener?.('focusout', scheduleRefresh, true);
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
    const snapshot = lastSnapshot || refresh();
    const activeElement = typeof getFocusedElement === 'function'
      ? getFocusedElement()
      : documentRef?.activeElement;
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
      activeElement: buildActiveElementDebug(activeElement),
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
