(() => {
  const store = window.appBridge?.debugUiRegistry?.stores?.capabilityRetrievalStore;
  const stats = store?.getStats?.() || {};
  const aggregates = (Array.isArray(stats.aggregates) ? stats.aggregates : []).filter(item => (
    item?.retrieverVersion === 'maid-capability-retriever-v3'
    && item?.mode === 'shadow'
    && item?.effectiveMode === 'shadow'
  ));
  const byModel = {};
  const fields = [
    'decisionCount',
    'validSelectionCount',
    'hitCount',
    'missCount',
    'runCount',
    'runCoveredCount',
  ];
  aggregates.forEach(item => {
    const key = `${item?.cohort?.provider || '-'}/${item?.cohort?.model || '-'}`;
    const current = byModel[key] || Object.fromEntries(fields.map(field => [field, 0]));
    fields.forEach(field => {
      current[field] += Number(item?.[field] || 0);
    });
    byModel[key] = current;
  });
  return { ok: true, byModel };
})()
