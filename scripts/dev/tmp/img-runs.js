(() => {
  const reg = window.appBridge?.debugUiRegistry;
  const runStore = reg?.stores?.agentRunStore;
  const arr = (runStore?.listRuns?.() || []);
  const list = Array.isArray(arr) ? arr : arr?.runs || [];
  const imageRuns = list
    .filter(r => /image/i.test(String(r.kind || r.title || '')) || (r.steps || []).some(s => /image/i.test(String(s.type || s.title || ''))))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 4)
    .map(r => ({
      id: (r.id || '').slice(0, 14), status: r.status, createdAt: r.createdAt,
      title: (r.title || '').slice(0, 40),
      err: (r.errorMessage || '').slice(0, 300),
      meta: r.metadata ? { provider: r.metadata.provider, model: r.metadata.model } : null,
      steps: (r.steps || []).map(s => ({ t: (s.title || s.type || '').slice(0, 24), status: s.status, err: (s.errorMessage || '').slice(0, 300) })),
    }));
  return imageRuns;
})()
