(async () => {
  const bridge = window.appBridge;
  const scriptStore = bridge.getScriptStore?.();
  const bucket = scriptStore.state.preset?.['preset-openai-1782195413072-8a6ff1'];
  const s = (bucket?.scripts || []).find(x => /对话渲染/.test(x.name));
  const content = String(s?.content || '');
  const out = [];
  let idx = 0;
  while ((idx = content.indexOf('applyInjection(', idx)) !== -1) {
    out.push({ at: idx, around: content.slice(Math.max(0, idx - 200), idx + 80).replace(/\s+/g, ' ') });
    idx += 10;
    if (out.length > 12) break;
  }
  // also find enable/config gating
  const gateIdx = content.indexOf('formatInjection');
  return {
    calls: out,
    hasFormatInjectionKey: gateIdx !== -1,
    gateAround: gateIdx !== -1 ? content.slice(Math.max(0, gateIdx - 150), gateIdx + 150).replace(/\s+/g, ' ') : '',
  };
})()
