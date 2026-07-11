(() => {
  // 找被丢弃的原始回复：bridge/debug 的 lastRawResponse
  const cands = [
    window.appBridge?.lastRawResponse,
    window.appBridge?.getLastRawResponse?.(),
    window.appBridge?.debugState?.lastRawResponse,
  ];
  for (const c of cands) {
    if (typeof c === 'string' && c.trim()) return { source: 'bridge', head: c.slice(0, 500), size: c.length };
  }
  const keys = Object.keys(window.appBridge || {}).filter(k => /raw|last/i.test(k)).slice(0, 10);
  return { notFound: true, bridgeKeys: keys };
})()
