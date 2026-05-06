const normalizeStringIdList = (items = []) => Array.from(
  new Set(
    (Array.isArray(items) ? items : [])
      .map((item) => String(item || '').trim())
      .filter(Boolean),
  ),
);

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
