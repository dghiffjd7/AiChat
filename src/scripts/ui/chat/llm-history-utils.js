const clampNonNegativeInt = (value, fallback = 0) => {
  const next = Math.trunc(Number(value));
  if (!Number.isFinite(next)) return fallback;
  return Math.max(0, next);
};

export const dropTrailingPendingUserEcho = (history = [], pendingUserText = '') => {
  const list = Array.isArray(history) ? [...history] : [];
  const last = list[list.length - 1];
  if (
    pendingUserText &&
    last?.role === 'user' &&
    String(last.content || '').trim() === String(pendingUserText).trim()
  ) {
    list.pop();
  }
  return list;
};

export const applyChatHistoryLimit = (history = [], limit = 0) => {
  const list = Array.isArray(history) ? [...history] : [];
  const nextLimit = clampNonNegativeInt(limit, 0);
  if (nextLimit > 0 && list.length > nextLimit) {
    list.splice(0, list.length - nextLimit);
  }
  return list;
};

export const applyHistoryCharBudget = (
  history = [],
  {
    maxContext = 0,
    maxOut = 0,
    reserveTokens = 512,
    fallbackInputTokens = 8000,
    minInputTokens = 2000,
    minChars = 30000,
    maxCharsCap = 140000,
    capPerMessage = 40000,
  } = {},
) => {
  const list = (Array.isArray(history) ? history : []).map(item => (
    item && typeof item === 'object' ? { ...item } : item
  ));

  const ctxTokens = clampNonNegativeInt(maxContext, 0);
  const outTokens = clampNonNegativeInt(maxOut, 0);
  const inputBudgetTokens = Math.max(
    minInputTokens,
    ctxTokens ? ctxTokens - outTokens - reserveTokens : fallbackInputTokens,
  );
  const maxChars = Math.min(maxCharsCap, Math.max(minChars, inputBudgetTokens * 4));

  for (const message of list) {
    if (!message || typeof message.content !== 'string') continue;
    if (message.content.length > capPerMessage) {
      message.content = `${message.content.slice(0, capPerMessage)}…`;
    }
  }

  let total = 0;
  for (const message of list) {
    total += typeof message?.content === 'string' ? message.content.length : 0;
  }
  while (list.length > 1 && total > maxChars) {
    const dropped = list.shift();
    total -= typeof dropped?.content === 'string' ? dropped.content.length : 0;
  }
  return list;
};

export const limitCreativeAssistantHistory = (history = [], creativeLimit = 0) => {
  const list = Array.isArray(history) ? [...history] : [];
  const nextLimit = clampNonNegativeInt(creativeLimit, 0);
  if (nextLimit <= 0) return list;

  const creativeAssistantIdx = [];
  list.forEach((message, idx) => {
    if (message?.__creative && message?.role === 'assistant') creativeAssistantIdx.push(idx);
  });
  if (creativeAssistantIdx.length <= nextLimit) return list;

  const firstAssistantToKeep = creativeAssistantIdx[creativeAssistantIdx.length - nextLimit];
  let keepStart = firstAssistantToKeep;
  for (let i = firstAssistantToKeep - 1; i >= 0; i -= 1) {
    if (list[i]?.role === 'user') {
      keepStart = i;
      break;
    }
  }
  return list.slice(keepStart);
};

export const injectReasoningIntoHistory = (
  history = [],
  {
    enabled = false,
    prefix = '',
    suffix = '',
    separator = '',
    maxAdditions = 1,
    applyMacros = value => String(value ?? ''),
  } = {},
) => {
  const list = (Array.isArray(history) ? history : []).map(item => (
    item && typeof item === 'object' ? { ...item } : item
  ));
  if (!enabled || (!prefix && !suffix && !separator)) return list;

  const limit = clampNonNegativeInt(maxAdditions, 1);
  if (limit <= 0) return list;

  const resolvedPrefix = applyMacros(prefix);
  const resolvedSuffix = applyMacros(suffix);
  const resolvedSeparator = applyMacros(separator);
  let added = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (added >= limit) break;
    const message = list[i];
    if (!message || message.role !== 'assistant') continue;
    const reasoning = String(message.__reasoning || '').trim();
    if (!reasoning) continue;
    const block = `${resolvedPrefix}${reasoning}${resolvedSuffix}${resolvedSeparator}`;
    message.content = `${block}${message.content || ''}`;
    added += 1;
  }
  return list;
};

export const stripTransientHistoryFields = (history = []) => (
  (Array.isArray(history) ? history : []).map((message) => {
    if (!message || typeof message !== 'object') return message;
    if (!('__creative' in message) && !('__reasoning' in message)) return message;
    const { __creative, __reasoning, ...rest } = message;
    return rest;
  })
);

export const finalizeLlmHistory = (
  history = [],
  {
    pendingUserText = '',
    chatHistoryLimit = 0,
    openaiPreset = null,
    rpUiMode = false,
    creativeHistoryLimit = 0,
    reasoning = null,
  } = {},
) => {
  let next = dropTrailingPendingUserEcho(history, pendingUserText);
  next = applyChatHistoryLimit(next, chatHistoryLimit);
  next = applyHistoryCharBudget(next, {
    maxContext: openaiPreset?.openai_max_context,
    maxOut: openaiPreset?.openai_max_tokens,
  });
  if (rpUiMode) {
    next = limitCreativeAssistantHistory(next, creativeHistoryLimit);
  }
  next = injectReasoningIntoHistory(next, {
    enabled: reasoning?.enabled === true,
    prefix: reasoning?.prefix ?? '',
    suffix: reasoning?.suffix ?? '',
    separator: reasoning?.separator ?? '',
    maxAdditions: reasoning?.maxAdditions ?? 1,
    applyMacros: reasoning?.applyMacros || (value => String(value ?? '')),
  });
  return stripTransientHistoryFields(next);
};
