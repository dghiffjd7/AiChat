export const buildBubbleStackCore = ({
  documentLike,
  bubble,
  isUser = false,
  reactionSummaryEl = null,
  reactionButton = null,
} = {}) => {
  const bubbleStack = documentLike.createElement('div');
  bubbleStack.className = 'chat-bubble-stack';
  if (isUser) bubbleStack.classList?.add?.('is-user');
  bubbleStack.appendChild?.(bubble);
  if (reactionSummaryEl) bubbleStack.appendChild?.(reactionSummaryEl);
  if (reactionButton) bubbleStack.appendChild?.(reactionButton);
  return bubbleStack;
};

const createMessageTimeElement = (documentLike, timeText) => {
  const timeEl = documentLike.createElement('span');
  timeEl.className = 'QQ_chat_time';
  timeEl.textContent = timeText || '';
  return timeEl;
};

export const appendStandardMessageLayoutCore = ({
  documentLike,
  wrapper,
  avatarImg,
  bubbleStack,
  message,
  isUser = false,
  uiMode = '',
  createSwipeIndicatorElement = null,
} = {}) => {
  const timeEl = createMessageTimeElement(documentLike, message?.time || '');
  if (isUser) {
    const contentWrap = documentLike.createElement('div');
    contentWrap.className = 'chat-message-stack';
    contentWrap.style.cssText =
      'grid-column: 1; display:flex; flex-direction:column; align-items:flex-end; gap:4px; min-width:0;';
    contentWrap.appendChild?.(bubbleStack);

    const timeRow = documentLike.createElement('div');
    timeRow.className = 'chat-time-row';
    const statusEl = documentLike.createElement('span');
    statusEl.className = 'chat-delivery-status';
    if (message?.status !== 'pending' && message?.status !== 'sending') {
      const saved = message?.meta?.deliveryText;
      statusEl.textContent = typeof saved === 'string' && saved ? saved : '已读';
    }
    timeRow.appendChild?.(statusEl);
    timeRow.appendChild?.(timeEl);
    contentWrap.appendChild?.(timeRow);

    wrapper.appendChild?.(contentWrap);
    wrapper.appendChild?.(avatarImg);
    return wrapper;
  }

  const contentWrap = documentLike.createElement('div');
  contentWrap.className = 'chat-message-stack';
  contentWrap.style.cssText =
    'grid-column: 2; display:flex; flex-direction:column; align-items:flex-start; gap:4px; min-width:0;';
  if (message?.meta?.showName && message?.name) {
    const nameEl = documentLike.createElement('div');
    nameEl.className = 'QQ_chat_name';
    nameEl.textContent = String(message.name || '');
    contentWrap.appendChild?.(nameEl);
  }
  contentWrap.appendChild?.(bubbleStack);

  if (uiMode === 'rp' && message?.role === 'assistant' && !message?.meta?.isGreeting) {
    const indicator = createSwipeIndicatorElement?.(documentLike, message);
    if (indicator) contentWrap.appendChild?.(indicator);
  }

  contentWrap.appendChild?.(timeEl);
  wrapper.appendChild?.(avatarImg);
  wrapper.appendChild?.(contentWrap);
  return wrapper;
};

export const scheduleSelectionModeApplyCore = ({
  selectionMode = false,
  messageId = '',
  scrollEl = null,
  markWrapperSelectable = null,
  setSelectionBarVisible = null,
  schedule = (handler) => handler(),
} = {}) => {
  if (!selectionMode || !messageId) return false;
  schedule(() => {
    try {
      const wrapper = scrollEl?.querySelector?.(`[data-msg-id="${messageId}"]`);
      if (wrapper) markWrapperSelectable?.(wrapper, messageId);
      setSelectionBarVisible?.(true);
    } catch {}
  }, 0);
  return true;
};
