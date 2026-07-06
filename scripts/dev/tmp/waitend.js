(() => {
  const reg = window.appBridge.debugUiRegistry;
  const runs = reg.stores.agentRunStore.buildListView({ kind: 'maid_assistant', limit: 1 });
  const run = runs.runs[0];
  return { status: run?.status, steps: run?.stepCount, agoSec: Math.round((Date.now() - (run?.updatedAt || 0)) / 1000) };
})()
