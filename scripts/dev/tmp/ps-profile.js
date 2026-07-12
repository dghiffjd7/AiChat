(async () => {
  const bridge = window.appBridge;
  const cm = bridge.getConfigManager?.() || window.configManager;
  if (cm?.load) { try { await cm.load(); } catch {} }
  const profiles = (cm?.listProfiles?.() || []).map(p => ({ id: p.id, name: p.name, provider: p.provider, model: p.model }));
  const activeId = cm?.getActiveProfileId?.() || cm?.state?.activeProfileId || '';
  const cfg = bridge.getConfig?.() || {};
  return {
    activeId,
    profiles,
    currentModel: cfg.model || '',
    currentProvider: cfg.provider || '',
  };
})()
