(() => {
  const r = window.__testRunDone?.result;
  const steps = (r?.steps || []).map(s => ({
    tool: s.toolName, status: s.status,
    out: JSON.stringify(s.output || {}).slice(0, 300),
  }));
  return { steps, clicks: (window.__testClickerLog || []).slice(-4) };
})()
