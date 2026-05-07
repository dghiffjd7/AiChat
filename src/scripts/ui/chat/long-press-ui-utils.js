export const createLongPressUiRuntime = ({
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
  clearSchedule = (timerId) => clearTimeout(timerId),
} = {}) => ({
  startLongPress({
    selectionMode = false,
    event,
    message,
    getPoint,
    clearExisting,
    setLongPressStart,
    setLongPressTimer,
    onTrigger,
  }) {
    if (selectionMode) return false;
    clearExisting?.();
    const point = getPoint?.(event) || null;
    setLongPressStart?.(point);
    const timerId = schedule(() => {
      onTrigger?.(event, message);
    }, 500);
    setLongPressTimer?.(timerId);
    return true;
  },
  clearLongPress({
    getLongPressTimer,
    setLongPressTimer,
    setLongPressStart,
  }) {
    const timerId = getLongPressTimer?.();
    if (timerId) {
      clearSchedule(timerId);
      setLongPressTimer?.(null);
    }
    setLongPressStart?.(null);
  },
  bindMessageContextInteractions({
    wrapper,
    message,
    getLongPressTimer,
    getLongPressStart,
    getPoint,
    clearLongPress,
    startLongPress,
    showContextMenu,
  }) {
    if (!wrapper) return wrapper;
    wrapper.addEventListener('pointerdown', event => startLongPress?.(event, message));
    wrapper.addEventListener(
      'pointermove',
      event => {
        if (!getLongPressTimer?.() || !getLongPressStart?.()) return;
        const point = getPoint?.(event);
        if (!point) return;
        const start = getLongPressStart?.();
        const dx = point.x - start.x;
        const dy = point.y - start.y;
        if (dx * dx + dy * dy > 10 * 10) clearLongPress?.();
      },
      { passive: true },
    );
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(type => {
      wrapper.addEventListener(type, () => clearLongPress?.());
    });
    wrapper.addEventListener(
      'contextmenu',
      event => {
        try {
          event.preventDefault();
        } catch {}
        clearLongPress?.();
        showContextMenu?.(event, message);
      },
      { passive: false },
    );
    return wrapper;
  },
});
