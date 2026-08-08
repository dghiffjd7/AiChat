import {
  prepareAutoImagePromptPlaceholders,
  protectUnclosedAutoImagePromptTags,
  restoreProtectedAutoImagePromptTags,
  stripAutoImagePromptTags,
} from './auto-image-prompt-utils.js';
import { hideCreativeContentTagsForDisplay } from './creative-content-display-utils.js';
import { normalizeAgentUsage } from '../../agent/agent-events.js';
import { normalizeWebSources } from '../../api/web-search-runtime.js';

// Phase B 主任务计量：把本次回复的真实 provider usage 归一化后挂到消息 meta.usage。
// 复用 AgentRun 的 usage 契约（token 不可得 → status:unknown，不估算）；主任务无工具调用故 toolCallCount 恒 0。
export const buildAssistantReplyUsage = (usage) => {
  if (!usage || typeof usage !== 'object') return null;
  return normalizeAgentUsage({ ...usage, toolCallCount: 0 });
};

export const buildAssistantReplySources = (sources) => {
  const normalized = normalizeWebSources(sources || []);
  return normalized.length
    ? normalized.map(source => ({
        url: source.url,
        title: source.title,
        ...(source.snippet ? { snippet: source.snippet } : {}),
        ...(source.provider ? { provider: source.provider } : {}),
      }))
    : null;
};

export const applyChatModeAssistantRegex = (
  text,
  {
    depth = 0,
    promptUserName = '',
    sanitizeAssistantReplyText = value => String(value ?? ''),
    extractReasoningFromContent = value => ({
      content: String(value ?? ''),
      reasoning: '',
      reasoningDisplay: '',
    }),
    applyStoredRegex = value => String(value ?? ''),
    applyDisplayRegex = value => String(value ?? ''),
  } = {},
) => {
  const cleaned = sanitizeAssistantReplyText(text, promptUserName);
  const reasoningParsed = extractReasoningFromContent(cleaned, { depth, strict: true });
  const finalSource = String(reasoningParsed.content || '');
  let stored = finalSource;
  let display = finalSource;
  try {
    stored = applyStoredRegex(finalSource, { depth });
    display = applyDisplayRegex(stored, { depth });
  } catch {}
  return { cleaned, reasoningParsed, finalSource, stored, display };
};

