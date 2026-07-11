(() => {
  const data = JSON.parse(localStorage.getItem('capability_retrieval_store_v2') || '{}');
  const snaps = data.snapshots || [];
  const recent = snaps.slice(-3).map(s => ({
    phase: s.phase, mode: s.effectiveMode,
    selected: s.selectedToolName, capability: s.selectedCapabilityId,
    hit: s.candidateHit, rank: s.selectedRank, valid: s.validSelection,
    candidates: (s.candidates || []).map(c => c.id).slice(0, 8),
  }));
  const reg = window.appBridge?.debugUiRegistry;
  const runs = reg?.stores?.agentRunStore?.listRuns?.() || [];
  const latest = (Array.isArray(runs) ? runs : []).sort((a,b) => (b.createdAt||0)-(a.createdAt||0))[0];
  return {
    snapshotCount: snaps.length,
    recent,
    runMeta: latest?.metadata ? {
      lastCandidateSnapshotId: latest.metadata.lastCandidateSnapshotId,
      candidateEffectiveMode: latest.metadata.candidateEffectiveMode,
      candidateHitCount: latest.metadata.candidateHitCount,
      candidateValidSelectionCount: latest.metadata.candidateValidSelectionCount,
      candidateAllCovered: latest.metadata.candidateAllCovered,
      hasImpressionList: JSON.stringify(latest.metadata).includes('"candidates"'),
    } : null,
  };
})()
