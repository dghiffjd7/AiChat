import {
  createPendingUserMessage,
  getMessageSendText,
  restorePendingQueueToHistory,
  resolvePendingMessagesToSend,
} from './pending-message-utils.js';
import {
  dispatchAfterSendEvents,
  markMessagesAsSending,
} from './send-side-effect-utils.js';

const normalizeStringIdList = (items = []) => Array.from(
  new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ),
);

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeTraceText = (value, fallback = '') => {
  const text = String(value || '').trim();
  return text || fallback;
};

const normalizeTraceDetails = (details = {}) => {
  if (!isPlainObject(details)) return {};
  return Object.fromEntries(
    Object.entries(details).filter(([, value]) => typeof value !== 'undefined'),
  );
};

export const buildSendFlowTraceEvent = ({
  phase = '',
  sessionId = '',
  status = 'info',
  summary = '',
  details = {},
} = {}) => ({
  category: 'generation',
  source: 'send-flow',
  phase: normalizeTraceText(phase, 'event'),
  sessionId: normalizeTraceText(sessionId, ''),
  status: normalizeTraceText(status, 'info'),
  summary: normalizeTraceText(summary, ''),
  details: normalizeTraceDetails(details),
});

export const normalizeHandleSendInvocation = (targetMessageId = null, options = {}) => {
  let nextTargetMessageId = targetMessageId;
  let nextOptions = options;

  if (nextTargetMessageId && typeof nextTargetMessageId === 'object') {
    if (typeof nextTargetMessageId.preventDefault === 'function') {
      nextTargetMessageId = null;
      nextOptions = {};
    } else {
      nextOptions = nextTargetMessageId;
      nextTargetMessageId = null;
    }
  }

  if (!nextOptions || typeof nextOptions !== 'object') nextOptions = {};
  return {
    targetMessageId: nextTargetMessageId,
    options: nextOptions,
  };
};

export const normalizeHandleSendOptions = (options = {}) => {
  const raw = options && typeof options === 'object' ? options : {};
  const overrideTextRaw = typeof raw.overrideText === 'string' ? raw.overrideText : '';
  const continueTarget = raw.continueTarget && typeof raw.continueTarget === 'object' ? raw.continueTarget : null;
  const excludeMessageIds = normalizeStringIdList([
    ...(Array.isArray(raw.excludeMessageIds) ? raw.excludeMessageIds : []),
    continueTarget?.messageId,
  ]);

  return {
    overrideTextRaw,
    overrideText: overrideTextRaw.trim() ? overrideTextRaw : '',
    ignorePending: Boolean(raw.ignorePending),
    suppressUserMessage: Boolean(raw.suppressUserMessage),
    existingUserMessageId:
      typeof raw.existingUserMessageId === 'string' ? raw.existingUserMessageId : '',
    skipInputRegex: Boolean(raw.skipInputRegex),
    skipTemplate: Boolean(raw.skipTemplate),
    skipScripts: Boolean(raw.skipScripts),
    suppressAssistantDom: Boolean(raw.suppressAssistantDom),
    assistantStreamFactory:
      typeof raw.createAssistantStream === 'function' ? raw.createAssistantStream : null,
    continueTarget,
    partialCommitHandler:
      typeof raw.partialCommitHandler === 'function' ? raw.partialCommitHandler : null,
    swipeTarget: raw.swipeTarget && typeof raw.swipeTarget === 'object' ? raw.swipeTarget : null,
    excludeMessageIds,
    includeAttachments: raw.includeAttachments !== false,
  };
};

