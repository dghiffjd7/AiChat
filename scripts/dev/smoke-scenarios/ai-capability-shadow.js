(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const actions = registry.actions || {};
  const stores = registry.stores || {};
  const routing = stores.maidCapabilityRoutingRuntime;
  const retrievalStore = stores.capabilityRetrievalStore;
  const agentRunStore = stores.agentRunStore;
  if (!routing || !retrievalStore || !agentRunStore || !actions.runMaidAssistantPrompt) {
    return { pass: false, detail: { reason: 'capability shadow debug contracts unavailable' } };
  }
  let maxHeartbeatGapMs = 0;
  let lastHeartbeatAt = performance.now();
  const heartbeat = setInterval(() => {
    const current = performance.now();
    maxHeartbeatGapMs = Math.max(maxHeartbeatGapMs, current - lastHeartbeatAt);
    lastHeartbeatAt = current;
  }, 50);
  const startedAt = performance.now();
  const beforeIds = new Set(retrievalStore.listSnapshots({ limit: 500 }).map(item => item.id));
  let result = null;
  try {
    result = await actions.runMaidAssistantPrompt({
      input: '帮我看看当前会话用了哪些资源，并简短告诉我结果',
    });
    await retrievalStore.flush?.();
    await new Promise(resolve => setTimeout(resolve, 80));
  } finally {
    clearInterval(heartbeat);
  }
  const elapsedMs = Math.round(performance.now() - startedAt);
  const freshSnapshots = retrievalStore.listSnapshots({ limit: 500 })
    .filter(item => !beforeIds.has(item.id));
  const latestRun = agentRunStore.listRuns({ kind: 'maid_assistant', limit: 1 })[0] || null;
  const compactSteps = (latestRun?.steps || []).filter(step => step?.input?.candidateSnapshotId);
  const runJson = JSON.stringify(latestRun || {});
  return {
    pass: Boolean(
      result?.ok === true &&
      result?.capabilityRouting?.mode === 'shadow' &&
      freshSnapshots.length >= 1 &&
      freshSnapshots.every(item => item.mode === 'shadow' && item.effectiveMode === 'shadow') &&
      compactSteps.length >= 1 &&
      !runJson.includes('"candidates"') &&
      maxHeartbeatGapMs < 200
    ),
    detail: {
      ok: result?.ok === true,
      mode: result?.capabilityRouting?.mode || '',
      decisions: result?.capabilityRouting?.decisionCount || 0,
      validSelections: result?.capabilityRouting?.validSelectionCount || 0,
      hits: result?.capabilityRouting?.hitCount || 0,
      freshSnapshots: freshSnapshots.length,
      runId: latestRun?.id || '',
      compactStepRefs: compactSteps.length,
      runContainsCandidates: runJson.includes('"candidates"'),
      elapsedMs,
      maxHeartbeatGapMs: Math.round(maxHeartbeatGapMs),
    },
  };
})()
