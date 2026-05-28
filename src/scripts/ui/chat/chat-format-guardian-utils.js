import { DialogueStreamParser } from './dialogue-stream-parser.js';

export const CHAT_FORMAT_EVENT_TYPES = Object.freeze({
  privateMessage: 'private_message',
  groupMessage: 'group_message',
  groupSystemEvent: 'group_system_event',
  momentComment: 'moment_comment',
  momentPost: 'moment_post',
});

const CHAT_SURFACE = 'chat';
const MOMENTS_SURFACE = 'moments';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : [value]).filter(item => item !== null && item !== undefined);

const normalizeConfidence = (value, fallback = 0.75) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(1, numeric));
};

const normalizeAttachments = value => (Array.isArray(value) ? value : []).filter(Boolean);

const normalizeStringList = value => list(value)
  .map(item => trim(item))
  .filter(Boolean);

const inferSurface = (type = '') => (
  type === CHAT_FORMAT_EVENT_TYPES.momentComment || type === CHAT_FORMAT_EVENT_TYPES.momentPost
    ? MOMENTS_SURFACE
    : CHAT_SURFACE
);

const normalizeChatFormatEventType = value => (
  Object.values(CHAT_FORMAT_EVENT_TYPES).includes(value)
    ? value
    : ''
);

export const normalizeChatFormatEventDraft = (event = {}) => {
  const src = isPlainObject(event) ? event : {};
  const type = normalizeChatFormatEventType(trim(src.type));
  const warnings = normalizeStringList(src.warnings);
  return {
    type,
    surface: trim(src.surface, inferSurface(type)),
    targetId: trim(src.targetId),
    targetName: trim(src.targetName),
    speakerId: trim(src.speakerId),
    speakerName: trim(src.speakerName),
    content: trim(src.content),
    time: trim(src.time),
    attachments: normalizeAttachments(src.attachments),
    sourceMessageId: trim(src.sourceMessageId),
    confidence: normalizeConfidence(src.confidence),
    warnings,
    metadata: isPlainObject(src.metadata) ? { ...src.metadata } : {},
  };
};

const isSystemSpeaker = (speaker = '', options = {}) => {
  if (typeof options.isSystemSpeaker === 'function') return options.isSystemSpeaker(speaker) === true;
  return ['系统', 'system', '系统消息'].includes(trim(speaker).toLowerCase()) ||
    trim(speaker).startsWith('系统');
};

const resolveTargetId = (name = '', resolver = null) => {
  if (typeof resolver !== 'function') return '';
  try {
    return trim(resolver(name));
  } catch {
    return '';
  }
};

const resolveSpeakerId = (name = '', resolver = null, targetId = '') => {
  if (typeof resolver !== 'function') return '';
  try {
    return trim(resolver(name, targetId));
  } catch {
    return '';
  }
};

const buildPrivateMessageDrafts = (event = {}, options = {}) => {
  const targetName = trim(event.otherName);
  const targetId = resolveTargetId(targetName, options.resolvePrivateTargetId);
  return list(event.messages).map(message => normalizeChatFormatEventDraft({
    type: CHAT_FORMAT_EVENT_TYPES.privateMessage,
    surface: CHAT_SURFACE,
    targetId,
    targetName,
    speakerId: resolveSpeakerId(message?.speaker, options.resolveSpeakerId, targetId),
    speakerName: trim(message?.speaker),
    content: message?.content,
    time: message?.time,
    sourceMessageId: options.sourceMessageId,
    confidence: targetName ? 0.86 : 0.62,
    metadata: {
      protocolType: 'private_chat',
      tagName: trim(event.tagName),
    },
  }));
};

const buildGroupMessageDrafts = (event = {}, options = {}) => {
  const targetName = trim(event.groupName);
  const targetId = resolveTargetId(targetName, options.resolveGroupTargetId);
  return list(event.messages).map((message) => {
    const speakerName = trim(message?.speaker);
    const system = isSystemSpeaker(speakerName, options);
    return normalizeChatFormatEventDraft({
      type: system ? CHAT_FORMAT_EVENT_TYPES.groupSystemEvent : CHAT_FORMAT_EVENT_TYPES.groupMessage,
      surface: CHAT_SURFACE,
      targetId,
      targetName,
      speakerId: system ? '' : resolveSpeakerId(speakerName, options.resolveSpeakerId, targetId),
      speakerName,
      content: message?.content,
      time: message?.time,
      sourceMessageId: options.sourceMessageId,
      confidence: targetName ? 0.88 : 0.62,
      metadata: {
        protocolType: 'group_chat',
        tagName: trim(event.tagName),
        members: normalizeStringList(event.members),
      },
    });
  });
};

const buildMomentPostDrafts = (event = {}, options = {}) => list(event.moments).map(moment => normalizeChatFormatEventDraft({
  type: CHAT_FORMAT_EVENT_TYPES.momentPost,
  surface: MOMENTS_SURFACE,
  targetId: trim(moment?.id),
  targetName: trim(moment?.author),
  speakerName: trim(moment?.author),
  content: moment?.content,
  time: moment?.time,
  sourceMessageId: options.sourceMessageId,
  confidence: trim(moment?.author) ? 0.82 : 0.66,
  metadata: {
    protocolType: 'moments',
    views: Number(moment?.views || 0) || 0,
    likes: Number(moment?.likes || 0) || 0,
    comments: Array.isArray(moment?.comments) ? moment.comments.slice() : [],
  },
}));