export const buildAssistantMessageFromText = async (
  rawText,
  {
    sessionId = '',
    time = '',
    name = '',
    avatar = '',
    showName = false,
    depth = 0,
    speakerContactId = '',
    promptUserName = '',
    isGroupChat = false,
    maybePromptTemplateGate = null,
    skipTemplate = false,
    shouldRunTemplate = null,
    getTemplateInjections = null,
    renderTemplateText = null,
    applyChatModeAssistantRegex = null,
    parseSpecialMessage = null,
    getSessionContact = null,
    getContactById = null,
    resolveGroupSpeakerAvatar = null,
    resolveContactAvatar = null,
    getAssistantAvatarForSession = null,
    logger = null,
    templateContext = null,
    templateInjectionContext = null,
    usage = null,
    sources = null,
  } = {},
) => {
  const sessionKey = String(sessionId || '').trim();
  let displayText = String(rawText ?? '');
  let templateVars = null;

  if (typeof maybePromptTemplateGate === 'function') {
    await maybePromptTemplateGate({ sampleText: displayText });
  }

  const templateMeta = skipTemplate ? { templateEnabled: false } : undefined;
  const templateAllowed =
    typeof shouldRunTemplate === 'function'
      ? shouldRunTemplate({
        sessionId: sessionKey,
        meta: templateMeta,
        templateContext,
      }) === true
      : false;

  if (templateAllowed) {
    try {
      const inject =
        typeof getTemplateInjections === 'function'
          ? await getTemplateInjections({
            sessionId: sessionKey,
            content: displayText,
            templateInjectionContext,
          })
          : null;
      const before = Array.isArray(inject?.before) ? inject.before.filter(Boolean).join('\n\n') : '';
      const after = Array.isArray(inject?.after) ? inject.after.filter(Boolean).join('\n\n') : '';
      if (before) displayText = `${before}\n\n${displayText}`;
      if (after) displayText = `${displayText}\n\n${after}`;
    } catch (err) {
      logger?.warn?.('template render injection failed', err);
    }

    try {
      const res =
        typeof renderTemplateText === 'function'
          ? await renderTemplateText(displayText, {
            sessionId: sessionKey,
            meta: templateMeta,
            templateContext,
          })
          : null;
      if (res && !res.error) {
        displayText = res.text;
        if (res.messageVars && Object.keys(res.messageVars).length) {
          templateVars = res.messageVars;
        }
      }
    } catch (err) {
      logger?.warn?.('template render (message) failed', err);
    }
  }

  const regexResult =
    typeof applyChatModeAssistantRegex === 'function'
      ? applyChatModeAssistantRegex(displayText, { depth })
      : {
        reasoningParsed: { content: displayText, reasoning: '', reasoningDisplay: '' },
        finalSource: displayText,
        stored: displayText,
        display: displayText,
      };
  const { reasoningParsed, finalSource, stored, display } = regexResult;
  const parsed =
    typeof parseSpecialMessage === 'function'
      ? parseSpecialMessage(display)
      : { type: 'text', content: display, meta: {} };
  const meta = { ...(parsed.meta || {}) };

  const resolvedSpeakerContactId = String(speakerContactId || '').trim();
  const sessionContact = typeof getSessionContact === 'function' ? getSessionContact(sessionKey) : null;
  const isGroupSession = sessionKey.startsWith('group:') || Boolean(sessionContact?.isGroup) || Boolean(isGroupChat);
  const resolvedSpeakerName = String(name || '').trim();
  if (showName) meta.showName = true;
  if (resolvedSpeakerContactId) meta.speakerContactId = resolvedSpeakerContactId;
  if (templateVars) meta.templateVars = templateVars;
  if (reasoningParsed.reasoning) {
    meta.reasoning = reasoningParsed.reasoning;
    meta.reasoningDisplay = reasoningParsed.reasoningDisplay;
  }
  const replyUsage = buildAssistantReplyUsage(usage);
  if (replyUsage) meta.usage = replyUsage;
  const replySources = buildAssistantReplySources(sources);
  if (replySources) meta.sources = replySources;

  let resolvedAvatar = '';
  if (isGroupSession && resolvedSpeakerName && typeof resolveGroupSpeakerAvatar === 'function') {
    resolvedAvatar = resolveGroupSpeakerAvatar({
      speakerName: resolvedSpeakerName,
      sessionId: sessionKey,
      speakerContactId: resolvedSpeakerContactId,
    }) || '';
  }
  if (resolvedSpeakerContactId && typeof getContactById === 'function' && typeof resolveContactAvatar === 'function') {
    const speakerContact = getContactById(resolvedSpeakerContactId);
    if (speakerContact && speakerContact.isGroup !== true) {
      resolvedAvatar = resolveContactAvatar(resolvedSpeakerContactId, speakerContact) || resolvedAvatar;
    }
  }
  if (!resolvedAvatar && (!isGroupSession || !resolvedSpeakerName) && typeof avatar === 'string' && avatar.trim()) {
    resolvedAvatar = avatar.trim();
  }
  if (!resolvedAvatar && (!isGroupSession || !resolvedSpeakerName) && typeof getAssistantAvatarForSession === 'function') {
    resolvedAvatar = getAssistantAvatarForSession(sessionKey) || '';
  }

  const next = {
    role: 'assistant',
    ...parsed,
    name: name || '助手',
    avatar: resolvedAvatar,
    sessionId: sessionKey,
    time: time || '',
  };
  const rawValue = String(rawText ?? '');
  if (rawValue) next.rawOriginal = rawValue;
  if (finalSource && finalSource !== rawValue) next.rawSource = finalSource;
  if (stored) next.raw = stored;
  if (Object.keys(meta).length) next.meta = meta;
  return next;
};

