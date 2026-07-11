(async () => {
  const mod = await import('/scripts/agent/maid-capability-routing.js');
  const cfg = mod.readMaidCapabilityRoutingConfig();
  // 检查 retrieval store 持久化内容
  let storeRaw = null;
  try {
    const kvKeys = Object.keys(localStorage).filter(k => /capability/i.test(k));
    storeRaw = kvKeys.map(k => ({ key: k, size: (localStorage.getItem(k) || '').length }));
  } catch (e) { storeRaw = String(e); }
  return { config: cfg, localStorageKeys: storeRaw };
})()
