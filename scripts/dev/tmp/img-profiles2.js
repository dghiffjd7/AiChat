(async () => {
  const mod = await import('/scripts/storage/config.js');
  const mgr = new mod.ConfigManager({ scope: 'image' });
  await mgr.load();
  const profiles = await mgr.getProfiles();
  const activeId = await mgr.getActiveProfileId?.();
  return {
    activeId,
    profiles: (Array.isArray(profiles) ? profiles : []).map(p => ({
      id: p.id, name: p.name,
      provider: p.provider || p.config?.provider,
      model: p.model || p.config?.model,
    })),
  };
})()
