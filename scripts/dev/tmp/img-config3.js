(async () => {
  const mod = await import('/src/scripts/storage/config.js');
  const mgr = new mod.ConfigManager({ scope: 'image' });
  const cfg = await mgr.load();
  if (!cfg) return { cfg: null };
  return {
    provider: cfg.provider, model: cfg.model,
    baseUrl: cfg.baseUrl,
    hasKey: !!cfg.apiKey,
  };
})()
