(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const runStore = registry.stores?.agentRunStore;
  const visible = node => {
    const style = getComputedStyle(node);
    const rect = node.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden'
      && rect.width > 0 && rect.height > 0;
  };
  return {
    at: Date.now(),
    runs: (runStore?.listRuns?.({ limit: 12 }) || [])
      .filter(run => Number(run?.updatedAt || run?.createdAt || 0) >= 1785463200000)
      .map(run => ({
        id: run.id,
        kind: run.kind,
        title: String(run.title || '').slice(0, 300),
        status: run.status,
        summary: String(run.summary || '').slice(0, 1000),
        errorMessage: String(run.errorMessage || ''),
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        finishedAt: run.finishedAt,
        stepCount: Array.isArray(run.steps) ? run.steps.length : 0,
        steps: (run.steps || []).slice(-6).map(step => ({
          type: step.type,
          status: step.status,
          title: String(step.title || '').slice(0, 200),
          summary: String(step.summary || '').slice(0, 500),
          errorMessage: String(step.errorMessage || ''),
        })),
      })),
    buttons: Array.from(document.querySelectorAll('button'))
      .filter(visible)
      .map(button => String(button.textContent || '').trim())
      .filter(Boolean)
      .slice(-30),
  };
})()
