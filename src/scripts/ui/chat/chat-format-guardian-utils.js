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

const compactWhitespace = value => String(value ?? '').trim().replace(/\s+/g, ' ');

const truncatePreview = (value = '', maxLength = 240) => {
  const text = String(value ?? '').trim();
  const limit = Math.max(20, Math.trunc(Number(maxLength) || 240));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

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

const normalizeRepairTime = value => {
  const text = trim(value);
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return '';
  const hour = Math.min(Math.max(0, Number(match[1]) || 0), 23);
  const minute = Math.min(Math.max(0, Number(match[2]) || 0), 59);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

const serializeProtocolContent = value => (
  trim(value)
    .replace(/\n+/g, '<br>')
    .replace(/\s*<br>\s*/gi, '<br>')
);

const buildProtocolLine = (event = {}, fallbackTime = '') => {
  const speaker = trim(event?.speakerName);
  const content = serializeProtocolContent(event?.content);
  const time = normalizeRepairTime(event?.time) || fallbackTime;
  if (!speaker || !content || !time) return '';
  return `${speaker}--${content}--${time}`;
};

const getEventGroupKey = event => [
  trim(event?.metadata?.protocolType),
  trim(event?.metadata?.tagName),
  trim(event?.targetName),
  trim(event?.targetId),
].join('\u0000');

const groupEventsByProtocolBlock = (events = []) => {
  const groups = [];
  const byKey = new Map();
  list(events).forEach((event) => {
    const key = getEventGroupKey(event);
    if (!byKey.has(key)) {
      const group = { key, events: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    byKey.get(key).events.push(event);
  });
  return groups;
};

const buildPrivateRepairBlock = (events = [], fallbackTime = '') => {
  const first = events[0] || {};
  const tagName = trim(first?.metadata?.tagName) || (trim(first?.targetName) ? `我和${trim(first.targetName)}的私聊` : '');
  if (!tagName) return '';
  const lines = events.map(event => buildProtocolLine(event, fallbackTime)).filter(Boolean);
  if (!lines.length) return '';
  return [`<${tagName}>`, ...lines, `</${tagName}>`].join('\n');
};

const buildGroupRepairBlock = (events = [], fallbackTime = '') => {
  const first = events[0] || {};
  const tagName = trim(first?.metadata?.tagName) || (trim(first?.targetName) ? `群聊:${trim(first.targetName)}` : '');
  if (!tagName) return '';
  const members = normalizeStringList(first?.metadata?.members);
  const lines = events.map(event => buildProtocolLine(event, fallbackTime)).filter(Boolean);
  if (!lines.length) return '';
  return [
    `<${tagName}>`,
    ...(members.length ? [`<成员>${members.join(',')}</成员>`] : []),
    '<聊天内容>',
    ...lines,
    '</聊天内容>',
    `</${tagName}>`,
  ].join('\n');
};

export const buildChatFormatRepairCandidate = (result = {}, {
  fallbackTime = '',
  maxPreviewLength = 240,
} = {}) => {
  const events = list(result?.eventDrafts).map(normalizeChatFormatEventDraft);
  const errors = normalizeStringList(result?.errors);
  const warnings = normalizeStringList(result?.warnings);
  if (!events.length || !warnings.length) {
    return { available: false, reason: 'no_repair_needed' };
  }
  if (errors.length) {
    return { available: false, reason: 'has_errors', errors, warnings };
  }
  if (warnings.some(warning => warning !== 'time is missing')) {
    return { available: false, reason: 'unsupported_warnings', errors, warnings };
  }
  if (events.some(event => event.surface !== CHAT_SURFACE)) {
    return { available: false, reason: 'unsupported_surface', errors, warnings };
  }
  if (events.some(event => !trim(event?.speakerName) || !trim(event?.content))) {
    return { available: false, reason: 'missing_speaker_or_content', errors, warnings };
  }

  const repairedTime = normalizeRepairTime(fallbackTime) || '00:00';
  const blocks = groupEventsByProtocolBlock(events)
    .map((group) => {
      const protocolType = trim(group.events[0]?.metadata?.protocolType);
      if (protocolType === 'private_chat') return buildPrivateRepairBlock(group.events, repairedTime);
      if (protocolType === 'group_chat') return buildGroupRepairBlock(group.events, repairedTime);
      return '';
    })
    .filter(Boolean);
  const replacementText = blocks.join('\n\n').trim();
  if (!replacementText) {
    return { available: false, reason: 'empty_candidate', errors, warnings };
  }
  return {
    available: true,
    kind: 'fill_missing_time',
    summary: `补齐 ${warnings.length} 处缺失时间`,
    replacementText,
    preview: truncatePreview(replacementText, maxPreviewLength),
    fallbackTime: repairedTime,
    fixedWarnings: Array.from(new Set(warnings)),
    eventCount: events.length,
    issueCount: warnings.length,
    title: '补齐聊天时间字段',
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
    textPreview: truncatePreview(compactWhitespace(text), 180),
  };
};
