import {
  normalizeLifecycleTraceDetails,
  normalizeLifecycleTraceText,
} from './lifecycle-trace-utils.js';

const normalizeObject = (value) => (value && typeof value === 'object' ? value : null);
const noop = () => {};

const callSafely = (fn, ...args) => {
  if (typeof fn !== 'function') return undefined;
  try {
    return fn(...args);
  } catch {
    return undefined;
  }
};

const hasPartialContent = (partial = null) => Boolean(String(partial?.content || '').trim());

export const buildGenerationCancelTraceEvent = ({
  sessionId = '',
  generationId,
  reason = 'user',
  status = 'info',
  hasPartial,
} = {}) => {
  const normalizedStatus = normalizeLifecycleTraceText(status, 'info');
  const details = {
    generationId,
    reason: normalizeLifecycleTraceText(reason, ''),
  };
  if (hasPartial !== undefined) details.hasPartial = Boolean(hasPartial);
  return {
    phase: 'generation.cancel',
    sessionId: normalizeLifecycleTraceText(sessionId, ''),
    status: normalizedStatus,
    summary: normalizedStatus === 'success'
      ? 'generation cancel completed'
      : (normalizedStatus === 'started' ? 'generation cancel requested' : 'generation cancel event'),
    details: normalizeLifecycleTraceDetails(details),
  };
};

export const createActiveGenerationRecord = ({
  id = 0,
  sessionId = '',
  userMsgId = null,
  partialCommitHandler = null,
  swipeTarget = null,
} = {}) => ({
  id,
  sessionId,
  userMsgId,
  streamCtrl: null,
  streamText: '',
  streamPayload: null,
  streamMeta: null,
  reattachStream: null,
  partialCommitHandler,
  swipeTarget,
  cancelled: false,
});

export const buildCancelledAssistantPartial = ({
  generation = null,
  assistantAvatar = '',
  fallbackTime = '',
} = {}) => {
  const currentGeneration = normalizeObject(generation);
  const rawText = String(currentGeneration?.streamText || '');
  if (!rawText.trim()) return null;

  const meta = normalizeObject(currentGeneration?.streamMeta) || {};
  return {
    role: 'assistant',
    type: 'text',
    id: meta.id || currentGeneration?.streamCtrl?.id,
    name: meta.name || '助手',
    avatar: meta.avatar || assistantAvatar,
    time: meta.time || fallbackTime,
    content: rawText,
    raw: rawText,
    rawOriginal: rawText,
    meta: {
      partial: true,
      cancelled: true,
    },
  };
};

export const buildCancelledAssistantPartialMessage = ({
  partial = null,
  assistantAvatar = '',
  fallbackTime = '',
} = {}) => {
  const source = normalizeObject(partial);
  const content = String(source?.content || '');
  if (!content.trim()) return null;
  const raw = typeof source?.raw === 'string' ? source.raw : content;
  const rawOriginal = typeof source?.rawOriginal === 'string'
    ? source.rawOriginal
    : raw;
  return {
    role: 'assistant',
    type: 'text',
    id: String(source?.id || '').trim() || undefined,
    name: source?.name || '助手',
    avatar: source?.avatar || assistantAvatar,
    time: source?.time || fallbackTime,
    content,
    raw,
    rawOriginal,
    meta: {
      ...(normalizeObject(source?.meta) || {}),
      partial: true,
      cancelled: true,
    },
  };
};

