(async () => {
  const bridge = window.appBridge || {};
  const presetStore = bridge.getPresetStore?.() || window.presetStore || null;
  const scriptStore = bridge.getScriptStore?.() || window.scriptStore || null;
  if (!presetStore || !scriptStore?.state) return { error: 'stores unavailable' };
  await presetStore.ready;
  const presets = presetStore.list('openai').map(p => ({
    id: String(p.id || ''),
    name: String(p.name || '').slice(0, 40),
  }));
  const activeId = String(presetStore.getActiveId('openai') || '');
  const presetIds = new Set(presets.map(p => p.id));
  const scopes = Object.entries(scriptStore.state.preset || {}).map(([scopeId, bucket]) => ({
    scopeId,
    alive: presetIds.has(scopeId),
    presetName: presets.find(p => p.id === scopeId)?.name || '',
    scriptCount: (bucket?.scripts || []).length,
    scripts: (bucket?.scripts || []).map(s => `${s.name}|${String(s.content || '').length}|${s.enabled ? 'on' : 'off'}`),
  }));
  return {
    activePresetId: activeId,
    activePresetName: presets.find(p => p.id === activeId)?.name || '',
    presetCount: presets.length,
    presets,
    scopes: scopes.map(s => ({ ...s, scripts: s.scriptCount ? s.scripts : undefined })),
  };
})()
