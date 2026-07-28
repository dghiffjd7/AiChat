(() => {
  const d = window.__mtDone;
  if (!d) return { pending: true, elapsedMs: Date.now() - (window.__mtStartedAt || 0) };
  if (!d.ok) return { done: true, ok: false, error: d.error };
  const r = d.result || {};
  return {
    done: true, ok: r.ok !== false, status: r.status, failureCode: r.failureCode || null,
    message: String(r.message || '').slice(0, 220),
    steps: (r.steps || []).map(s => ({ tool: s.toolName, feature: s.featureId || undefined, status: s.status })),
    allowClicks: (window.__mtAllowLog || []).length,
  };
})()
