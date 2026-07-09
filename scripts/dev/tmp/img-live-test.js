(async () => {
  const cfgMod = await import('/scripts/storage/config.js');
  const mgr = new cfgMod.ConfigManager({ scope: 'image' });
  const cfg = await mgr.load();
  if (!cfg?.apiKey) return { err: 'no image config' };
  const provMod = await import('/scripts/api/providers/custom.js');
  const Provider = provMod.CustomProvider || provMod.default;
  if (!Provider) return { err: 'no CustomProvider export', keys: Object.keys(provMod) };
  // canvas 造一张 256x256 蓝底黄圆参考图
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#1e3a8a'; ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(128, 128, 64, 0, Math.PI * 2); ctx.fill();
  const refDataUrl = canvas.toDataURL('image/png');
  const client = new Provider(cfg);
  const startedAt = Date.now();
  try {
    const images = await client.generateImage('把这张图里的黄色圆形变成一颗五角星，保持蓝色背景', {
      referenceImages: [refDataUrl],
      n: 1,
    });
    return {
      ok: true,
      elapsedMs: Date.now() - startedAt,
      count: images.length,
      first: images[0] ? { hasDataUrl: !!images[0].dataUrl, url: (images[0].url || '').slice(0, 90) } : null,
    };
  } catch (e) {
    return { ok: false, elapsedMs: Date.now() - startedAt, error: String(e?.message || e).slice(0, 600) };
  }
})()
