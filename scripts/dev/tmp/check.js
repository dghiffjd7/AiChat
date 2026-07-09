(() => {
  const reg = window.appBridge.debugUiRegistry;
  const run = reg.stores.agentRunStore.buildListView({ kind: 'maid_assistant', limit: 1 }).runs[0];
  return { status: run?.status, steps: run?.stepCount, last: run?.lastStep ? `${run.lastStep.type}:${run.lastStep.status} ${String(run.lastStep.summary || '').slice(0, 60)}` : null, agoSec: Math.round((Date.now() - (run?.updatedAt || 0)) / 1000) };
})()
