(async () => {
  const mod = await import('/scripts/storage/config.js');
  const mgr = new mod.ConfigManager({ scope: 'image' });
  const profiles = (await (mgr.listProfiles?.() || mgr.getProfiles?.() || [])) || [];
  const cur = await mgr.load();
  return {
    current: { provider: cur?.provider, model: cur?.model },
    profiles: (Array.isArray(profiles) ? profiles : []).map(p => ({ id: p.id, name: p.name, provider: p.provider || p.config?.provider, model: p.model || p.config?.model })),
    mgrKeys: Object.getOwnPropertyNames(Object.getPrototypeOf(mgr)).slice(0, 20),
  };
})()
