import {
  emitLifecycleTraceEvent,
  normalizeLifecycleTraceDetails,
  normalizeLifecycleTraceText,
} from './lifecycle-trace-utils.js';

export const buildHookLifecycleTraceEvent = ({
  phase = '',
  hookName = '',
  runtimeLabel = '',
  sessionId = '',
  messageId = '',
  status = 'info',
  summary = '',
  details = {},
} = {}) => ({
  category: 'plugin-hooks',
  source: 'hook-lifecycle',
  phase: normalizeLifecycleTraceText(phase, 'event'),
  hookName: normalizeLifecycleTraceText(hookName, ''),
  runtimeLabel: normalizeLifecycleTraceText(runtimeLabel, ''),
  sessionId: normalizeLifecycleTraceText(sessionId, ''),
  messageId: normalizeLifecycleTraceText(messageId, ''),
  status: normalizeLifecycleTraceText(status, 'info'),
  summary: normalizeLifecycleTraceText(summary, ''),
  details: normalizeLifecycleTraceDetails(details),
});

const MESSAGE_BEFORE_SEND_HOOK = 'message.before_send';

const getMessageTraceId = ({ message = null, messageId = '' } = {}) => (
  String(messageId || message?.id || '').trim()
);

const buildMessageHookName = (lifecycle = '') => (
  `message.${normalizeLifecycleTraceText(lifecycle, 'event')}`
);

const buildMessageHookPhase = (lifecycle = '', stage = '') => (
  `${normalizeLifecycleTraceText(lifecycle, 'event')}.${normalizeLifecycleTraceText(stage, 'event')}`
);

const buildRuntimeHookPhase = (hookName = '', stage = '') => (
  `${normalizeLifecycleTraceText(hookName, 'event')}.${normalizeLifecycleTraceText(stage, 'event')}`
);

const getHookWarningMessage = ({
  warningMessage = '',
  runtimeLabel = '',
  hookName = '',
} = {}) => (
  normalizeLifecycleTraceText(warningMessage, '')
  || `${normalizeLifecycleTraceText(runtimeLabel, 'runtime')} ${normalizeLifecycleTraceText(hookName, 'event')} failed`
);

const normalizeHookDetailsPayload = (details = {}) => normalizeLifecycleTraceDetails(details);

export const buildBeforeSendHookStartTraceEvent = ({
  runtimeLabel = '',
  sessionId = '',
  text = '',
  isGroupChat = false,
  hasAttachments = false,
  allowTextOverride = true,
} = {}) => ({
  phase: 'before_send.start',
  hookName: MESSAGE_BEFORE_SEND_HOOK,
  runtimeLabel,
  sessionId,
  status: 'started',
  summary: 'message.before_send hook started',
  details: {
    isGroupChat,
    hasAttachments,
    allowTextOverride,
    contentLength: String(text || '').length,
  },
});

export const buildBeforeSendHookFinishTraceEvent = ({
  runtimeLabel = '',
  sessionId = '',
  status = 'success',
  text = '',
  nextText = '',
  changed = false,
  errorMessage = '',
} = {}) => {
  const normalizedStatus = normalizeLifecycleTraceText(status, 'success');
  if (normalizedStatus === 'error') {
    return {
      phase: 'before_send.finish',
      hookName: MESSAGE_BEFORE_SEND_HOOK,
      runtimeLabel,
      sessionId,
      status: 'error',
      summary: errorMessage || 'message.before_send hook failed',
      details: { contentLength: String(text || '').length },
    };
  }

  if (changed) {
    return {
      phase: 'before_send.finish',
      hookName: MESSAGE_BEFORE_SEND_HOOK,
      runtimeLabel,
      sessionId,
      status: 'success',
      summary: 'message.before_send hook changed content',
      details: {
        changed: true,
        originalLength: String(text || '').length,
        nextLength: String(nextText || '').length,
      },
    };
  }

  return {
    phase: 'before_send.finish',
    hookName: MESSAGE_BEFORE_SEND_HOOK,
    runtimeLabel,
    sessionId,
    status: 'success',
    summary: 'message.before_send hook finished',
    details: {
      changed: false,
      contentLength: String(text || '').length,
    },
  };
};

