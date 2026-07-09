(() => {
  const p = window.__maidModelProbe || null;
  const lp = window.__maidLoopProbe || null;
  const run = window.appBridge.debugUiRegistry.stores.agentRunStore.buildListView({ kind: 'maid_assistant', limit: 1 }).runs[0];
  return {
    modelProbe: p ? { phase: p.phase, elapsedMs: p.elapsedMs ?? (Date.now() - p.startedAt), error: p.error } : null,
    loopProbe: lp ? { stage: lp.stage, agoMs: Date.now() - lp.at } : null,
    runSteps: run?.stepCount,
    runStatus: run?.status,
    result: window.__uiTestResult || null,
  };
})()
