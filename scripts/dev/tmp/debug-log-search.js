(() => {
  const reg = window.appBridge.debugUiRegistry;
  const tl = reg.stores.traceTimeline;
  const tlMethods = tl ? Object.getOwnPropertyNames(Object.getPrototypeOf(tl)).slice(0, 12) : null;
  // emitDebugLog 的去处：常见 window.__debugLogs 或 debug panel store
  const candidates = ['__debugLogs', '__chatappDebugLogs', '__appDebugLog'];
  const found = candidates.filter(k => Array.isArray(window[k]));
  let hits = [];
  for (const k of found) {
    hits = window[k].filter(l => /blob-script-error|iframe-error/.test(JSON.stringify(l))).slice(-5);
    if (hits.length) break;
  }
  return { tlMethods, foundBuffers: found, hits: hits.map(h => JSON.stringify(h).slice(0, 300)) };
})()
