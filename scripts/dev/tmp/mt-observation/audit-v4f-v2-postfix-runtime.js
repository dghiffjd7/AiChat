(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const stores = registry.stores || {};
  const tools = stores.agentToolRegistry;
  const readContext = {
    operationIntentPolicy: { mode: 'read_only' },
    requestPermission: async () => ({ decision: 'allow' }),
  };
  const recentErrorsOutput = await tools?.executeTool?.(
    'app.read_recent_errors',
    { limit: 20 },
    readContext,
  );
  const recentErrors = recentErrorsOutput?.result?.errors
    || recentErrorsOutput?.result?.items
    || recentErrorsOutput?.result?.entries
    || recentErrorsOutput?.result
    || [];
  const stats = stores.capabilityRetrievalStore?.getStats?.() || {};
  return {
    ok: Boolean(tools?.get?.('chat.send_message')),
    activePage: document.body?.dataset?.activePage || '',
    uiMode: document.body?.dataset?.uiMode || '',
    currentSessionId: stores.chatStore?.getCurrent?.() || '',
    isGenerating: window.appBridge?.isGenerating === true,
    recentErrors: Array.isArray(recentErrors)
      ? recentErrors.map(item => ({
          at: Number(item?.at || item?.timestamp || 0),
          level: String(item?.level || item?.kind || item?.type || ''),
          message: String(item?.message || item?.error || item?.summary || item?.detail || ''),
          status: String(item?.status || ''),
          reason: String(item?.reason || item?.errorMessage || ''),
        }))
      : recentErrors,
    shadowCounters: {
      version: Number(stats.counterVersion || 0),
      startedAt: Number(stats.counterStartedAt || 0),
      pools: Array.isArray(stats.monotonicPools) ? stats.monotonicPools : [],
    },
  };
})()
