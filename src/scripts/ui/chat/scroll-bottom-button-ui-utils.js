export const getScrollDistanceFromBottom = (scrollEl) => {
  if (!scrollEl) return 0;
  const scrollHeight = Number(scrollEl.scrollHeight || 0);
  const viewportHeight = Number(scrollEl.clientHeight || 0);
  const scrollTop = Number(scrollEl.scrollTop || 0);
  return Math.max(0, scrollHeight - viewportHeight - scrollTop);
};

export const isNearBottom = (scrollEl, threshold = 120) =>
  getScrollDistanceFromBottom(scrollEl) <= Number(threshold || 0);

export const resolveScrollBottomButtonThresholds = (scrollEl) => {
  const viewportHeight = Math.max(0, Number(scrollEl?.clientHeight || 0));
  return {
    show: Math.max(220, Math.round(viewportHeight * 0.58)),
    hide: Math.max(84, Math.round(viewportHeight * 0.18)),
  };
};

export const createScrollBottomButtonUiRuntime = ({
  documentLike,
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
} = {}) => ({
  ensureButton({ scrollEl, existingButtonEl, onClick }) {
    if (!scrollEl) return existingButtonEl || null;
    if (existingButtonEl) return existingButtonEl;
    const host = scrollEl.parentElement;
    if (!host) return null;
    const button = documentLike.createElement('button');
    button.type = 'button';
    button.className = 'chat-scroll-bottom-btn';
    button.setAttribute?.('aria-label', '跳到最新消息');
    button.setAttribute?.('title', '跳到最新消息');
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 4.75a1 1 0 0 1 1 1v10.586l2.714-2.714a1 1 0 1 1 1.414 1.414l-4.422 4.422a1 1 0 0 1-1.414 0l-4.422-4.422a1 1 0 1 1 1.414-1.414L11 16.336V5.75a1 1 0 0 1 1-1Z"
          fill="currentColor"
        />
      </svg>
    `;
    button.addEventListener?.('click', () => {
      onClick?.();
    });
    host.appendChild?.(button);
    return button;
  },
  hideButton({ buttonEl, immediate = false }) {
    if (!buttonEl) return;
    if (immediate) buttonEl.classList.add('is-immediate');
    else buttonEl.classList.remove('is-immediate');
    buttonEl.classList.remove('is-visible');
    if (!immediate) return;
    schedule(() => {
      buttonEl?.classList?.remove('is-immediate');
    }, 0);
  },
  showButton({ buttonEl, immediate = false }) {
    if (!buttonEl) return;
    if (immediate) buttonEl.classList.add('is-immediate');
    else buttonEl.classList.remove('is-immediate');
    buttonEl.classList.add('is-visible');
    if (!immediate) return;
    schedule(() => {
      buttonEl?.classList?.remove('is-immediate');
    }, 0);
  },
  refreshButton({
    scrollEl,
    buttonEl,
    immediate = false,
    hideButton,
    showButton,
    typingEl = null,
    floatingTypingEl = null,
    hideFloatingTyping,
    showFloatingTyping,
    getDistance = getScrollDistanceFromBottom,
    resolveThresholds = resolveScrollBottomButtonThresholds,
    isNearBottomFn = isNearBottom,
  }) {
    if (!scrollEl || !buttonEl) return false;
    const scrollHeight = Number(scrollEl.scrollHeight || 0);
    const viewportHeight = Number(scrollEl.clientHeight || 0);
    const maxScrollable = Math.max(0, scrollHeight - viewportHeight);
    if (maxScrollable <= 8) {
      hideButton?.({ immediate });
      return false;
    }
    const distance = getDistance(scrollEl);
    const { show, hide } = resolveThresholds(scrollEl);
    const visible = buttonEl.classList.contains('is-visible');
    const shouldShow = visible ? distance > hide : distance > show;
    if (shouldShow) showButton?.({ immediate });
    else hideButton?.({ immediate });
    if (typingEl) {
      if (isNearBottomFn(scrollEl)) {
        hideFloatingTyping?.(floatingTypingEl);
      } else if (!floatingTypingEl) {
        showFloatingTyping?.(typingEl);
      }
    }
    return shouldShow;
  },
  scheduleRefresh({
    immediate = false,
    getPendingImmediate,
    setPendingImmediate,
    getRafId,
    setRafId,
    scheduleFrame = typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (cb => setTimeout(cb, 16)),
    refresh,
  }) {
    setPendingImmediate?.(Boolean(getPendingImmediate?.() || immediate));
    if (getRafId?.()) return;
    const nextId = scheduleFrame(() => {
      setRafId?.(0);
      const shouldApplyImmediately = Boolean(getPendingImmediate?.());
      setPendingImmediate?.(false);
      refresh?.({ immediate: shouldApplyImmediately });
    });
    setRafId?.(nextId || 0);
  },
});
