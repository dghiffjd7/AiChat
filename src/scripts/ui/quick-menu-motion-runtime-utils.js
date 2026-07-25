export const createQuickMenuMotionRuntime = ({
  menuEl = null,
  triggerEls = [],
  closeDuration = 150,
  requestFrame = callback => globalThis.requestAnimationFrame?.(callback),
  schedule = (callback, delay) => globalThis.setTimeout?.(callback, delay),
  cancelSchedule = timer => globalThis.clearTimeout?.(timer),
  windowRef = globalThis.window,
} = {}) => {
  const triggers = Array.from(triggerEls || []).filter(Boolean);
  let activeTrigger = null;
  let closeTimer = null;
  let motionToken = 0;

  const syncTriggers = (open, current = null) => {
    triggers.forEach((trigger) => {
      const isCurrent = Boolean(open && trigger === current);
      trigger.classList?.toggle?.('is-open', isCurrent);
      trigger.setAttribute?.('aria-expanded', isCurrent ? 'true' : 'false');
    });
  };

  const clearCloseTimer = () => {
    if (closeTimer !== null && closeTimer !== undefined) cancelSchedule?.(closeTimer);
    closeTimer = null;
  };

  const finalizeClose = () => {
    clearCloseTimer();
    menuEl?.classList?.add?.('hidden');
    menuEl?.classList?.remove?.('is-open', 'is-closing');
    menuEl?.setAttribute?.('aria-hidden', 'true');
  };

  const open = (trigger = null) => {
    if (!menuEl) return false;
    clearCloseTimer();
    motionToken += 1;
    const token = motionToken;
    activeTrigger = trigger || null;
    menuEl.classList?.remove?.('hidden', 'is-open', 'is-closing');
    menuEl.setAttribute?.('aria-hidden', 'false');
    syncTriggers(true, activeTrigger);
    requestFrame?.(() => {
      if (token !== motionToken || menuEl.classList?.contains?.('hidden')) return;
      menuEl.classList?.add?.('is-open');
    });
    return true;
  };

  const close = ({ immediate = false } = {}) => {
    if (!menuEl) return false;
    motionToken += 1;
    clearCloseTimer();
    syncTriggers(false);
    activeTrigger = null;
    menuEl.classList?.remove?.('is-open');
    if (immediate || menuEl.classList?.contains?.('hidden')) {
      finalizeClose();
      return true;
    }
    menuEl.classList?.add?.('is-closing');
    closeTimer = schedule?.(finalizeClose, closeDuration);
    return true;
  };

  const onKeyDown = (event) => {
    if (event?.key !== 'Escape') return;
    if (menuEl?.classList?.contains?.('hidden')) return;
    close();
  };
  windowRef?.addEventListener?.('keydown', onKeyDown);
  syncTriggers(false);
  menuEl?.setAttribute?.('aria-hidden', menuEl?.classList?.contains?.('hidden') ? 'true' : 'false');

  return {
    close,
    getActiveTrigger: () => activeTrigger,
    isOpen: () => Boolean(
      menuEl &&
      !menuEl.classList?.contains?.('hidden') &&
      menuEl.classList?.contains?.('is-open') &&
      !menuEl.classList?.contains?.('is-closing')
    ),
    open,
    destroy: () => {
      clearCloseTimer();
      windowRef?.removeEventListener?.('keydown', onKeyDown);
      finalizeClose();
    },
  };
};
