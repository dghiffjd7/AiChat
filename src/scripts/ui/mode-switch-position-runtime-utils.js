const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

export const MODE_SWITCH_POSITION_STORAGE_KEY = 'phone_mode_switch_pos_v1';

const getDefaultLocalStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

export const normalizeStoredModeSwitchPosition = (value = null) => {
  if (!value || typeof value !== 'object') return null;
  const xRatio = Number(value.xRatio);
  const yRatio = Number(value.yRatio);
  if (!Number.isFinite(xRatio) || !Number.isFinite(yRatio)) return null;
  return { xRatio, yRatio };
};

export const readModeSwitchPosition = ({
  storage = getDefaultLocalStorage(),
  key = MODE_SWITCH_POSITION_STORAGE_KEY,
} = {}) => {
  try {
    const raw = storage?.getItem?.(key);
    if (!raw) return null;
    return normalizeStoredModeSwitchPosition(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const writeModeSwitchPosition = (
  position = null,
  {
    storage = getDefaultLocalStorage(),
    key = MODE_SWITCH_POSITION_STORAGE_KEY,
  } = {},
) => {
  try {
    if (!position) return false;
    storage?.setItem?.(key, JSON.stringify(position));
    return true;
  } catch {
    return false;
  }
};

export const createModeSwitchPositionRuntime = ({
  modeSwitchEl = null,
  readCssVarPx = null,
  initialSize = 26,
  initialSlot = 10,
  setMetrics = null,
  getSafeInsets = null,
  getModeSwitchPos = null,
  isModeSwitchPinned = null,
  setModeSwitchPinned = null,
  isChatRoomActive = null,
  getUiMode = null,
  getChatInputRect = null,
  getBottomNavRect = null,
  getContactsButtonRect = null,
  getViewportSize = null,
  requestAnimationFrameFn = null,
  setTimeoutFn = null,
  onPositionChange = null,
} = {}) => {
  let modeSwitchSize = initialSize;
  let modeSwitchSlot = initialSlot;

  const resolveViewportSize = () => {
    const size = getViewportSize?.() || {};
    return {
      w: Number(size?.w || 0),
      h: Number(size?.h || 0),
    };
  };

  const refreshMetrics = () => {
    const nextSize = typeof readCssVarPx === 'function'
      ? readCssVarPx('--mode-switch-size', modeSwitchSize)
      : modeSwitchSize;
    const nextSlot = typeof readCssVarPx === 'function'
      ? readCssVarPx('--mode-switch-slot', modeSwitchSlot)
      : modeSwitchSlot;
    modeSwitchSize = Number.isFinite(nextSize) ? nextSize : modeSwitchSize;
    modeSwitchSlot = Number.isFinite(nextSlot) ? nextSlot : modeSwitchSlot;
    setMetrics?.({ size: modeSwitchSize, slot: modeSwitchSlot });
  };

  const normalizeModeSwitchPos = (x, y) => {
    const { w, h } = resolveViewportSize();
    if (!w || !h) return null;
    return { xRatio: x / w, yRatio: y / h };
  };

  const resolvePinnedModeSwitchPos = () => {
    const pos = getModeSwitchPos?.();
    if (!pos) return null;
    const { w, h } = resolveViewportSize();
    if (!w || !h) return null;
    const safeInsets = getSafeInsets?.() || { top: 0, bottom: 0, left: 0, right: 0 };
    const base = 8 + modeSwitchSize / 2;
    const x = clampValue(pos.xRatio * w, base + safeInsets.left, w - base - safeInsets.right);
    const y = clampValue(pos.yRatio * h, base + safeInsets.top, h - base - safeInsets.bottom);
    return { x, y };
  };

  const resolveModeSwitchAnchor = () => {
    if (isChatRoomActive?.() || getUiMode?.() === 'rp') {
      return { rect: getChatInputRect?.(), mode: 'input' };
    }
    return {
      rect: getContactsButtonRect?.() || getBottomNavRect?.(),
      mode: 'dock',
      dockRect: getBottomNavRect?.(),
    };
  };

  const syncPosition = () => {
    if (!modeSwitchEl) return;
    refreshMetrics();
    if (isModeSwitchPinned?.() && getModeSwitchPos?.()) {
      const pinned = resolvePinnedModeSwitchPos();
      if (pinned) {
        modeSwitchEl.style.left = `${Math.round(pinned.x)}px`;
        modeSwitchEl.style.top = `${Math.round(pinned.y)}px`;
        modeSwitchEl.style.pointerEvents = 'auto';
        modeSwitchEl.classList.remove('is-hidden');
        onPositionChange?.();
        return;
      }
      setModeSwitchPinned?.(false);
    }
    const { rect, mode, dockRect } = resolveModeSwitchAnchor();
    if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height)) {
      modeSwitchEl.classList.add('is-hidden');
      modeSwitchEl.style.pointerEvents = 'none';
      return;
    }
    const x = rect.left + rect.width / 2;
    let y = rect.top - 8 - modeSwitchSize / 2;
    if (mode === 'dock') {
      const baseTop = dockRect?.top ?? rect.top;
      y = baseTop - modeSwitchSlot - modeSwitchSize / 2;
    }
    modeSwitchEl.style.left = `${Math.round(x)}px`;
    modeSwitchEl.style.top = `${Math.round(y)}px`;
    modeSwitchEl.style.pointerEvents = 'auto';
    modeSwitchEl.classList.remove('is-hidden');
    onPositionChange?.();
  };

  const scheduleSync = () => {
    if (typeof requestAnimationFrameFn === 'function') {
      requestAnimationFrameFn(syncPosition);
    } else if (typeof setTimeoutFn === 'function') {
      setTimeoutFn(syncPosition, 0);
    } else {
      syncPosition();
    }
  };

  const getMetrics = () => ({
    size: modeSwitchSize,
    slot: modeSwitchSlot,
  });

  return {
    getViewportSize: resolveViewportSize,
    refreshMetrics,
    normalizeModeSwitchPos,
    syncPosition,
    scheduleSync,
    getMetrics,
  };
};