export const buildCreativeAssistantMessageParts = ({
  text = '',
  nativeReasoningState = null,
  normalizeCreativeLineBreaks = value => String(value ?? ''),
  extractReasoningFromContent = value => ({
    content: String(value ?? ''),
    reasoning: '',
    reasoningDisplay: '',
  }),
  resolveReasoningState = reasoningParsed => reasoningParsed,
  applyOutputRegexPairSafe = value => ({ stored: String(value ?? ''), display: String(value ?? '') }),
  appBridge = null,
  preserveAutoImagePromptPlaceholders = false,
  autoImagePromptPlaceholderOptions = {},
} = {}) => {
  const rawSource = normalizeCreativeLineBreaks(text);
  const reasoningParsed = extractReasoningFromContent(rawSource, { depth: 0, strict: true });
  const resolvedReasoning = nativeReasoningState
    ? resolveReasoningState(reasoningParsed, nativeReasoningState, { finalize: true })
    : reasoningParsed;
  const rawFinalSource = normalizeCreativeLineBreaks(reasoningParsed.content || '');
  const autoImagePrepared = preserveAutoImagePromptPlaceholders
    ? prepareAutoImagePromptPlaceholders(rawFinalSource, autoImagePromptPlaceholderOptions)
    : { text: stripAutoImagePromptTags(rawFinalSource), prompts: [] };
  const finalSource = autoImagePrepared.text;
  const protectedFinalSource = protectUnclosedAutoImagePromptTags(finalSource);
  const regexResult = applyOutputRegexPairSafe(protectedFinalSource.text, {
    appBridge,
    depth: 0,
    normalizeText: normalizeCreativeLineBreaks,
  }) || {};
  return {
    rawSource,
    autoImagePromptRawContent: rawFinalSource,
    autoImagePromptPlaceholders: autoImagePrepared.prompts,
    reasoningParsed,
    resolvedReasoning,
    finalSource,
    stored: restoreProtectedAutoImagePromptTags(regexResult.stored, protectedFinalSource),
    display: hideCreativeContentTagsForDisplay(
      restoreProtectedAutoImagePromptTags(regexResult.display, protectedFinalSource),
    ),
  };
};

export const buildCreativeAssistantMessageFromParts = async ({
  parts = null,
  rawOriginal = '',
  sessionId = '',
  id = undefined,
  includeId = false,
  avatar = '',
  time = '',
  formatTime = null,
  summary = '',
  isRpMode = false,
  isGroupChat = false,
  captureAssistantMemoryState = null,
  attachAssistantMemoryStateToMeta = meta => meta,
  usage = null,
  sources = null,
} = {}) => {
  const nextParts = parts && typeof parts === 'object' ? parts : {};
  const resolvedReasoning = nextParts.resolvedReasoning || {};
  const memoryState =
    isRpMode && typeof captureAssistantMemoryState === 'function'
      ? await captureAssistantMemoryState(sessionId, { isGroup: isGroupChat })
      : null;
  const meta = (
    typeof attachAssistantMemoryStateToMeta === 'function'
      ? attachAssistantMemoryStateToMeta({ renderRich: true }, memoryState)
      : { renderRich: true }
  ) || { renderRich: true };
  if (summary) meta.summary = summary;
  if (nextParts.autoImagePromptRawContent && Array.isArray(nextParts.autoImagePromptPlaceholders) && nextParts.autoImagePromptPlaceholders.length) {
    meta.autoImagePromptRawContent = nextParts.autoImagePromptRawContent;
    meta.autoImagePromptPlaceholders = nextParts.autoImagePromptPlaceholders.map(item => ({
      prompt: String(item?.prompt || '').trim(),
      pendingToken: String(item?.pendingToken || '').trim(),
      tag: String(item?.tag || '').trim(),
    })).filter(item => item.prompt && item.pendingToken);
  }
  if (resolvedReasoning.reasoning) {
    meta.reasoning = resolvedReasoning.reasoning;
    meta.reasoningDisplay = resolvedReasoning.reasoningDisplay;
    if (resolvedReasoning.reasoningHidden) meta.reasoningHidden = true;
    if (resolvedReasoning.reasoningLabel) meta.reasoningLabel = resolvedReasoning.reasoningLabel;
    if (resolvedReasoning.reasoningSource) meta.reasoningSource = resolvedReasoning.reasoningSource;
  }
  const replyUsage = buildAssistantReplyUsage(usage);
  if (replyUsage) meta.usage = replyUsage;
  const replySources = buildAssistantReplySources(sources);
  if (replySources) meta.sources = replySources;
  const resolvedTime = time || (typeof formatTime === 'function' ? formatTime() : '');

  const message = {
    role: 'assistant',
    type: 'text',
    name: '助手',
    avatar,
    time: resolvedTime,
    sessionId,
    rawOriginal,
    rawSource: nextParts.finalSource,
    raw: nextParts.stored,
    content: nextParts.display,
    meta,
  };
  if (includeId) message.id = id;
  return message;
};

