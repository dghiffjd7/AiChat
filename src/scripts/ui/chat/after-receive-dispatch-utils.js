import {
  buildAfterReceiveHookFinishTraceEvent,
  buildAfterReceiveHookStartTraceEvent,
  emitHookLifecycleTrace,
} from './hook-lifecycle-trace-utils.js';

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
