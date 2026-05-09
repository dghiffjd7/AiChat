import {
  buildBeforeSendHookFinishTraceEvent,
  buildBeforeSendHookStartTraceEvent,
  emitHookLifecycleTrace,
} from './hook-lifecycle-trace-utils.js';

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
    emitHookLifecycleTrace(recordTraceEvent, buildBeforeSendHookStartTraceEvent({
      runtimeLabel,
      sessionId,
      text,
      isGroupChat,
      hasAttachments,
      allowTextOverride,
    }));
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
      emitHookLifecycleTrace(recordTraceEvent, buildBeforeSendHookFinishTraceEvent({
        runtimeLabel,
        sessionId,
        text,
        nextText: updated.content,
        changed: true,
      }));
      return updated.content;
    }
    emitHookLifecycleTrace(recordTraceEvent, buildBeforeSendHookFinishTraceEvent({
      runtimeLabel,
      sessionId,
      text,
      changed: false,
    }));
  } catch (err) {
    emitHookLifecycleTrace(recordTraceEvent, buildBeforeSendHookFinishTraceEvent({
      runtimeLabel,
      sessionId,
      status: 'error',
      text,
      errorMessage: err?.message,
    }));
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
