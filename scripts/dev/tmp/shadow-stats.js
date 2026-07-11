(() => {
  const raw = localStorage.getItem('capability_retrieval_store_v2');
  const data = JSON.parse(raw || '{}');
  const snaps = data.snapshots || data.records || [];
  const agg = data.aggregates || data.rollup || null;
  return {
    topKeys: Object.keys(data),
    snapshotCount: Array.isArray(snaps) ? snaps.length : 'n/a',
    sample: Array.isArray(snaps) && snaps.length ? (() => { const s = snaps[snaps.length-1]; return { keys: Object.keys(s), hit: s.candidateHit, mode: s.effectiveMode, tool: s.selectedToolName, rank: s.selectedRank, candidateCount: s.candidateCount, hasBase64: JSON.stringify(s).includes('data:image'), size: JSON.stringify(s).length }; })() : null,
    aggregates: agg ? JSON.stringify(agg).slice(0, 500) : null,
  };
})()
