export const FORMAT_REPAIR_SOURCE_KINDS = Object.freeze({
  socialTurnRaw: 'social_turn_raw',
  creativeRawOriginal: 'creative_raw_original',
});

const FORMAT_REPAIR_TURN_META_KEY = 'formatRepairTurn';

const trim = value => String(value ?? '').trim();

const normalizeIds = value => (Array.isArray(value) ? value : [])
  .map(item => trim(item))
  .filter(Boolean);

const isCompletedAssistantMessage = message => (
  message?.role === 'assistant' &&
  message?.status !== 'pending' &&
  message?.status !== 'sending' &&
  message?.meta?.streaming !== true
);

const resolveMessages = (getMessages, sessionId) => {
  if (typeof getMessages !== 'function') return [];
  try {
    const messages = getMessages(sessionId);
    return Array.isArray(messages) ? messages : [];
  } catch {
    return [];
  }
};

const findLatestCompletedAssistant = messages => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (isCompletedAssistantMessage(messages[index])) return messages[index];
  }
  return null;
};

const isCreativeTarget = ({ uiMode = '', sessionId = '', message = null } = {}) => {
  const sourceKind = trim(message?.meta?.[FORMAT_REPAIR_TURN_META_KEY]?.sourceKind);
  return trim(uiMode).toLowerCase() === 'rp' ||
    trim(sessionId).startsWith('rp:') ||
    sourceKind === FORMAT_REPAIR_SOURCE_KINDS.creativeRawOriginal;
};

export const buildFormatRepairTurnMeta = ({
  turnId = '',
  sourceSessionId = '',
  sourceKind = FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
  sourceMessageIds = [],
} = {}) => ({
  turnId: trim(turnId),
  sourceSessionId: trim(sourceSessionId),
  sourceKind: Object.values(FORMAT_REPAIR_SOURCE_KINDS).includes(sourceKind)
    ? sourceKind
    : FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
  sourceMessageIds: normalizeIds(sourceMessageIds),
});

export const tagMessageWithFormatRepairTurn = (message = {}, turnMeta = {}) => {
  if (!message || typeof message !== 'object') return message;
  const normalized = buildFormatRepairTurnMeta(turnMeta);
  if (!normalized.turnId || !normalized.sourceSessionId) return message;
  return {
    ...message,
    meta: {
      ...(message.meta && typeof message.meta === 'object' ? message.meta : {}),
      [FORMAT_REPAIR_TURN_META_KEY]: normalized,
    },
  };
};

export const getMessageFormatRepairTurnMeta = (message = {}) => {
  const raw = message?.meta?.[FORMAT_REPAIR_TURN_META_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const normalized = buildFormatRepairTurnMeta(raw);
  return normalized.turnId && normalized.sourceSessionId ? normalized : null;
};

const getSocialTargetDescriptor = ({
  message = null,
  sessionId = '',
  getLastRawResponseEnvelope = null,
} = {}) => {
  if (!isCompletedAssistantMessage(message)) {
    return { ok: false, reason: 'assistant_message_required' };
  }
  const turnMeta = getMessageFormatRepairTurnMeta(message);
  if (!turnMeta || turnMeta.sourceKind !== FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw) {
    return { ok: false, reason: 'turn_metadata_unavailable' };
  }
  if (typeof getLastRawResponseEnvelope !== 'function') {
    return { ok: false, reason: 'source_unavailable' };
  }
  let envelope = null;
  try {
    envelope = getLastRawResponseEnvelope(turnMeta.sourceSessionId);
  } catch {
    envelope = null;
  }
  if (!envelope || typeof envelope !== 'object') {
    return { ok: false, reason: 'source_unavailable' };
  }
  if (trim(envelope.turnId) !== turnMeta.turnId) {
    return { ok: false, reason: 'not_latest_turn' };
  }
  if (envelope.truncated === true) {
    return { ok: false, reason: 'source_truncated' };
  }
  const sourceMessageIds = normalizeIds(envelope.sourceMessageIds).length
    ? normalizeIds(envelope.sourceMessageIds)
    : normalizeIds(turnMeta.sourceMessageIds);
  const messageId = trim(message?.id);
  if (sourceMessageIds.length && messageId && !sourceMessageIds.includes(messageId)) {
    return { ok: false, reason: 'message_not_in_turn' };
  }
  const sourceText = typeof envelope.text === 'string' ? envelope.text : '';
  if (!sourceText.length) {
    return { ok: false, reason: 'source_unavailable' };
  }
  return {
    ok: true,
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.socialTurnRaw,
    sourceText,
    sourceSessionId: turnMeta.sourceSessionId,
    targetSessionId: trim(sessionId),
    targetSessionIds: normalizeIds(envelope.targetSessionIds),
    turnId: turnMeta.turnId,
    sourceMessageIds: sourceMessageIds.length ? sourceMessageIds : (messageId ? [messageId] : []),
    anchorMessage: message,
  };
};

const getCreativeTargetDescriptor = ({
  message = null,
  sessionId = '',
  getMessages = null,
} = {}) => {
  if (!isCompletedAssistantMessage(message)) {
    return { ok: false, reason: 'assistant_message_required' };
  }
  const messages = resolveMessages(getMessages, sessionId);
  const latest = findLatestCompletedAssistant(messages);
  if (!latest || trim(latest.id) !== trim(message.id)) {
    return { ok: false, reason: 'not_latest_turn' };
  }
  return {
    ok: true,
    sourceKind: FORMAT_REPAIR_SOURCE_KINDS.creativeRawOriginal,
    sourceSessionId: trim(sessionId),
    targetSessionId: trim(sessionId),
    turnId: getMessageFormatRepairTurnMeta(message)?.turnId ||
      `creative:${trim(sessionId)}:${trim(message.id)}`,
    sourceMessageIds: trim(message.id) ? [trim(message.id)] : [],
    anchorMessage: message,
  };
};

export const canCheckLatestFormatRepairTarget = ({
  message = null,
  sessionId = '',
  uiMode = '',
  getMessages = null,
  getLastRawResponseEnvelope = null,
} = {}) => {
  if (isCreativeTarget({ uiMode, sessionId, message })) {
    return getCreativeTargetDescriptor({ message, sessionId, getMessages }).ok;
  }
  return getSocialTargetDescriptor({ message, sessionId, getLastRawResponseEnvelope }).ok;
};

export const resolveLatestFormatRepairTarget = async ({
  message = null,
  sessionId = '',
  uiMode = '',
  getMessages = null,
  getLastRawResponseEnvelope = null,
  loadRawOriginal = null,
  resolveCreativeRawOriginal = null,
} = {}) => {
  if (!isCreativeTarget({ uiMode, sessionId, message })) {
    return getSocialTargetDescriptor({ message, sessionId, getLastRawResponseEnvelope });
  }
  const descriptor = getCreativeTargetDescriptor({ message, sessionId, getMessages });
  if (!descriptor.ok) return descriptor;
  let sourceText = '';
  if (typeof resolveCreativeRawOriginal === 'function') {
    try {
      sourceText = await resolveCreativeRawOriginal(message, sessionId);
    } catch {
      sourceText = '';
    }
  } else if (typeof message?.rawOriginal === 'string' && message.rawOriginal.length) {
    sourceText = message.rawOriginal;
  } else if (typeof loadRawOriginal === 'function') {
    try {
      sourceText = await loadRawOriginal(message, sessionId);
    } catch {
      sourceText = '';
    }
  }
  if (typeof sourceText !== 'string' || !sourceText.length) {
    return { ok: false, reason: 'source_unavailable' };
  }
  return {
    ...descriptor,
    sourceText,
  };
};
