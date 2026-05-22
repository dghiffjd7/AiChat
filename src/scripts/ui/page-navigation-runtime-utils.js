const normalizeCollection = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value[Symbol.iterator] === 'function') return Array.from(value);
  if (typeof value.length === 'number') return Array.from(value);
  return [];
};

export const createPageSwitchRuntime = ({
  getActivePage = null,
  setActivePage = null,
  pageOrder = {},
  navButtons = [],
  pages = {},
  getReducedMotion = null,
  chatRoomEl = null,
  chatListEl = null,
  renderMoments = null,
  updateChatContentSearchVisibility = null,
  isUiStateArmed = null,
  saveUiState = null,
  uiLog = null,
  scheduleModeSwitchSync = null,
  setTimeoutFn = (fn, ms) => setTimeout(fn, ms),
} = {}) => {
  return (name, options) => {
    const prev = String(getActivePage?.() || '').trim();
    const next = String(name || '').trim();
    if (!next || prev === next) return false;
    const animate = (!options || options.animate !== false) && !getReducedMotion?.();
    const dir = (pageOrder[next] ?? 0) > (pageOrder[prev] ?? 0) ? 'forward' : 'backward';

    setActivePage?.(next);
    normalizeCollection(navButtons).forEach((button) => {
      const isActive = button?.dataset?.page === next;
      button?.classList?.toggle?.('active', isActive);
      if (isActive) button?.setAttribute?.('aria-current', 'page');
      else button?.removeAttribute?.('aria-current');
    });

    const oldEl = pages?.[prev];
    const newEl = pages?.[next];

    Object.values(pages || {}).forEach((page) => {
      if (!page) return;
      page.classList?.remove?.('page-exiting');
      try {
        delete page.dataset.pageDir;
      } catch {}
    });

    if (oldEl && newEl && animate) {
      oldEl.classList?.remove?.('active');
      oldEl.classList?.add?.('page-exiting');
      if (oldEl.dataset) oldEl.dataset.pageDir = dir;
      newEl.classList?.add?.('active');
      if (newEl.dataset) newEl.dataset.pageDir = dir;

      const cleanupOld = () => {
        oldEl.classList?.remove?.('page-exiting');
        try {
          delete oldEl.dataset.pageDir;
        } catch {}
      };
      const cleanupNew = () => {
        try {
          delete newEl.dataset.pageDir;
        } catch {}
      };
      oldEl.addEventListener?.('animationend', cleanupOld, { once: true });
      newEl.addEventListener?.('animationend', cleanupNew, { once: true });
      setTimeoutFn(cleanupOld, 350);
      setTimeoutFn(cleanupNew, 350);
    } else {
      Object.entries(pages || {}).forEach(([key, element]) => {
        element?.classList?.toggle?.('active', key === next);
      });
    }

    if (next !== 'chat') {
      chatRoomEl?.classList?.add?.('hidden');
      chatListEl?.classList?.remove?.('hidden');
    }
    if (next === 'moments') {
      try {
        renderMoments?.();
      } catch {}
    }
    if (next === 'chat') {
      try {
        updateChatContentSearchVisibility?.();
      } catch {}
    }
    if (isUiStateArmed?.()) saveUiState?.();
    uiLog?.('switchPage', { activePage: next });
    scheduleModeSwitchSync?.();
    return true;
  };
};

export const bindPageNavButtons = ({
  navButtons = [],
  getActivePage = null,
  switchPage = null,
  getScrollTarget = null,
  getNow = () => Date.now(),
} = {}) => {
  let navLastTap = { page: '', time: 0 };
  normalizeCollection(navButtons).forEach((button) => {
    button?.addEventListener?.('click', () => {
      const page = String(button?.dataset?.page || '').trim();
      const now = Number(getNow?.() || Date.now());
      if (
        page &&
        page === navLastTap.page &&
        page === String(getActivePage?.() || '').trim() &&
        now - navLastTap.time < 350
      ) {
        getScrollTarget?.(page)?.scrollTo?.({ top: 0, behavior: 'smooth' });
      }
      navLastTap = { page, time: now };
      switchPage?.(page);
    });
  });
};

export const bindPageSwipeNavigation = ({
  appEl = null,
  isChatRoomVisible = null,
  getUiMode = null,
  getActivePage = null,
  pageOrder = {},
  pageNames = [],
  switchPage = null,
  isModeSwitchTarget = null,
  swipeThreshold = 60,
} = {}) => {
  let swipeStartX = 0;
  let swipeStartY = 0;
  let swipeLocked = false;

  appEl?.addEventListener?.('touchstart', (event) => {
    if (isChatRoomVisible?.() || getUiMode?.() === 'rp') return;
    if (isModeSwitchTarget?.(event?.target)) {
      swipeLocked = true;
      return;
    }
    swipeStartX = event?.touches?.[0]?.clientX || 0;
    swipeStartY = event?.touches?.[0]?.clientY || 0;
    swipeLocked = false;
  }, { passive: true });

  appEl?.addEventListener?.('touchend', (event) => {
    if (isChatRoomVisible?.() || getUiMode?.() === 'rp' || swipeLocked) return;
    const dx = (event?.changedTouches?.[0]?.clientX || 0) - swipeStartX;
    const dy = (event?.changedTouches?.[0]?.clientY || 0) - swipeStartY;
    if (Math.abs(dx) < swipeThreshold || Math.abs(dy) > Math.abs(dx)) return;
    const activePage = String(getActivePage?.() || '').trim();
    const idx = pageOrder[activePage] ?? 0;
    if (dx < 0 && idx < pageNames.length - 1) {
      switchPage?.(pageNames[idx + 1]);
    } else if (dx > 0 && idx > 0) {
      switchPage?.(pageNames[idx - 1]);
    }
  }, { passive: true });

  appEl?.addEventListener?.('touchmove', (event) => {
    if (swipeLocked) return;
    const dy = Math.abs((event?.touches?.[0]?.clientY || 0) - swipeStartY);
    const dx = Math.abs((event?.touches?.[0]?.clientX || 0) - swipeStartX);
    if (dy > 10 && dy > dx) swipeLocked = true;
  }, { passive: true });
};
