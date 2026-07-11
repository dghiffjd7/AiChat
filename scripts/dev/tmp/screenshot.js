(async () => {
  const tauriMod = await import('/scripts/utils/tauri.js');
  const iframe = document.querySelector('iframe');
  const r = iframe.getBoundingClientRect();
  const result = await tauriMod.safeInvoke('capture_viewport_region', {
    left: Math.max(0, r.left), top: Math.max(0, r.top),
    width: Math.min(r.width, window.innerWidth), height: Math.min(r.height, window.innerHeight - Math.max(0, r.top)),
    viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
    pixelRatio: window.devicePixelRatio || 1, maxDimension: 1400,
  });
  return { dataUrl: result?.dataUrl?.slice(0, 100), full: result?.dataUrl, w: result?.width, h: result?.height };
})()