export const runPendingSendPreparationFlow = ({
  ignorePending = false,
  targetMessageId = null,
  allMessages = [],
  pendingQueue = [],
  overrideText = '',
  hasAttachments = false,
  continueTarget = null,
  sessionId = '',
  userAvatar = '',
  getInputText = () => '',
  getActiveUserProfile = () => null,
  isStickerAllowed = () => false,
  parseStickerToken = () => '',
  getReplyTargetForSession = () => null,
  clearReplyTargetForSession = () => {},
  formatNowTime = () => '',
  appendMessage = null,
  addMessageToUi = null,
  removePendingMessage = null,
  clearInput = () => {},
  buildStickerToken = value => String(value || ''),
  chatStore = null,
  ui = null,
  scriptRuntime = null,
  pluginRuntime = null,
  skipScripts = false,
  logger = null,
  recordTraceEvent = null,
  refreshChatAndContacts = () => {},
  updatePendingFloat = () => {},
  showError = () => {},
  showWarning = () => {},
} = {}) => {
  const pendingMessages = ignorePending
    ? []
    : (Array.isArray(allMessages) ? allMessages.filter(message => message?.status === 'pending') : []);
  if (!ignorePending && !targetMessageId && Array.isArray(pendingQueue) && pendingQueue.length) {
    const restored = restorePendingQueueToHistory({
      pendingQueue,
      existingMessages: allMessages,
      sessionId,
      appendMessage,
      addMessageToUi,
      removePendingMessage,
    });
    if (restored.length) pendingMessages.push(...restored);
  }

  if (pendingMessages.length > 0) {
    let { messagesToSend, errorMessage } = resolvePendingMessagesToSend({
      pendingMessages,
      targetMessageId,
    });

    if (errorMessage) {
      showError(errorMessage);
      return {
        shouldContinue: false,
        text: '',
        pendingMessagesToConfirm: [],
        errorMessage,
      };
    }

    if (!targetMessageId) {
      const currentInput = String(getInputText() || '').trim();
      if (currentInput) {
        const activeUser = getActiveUserProfile();
        const stickerKey = isStickerAllowed() ? parseStickerToken(currentInput) : '';
        const replyTarget = getReplyTargetForSession(sessionId);
        const newPendingMsg = createPendingUserMessage({
          text: currentInput,
          stickerKey,
          avatar: userAvatar,
          userName: activeUser?.name,
          time: formatNowTime(),
          replyTarget,
        });
        const saved = appendMessage(newPendingMsg, sessionId);
        addMessageToUi(saved);
        messagesToSend.push(saved);
        clearInput();
        if (replyTarget) clearReplyTargetForSession(sessionId);
      }
    }

    const text = messagesToSend
      .map(message => getMessageSendText(message, buildStickerToken))
      .filter(Boolean)
      .join('\n');
    let pendingMessagesToConfirm = messagesToSend;

    if (!text && !hasAttachments) {
      showWarning('没有可发送的消息');
      return {
        shouldContinue: false,
        text: '',
        pendingMessagesToConfirm,
        warningMessage: '没有可发送的消息',
      };
    }

    pendingMessagesToConfirm = markMessagesAsSending({
      messages: pendingMessagesToConfirm,
      sessionId,
      chatStore,
      ui,
    });
    dispatchAfterSendEvents({
      messages: pendingMessagesToConfirm,
      sessionId,
      scriptRuntime,
      pluginRuntime,
      skipScripts,
      logger,
      recordTraceEvent,
    });
    refreshChatAndContacts({ immediate: true });
    updatePendingFloat(sessionId);

    return {
      shouldContinue: true,
      text,
      pendingMessagesToConfirm,
      handledPending: true,
    };
  }

  const text = overrideText || getInputText();
  if (!text && !hasAttachments && !continueTarget) {
    return {
      shouldContinue: false,
      text: '',
      pendingMessagesToConfirm: [],
    };
  }

  return {
    shouldContinue: true,
    text,
    pendingMessagesToConfirm: [],
    handledPending: false,
  };
};

export const resolveRegenerateFromUserIndexPlan = ({
  messages = [],
  userIdx = -1,
  allowEmpty = false,
  isSyntheticUser = () => false,
} = {}) => {
  const list = Array.isArray(messages) ? messages : [];
  const index = Math.trunc(Number(userIdx));
  const prevUser = list[index] || null;
  const isSynthetic = message => {
    try {
      return Boolean(isSyntheticUser?.(message));
    } catch {
      return false;
    }
  };
  const emptyResult = {
    canRegenerate: false,
    prevUser: null,
    roundMessages: [],
    regenMessages: [],
    nextUserIdx: -1,
    warningMessage: '',
    reason: 'invalid-user',
  };
  if (!prevUser || prevUser.role !== 'user' || isSynthetic(prevUser)) return emptyResult;
  if (prevUser.status === 'pending' || prevUser.status === 'sending') {
    return {
      ...emptyResult,
      prevUser,
      warningMessage: '发送中的消息无法重生成',
      reason: 'user-message-sending',
    };
  }
  let nextUserIdx = -1;
  for (let i = index + 1; i < list.length; i += 1) {
    if (
      list[i]?.role === 'user' &&
      !isSynthetic(list[i]) &&
      list[i]?.status !== 'pending' &&
      list[i]?.status !== 'sending'
    ) {
      nextUserIdx = i;
      break;
    }
  }
  if (nextUserIdx !== -1) {
    return {
      ...emptyResult,
      prevUser,
      nextUserIdx,
      warningMessage: '只能重生成最新一轮回复',
      reason: 'not-latest-round',
    };
  }
  const roundMessages = list.slice(index + 1, nextUserIdx === -1 ? list.length : nextUserIdx);
  const regenMessages = roundMessages.filter(message => message?.role === 'assistant' || isSynthetic(message));
  if (!regenMessages.length && !allowEmpty) {
    return {
      ...emptyResult,
      prevUser,
      roundMessages,
      regenMessages,
      nextUserIdx,
      warningMessage: '未找到可重生成的 AI 回复',
      reason: 'missing-assistant-reply',
    };
  }
  return {
    canRegenerate: true,
    prevUser,
    roundMessages,
    regenMessages,
    nextUserIdx,
    warningMessage: '',
    reason: '',
  };
};

