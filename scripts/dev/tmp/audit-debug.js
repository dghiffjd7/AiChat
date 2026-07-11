(() => {
  const runtime = window.appBridge?.scriptRuntime;
  const ctx = runtime?.buildContext?.() || {};
  const enabled = runtime?.isEnabled?.(ctx.sessionId);
  const ss = window.appBridge?.debugUiRegistry?.stores?.scriptStore;
  const presetScripts = ctx.presetId ? (ss?.getScripts?.('preset', ctx.presetId) || []).map(s => ({ name: s.name, enabled: s.enabled, authorized: s.authorized })) : [];
  return {
    sessionId: ctx.sessionId, personaId: ctx.personaId,
    presetId: ctx.presetId, presetIds: ctx.presetIds,
    isEnabled: enabled,
    sessionSettings: runtime?.getSessionSettings?.(ctx.sessionId),
    presetScripts,
  };
})()
