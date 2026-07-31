(async () => {
  const retrievalStore = window.appBridge?.debugUiRegistry?.stores?.capabilityRetrievalStore;
  const retrievalStats = retrievalStore?.getStats?.() || {};
  const items = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = String(localStorage.key(index) || '');
    const value = String(localStorage.getItem(key) || '');
    items.push({ key, bytesApprox: value.length * 2 });
  }
  const families = {};
  for (const item of items) {
    const family = [
      'memory_snapshot_payload_v1',
      'memory_snapshot_refs_v1',
      'rp_session_v1',
      'persona_archive_store_v1',
      'turn_checkpoint_v1',
      'capability_retrieval_store_v2',
      'worldinfo_store',
    ].find(prefix => item.key.startsWith(prefix)) || 'other';
    const current = families[family] || { count: 0, bytesApprox: 0 };
    current.count += 1;
    current.bytesApprox += item.bytesApprox;
    families[family] = current;
  }
  return {
    capturedAt: Date.now(),
    itemCount: items.length,
    totalBytesApprox: items.reduce((total, item) => total + item.bytesApprox, 0),
    families,
    retainedTierKeys: items
      .filter(item => /^(?:memory_snapshot_payload_v1|rp_session_v1|persona_archive_store_v1|turn_checkpoint_v1)/.test(item.key))
      .sort((a, b) => b.bytesApprox - a.bytesApprox),
    shadowCounters: {
      version: retrievalStats.counterVersion || 0,
      startedAt: retrievalStats.counterStartedAt || 0,
      poolCount: Array.isArray(retrievalStats.monotonicPools)
        ? retrievalStats.monotonicPools.length
        : 0,
      pools: retrievalStats.monotonicPools || [],
    },
  };
})()
