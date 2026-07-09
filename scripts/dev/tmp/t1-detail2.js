(() => {
  const reg = window.appBridge?.debugUiRegistry;
  const runStore = reg?.stores?.agentRunStore;
  const runs = runStore?.listRuns?.() || [];
  const list = (Array.isArray(runs) ? runs : runs?.runs || []).slice();
  const recent = list.sort((a, b) => (b.createdAt || b.startedAt || 0) - (a.createdAt || a.startedAt || 0)).slice(0, 2);
  return {
    done: window.__testRunDone && { ok: window.__testRunDone.ok, result: JSON.stringify(window.__testRunDone.result || window.__testRunDone.error).slice(0, 500) },
    runs: recent.map(r => ({
      id: (r.id || '').slice(0, 16), status: r.status, createdAt: r.createdAt,
      title: (r.title || '').slice(0, 60), summary: (r.summary || '').slice(0, 200),
      steps: (r.steps || []).map(s => ({ title: (s.title || '').slice(0, 40), status: s.status, summary: (s.summary || '').slice(0, 120) })),
    })),
  };
})()
