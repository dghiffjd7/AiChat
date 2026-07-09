(() => {
  const r = window.__testRunDone?.result;
  if (!r) return { pending: true, elapsed: Date.now() - (window.__testRunStartedAt || 0), loop: window.__maidLoopProbe, model: window.__maidModelProbe && { phase: window.__maidModelProbe.phase, elapsedMs: window.__maidModelProbe.elapsedMs } };
  return {
    ok: r.ok, status: r.status, reason: r.reason, failureCode: r.failureCode,
    message: (r.message || '').slice(0, 400),
    steps: (r.steps || []).map(s => ({ i: s.index, tool: s.toolName, feature: s.featureId, status: s.status, args: JSON.stringify(s.args || {}).slice(0, 120) })),
    clicks: (window.__testClickerLog || []).slice(-8),
    uiLagMax: (window.__uiLagSamples || []).length ? Math.max(...window.__uiLagSamples) : null,
  };
})()