export const buildRuntimeHookStartTraceEvent = ({
  hookName = '',
  runtimeLabel = '',
  sessionId = '',
  messageId = '',
  details = {},
} = {}) => {
  const normalizedHookName = normalizeLifecycleTraceText(hookName, 'event');
  return {
    phase: buildRuntimeHookPhase(normalizedHookName, 'start'),
    hookName: normalizedHookName,
    runtimeLabel,
    sessionId,
    messageId: getMessageTraceId({ messageId }),
    status: 'started',
    summary: `${normalizedHookName} hook started`,
    details: normalizeHookDetailsPayload(details),
  };
};

export const buildRuntimeHookFinishTraceEvent = ({
  hookName = '',
  runtimeLabel = '',
  sessionId = '',
  messageId = '',
  status = 'queued',
  errorMessage = '',
  details = {},
} = {}) => {
  const normalizedHookName = normalizeLifecycleTraceText(hookName, 'event');
  const normalizedStatus = normalizeLifecycleTraceText(status, 'queued');
  const summary = (() => {
    if (normalizedStatus === 'error') return errorMessage || `${normalizedHookName} hook failed`;
    if (normalizedStatus === 'success') return `${normalizedHookName} hook finished`;
    if (normalizedStatus === 'skipped') return `${normalizedHookName} hook skipped`;
    return `${normalizedHookName} hook ${normalizedStatus}`;
  })();
  return {
    phase: buildRuntimeHookPhase(normalizedHookName, 'finish'),
    hookName: normalizedHookName,
    runtimeLabel,
    sessionId,
    messageId: getMessageTraceId({ messageId }),
    status: normalizedStatus,
    summary,
    details: normalizeHookDetailsPayload(details),
  };
};

export const buildMessageHookDispatchStartTraceEvent = ({
  lifecycle = 'after_send',
  runtimeLabel = '',
  sessionId = '',
  message = null,
  messageId = '',
} = {}) => {
  const hookName = buildMessageHookName(lifecycle);
  return {
    phase: buildMessageHookPhase(lifecycle, 'start'),
    hookName,
    runtimeLabel,
    sessionId,
    messageId: getMessageTraceId({ message, messageId }),
    status: 'started',
    summary: `${hookName} hook started`,
    details: { role: message?.role || '', type: message?.type || '' },
  };
};

export const buildMessageHookDispatchFinishTraceEvent = ({
  lifecycle = 'after_send',
  runtimeLabel = '',
  sessionId = '',
  messageId = '',
  status = 'queued',
  errorMessage = '',
} = {}) => {
  const hookName = buildMessageHookName(lifecycle);
  const normalizedStatus = normalizeLifecycleTraceText(status, 'queued');
  return {
    phase: buildMessageHookPhase(lifecycle, 'finish'),
    hookName,
    runtimeLabel,
    sessionId,
    messageId: getMessageTraceId({ messageId }),
    status: normalizedStatus,
    summary: normalizedStatus === 'error'
      ? (errorMessage || `${hookName} hook failed`)
      : `${hookName} hook queued`,
  };
};

export const buildAfterSendHookStartTraceEvent = (payload = {}) => (
  buildMessageHookDispatchStartTraceEvent({ ...payload, lifecycle: 'after_send' })
);

export const buildAfterSendHookFinishTraceEvent = (payload = {}) => (
  buildMessageHookDispatchFinishTraceEvent({ ...payload, lifecycle: 'after_send' })
);

export const buildAfterReceiveHookStartTraceEvent = (payload = {}) => (
  buildMessageHookDispatchStartTraceEvent({ ...payload, lifecycle: 'after_receive' })
);