export const runRegenerateFromUserIndexFlow = async ({
  messages = [],
  userIdx = -1,
  allowEmpty = false,
  isSyntheticUser = () => false,
  sessionId = '',
  chatStore = null,
  ui = null,
  recordTraceEvent = () => {},
  removeTurnCheckpointsForMessages = async () => {},
  refreshChatAndContacts = () => {},
  getMemoryStorageMode = () => '',
  restoreMemoryForActiveThread = async () => {},
  getMessageSendText = () => '',
  buildStickerToken = value => value,
  handleSend = async () => false,
  warn = () => {},
  logger = null,
} = {}) => {
  const plan = resolveRegenerateFromUserIndexPlan({
    messages,
    userIdx,
    allowEmpty,
    isSyntheticUser,
  });
  if (!plan.canRegenerate) {
    if (plan.warningMessage) warn(plan.warningMessage);
    return {
      started: false,
      resent: false,
      plan,
      reason: plan.reason,
    };
  }

  const prevUser = plan.prevUser;
  const regenMessages = plan.regenMessages;
  recordTraceEvent({
    phase: 'regenerate.start',
    sessionId,
    status: 'started',
    summary: 'regenerate flow started',
    details: {
      userIdx,
      allowEmpty,
      regenMessageCount: regenMessages.length,
    },
  });

  if (regenMessages.length) {
    regenMessages.forEach(message => {
      chatStore?.deleteMessage?.(message.id, sessionId);
      ui?.removeMessage?.(message.id);
    });
    try {
      await removeTurnCheckpointsForMessages(sessionId, regenMessages, { prune: true });
    } catch (err) {
      logger?.warn?.('remove turn checkpoints for regenerated messages failed', err);
    }
    refreshChatAndContacts();
  }

  chatStore?.removeLastSummary?.(sessionId);
  if (getMemoryStorageMode() === 'table') {
    try {
      await restoreMemoryForActiveThread(sessionId, {
        refreshBaselineWhenNoTail: false,
        source: 'regenerate_from_user_index',
      });
    } catch (err) {
      logger?.warn?.('restore memory after regenerate failed', err);
    }
  }

  const resendText = getMessageSendText(prevUser, buildStickerToken);
  if (!String(resendText || '').trim()) {
    recordTraceEvent({
      phase: 'regenerate.finish',
      sessionId,
      status: 'skipped',
      summary: 'regenerate flow skipped',
      details: {
        userIdx,
        allowEmpty,
        reason: 'empty-user-message',
      },
    });
    warn('未找到对应的用户消息内容');
    return {
      started: true,
      resent: false,
      plan,
      reason: 'empty-user-message',
    };
  }

  const resent = await handleSend(null, {
    overrideText: resendText,
    ignorePending: true,
    suppressUserMessage: true,
    skipInputRegex: true,
    existingUserMessageId: prevUser?.id || '',
    includeAttachments: false,
  });
  recordTraceEvent({
    phase: 'regenerate.finish',
    sessionId,
    status: resent ? 'success' : 'error',
    summary: resent ? 'regenerate flow completed' : 'regenerate resend failed',
    details: {
      userIdx,
      allowEmpty,
      regenMessageCount: regenMessages.length,
      resent: Boolean(resent),
    },
  });

  return {
    started: true,
    resent: Boolean(resent),
    plan,
    reason: resent ? '' : 'resend-failed',
  };
};

