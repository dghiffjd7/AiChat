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
