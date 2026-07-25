export const createGroupPanelMotionRuntime = ({
  overlayEl = null,
  panelEl = null,
  closeDuration = 180,
  requestFrame = callback => globalThis.requestAnimationFrame?.(callback),
  schedule = (callback, delay) => globalThis.setTimeout?.(callback, delay),
  cancelSchedule = timer => globalThis.clearTimeout?.(timer),
  isReducedMotion = () => false,
} = {}) => {
  let closeTimer = null;
  let motionToken = 0;

  const clearCloseTimer = () => {
    if (closeTimer !== null && closeTimer !== undefined) cancelSchedule?.(closeTimer);
    closeTimer = null;
  };

  const setMotionClass = (method, ...tokens) => {
    overlayEl?.classList?.[method]?.(...tokens);
    panelEl?.classList?.[method]?.(...tokens);
  };

  const finalizeHide = () => {
    clearCloseTimer();
    if (overlayEl?.style) overlayEl.style.display = 'none';
    if (panelEl?.style) panelEl.style.display = 'none';
    setMotionClass('remove', 'is-open', 'is-closing');
  };

  const show = () => {
    if (!overlayEl || !panelEl) return false;
    clearCloseTimer();
    motionToken += 1;
    const token = motionToken;
    setMotionClass('remove', 'is-open', 'is-closing');
    overlayEl.style.display = 'block';
    panelEl.style.display = 'flex';
    requestFrame?.(() => {
      if (token !== motionToken) return;
      setMotionClass('add', 'is-open');
    });
    return true;
  };

  const hide = ({ immediate = false } = {}) => {
    if (!overlayEl || !panelEl) return false;
    motionToken += 1;
    clearCloseTimer();
    setMotionClass('remove', 'is-open');
    if (immediate || isReducedMotion?.()) {
      finalizeHide();
      return true;
    }
    setMotionClass('add', 'is-closing');
    closeTimer = schedule?.(finalizeHide, closeDuration);
    return true;
  };

  return {
    hide,
    isVisible: () => Boolean(panelEl && panelEl.style?.display !== 'none'),
    show,
  };
};
