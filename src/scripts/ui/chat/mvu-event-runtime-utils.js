export const buildMvuVarsPayload = (
  {
    sessionId = '',
    getCurrentSessionId = null,
    listVariables = null,
    listGlobalVariables = null,
    isSharedVariableSession = null,
    buildVariableContextFn = null,
    useGlobal,
  } = {},
) => {
  const sid = String(sessionId || getCurrentSessionId?.() || '').trim();
  if (!sid || typeof buildVariableContextFn !== 'function') return null;
  const localVars = listVariables?.(sid) || {};
  const globalVars = listGlobalVariables?.() || {};
  const shared = typeof useGlobal === 'boolean' ? useGlobal : isSharedVariableSession?.(sid) === true;
  const baseVars = shared ? globalVars : localVars;
  return buildVariableContextFn({ baseVars, globalVars, localVars }).variableContext;
};

export const createMvuEventRuntime = ({
  scriptRuntime = null,
  logger = null,
  buildVarsPayload = null,
} = {}) => {
  const shouldEmitMvuEvent = (name) => Boolean(scriptRuntime?.hasListener?.(name));

  const emitMvuEvent = (eventName, payload) => {
    if (!scriptRuntime) return;
    scriptRuntime.dispatchEvent(eventName, payload, { allowMutate: false })
      .catch(err => logger?.warn?.('script mvu event failed', eventName, err));
  };

  const emitInitialized = (sessionId, messageIndex = 0, { useGlobal } = {}) => {
    if (!shouldEmitMvuEvent('mag_variable_initialized')) return false;
    const vars = typeof buildVarsPayload === 'function' ? buildVarsPayload(sessionId, { useGlobal }) : null;
    if (!vars) return false;
    const scope = useGlobal ? 'global' : 'chat';
    emitMvuEvent('mag_variable_initialized', { scope, variables: vars, args: [vars, messageIndex] });
    return true;
  };

  const emitStarted = (sessionId, updates, { useGlobal } = {}) => {
    if (!shouldEmitMvuEvent('mag_variable_update_started')) return false;
    const scope = useGlobal ? 'global' : 'chat';
    const payload = { scope, updates: updates || {} };
    emitMvuEvent('mag_variable_update_started', { ...payload, args: [payload] });
    return true;
  };

  const emitEnded = (sessionId, { useGlobal } = {}) => {
    const vars = typeof buildVarsPayload === 'function' ? buildVarsPayload(sessionId, { useGlobal }) : null;
    if (!vars) return false;
    const scope = useGlobal ? 'global' : 'chat';
    const payload = { scope, variables: vars };
    if (shouldEmitMvuEvent('mag_variable_update_ended')) {
      emitMvuEvent('mag_variable_update_ended', { ...payload, args: [vars] });
    }
    if (shouldEmitMvuEvent('mag_variable_update_ended_for_zod')) {
      emitMvuEvent('mag_variable_update_ended_for_zod', { ...payload, args: [vars] });
    }
    return true;
  };

  return {
    shouldEmitMvuEvent,
    emitInitialized,
    emitStarted,
    emitEnded,
  };
};
