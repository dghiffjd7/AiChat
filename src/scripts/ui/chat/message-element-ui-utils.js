export const buildMessageElementCore = ({
  message,
  resolveActiveSwipeMessage,
  resolveMessageSessionId,
  createMessageId,
  createDividerMessageWrapper,
  createSystemMessageWrapper,
  bindMessageContextInteractions,
  createStandardMessageWrapper,
  createMessageAvatarImage,
  defaultAvatar = '',
  documentLike,
  createBubble,
  renderMessageBubbleContent,
  buildMessageSidecarElement = null,
  buildReactionSummaryElement,
  createReactionQuickBar,
  createReactionTriggerButton,
  getQuickReactionEmojis,
  onToggleReaction,
  bindReactionQuickBarTouch,
  buildBubbleStack,
  appendStandardMessageLayout,
  isThreadingEnabledForMessage,
  showReactionPicker,
  createSwipeIndicatorElement,
  getUiMode,
  selectionMode = false,
  scheduleSelectionModeApply,
  scrollEl = null,
  markWrapperSelectable = null,
  setSelectionBarVisible = null,
} = {}) => {
  let nextMessage = resolveActiveSwipeMessage?.(message) || message;
  const activeSwipeDraft = Boolean(nextMessage?.meta?.activeSwipeDraft?.active);
  if (!nextMessage?.content && !nextMessage?.type && !activeSwipeDraft) {
    return null;
  }
  if (!nextMessage?.id) {
    nextMessage.id = createMessageId?.() || '';
  }
  const resolvedSessionId = resolveMessageSessionId?.(nextMessage);
  if (resolvedSessionId && String(nextMessage?.sessionId || '').trim() !== resolvedSessionId) {
    nextMessage = { ...nextMessage, sessionId: resolvedSessionId };
  }

  if (nextMessage?.role === 'system' && nextMessage?.type === 'divider') {
    return createDividerMessageWrapper?.({
      documentLike,
      message: nextMessage,
    }) || null;
  }

  if (nextMessage?.role === 'system') {
    const wrapper = createSystemMessageWrapper?.({
      documentLike,
      message: nextMessage,
    });
    return bindMessageContextInteractions?.({
      wrapper,
      message: nextMessage,
    }) || wrapper || null;
  }

  const isUser = nextMessage?.role === 'user';
  const wrapper = createStandardMessageWrapper?.({
    documentLike,
    message: nextMessage,
    isUser,
  });
  const avatarImg = createMessageAvatarImage?.({
    documentLike,
    message: nextMessage,
    defaultAvatar,
  });
  const bubble = createBubble?.(documentLike);
  renderMessageBubbleContent?.({
    bubble,
    message: nextMessage,
    resolvedSessionId,
  });
  const messageSidecarEl = buildMessageSidecarElement?.({
    documentLike,
    message: nextMessage,
    isUser,
    resolvedSessionId,
  }) || null;

  const uiMode = getUiMode?.() || '';
  const reactionSummaryEl = buildReactionSummaryElement?.(nextMessage);
  const reactionQuickBar = uiMode === 'chat'
    ? createReactionQuickBar?.(nextMessage, {
      documentLike,
      isThreadingEnabled: isThreadingEnabledForMessage?.(nextMessage),
      emojis: getQuickReactionEmojis?.(nextMessage) || [],
      onToggleReaction: emoji => onToggleReaction?.(nextMessage, emoji),
      onShowPicker: (button, messageValue) => showReactionPicker?.(button, messageValue),
    })
    : null;
  const reactionButton = reactionQuickBar || (nextMessage?.role === 'assistant' || uiMode === 'chat'
    ? null
    : createReactionTriggerButton?.(nextMessage, {
      documentLike,
      isThreadingEnabled: isThreadingEnabledForMessage?.(nextMessage),
      onShowPicker: (button, messageValue) => showReactionPicker?.(button, messageValue),
    }));
  const bubbleStack = buildBubbleStack?.({
    documentLike,
    bubble,
    isUser,
    messageSidecarEl,
    reactionButton,
  });
  if (reactionQuickBar) {
    bindReactionQuickBarTouch?.({
      bubbleStack,
      bubble,
      quickBar: reactionQuickBar,
      scrollBoundary: scrollEl,
    });
  }

  appendStandardMessageLayout?.({
    documentLike,
    wrapper,
    avatarImg,
    bubbleStack,
    reactionSummaryEl,
    message: nextMessage,
    isUser,
    uiMode,
    createSwipeIndicatorElement,
  });

  bindMessageContextInteractions?.({
    wrapper,
    message: nextMessage,
  });

  scheduleSelectionModeApply?.({
    selectionMode,
    messageId: nextMessage?.id,
    scrollEl,
    markWrapperSelectable,
    setSelectionBarVisible,
  });

  return wrapper || null;
};