export const commitCancelledGenerationPartial = ({
  generation = null,
  partial = null,
  reason = 'user',
  chatStore = null,
  logger = null,
  getAssistantAvatarForSession = () => '',
  formatNowTime = () => '',
  refreshChatAndContacts = () => {},
} = {}) => {
  if (reason !== 'user') {
    return {
      attempted: false,
      sessionId: '',
      messageId: '',
      hasContent: false,
      handledPartial: false,
      appended: false,
      skippedExisting: false,
    };
  }
  const currentGeneration = normalizeObject(generation);
  const sessionId = String(currentGeneration?.sessionId || '').trim();
  const content = String(partial?.content || '').trim();
  const messageId = String(partial?.id || '').trim();
  let handledPartial = false;

  const partialCommitHandler =
    typeof currentGeneration?.partialCommitHandler === 'function'
      ? currentGeneration.partialCommitHandler
      : null;
  if (sessionId && content && partialCommitHandler) {
    try {
      handledPartial = partialCommitHandler(partial) === true;
    } catch (err) {
      logger?.warn?.('assistant partial commit failed', err);
    }
  }

  const swipeTarget = normalizeObject(currentGeneration?.swipeTarget);
  if (sessionId && content && typeof swipeTarget?.onPartial === 'function') {
    try {
      handledPartial = swipeTarget.onPartial(partial) === true;
    } catch (err) {
      logger?.warn?.('swipe partial commit failed', err);
    }
  }

  let appended = false;
  let skippedExisting = false;
  if (sessionId && content && !handledPartial) {
    const exists = messageId ? Boolean(chatStore?.findMessage?.(messageId, sessionId)) : false;
    if (exists) {
      skippedExisting = true;
    } else {
      const partialMessage = buildCancelledAssistantPartialMessage({
        partial,
        assistantAvatar: getAssistantAvatarForSession(sessionId),
        fallbackTime: formatNowTime(),
      });
      if (partialMessage) {
        chatStore?.appendMessage?.(partialMessage, sessionId);
        appended = true;
      }
      refreshChatAndContacts();
    }
  }

  return {
    attempted: true,
    sessionId,
    messageId,
    hasContent: Boolean(content),
    handledPartial,
    appended,
    skippedExisting,
  };
};

export const runActiveGenerationCancelFlow = ({
  generation = null,
  reason = 'user',
  recordTraceEvent = noop,
  abortMemoryUpdate = noop,
  cancelCurrentGeneration = noop,
  chatStore = null,
  logger = null,
  getAssistantAvatarForSession = () => '',
  formatNowTime = () => '',
  refreshChatAndContacts = noop,
  hideTyping = noop,
  setStreamingState = noop,
  setSendingState = noop,
} = {}) => {
  const currentGeneration = normalizeObject(generation);
  if (!currentGeneration || currentGeneration.cancelled) {
    return {
      cancelled: false,
      generation: currentGeneration,
      partial: null,
      commitResult: null,
      sessionId: '',
      hasPartial: false,
    };
  }

  callSafely(recordTraceEvent, buildGenerationCancelTraceEvent({
    sessionId: currentGeneration.sessionId,
    generationId: currentGeneration.id,
    reason,
    status: 'started',
  }));

  try {
    currentGeneration.cancelled = true;
  } catch {}

  const sessionId = String(currentGeneration.sessionId || '').trim();
  if (sessionId) callSafely(abortMemoryUpdate, sessionId);
  callSafely(cancelCurrentGeneration, reason);

  let partial = null;
  try {
    partial = currentGeneration.streamCtrl?.cancel?.({ keepPartial: reason === 'user' }) || null;
  } catch {}

  if (!partial && reason === 'user') {
    partial = buildCancelledAssistantPartial({
      generation: currentGeneration,
      assistantAvatar: getAssistantAvatarForSession(currentGeneration.sessionId),
      fallbackTime: formatNowTime(),
    });
  }

  let commitResult = null;
  if (reason === 'user') {
    try {
      commitResult = commitCancelledGenerationPartial({
        generation: currentGeneration,
        partial,
        reason,
        chatStore,
        logger,
        getAssistantAvatarForSession,
        formatNowTime,
        refreshChatAndContacts,
      });
    } catch {}
  }

  callSafely(recordTraceEvent, buildGenerationCancelTraceEvent({
    sessionId: currentGeneration.sessionId,
    generationId: currentGeneration.id,
    reason,
    status: 'success',
    hasPartial: hasPartialContent(partial),
  }));

  callSafely(hideTyping);
  callSafely(setStreamingState, false);
  callSafely(setSendingState, false);

  return {
    cancelled: true,
    generation: currentGeneration,
    partial,
    commitResult,
    sessionId,
    hasPartial: hasPartialContent(partial),
  };
};
