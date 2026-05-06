export const clearDebugPanelAutoHideTimer = ({
  autoHideTimer = null,
  clearTimer = clearTimeout,
} = {}) => {
  if (autoHideTimer) {
    clearTimer?.(autoHideTimer);
  }
  return null;
};

export const createDebugLogListener = ({
  log = () => {},
} = {}) => (event) => {
  const detail = event?.detail || {};
  const type = detail.type || 'info';
  const source = String(detail.source || '').trim();
  const message = String(detail.message || '').trim();
  if (!message) return false;
  const prefix = source ? `[${source}] ` : '';
  log?.(`${prefix}${message}`, type);
  return true;
};

export const showDebugPanel = ({
  panel = null,
  scrollToBottom = () => {},
  autoHideTimer = null,
  clearTimer = clearTimeout,
} = {}) => {
  if (!panel?.style) {
    return { shown: false, isVisible: false, autoHideTimer };
  }
  panel.style.display = 'flex';
  scrollToBottom?.();
  return {
    shown: true,
    isVisible: true,
    autoHideTimer: clearDebugPanelAutoHideTimer({
      autoHideTimer,
      clearTimer,
    }),
  };
};

export const hideDebugPanel = ({
  panel = null,
} = {}) => {
  if (!panel?.style) {
    return { hidden: false, isVisible: false };
  }
  panel.style.display = 'none';
  return { hidden: true, isVisible: false };
};

export const applyDebugPanelEnabledState = ({
  enabled = false,
  toggleBtn = null,
  onDisable = () => {},
  autoHideTimer = null,
  clearTimer = clearTimeout,
} = {}) => {
  const normalized = Boolean(enabled);
  if (toggleBtn?.style) {
    toggleBtn.style.display = normalized ? 'block' : 'none';
  }
  let nextAutoHideTimer = autoHideTimer;
  if (!normalized) {
    onDisable?.();
    nextAutoHideTimer = clearDebugPanelAutoHideTimer({
      autoHideTimer,
      clearTimer,
    });
  }
  return {
    enabled: normalized,
    autoHideTimer: nextAutoHideTimer,
  };
};

export const toggleDebugPanelVisibility = ({
  isVisible = false,
  onShow = () => {},
  onHide = () => {},
} = {}) => {
  if (isVisible) {
    onHide?.();
    return false;
  }
  onShow?.();
  return true;
};

export const runDebugPanelStartupAutoShow = ({
  enabled = false,
  show = () => {},
  hide = () => {},
  getLogCount = () => 0,
  setTimer = setTimeout,
  autoHideMs = 8000,
} = {}) => {
  if (!enabled) return null;
  show?.();
  return setTimer?.(() => {
    if (getLogCount?.() < 3) {
      hide?.();
    }
  }, autoHideMs) || null;
};
