(() => {
  const reg = window.appBridge?.debugUiRegistry;
  const runStore = reg?.stores?.agentRunStore;
  const runs = runStore?.listRuns?.() || [];
  const list = (Array.isArray(runs) ? runs : runs?.runs || []).slice();
  const recent = list.sort((a, b) => (b.createdAt || b.startedAt || 0) - (a.createdAt || a.startedAt || 0)).slice(0, 3);
  return {
    done: window.__testRunDone && { ok: window.__testRunDone.ok, result: JSON.stringify(window.__testRunDone.result || window.__testRunDone.error).slice(0, 400) },
    recentRuns: recent.map(r => ({
      id: (r.id || '').slice(0, 20),
      status: r.status,
      createdAt: r.createdAt,
      startedAt: r.startedAt,
      prompt: (r.prompt || r.title || r.metadata?.prompt || '').slice(0, 80),
      keys: Object.keys(r).slice(0, 15),
      steps: (r.steps || []).map(s => ({ keys: Object.keys(s).slice(0, 12), tool: s.tool || s.toolName || s.name, status: s.status })),
    })),
  };
})()
