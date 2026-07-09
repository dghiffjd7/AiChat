(async () => {
  const cfgMod = await import('/scripts/storage/config.js');
  const mgr = new cfgMod.ConfigManager({ scope: 'image' });
  const cfg = await mgr.load();
  if (!cfg?.apiKey) return { err: 'no active image config/key' };
  const clientMod = await import('/scripts/api/client.js');
  const Client = clientMod.LLMClient || clientMod.default;
  const client = new Client(cfg);
  const startedAt = Date.now();
  try {
    const images = await client.generateImage('1girl, blue short hair, maid outfit, watering flowers in a garden, watercolor style, soft colors', { n: 1 });
    return {
      ok: true,
      provider: cfg.provider, model: cfg.model,
      elapsedMs: Date.now() - startedAt,
      count: Array.isArray(images) ? images.length : 0,
      first: images?.[0] ? { hasDataUrl: !!images[0].dataUrl, hasUrl: !!images[0].url } : null,
    };
  } catch (e) {
    return { ok: false, provider: cfg.provider, model: cfg.model, elapsedMs: Date.now() - startedAt, error: String(e?.message || e).slice(0, 400) };
  }
})()
