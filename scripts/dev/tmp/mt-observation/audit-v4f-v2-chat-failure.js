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
  const sessionId = '艾琳·洛';
  const messages = stores.chatStore?.getMessages?.(sessionId) || [];
  const runs = stores.agentRunStore?.listRuns?.({ limit: 30 }) || [];
  const traceStore = stores.traceTimeline;
  const traceMethods = traceStore
    ? Array.from(new Set([
      ...Object.getOwnPropertyNames(traceStore),
      ...Object.getOwnPropertyNames(Object.getPrototypeOf(traceStore) || {}),
    ])).sort()
    : [];
  let traces = [];
  for (const method of ['list', 'listEvents', 'getEvents', 'exportState', 'snapshot']) {
    if (typeof traceStore?.[method] !== 'function') continue;
    try {
      const value = await traceStore[method]({ limit: 100 });
      traces.push({ method, value });
    } catch (error) {
      traces.push({ method, error: String(error?.message || error) });
    }
  }
  return {
    bridge: {
      isGenerating: window.appBridge?.isGenerating === true,
      activePage: document.body?.dataset?.activePage || '',
      uiMode: document.body?.dataset?.uiMode || '',
    },
    session: {
      currentId: stores.chatStore?.getCurrent?.() || '',
      messages: messages.map(message => ({
        id: String(message?.id || ''),
        role: String(message?.role || ''),
        type: String(message?.type || ''),
        content: String(message?.content || ''),
        rawOriginal: String(message?.rawOriginal || ''),
        rawOriginalRef: message?.rawOriginalRef || null,
        meta: message?.meta || null,
        timestamp: Number(message?.timestamp || message?.sentAt || 0),
      })),
    },
    recentErrors: recentErrorsOutput?.result || recentErrorsOutput || null,
    recentRuns: runs.map(run => ({
      id: run.id,
      kind: run.kind,
      title: run.title,
      status: run.status,
      summary: run.summary,
      errorMessage: run.errorMessage,
      cancelReason: run.cancelReason,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
      metadata: run.metadata || null,
      steps: (run.steps || []).map(step => ({
        id: step.id,
        type: step.type,
        toolName: step.toolName,
        status: step.status,
        summary: step.summary,
        errorMessage: step.errorMessage,
        metadata: step.metadata || null,
      })),
    })),
    traceMethods,
    traces,
  };
})()
