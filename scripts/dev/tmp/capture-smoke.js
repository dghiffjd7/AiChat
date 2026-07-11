(async () => {
  const tauriMod = await import('/scripts/utils/tauri.js');
  try {
    const result = await tauriMod.safeInvoke('capture_viewport_region', {
      left: 10, top: 10, width: 200, height: 120,
      viewportWidth: window.innerWidth, viewportHeight: window.innerHeight,
      pixelRatio: window.devicePixelRatio || 1,
      maxDimension: 800,
    });
    return {
      ok: true,
      mime: result?.mime,
      width: result?.width, height: result?.height, bytes: result?.bytes,
      isPng: String(result?.dataUrl || '').startsWith('data:image/png;base64,'),
    };
  } catch (e) {
    return { ok: false, error: String(e?.message || e).slice(0, 300) };
  }
})()
