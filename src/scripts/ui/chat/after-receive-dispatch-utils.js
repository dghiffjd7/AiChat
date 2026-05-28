import {
  buildAfterReceiveHookFinishTraceEvent,
  buildAfterReceiveHookStartTraceEvent,
  emitHookLifecycleTrace,
} from './hook-lifecycle-trace-utils.js';
import { mergeAgentMessageParts } from '../../agent/agent-message-parts.js';
import { extractChatFormatEventDrafts } from './chat-format-guardian-utils.js';

const CHAT_FORMAT_GUARDIAN_SOURCE = 'chat-format-guardian';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const list = value => (Array.isArray(value) ? value : []).filter(Boolean);

const toTimestamp = (now = Date.now) => {
  if (typeof now === 'function') {
    const numeric = Number(now());
    return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
  }
  const numeric = Number(now);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : Date.now();
};

const truncate = (value = '', maxLength = 80) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  const limit = Math.max(8, Math.trunc(Number(maxLength) || 80));
  return text.length > limit ? `${text.slice(0, limit - 1)}...` : text;
};

const countBy = (items = [], keyFn = item => item) => {
  const counts = {};
  list(items).forEach((item) => {
    const key = trim(keyFn(item), 'unknown');
    counts[key] = (counts[key] || 0) + 1;
  });
  return counts;
};

const getChatFormatGuardianStatus = (status = '') => {
  if (status === 'invalid') return 'failed';
  if (status === 'needs_review') return 'waiting_permission';
  return 'succeeded';
};

const getChatFormatGuardianTitle = (status = '') => {
  if (status === 'invalid') return '聊天格式错误';
  if (status === 'needs_review') return '聊天格式待确认';
  return '聊天格式已验证';
};

const shouldEmitChatFormatGuardianPart = (result = {}, options = {}) => {
  if (!result || result.status === 'no_events') return false;
  if (result.status === 'ready' && options.showSucceededPreview !== true) return false;
  return true;
};

export const buildChatFormatGuardianMessagePart = ({
  result = null,
  message = {},
  sessionId = '',
  showSucceededPreview = false,
  maxEvents = 5,
  maxIssues = 6,
  now = Date.now,
} = {}) => {
  if (!shouldEmitChatFormatGuardianPart(result, { showSucceededPreview })) return null;
  const events = list(result?.eventDrafts);
  const errors = list(result?.errors).map(item => trim(item)).filter(Boolean);
  const warnings = list(result?.warnings).map(item => trim(item)).filter(Boolean);
  const status = getChatFormatGuardianStatus(result?.status);
  const at = toTimestamp(now);
  const sourceMessageId = trim(result?.sourceMessageId || message?.id || sessionId, 'message');
  const eventCount = events.length;
  const issueCount = errors.length + warnings.length;
  const summary = [
    `${eventCount} event draft${eventCount === 1 ? '' : 's'}`,
    `${errors.length} error${errors.length === 1 ? '' : 's'}`,
    `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`,
  ].join(' · ');
  return {
    id: `chat-format-guardian:${sourceMessageId}`,
    type: 'agent_status',
    source: CHAT_FORMAT_GUARDIAN_SOURCE,
    kind: 'chat_format.validate',
    status,
    title: getChatFormatGuardianTitle(result?.status),
    summary: result?.summary || summary,
    createdAt: at,
    updatedAt: at,
    errorMessage: status === 'failed' ? trim(errors[0]) : '',
    metadata: {
      sessionId: trim(sessionId),
      sourceMessageId,
      status: trim(result?.status),
      eventCount,
      issueCount,
      countsByType: countBy(events, event => event?.type),
      commitReady: result?.status === 'ready',
      errors: errors.slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 6))),
      warnings: warnings.slice(0, Math.max(0, Math.trunc(Number(maxIssues) || 6))),
      events: events
        .slice(0, Math.max(0, Math.trunc(Number(maxEvents) || 5)))
        .map(event => ({
          type: trim(event?.type),
          surface: trim(event?.surface),
          targetId: trim(event?.targetId),
          targetName: trim(event?.targetName),
          speakerId: trim(event?.speakerId),
          speakerName: trim(event?.speakerName),
          time: trim(event?.time),
          contentPreview: truncate(event?.content, 96),
          commitReady: list(event?.warnings).length === 0,
          warnings: list(event?.warnings).map(item => trim(item)).filter(Boolean).slice(0, 4),
        })),
    },
  };
};

export const buildChatFormatGuardianPreviewMessage = (message = {}, part = null) => {
  if (!message || typeof message !== 'object' || !part) return null;
  const meta = isPlainObject(message.meta) ? { ...message.meta } : {};
  return {
    ...message,
    meta: {
      ...meta,
      agentMessageParts: mergeAgentMessageParts(meta.agentMessageParts, [part]),
    },
  };
};

