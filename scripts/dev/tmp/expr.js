(() => {
  const reg = window.appBridge.debugUiRegistry;
  const run = reg.stores.agentRunStore.buildListView({ kind: 'maid_assistant', limit: 1 }).runs[0];
  return { status: run.status, failureCode: run.failureCode, error: String(run.errorMessage || '').slice(0, 120), lastStep: run.lastStep?.summary };
})()