export const buildCreativeAssistantMessage = async (options = {}) => {
  const parts = buildCreativeAssistantMessageParts(options);
  return buildCreativeAssistantMessageFromParts({ ...options, parts });
};

export const buildChatModeAssistantMessageParts = ({
  text = '',
  nativeReasoningState = null,
  applyChatModeAssistantRegex = value => ({
    reasoningParsed: {
      content: String(value ?? ''),
      reasoning: '',
      reasoningDisplay: '',
    },
    finalSource: String(value ?? ''),
    stored: String(value ?? ''),
    display: String(value ?? ''),
  }),
  resolveReasoningState = reasoningParsed => reasoningParsed,
} = {}) => {
  const regexResult = applyChatModeAssistantRegex(text, { depth: 0 }) || {};
  const reasoningParsed = regexResult.reasoningParsed || {};
  const resolvedReasoning = nativeReasoningState
    ? resolveReasoningState(reasoningParsed, nativeReasoningState, { finalize: true })
    : reasoningParsed;
  return {
    reasoningParsed,
    resolvedReasoning,
    finalSource: regexResult.finalSource,
    stored: regexResult.stored,
    display: regexResult.display,
  };
};

export const buildChatModeAssistantMessageFromParts = ({
  parts = null,
  rawOriginal = '',
  id = undefined,
  includeId = false,
  avatar = '',
  time = '',
  formatTime = null,
  parseSpecialMessage = value => ({ type: 'text', content: String(value ?? ''), meta: {} }),
  usage = null,
  sources = null,
} = {}) => {
  const nextParts = parts && typeof parts === 'object' ? parts : {};
  const resolvedReasoning = nextParts.resolvedReasoning || {};
  const meta = {};
  if (resolvedReasoning.reasoning) {
    meta.reasoning = resolvedReasoning.reasoning;
    meta.reasoningDisplay = resolvedReasoning.reasoningDisplay;
    if (resolvedReasoning.reasoningHidden) meta.reasoningHidden = true;
    if (resolvedReasoning.reasoningLabel) meta.reasoningLabel = resolvedReasoning.reasoningLabel;
    if (resolvedReasoning.reasoningSource) meta.reasoningSource = resolvedReasoning.reasoningSource;
  }
  const replyUsage = buildAssistantReplyUsage(usage);
  if (replyUsage) meta.usage = replyUsage;
  const replySources = buildAssistantReplySources(sources);
  if (replySources) meta.sources = replySources;
  const message = {
    role: 'assistant',
    name: '助手',
    avatar,
    time: time || (typeof formatTime === 'function' ? formatTime() : ''),
    rawOriginal,
    rawSource: nextParts.finalSource || undefined,
    raw: nextParts.stored,
    ...parseSpecialMessage(nextParts.display),
    meta: Object.keys(meta).length ? meta : undefined,
  };
  if (includeId) message.id = id;
  return message;
};

export const buildChatModeAssistantMessage = (options = {}) => {
  const parts = buildChatModeAssistantMessageParts(options);
  return buildChatModeAssistantMessageFromParts({ ...options, parts });
};
