(async () => {
  const { ConfigManager } = await import('/src/scripts/utils/config-manager.js').catch(() => ({}));
  if (!ConfigManager) return { err: 'import failed' };
  const mgr = new ConfigManager({ scope: 'image' });
  const cfg = await mgr.load();
  if (!cfg) return { cfg: null };
  return {
    provider: cfg.provider, model: cfg.model,
    baseUrl: String(cfg.baseUrl || '').replace(/\/\/[^/]*@/, '//'),
    hasKey: !!cfg.apiKey,
    keys: Object.keys(cfg),
  };
})()
