(() => {
  const r = window.__testRunDone?.result;
  if (!r) return null;
  return {
    reactStopped: r.reactStoppedReason || r.reason,
    decision: r.finalDecision && JSON.stringify(r.finalDecision).slice(0, 500),
    lastReact: r.lastReactDecision && JSON.stringify(r.lastReactDecision).slice(0, 500),
    steps: (r.steps || []).map(s => ({ i: s.index, tool: s.toolName, status: s.status, reason: s.reason })),
    topKeys: Object.keys(r),
  };
})()
