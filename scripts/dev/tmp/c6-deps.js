(async () => {
  const iframe = document.querySelector('iframe');
  const win = iframe.contentWindow;
  const doc = iframe.contentDocument;
  // CDN 库全局是否就位
  const libs = {
    Dexie: typeof win.Dexie,
    AV: typeof win.AV,
    echarts: typeof win.echarts,
    React: typeof win.React,
    ReactDOM: typeof win.ReactDOM,
  };
  // IndexedDB 可用性
  let idb = 'unknown';
  try {
    const req = win.indexedDB?.open?.('__probe__', 1);
    idb = req ? 'open-ok' : 'no-indexedDB';
    if (req) req.onsuccess = () => { try { req.result.close(); win.indexedDB.deleteDatabase('__probe__'); } catch {} };
  } catch (e) { idb = 'ERR:' + String(e?.message || e).slice(0, 60); }
  // script[src] 实际加载状态（resource timing）
  const perf = win.performance?.getEntriesByType?.('resource') || [];
  const scriptRes = perf.filter(r => /jsdelivr|unpkg|dexie|react|echarts|leancloud/i.test(r.name)).map(r => ({
    url: r.name.slice(0, 70), duration: Math.round(r.duration), size: r.transferSize ?? -1,
  }));
  return { libs, idb, scriptResources: scriptRes, fallback: iframe.dataset.staticFallbackApplied, iframeError: (iframe.dataset.iframeError || '').slice(0, 100) };
})()
