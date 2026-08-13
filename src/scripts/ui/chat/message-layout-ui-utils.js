import { createRpMessageActionsElement } from './rp-message-actions-ui-utils.js';

export const buildBubbleStackCore = ({
  documentLike,
  bubble,
  isUser = false,
  messageSidecarEl = null,
  reactionButton = null,
} = {}) => {
  const bubbleStack = documentLike.createElement('div');
  bubbleStack.className = 'chat-bubble-stack';
  if (isUser) bubbleStack.classList?.add?.('is-user');
  bubbleStack.appendChild?.(bubble);
  if (messageSidecarEl) bubbleStack.appendChild?.(messageSidecarEl);
  if (reactionButton) bubbleStack.appendChild?.(reactionButton);
  return bubbleStack;
};

const createMessageTimeElement = (documentLike, timeText) => {
  const timeEl = documentLike.createElement('span');
  timeEl.className = 'QQ_chat_time';
  timeEl.textContent = timeText || '';
  return timeEl;
};

const appendMessageFooter = ({
  documentLike,
  contentWrap,
  bubbleStack,
  timeRow,
  reactionSummaryEl = null,
  isUser = false,
  uiMode = '',
} = {}) => {
  if (uiMode !== 'chat' || !reactionSummaryEl) {
    contentWrap.appendChild?.(timeRow);
    return timeRow;
  }
  const footer = documentLike.createElement('div');
  footer.className = `chat-message-footer ${isUser ? 'is-user' : 'is-assistant'}`;
  footer.appendChild?.(reactionSummaryEl);
  footer.appendChild?.(timeRow);
  bubbleStack.appendChild?.(footer);
  return footer;
};

export const appendStandardMessageLayoutCore = ({
  documentLike,
  wrapper,
  avatarImg,
  bubbleStack,
  reactionSummaryEl = null,
  message,
  isUser = false,
  uiMode = '',
  createSwipeIndicatorElement = null,
  resolveRpCharacterName = null,
} = {}) => {
  const timeText = [
    String(message?.time || ''),
    Number(message?.editedAt || 0) > 0 ? '已编辑' : '',
  ].filter(Boolean).join(' · ');
  const timeEl = createMessageTimeElement(documentLike, timeText);
  if (isUser) {
    const useUserActions =
      (uiMode === 'rp' || uiMode === 'chat') &&
      message?.role === 'user';
    const contentWrap = documentLike.createElement('div');
    contentWrap.className = 'chat-message-stack';
    contentWrap.style.cssText =
      'grid-column: 1; display:flex; flex-direction:column; align-items:flex-end; gap:4px; min-width:0;';
    contentWrap.appendChild?.(bubbleStack);

    const timeRow = documentLike.createElement('div');
    timeRow.className = 'chat-time-row';
    if (useUserActions) {
      wrapper.classList?.add?.('has-rp-message-actions');
      const actions = createRpMessageActionsElement({
        documentLike,
        message,
        kind: 'user',
      });
      if (actions) timeRow.appendChild?.(actions);
    }
    const statusEl = documentLike.createElement('span');
    statusEl.className = 'chat-delivery-status';
    if (message?.status !== 'pending' && message?.status !== 'sending') {
      const saved = message?.meta?.deliveryText;
      statusEl.textContent = typeof saved === 'string' && saved ? saved : '已读';
    }
    timeRow.appendChild?.(statusEl);
    timeRow.appendChild?.(timeEl);
    appendMessageFooter({
      documentLike,
      contentWrap,
      bubbleStack,
      timeRow,
      reactionSummaryEl,
      isUser: true,
      uiMode,
    });

    wrapper.appendChild?.(contentWrap);
    wrapper.appendChild?.(avatarImg);
    return wrapper;
  }

  const contentWrap = documentLike.createElement('div');
  contentWrap.className = 'chat-message-stack';
  contentWrap.style.cssText =
    'grid-column: 2; display:flex; flex-direction:column; align-items:flex-start; gap:4px; min-width:0;';

  const useRpAssistantChrome =
    uiMode === 'rp' &&
    message?.role === 'assistant' &&
    !message?.meta?.isGreeting;
  if (
    uiMode === 'rp' &&
    message?.role === 'assistant' &&
    message?.meta?.isGreeting === true
  ) {
    wrapper.classList?.add?.('is-rp-greeting-message');
  }
  if (useRpAssistantChrome) {
    wrapper.classList?.add?.('has-rp-message-chrome', 'has-rp-message-actions');
    const header = documentLike.createElement('div');
    header.className = 'rp-message-header';

    const nameEl = documentLike.createElement('div');
    nameEl.className = 'QQ_chat_name rp-message-name';
    let resolvedName = '';
    try {
      resolvedName = String(resolveRpCharacterName?.(message) || '').trim();
    } catch {}
    nameEl.textContent = resolvedName || String(message?.name || '').trim() || '角色';
    header.appendChild?.(nameEl);
    header.appendChild?.(timeEl);
    contentWrap.appendChild?.(header);
    contentWrap.appendChild?.(bubbleStack);

    const actions = createRpMessageActionsElement({
      documentLike,
      message,
      createSwipeIndicatorElement,
    });
    if (actions) contentWrap.appendChild?.(actions);
    wrapper.appendChild?.(avatarImg);
    wrapper.appendChild?.(contentWrap);
    return wrapper;
  }

  if (message?.meta?.showName && message?.name) {
    const nameEl = documentLike.createElement('div');
    nameEl.className = 'QQ_chat_name';
    nameEl.textContent = String(message.name || '');
    contentWrap.appendChild?.(nameEl);
  }
  contentWrap.appendChild?.(bubbleStack);

  const useChatAssistantActions =
    uiMode === 'chat' &&
    message?.role === 'assistant';
  if (useChatAssistantActions) {
    wrapper.classList?.add?.('has-rp-message-actions');
    const footer = documentLike.createElement('div');
    footer.className = 'chat-time-row is-assistant';
    footer.appendChild?.(timeEl);
    const actions = createRpMessageActionsElement({
      documentLike,
      message,
    });
    if (actions) footer.appendChild?.(actions);
    appendMessageFooter({
      documentLike,
      contentWrap,
      bubbleStack,
      timeRow: footer,
      reactionSummaryEl,
      uiMode,
    });
  } else {
    contentWrap.appendChild?.(timeEl);
  }
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
      const wrapper = scrollEl?.querySelector?.(`[data-msg-id="${messageId}"][data-role]`);
      if (wrapper) markWrapperSelectable?.(wrapper, messageId);
      setSelectionBarVisible?.(true);
    } catch {}
  }, 0);
  return true;
};
