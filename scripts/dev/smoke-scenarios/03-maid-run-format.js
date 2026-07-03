(async () => {
  const runs = window.appBridge.debugUiRegistry.actions.listAgentRuns({ kind: 'maid_assistant', limit: 10 }) || [];
  const withGoal = runs.filter(r => String(r?.metadata?.goal || '').trim());
  const pass = runs.length === 0 || withGoal.length > 0;
  return {
    pass,
    detail: {
      runCount: runs.length,
      newFormatCount: withGoal.length,
      latestGoal: String(withGoal[0]?.metadata?.goal || '').slice(0, 60),
    },
  };
})()
