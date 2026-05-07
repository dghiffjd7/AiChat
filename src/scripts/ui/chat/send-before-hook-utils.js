import { emitHookLifecycleTrace } from './hook-lifecycle-trace-utils.js';

const applyBeforeSendRuntimeHook = async ({
  runtime = null,
  runtimeLabel = '',
  text = '',
  sessionId = '',
  userName = '',
  isGroupChat = false,
  hasAttachments = false,
  allowTextOverride = true,
  logger = null,
  recordTraceEvent = null,
} = {}) => {
  if (!runtime || typeof runtime.dispatchEvent !== 'function') return text;

  try {
    emitHookLifecycleTrace(recordTraceEvent, {
      phase: 'before_send.start',
      hookName: 'message.before_send',
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
    const payload = {
      content: text,
      sessionId,
      userName,
      isGroup: isGroupChat,
      hasAttachments,
    };
    const updated = await runtime.dispatchEvent('message.before_send', payload);
    if (
      allowTextOverride &&
      updated &&
      typeof updated.content === 'string' &&
      updated.content !== text
    ) {
      emitHookLifecycleTrace(recordTraceEvent, {
        phase: 'before_send.finish',
        hookName: 'message.before_send',
        runtimeLabel,
        sessionId,
        status: 'success',
        summary: 'message.before_send hook changed content',
        details: {
          changed: true,
          originalLength: String(text || '').length,
          nextLength: String(updated.content || '').length,
        },
      });
      return updated.content;
    }
    emitHookLifecycleTrace(recordTraceEvent, {
      phase: 'before_send.finish',
      hookName: 'message.before_send',
      runtimeLabel,
      sessionId,
      status: 'success',
      summary: 'message.before_send hook finished',
      details: {
        changed: false,
        contentLength: String(text || '').length,
      },
    });
  } catch (err) {
    emitHookLifecycleTrace(recordTraceEvent, {
      phase: 'before_send.finish',
      hookName: 'message.before_send',
      runtimeLabel,
      sessionId,
      status: 'error',
      summary: err?.message || 'message.before_send hook failed',
      details: { contentLength: String(text || '').length },
    });
    logger?.warn?.(`${runtimeLabel} message.before_send failed`, err);
  }

  return text;
};

export const applyBeforeSendHooks = async ({
  text = '',
  sessionId = '',
  userName = '',
  isGroupChat = false,
  hasAttachments = false,
  allowTextOverride = true,
  scriptRuntime = null,
  pluginRuntime = null,
  skipScripts = false,
  logger = null,
  recordTraceEvent = null,
} = {}) => {
  let nextText = text;

  if (!skipScripts) {
    nextText = await applyBeforeSendRuntimeHook({
      runtime: scriptRuntime,
      runtimeLabel: 'script',
      text: nextText,
      sessionId,
      userName,
      isGroupChat,
      hasAttachments,
      allowTextOverride,
      logger,
      recordTraceEvent,
    });
  }

  nextText = await applyBeforeSendRuntimeHook({
    runtime: pluginRuntime,
    runtimeLabel: 'plugin',
    text: nextText,
    sessionId,
    userName,
    isGroupChat,
    hasAttachments,
    allowTextOverride,
    logger,
    recordTraceEvent,
  });

  return nextText;
};
