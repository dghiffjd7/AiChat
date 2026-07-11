(() => {
  const bridge = window.appBridge;
  const s = bridge.getRegexStore?.().getState?.();
  const set = Object.values(s?.local?.sets || {}).find(x => /凡人修仙/.test(x?.name || ''));
  const rule = (set?.rules || []).find(r => String(r.replaceString || '').length > 1000000);
  const rep = String(rule?.replaceString || '');
  const positions = [];
  let idx = -1;
  while ((idx = rep.indexOf('```', idx + 1)) !== -1 && positions.length < 32) {
    positions.push({ at: idx, context: rep.slice(Math.max(0, idx - 40), idx + 20).replace(/\n/g, '\\n') });
  }
  return {
    total: rep.length,
    endsWithFence: rep.trimEnd().endsWith('```'),
    tail: rep.slice(-80).replace(/\n/g, '\\n'),
    fencePositions: positions.map(p => ({ at: p.at, ctx: p.context.slice(-50) })),
  };
})()
