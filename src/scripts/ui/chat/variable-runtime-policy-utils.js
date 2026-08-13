export const VARIABLE_RUNTIME_SETTING_KEY = 'variableRuntimeEnabled';
export const VARIABLE_RUNTIME_CHANGED_EVENT = 'chatapp-variable-runtime-changed';
export const VARIABLE_RUNTIME_PENDING_GREETING_INIT_KEY = 'variableRuntimePendingGreetingInit';

export const isVariableRuntimeEnabledForSession = (chatStore, sessionId) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return true;
  const settings = chatStore?.getSessionSettings?.(sid);
  return settings?.[VARIABLE_RUNTIME_SETTING_KEY] !== false;
};

const createRuntimeChangeEvent = detail => {
  if (typeof CustomEvent === 'function') {
    return new CustomEvent(VARIABLE_RUNTIME_CHANGED_EVENT, { detail });
  }
  return { type: VARIABLE_RUNTIME_CHANGED_EVENT, detail };
};

export const dispatchVariableRuntimeChangedForSession = (
  sessionId,
  enabled,
  { eventTarget = globalThis.window } = {},
) => {
  const sid = String(sessionId || '').trim();
  if (!sid || typeof eventTarget?.dispatchEvent !== 'function') return false;
  eventTarget.dispatchEvent(createRuntimeChangeEvent({
    sessionId: sid,
    enabled: enabled !== false,
  }));
  return true;
};

export const getVariableRuntimePendingGreetingInit = (chatStore, sessionId) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  const pending = chatStore?.getSessionSettings?.(sid)?.[VARIABLE_RUNTIME_PENDING_GREETING_INIT_KEY];
  if (!pending) return null;
  if (pending && typeof pending === 'object' && !Array.isArray(pending)) {
    return { greetingId: String(pending.greetingId || '').trim() };
  }
  return { greetingId: '' };
};

export const setVariableRuntimePendingGreetingInit = (
  chatStore,
  sessionId,
  { greetingId = '' } = {},
) => {
  const sid = String(sessionId || '').trim();
  if (!sid || typeof chatStore?.setSessionSettings !== 'function') return false;
  const current = chatStore.getSessionSettings?.(sid);
  return chatStore.setSessionSettings(sid, {
    ...(current && typeof current === 'object' ? current : {}),
    [VARIABLE_RUNTIME_PENDING_GREETING_INIT_KEY]: {
      greetingId: String(greetingId || '').trim(),
    },
  }) !== false;
};

export const clearVariableRuntimePendingGreetingInit = (chatStore, sessionId) => {
  const sid = String(sessionId || '').trim();
  if (!sid || typeof chatStore?.setSessionSettings !== 'function') return false;
  const current = chatStore.getSessionSettings?.(sid);
  if (!current || typeof current !== 'object') return true;
  if (!Object.prototype.hasOwnProperty.call(current, VARIABLE_RUNTIME_PENDING_GREETING_INIT_KEY)) {
    return true;
  }
  const next = { ...current };
  delete next[VARIABLE_RUNTIME_PENDING_GREETING_INIT_KEY];
  return chatStore.setSessionSettings(sid, next) !== false;
};

export const resumeVariableRuntimeForSession = async ({
  sessionId = '',
  ensureWorlds = async () => true,
  refreshWorldSchemas = async () => {},
  replayGreetingInit = async () => ({ ok: true }),
  applySchemaDefaults = () => {},
  evaluateStage = async () => {},
  syncScriptContext = async () => {},
  syncPluginContext = async () => {},
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { ok: false, sessionId: sid, reason: 'invalid_session' };
  try {
    const worldsReady = await ensureWorlds(sid);
    if (worldsReady === false) {
      return { ok: false, sessionId: sid, reason: 'worlds_unavailable' };
    }
    await refreshWorldSchemas(sid);
    const greetingResult = await replayGreetingInit(sid);
    if (greetingResult?.ok === false) {
      return {
        ok: false,
        sessionId: sid,
        reason: String(greetingResult.reason || 'greeting_init_failed'),
      };
    }
    await applySchemaDefaults(sid);
    await evaluateStage(sid);
    await syncScriptContext(sid);
    await syncPluginContext(sid);
    return { ok: true, sessionId: sid };
  } catch {
    return { ok: false, sessionId: sid, reason: 'resume_failed' };
  }
};

export const setVariableRuntimeEnabledForSession = (
  chatStore,
  sessionId,
  enabled,
  { eventTarget = globalThis.window } = {},
) => {
  const sid = String(sessionId || '').trim();
  const nextEnabled = enabled !== false;
  if (!sid || typeof chatStore?.setSessionSettings !== 'function') {
    return { ok: false, sessionId: sid, enabled: nextEnabled, changed: false };
  }
  const currentEnabled = isVariableRuntimeEnabledForSession(chatStore, sid);
  if (currentEnabled === nextEnabled) {
    return { ok: true, sessionId: sid, enabled: nextEnabled, changed: false };
  }
  const currentSettings = chatStore.getSessionSettings?.(sid);
  const nextSettings = {
    ...(currentSettings && typeof currentSettings === 'object' ? currentSettings : {}),
    [VARIABLE_RUNTIME_SETTING_KEY]: nextEnabled,
  };
  const ok = chatStore.setSessionSettings(sid, nextSettings) !== false;
  if (ok) {
    try {
      dispatchVariableRuntimeChangedForSession(sid, nextEnabled, { eventTarget });
    } catch {}
  }
  return { ok, sessionId: sid, enabled: nextEnabled, changed: ok };
};
