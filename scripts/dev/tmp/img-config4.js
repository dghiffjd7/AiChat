(async () => {
  const tries = ['/scripts/storage/config.js', './scripts/storage/config.js', '/src/scripts/storage/config.js'];
  for (const p of tries) {
    try {
      const mod = await import(p);
      if (mod?.ConfigManager) {
        const mgr = new mod.ConfigManager({ scope: 'image' });
        const cfg = await mgr.load();
        return cfg ? { path: p, provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, hasKey: !!cfg.apiKey } : { path: p, cfg: null };
      }
    } catch (e) { /* next */ }
  }
  return { err: 'no path worked', probe: [...document.scripts].map(s => s.src).filter(Boolean).slice(0, 4) };
})()
