(() => {
  const store = window.appBridge?.debugUiRegistry?.stores?.capabilityRetrievalStore;
  const stats = store?.getStats?.() || {};
  const aggregates = (Array.isArray(stats.aggregates) ? stats.aggregates : [])
    .filter(item => item?.retrieverVersion === 'maid-capability-retriever-v3');
  const sum = key => aggregates.reduce((total, item) => total + Number(item?.[key] || 0), 0);
  return {
    retrieverVersion: 'maid-capability-retriever-v3',
    snapshotCount: Number(stats.snapshotCount || 0),
    aggregateCount: aggregates.length,
    decisionCount: sum('decisionCount'),
    validSelectionCount: sum('validSelectionCount'),
    hitCount: sum('hitCount'),
    missCount: sum('validSelectionCount') - sum('hitCount'),
    runCount: sum('runCount'),
    runCoveredCount: sum('runCoveredCount'),
  };
})()
