(() => {
  const visible = (node) => {
    if (!node || !node.isConnected) return false;
    const style = getComputedStyle(node);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = node.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  };
  const buttons = [...document.querySelectorAll('button')].filter(visible);
  const state = window.__obsTaskState || null;
  const runStore = window.appBridge?.debugUiRegistry?.stores?.agentRunStore;
  const beforeRuns = new Set(state?.runIdsBefore || []);
  const newRuns = (runStore?.listRuns?.({ limit: 500 }) || [])
    .filter(run => !beforeRuns.has(run.id))
    .map(run => ({
      id: run.id,
      status: run.status,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      steps: (run.steps || []).map(step => ({
        id: step.id,
        kind: step.kind,
        status: step.status,
        title: step.title,
        error: step.error || null,
      })),
    }));
  return {
    task: state
      ? {
          taskId: state.taskId,
          prompt: state.prompt,
          startedAt: state.startedAt,
          pending: state.pending,
          done: state.done,
          finishedAt: state.finishedAt || null,
          thrown: state.thrown || null,
          resultStatus: state.result?.status || null,
        }
      : null,
    loopProbe: window.__maidLoopProbe || null,
    newRuns,
    visibleButtons: buttons
      .map(item => String(item.textContent || '').trim())
      .filter(Boolean)
      .slice(-30),
  };
})()
