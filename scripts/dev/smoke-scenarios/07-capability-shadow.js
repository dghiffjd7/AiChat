(() => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const runtime = stores.maidCapabilityRoutingRuntime;
  const retrievalStore = stores.capabilityRetrievalStore;
  const config = runtime?.getConfig?.() || null;
  const stats = retrievalStore?.getStats?.() || null;
  const aggregates = Array.isArray(stats?.aggregates) ? stats.aggregates : [];
  const aggregateTotal = key => aggregates.reduce((total, item) => total + Number(item?.[key] || 0), 0);
  const latest = retrievalStore?.listSnapshots?.({ limit: 1 })?.[0] || null;
  const compactMetricsOk = !latest || (
    Number.isFinite(Number(latest.candidateCount)) &&
    Number.isFinite(Number(latest.selectedRank)) &&
    Number.isFinite(Number(latest.estimatedFullSchemaTokens)) &&
    Number.isFinite(Number(latest.estimatedCandidateSchemaTokens))
  );
  return {
    pass: Boolean(
      runtime &&
      retrievalStore &&
      config?.mode === 'shadow' &&
      Number.isFinite(Number(stats?.snapshotCount)) &&
      compactMetricsOk,
    ),
    detail: {
      mode: config?.mode || '',
      snapshotCount: Number(stats?.snapshotCount || 0),
      aggregateCount: Number(stats?.aggregateCount || 0),
      validSelectionCount: aggregateTotal('validSelectionCount'),
      hitCount: aggregateTotal('hitCount'),
      runCount: aggregateTotal('runCount'),
      runCoveredCount: aggregateTotal('runCoveredCount'),
      latestCandidateCount: Number(latest?.candidateCount || 0),
      latestSelectedRank: Number(latest?.selectedRank || 0),
      latestFullSchemaTokens: Number(latest?.estimatedFullSchemaTokens || 0),
      latestCandidateSchemaTokens: Number(latest?.estimatedCandidateSchemaTokens || 0),
    },
  };
})()
