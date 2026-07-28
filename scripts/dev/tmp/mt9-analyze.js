(() => {
  const stores = window.appBridge.debugUiRegistry.stores;
  const store = stores.capabilityRetrievalStore;
  const base = window.__mtBaseline || { at: 0 };
  const snaps = (store.listSnapshots({ limit: 500 }) || []).filter(s => s.createdAt >= base.at);
  const valid = snaps.filter(s => s.validSelection && !s.policyExcluded);
  const misses = valid.filter(s => !s.candidateHit);
  const stats = store.getStats();
  return {
    newSnapshots: snaps.length,
    newValid: valid.length,
    newHits: valid.length - misses.length,
    models: [...new Set(snaps.map(s => s.cohort?.model))],
    misses: misses.map(s => ({
      tool: s.selectedToolName,
      rank: s.selectedRank,
      candidates: (s.candidates || []).map(c => c.id),
      domain: s.cohort?.taskDomain,
    })),
    tools: [...new Set(valid.map(s => s.selectedToolName))],
    totals: { snapshotCount: stats.snapshotCount },
    allowClicks: window.__mtAllowLog || [],
  };
})()
