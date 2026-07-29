(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const tools = stores.agentToolRegistry;
  const allowRead = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const execute = async (name, args = {}) => {
    try {
      const output = await tools?.executeTool?.(name, args, allowRead);
      return output?.result || output || null;
    } catch (error) {
      return { ok: false, error: String(error?.message || error) };
    }
  };
  const [sessions, worldbooks, personas, state] = await Promise.all([
    execute('session.list'),
    execute('worldbook.list'),
    execute('app.read_resource', { resource: 'persona', include: ['associations'] }),
    execute('app.get_current_state'),
  ]);
  const retrievalStats = stores.capabilityRetrievalStore?.getStats?.() || {};
  const aggregates = Array.isArray(retrievalStats.aggregates) ? retrievalStats.aggregates : [];
  const v3 = aggregates.filter(item => (
    item?.retrieverVersion === 'maid-capability-retriever-v3'
    && item?.mode === 'shadow'
    && item?.effectiveMode === 'shadow'
  ));
  const sum = key => v3.reduce((total, item) => total + Number(item?.[key] || 0), 0);
  const modelCohorts = {};
  v3.forEach(item => {
    const provider = String(item?.cohort?.provider || '-');
    const model = String(item?.cohort?.model || '-');
    const key = `${provider}/${model}`;
    const current = modelCohorts[key] || {
      decisionCount: 0,
      validSelectionCount: 0,
      hitCount: 0,
      missCount: 0,
      runCount: 0,
      runCoveredCount: 0,
    };
    Object.keys(current).forEach(field => {
      current[field] += Number(item?.[field] || 0);
    });
    modelCohorts[key] = current;
  });
  return {
    ok: true,
    currentState: state,
    sessions,
    worldbooks,
    personas,
    shadowV3: {
      aggregateCount: v3.length,
      decisionCount: sum('decisionCount'),
      validSelectionCount: sum('validSelectionCount'),
      hitCount: sum('hitCount'),
      missCount: sum('missCount'),
      runCount: sum('runCount'),
      runCoveredCount: sum('runCoveredCount'),
      modelCohorts,
    },
  };
})()
