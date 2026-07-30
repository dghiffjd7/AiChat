(() => {
  const bridge = window.appBridge;
  const store = bridge?.getRegexStore?.();
  const set = store?.listLocalSets?.().find(item => item?.bind?.worldId === '- juus -');
  if (!store || !set) return { error: 'juus regex set unavailable' };
  const rules = (set.rules || []).filter(rule => (
    rule
    && rule.disabled !== true
    && rule.markdownOnly === true
    && Array.isArray(rule.placement)
    && rule.placement.includes(2)
  ));
  let output = 'juus的开局测试';
  const steps = [];
  for (const rule of rules) {
    const inputLength = output.length;
    const startedAt = performance.now();
    output = store.runRegexScript(rule, output, {});
    steps.push({
      id: String(rule.id || ''),
      name: String(rule.scriptName || ''),
      inputLength,
      outputLength: output.length,
      elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
    });
  }
  return {
    finalOutputLength: output.length,
    totalMs: Math.round(steps.reduce((sum, step) => sum + step.elapsedMs, 0) * 100) / 100,
    steps,
  };
})()
