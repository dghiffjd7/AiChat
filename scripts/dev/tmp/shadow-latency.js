(() => {
  const data = JSON.parse(localStorage.getItem('capability_retrieval_store_v2') || '{}');
  const lat = (data.snapshots || []).map(s => s.latencyMs);
  if (window.__testClicker) clearInterval(window.__testClicker);
  return { latencies: lat, max: Math.max(...lat) };
})()
