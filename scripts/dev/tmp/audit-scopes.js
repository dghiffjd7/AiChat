(async () => {
  const ss = window.appBridge?.debugUiRegistry?.stores?.scriptStore;
  await ss?.load?.();
  const scopes = ss.listScopes();
  const ps = window.appBridge?.presets;
  const state = ps.getState?.() || {};
  const openaiIds = new Set(Object.keys(state?.presets?.openai || {}));
  return (scopes.preset || []).map(id => ({
    scopeId: id,
    presetExists: openaiIds.has(id),
    scriptCount: (ss.getScripts('preset', id) || []).filter(s => s.enabled && s.authorized).length,
  })).filter(x => x.scriptCount > 0);
})()