export const buildAfterReceiveHookFinishTraceEvent = (payload = {}) => (
  buildMessageHookDispatchFinishTraceEvent({ ...payload, lifecycle: 'after_receive' })
);

export const emitHookLifecycleTrace = (recordTraceEvent, event) => {
  emitLifecycleTraceEvent(recordTraceEvent, buildHookLifecycleTraceEvent(event));
};

export const dispatchRuntimeHookLifecycleEvent = ({
  runtime = null,
  runtimeLabel = '',
  hookName = '',
  payload = {},
  sessionId = '',
  messageId = '',
  details = {},
  logger = null,
  warningMessage = '',
  recordTraceEvent = null,
} = {}) => {
  const normalizedHookName = normalizeLifecycleTraceText(hookName, '');
  if (!normalizedHookName || !runtime || typeof runtime.dispatchEvent !== 'function') return false;

  emitHookLifecycleTrace(recordTraceEvent, buildRuntimeHookStartTraceEvent({
    hookName: normalizedHookName,
    runtimeLabel,
    sessionId,
    messageId,
    details,
  }));

  let result;
  try {
    result = runtime.dispatchEvent(normalizedHookName, payload, { sessionId });
  } catch (err) {
    emitHookLifecycleTrace(recordTraceEvent, buildRuntimeHookFinishTraceEvent({
      hookName: normalizedHookName,
      runtimeLabel,
      sessionId,
      messageId,
      status: 'error',
      errorMessage: err?.message,
      details,
    }));
    throw err;
  }

  if (result && typeof result.catch === 'function') {
    result.catch((err) => {
      emitHookLifecycleTrace(recordTraceEvent, buildRuntimeHookFinishTraceEvent({
        hookName: normalizedHookName,
        runtimeLabel,
        sessionId,
        messageId,
        status: 'error',
        errorMessage: err?.message,
        details,
      }));
      logger?.warn?.(getHookWarningMessage({ warningMessage, runtimeLabel, hookName: normalizedHookName }), err);
    });
  }

  emitHookLifecycleTrace(recordTraceEvent, buildRuntimeHookFinishTraceEvent({
    hookName: normalizedHookName,
    runtimeLabel,
    sessionId,
    messageId,
    status: 'queued',
    details,
  }));
  return true;
};

export const runRuntimeHookLifecycleEvent = async ({
  runtime = null,
  runtimeLabel = '',
  hookName = '',
  payload = {},
  sessionId = '',
  messageId = '',
  details = {},
  finishDetails = {},
  logger = null,
  warningMessage = '',
  recordTraceEvent = null,
} = {}) => {
  const normalizedHookName = normalizeLifecycleTraceText(hookName, '');
  if (!normalizedHookName || !runtime || typeof runtime.dispatchEvent !== 'function') {
    return { dispatched: false, result: null, error: null };
  }

  emitHookLifecycleTrace(recordTraceEvent, buildRuntimeHookStartTraceEvent({
    hookName: normalizedHookName,
    runtimeLabel,
    sessionId,
    messageId,
    details,
  }));

  try {
    const result = await runtime.dispatchEvent(normalizedHookName, payload, { sessionId });
    const nextDetails = typeof finishDetails === 'function'
      ? finishDetails(result)
      : finishDetails;
    emitHookLifecycleTrace(recordTraceEvent, buildRuntimeHookFinishTraceEvent({
      hookName: normalizedHookName,
      runtimeLabel,
      sessionId,
      messageId,
      status: 'success',
      details: nextDetails,
    }));
    return { dispatched: true, result, error: null };
  } catch (err) {
    emitHookLifecycleTrace(recordTraceEvent, buildRuntimeHookFinishTraceEvent({
      hookName: normalizedHookName,
      runtimeLabel,
      sessionId,
      messageId,
      status: 'error',
      errorMessage: err?.message,
      details,
    }));
    logger?.warn?.(getHookWarningMessage({ warningMessage, runtimeLabel, hookName: normalizedHookName }), err);
    return { dispatched: true, result: null, error: err };
  }
};