const buildMomentReplyDrafts = (event = {}, options = {}) => list(event.comments).map(comment => normalizeChatFormatEventDraft({
  type: CHAT_FORMAT_EVENT_TYPES.momentComment,
  surface: MOMENTS_SURFACE,
  targetId: trim(event.momentId),
  targetName: trim(comment?.replyToAuthor || comment?.replyTo),
  speakerName: trim(comment?.author),
  content: comment?.content,
  sourceMessageId: options.sourceMessageId,
  confidence: trim(event.momentId) ? 0.84 : 0.68,
  metadata: {
    protocolType: 'moment_reply',
    replyTo: trim(comment?.replyTo),
    replyToAuthor: trim(comment?.replyToAuthor),
  },
}));

export const buildChatFormatEventDraftsFromProtocolEvents = (protocolEvents = [], options = {}) => (
  list(protocolEvents).flatMap((event) => {
    if (event?.type === 'private_chat') return buildPrivateMessageDrafts(event, options);
    if (event?.type === 'group_chat') return buildGroupMessageDrafts(event, options);
    if (event?.type === 'moments') return buildMomentPostDrafts(event, options);
    if (event?.type === 'moment_reply') return buildMomentReplyDrafts(event, options);
    return [];
  })
);

export const validateChatFormatEventDraft = (event = {}) => {
  const draft = normalizeChatFormatEventDraft(event);
  const errors = [];
  const warnings = normalizeStringList(draft.warnings);
  if (!draft.type) errors.push('type is required');
  if (!draft.surface) errors.push('surface is required');
  if (draft.surface === CHAT_SURFACE &&
    (draft.type === CHAT_FORMAT_EVENT_TYPES.momentComment || draft.type === CHAT_FORMAT_EVENT_TYPES.momentPost)) {
    errors.push('moment events must use moments surface');
  }
  if (draft.surface === MOMENTS_SURFACE &&
    (draft.type === CHAT_FORMAT_EVENT_TYPES.privateMessage ||
      draft.type === CHAT_FORMAT_EVENT_TYPES.groupMessage ||
      draft.type === CHAT_FORMAT_EVENT_TYPES.groupSystemEvent)) {
    errors.push('chat events must use chat surface');
  }
  if (!draft.content) errors.push('content is required');
  if (!draft.targetId && !draft.targetName) warnings.push('target is unresolved');
  if (!draft.speakerId && !draft.speakerName && draft.type !== CHAT_FORMAT_EVENT_TYPES.groupSystemEvent) {
    warnings.push('speaker is unresolved');
  }
  if (!draft.time && draft.surface === CHAT_SURFACE) warnings.push('time is missing');
  if (draft.confidence < 0.7) warnings.push('low confidence');
  return {
    ok: errors.length === 0,
    commitReady: errors.length === 0 && warnings.length === 0,
    severity: errors.length ? 'error' : (warnings.length ? 'warning' : 'ok'),
    event: {
      ...draft,
      warnings,
    },
    errors,
    warnings,
  };
};

export const validateChatFormatEventDrafts = (events = []) => {
  const items = list(events).map(validateChatFormatEventDraft);
  const errors = items.flatMap(item => item.errors);
  const warnings = items.flatMap(item => item.warnings);
  return {
    ok: errors.length === 0,
    commitReady: items.length > 0 && items.every(item => item.commitReady),
    severity: errors.length ? 'error' : (warnings.length ? 'warning' : 'ok'),
    items,
    errors,
    warnings,
  };
};

export const extractChatFormatEventDrafts = (text = '', options = {}) => {
  const parser = new DialogueStreamParser({
    userName: trim(options.userName, '我'),
    resolveLooseGroupTag: options.resolveLooseGroupTag,
    resolveLoosePrivateTag: options.resolveLoosePrivateTag,
  });
  const protocolEvents = [
    ...parser.push(text),
    ...parser.flush(),
  ];
  const eventDrafts = buildChatFormatEventDraftsFromProtocolEvents(protocolEvents, options);
  const validation = validateChatFormatEventDrafts(eventDrafts);
  const status = !eventDrafts.length
    ? 'no_events'
    : (validation.severity === 'error' ? 'invalid' : (validation.severity === 'warning' ? 'needs_review' : 'ready'));
  return {
    ok: eventDrafts.length > 0 && validation.ok,
    status,
    sourceMessageId: trim(options.sourceMessageId),
    protocolEvents,
    eventDrafts: validation.items.map(item => item.event),
    errors: validation.errors,
    warnings: validation.warnings,
    summary: eventDrafts.length
      ? `${eventDrafts.length} chat format event draft(s), ${validation.errors.length} error(s), ${validation.warnings.length} warning(s)`
      : 'no chat format events detected',
  };
};
