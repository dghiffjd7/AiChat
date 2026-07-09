(() => {
  const reg = window.appBridge?.debugUiRegistry;
  const runStore = reg?.stores?.agentRunStore;
  const list = (runStore?.listRuns?.() || []);
  const arr = Array.isArray(list) ? list : list?.runs || [];
  const run = arr.find(r => (r.id || '').startsWith('run:4fc3a748'));
  return {
    done: window.__testRunDone ? JSON.stringify(window.__testRunDone).slice(0, 700) : null,
    status: run?.status, errorMessage: run?.errorMessage, cancelReason: run?.cancelReason,
    summary: (run?.summary || '').slice(0, 300),
    metadata: run?.metadata && JSON.stringify(run.metadata).slice(0, 400),
    steps: (run?.steps || []).map(s => ({ title: s.title, status: s.status, err: s.errorMessage, summary: (s.summary || '').slice(0, 150) })),
  };
})()
