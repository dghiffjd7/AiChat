import { emitHookLifecycleTrace } from './hook-lifecycle-trace-utils.js';

const normalizeMessages = (messages = []) => (Array.isArray(messages) ? messages : []);

const dispatchAfterSendToRuntime = ({
  runtime = null,
  runtimeLabel = '',
  messages = [],
  sessionId = '',
  logger = null,
  recordTraceEvent = null,
} = {}) => {
  if (!runtime || typeof runtime.dispatchEvent !== 'function') return;
  normalizeMessages(messages).forEach((message) => {
    const messageId = String(message?.id || '').trim();
    emitHookLifecycleTrace(recordTraceEvent, {
      phase: 'after_send.start',
      hookName: 'message.after_send',
      runtimeLabel,
      sessionId,
      messageId,
      status: 'started',
      summary: 'message.after_send hook started',
      details: { role: message?.role || '', type: message?.type || '' },
    });
    runtime.dispatchEvent('message.after_send', { message, sessionId }).catch((err) => {
      emitHookLifecycleTrace(recordTraceEvent, {
        phase: 'after_send.finish',
        hookName: 'message.after_send',
        runtimeLabel,
        sessionId,
        messageId,
        status: 'error',
        summary: err?.message || 'message.after_send hook failed',
      });
      logger?.warn?.(`${runtimeLabel} message.after_send failed`, err);
    });
    emitHookLifecycleTrace(recordTraceEvent, {
      phase: 'after_send.finish',
      hookName: 'message.after_send',
      runtimeLabel,
      sessionId,
      messageId,
      status: 'queued',
      summary: 'message.after_send hook queued',
    });
  });
};

export const markMessagesAsSending = ({
  messages = [],
  sessionId = '',
  chatStore = null,
  ui = null,
} = {}) => normalizeMessages(messages).map((message) => {
  const fallback = {
    ...(message && typeof message === 'object' ? message : {}),
    status: 'sending',
  };
  const messageId = message?.id;
  if (!messageId) return fallback;

  const updated =
    chatStore && typeof chatStore.updateMessage === 'function'
      ? (chatStore.updateMessage(messageId, { status: 'sending' }, sessionId) || fallback)
      : fallback;
  if (ui && typeof ui.updateMessage === 'function') {
    ui.updateMessage(messageId, updated || fallback);
  }
  if (chatStore && typeof chatStore.findMessage === 'function') {
    return chatStore.findMessage(messageId, sessionId) || updated || fallback;
  }
  return updated || fallback;
});

export const dispatchAfterSendEvents = ({
  messages = [],
  sessionId = '',
  scriptRuntime = null,
  pluginRuntime = null,
  skipScripts = false,
  logger = null,
  recordTraceEvent = null,
} = {}) => {
  const nextMessages = normalizeMessages(messages);
  if (!skipScripts) {
    dispatchAfterSendToRuntime({
      runtime: scriptRuntime,
      runtimeLabel: 'script',
      messages: nextMessages,
      sessionId,
      logger,
      recordTraceEvent,
    });
  }
  dispatchAfterSendToRuntime({
    runtime: pluginRuntime,
    runtimeLabel: 'plugin',
    messages: nextMessages,
    sessionId,
    logger,
    recordTraceEvent,
  });
};