export const runSendCatchFlow = ({
  error = null,
  generationId = 0,
  suppressErrorUI = false,
  streamCtrl = null,
  getActiveGeneration = () => null,
  isGenerationInterrupted = () => false,
  sessionId = '',
  isSessionActive = () => false,
  hideTyping = () => {},
  fastForwardDelivery = () => {},
  logger = null,
  showErrorBanner = () => {},
  retrySend = () => {},
  showToastError = () => {},
} = {}) => {
  const sendErrorMessage = error?.message ? String(error.message) : String(error || '');
  const generationInterrupted = isGenerationInterrupted(generationId);
  const isCancelled = Boolean(error?.cancelled || generationInterrupted);
  if (!isCancelled) {
    streamCtrl?.cancel?.();
  }
  const activeGeneration = getActiveGeneration();
  if (activeGeneration?._messageQueue) {
    try {
      activeGeneration._messageQueue.cancel();
    } catch {}
  }
  if (!generationInterrupted && isSessionActive(sessionId)) {
    hideTyping();
    fastForwardDelivery(sessionId);
  }

  const nextSuppressErrorUI = Boolean(suppressErrorUI || isCancelled);
  if (!nextSuppressErrorUI) {
    logger?.error?.('发送失败', error, { status: error?.status, response: error?.response });
    showErrorBanner(error?.message || '发送失败，请检查网络或 API 设置', {
      label: '重试',
      handler: () => retrySend(),
    });
    showToastError(error?.message || '发送失败', '错误');
  }

  return {
    sendErrorMessage,
    suppressErrorUI: nextSuppressErrorUI,
    generationInterrupted,
    cancelled: isCancelled,
  };
};

export const runSendFinallyFlow = ({
  sendSucceeded = false,
  pendingMessagesToConfirm = [],
  sessionId = '',
  isGroupChat = false,
  checkpointTargetMessageId = '',
  generationId = 0,
  sendTraceStarted = false,
  suppressErrorUI = false,
  sendErrorMessage = '',
  finalizePendingMessages = () => {},
  movePendingFromHistoryToQueue = () => {},
  refreshChatAndContacts = () => {},
  scriptRuntime = null,
  runMemoryUpdateAfterChat = () => null,
  buildMemoryContext = () => null,
  updatePendingFloat = () => {},
  getActiveGeneration = () => null,
  setActiveGeneration = () => {},
  setSendingState = () => {},
  recordTraceEvent = () => {},
} = {}) => {
  if (sendSucceeded) {
    if (Array.isArray(pendingMessagesToConfirm) && pendingMessagesToConfirm.length > 0) {
      finalizePendingMessages(sessionId, pendingMessagesToConfirm);
    }
    movePendingFromHistoryToQueue(sessionId);
    refreshChatAndContacts();
    scriptRuntime?.consumeOnce?.(sessionId);
    const memoryTask = runMemoryUpdateAfterChat(sessionId, isGroupChat, buildMemoryContext(), {
      checkpointMessageId: checkpointTargetMessageId,
    });
    memoryTask?.catch?.(() => {});
  }

  updatePendingFloat(sessionId);
  const activeBeforeSendingReset = getActiveGeneration();
  if (!activeBeforeSendingReset || activeBeforeSendingReset.id === generationId) {
    setSendingState(false);
  }
  const activeBeforeClear = getActiveGeneration();
  if (activeBeforeClear?.id === generationId) {
    setActiveGeneration(null);
  }

  if (sendTraceStarted) {
    recordTraceEvent({
      phase: 'send.finish',
      sessionId,
      status: sendSucceeded ? 'success' : (suppressErrorUI ? 'cancelled' : 'error'),
      summary: sendSucceeded ? 'send flow completed' : 'send flow stopped',
      details: {
        generationId,
        sendSucceeded,
        cancelled: suppressErrorUI || undefined,
        errorMessage: sendErrorMessage || undefined,
      },
    });
  }

  return sendSucceeded;
};

const isEnabledPromptRule = (enabled, rules) =>
  Boolean(enabled) && String(rules || '').trim().length > 0;

export const resolveSyspromptProtocolFlags = ({
  sysp = null,
  rpUiMode = false,
  isGroupChat = false,
  summaryEnabled = false,
} = {}) => {
  const dialogueEnabled = isEnabledPromptRule(sysp?.dialogue_enabled, sysp?.dialogue_rules);
  const groupEnabled = isEnabledPromptRule(sysp?.group_enabled, sysp?.group_rules);
  const momentCreateEnabled = isEnabledPromptRule(
    sysp?.moment_create_enabled,
    sysp?.moment_create_rules,
  );

  return {
    dialogueEnabled,
    groupEnabled,
    momentCreateEnabled,
    protocolEnabled:
      !rpUiMode && (momentCreateEnabled || (isGroupChat ? groupEnabled : dialogueEnabled)),
    disableSummaryForThis: !summaryEnabled,
  };
};
