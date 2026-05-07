export const resolveJumpFocusElements = (wrapper) => {
  if (!wrapper) return { focusEl: null, textRoot: null };
  const focusEl =
    wrapper.querySelector?.('.QQ_chat_unread-line')
    || wrapper.querySelector?.('.QQ_chat_msgdiv')
    || wrapper.querySelector?.('.QQ_chat_sysbubble')
    || wrapper;
  const textRoot = focusEl?.querySelector?.('.chat-message-content') || focusEl;
  return { focusEl, textRoot };
};

export const shouldDismissJumpFocusOnScroll = ({
  state,
  currentTop,
  now = Date.now(),
} = {}) => {
  if (!state?.dismissOnScroll || !state.wrapper) return false;
  if (now < Number(state.ignoreScrollUntil || 0)) return false;
  return Math.abs(Number(currentTop || 0) - Number(state.scrollTop || 0)) >= 6;
};

export const clearJumpFocusState = (state, {
  clearTimer = (timerId) => clearTimeout(timerId),
  clearHighlights,
} = {}) => {
  if (state?.timer) clearTimer?.(state.timer);
  const wrapper = state?.wrapper;
  const focusEl = state?.focusEl;
  if (focusEl?.classList) {
    focusEl.classList.remove('chat-jump-focus-target');
  }
  if (wrapper?.classList) {
    wrapper.classList.remove('chat-jump-focus-line');
    if (wrapper.dataset) delete wrapper.dataset.chatJumpKind;
  }
  clearHighlights?.(state?.textRoot || focusEl || wrapper);
  return null;
};

export const applyJumpFocusState = (wrapper, {
  keyword = '',
  kind = 'anchor',
  dismissOnScroll = true,
  autoClearMs = 0,
  clearExisting,
  resolveElements = resolveJumpFocusElements,
  highlightKeyword,
  getScrollTop = () => 0,
  now = Date.now(),
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
  onAutoClear,
  setState,
} = {}) => {
  if (!wrapper) return false;
  clearExisting?.();
  const { focusEl, textRoot } = resolveElements(wrapper);
  wrapper.classList.add('chat-jump-focus-line');
  if (wrapper.dataset) wrapper.dataset.chatJumpKind = String(kind || 'anchor');
  focusEl?.classList?.add('chat-jump-focus-target');
  if (keyword) highlightKeyword?.(textRoot, keyword);
  const state = {
    wrapper,
    focusEl,
    textRoot,
    dismissOnScroll: dismissOnScroll !== false,
    scrollTop: Number(getScrollTop() || 0),
    ignoreScrollUntil: Number(now || 0) + 260,
    timer: null,
  };
  if (Number(autoClearMs) > 0) {
    state.timer = schedule(() => {
      if (typeof onAutoClear === 'function') onAutoClear(wrapper);
    }, Number(autoClearMs));
  }
  setState?.(state);
  return true;
};