export const runChatFormatGuardianPreview = ({
  message = null,
  sessionId = '',
  chatFormatGuardian = null,
  onChatFormatGuardianPreview = null,
  logger = console,
  now = Date.now,
} = {}) => {
  if (!message || message.role !== 'assistant' || !chatFormatGuardian) return null;
  const options = chatFormatGuardian === true
    ? { enabled: true }
    : (isPlainObject(chatFormatGuardian) ? { ...chatFormatGuardian } : {});
  if (options.enabled === false) return null;
  const text = String(message.raw || message.content || message.text || '').trim();
  if (!text) return null;
  try {
    const result = extractChatFormatEventDrafts(text, {
      ...options,
      sourceMessageId: trim(message.id || options.sourceMessageId),
    });
    const part = buildChatFormatGuardianMessagePart({
      result,
      message,
      sessionId,
      showSucceededPreview: options.showSucceededPreview === true,
      maxEvents: options.maxEvents,
      maxIssues: options.maxIssues,
      now,
    });
    const patchedMessage = buildChatFormatGuardianPreviewMessage(message, part);
    if (patchedMessage && typeof onChatFormatGuardianPreview === 'function') {
      onChatFormatGuardianPreview({ message, patchedMessage, result, part, sessionId });
    }
    return { result, part, patchedMessage };
  } catch (err) {
    logger?.warn?.('chat format guardian preview failed', err);
    return null;
  }
};

export const resolveAfterReceiveSkipScripts = (
  skipScriptsOverride,
  defaultSkipScripts = false,
) => (
  typeof skipScriptsOverride === 'boolean'
    ? skipScriptsOverride
    : Boolean(defaultSkipScripts)
);

const catchAsync = (maybePromise, onError) => {
  if (!maybePromise || typeof maybePromise.catch !== 'function') return;
  maybePromise.catch(onError);
};

export const dispatchAfterReceiveEffects = ({
  message,
  sessionId = '',
  skipScripts,
  defaultSkipScripts = false,
  scriptRuntime = null,
  pluginRuntime = null,
  logger = console,
  applyUpdateVariable,
  handleVariableRules,
  useGlobalVariables = false,
  recordTraceEvent = null,
  chatFormatGuardian = null,
  onChatFormatGuardianPreview = null,
} = {}) => {
  if (!message || message.role !== 'assistant') return false;
  const shouldSkipScripts = resolveAfterReceiveSkipScripts(skipScripts, defaultSkipScripts);
  const payload = { message, sessionId };
  const dispatchRuntimeHook = ({ runtime = null, runtimeLabel = '' } = {}) => {
    if (!runtime) return;
    const messageId = String(message?.id || '').trim();
    emitHookLifecycleTrace(recordTraceEvent, buildAfterReceiveHookStartTraceEvent({
      runtimeLabel,
      sessionId,
      message,
    }));
    const result = runtime.dispatchEvent('message.after_receive', payload);
    catchAsync(result, err => {
      emitHookLifecycleTrace(recordTraceEvent, buildAfterReceiveHookFinishTraceEvent({
        runtimeLabel,
        sessionId,
        messageId,
        status: 'error',
        errorMessage: err?.message,
      }));
      logger?.warn?.(`${runtimeLabel} message.after_receive failed`, err);
    });
    emitHookLifecycleTrace(recordTraceEvent, buildAfterReceiveHookFinishTraceEvent({
      runtimeLabel,
      sessionId,
      messageId,
      status: 'queued',
    }));
  };
  if (scriptRuntime && !shouldSkipScripts) {
    dispatchRuntimeHook({ runtime: scriptRuntime, runtimeLabel: 'script' });
  }
  if (pluginRuntime) {
    dispatchRuntimeHook({ runtime: pluginRuntime, runtimeLabel: 'plugin' });
  }
  runChatFormatGuardianPreview({
    message,
    sessionId,
    chatFormatGuardian,
    onChatFormatGuardianPreview,
    logger,
  });
  try {
    if (typeof applyUpdateVariable === 'function') applyUpdateVariable(message, sessionId);
    else logger?.warn?.('[update-variable] apply function unavailable');
  } catch (err) {
    logger?.warn?.('UpdateVariable parse failed', err);
  }
  if (typeof handleVariableRules === 'function') {
    catchAsync(
      handleVariableRules({ sessionId, message, useGlobalVariables }),
      err => logger?.warn?.('variable rules after_receive failed', err),
    );
  }
  return true;
};
