(async () => {
  const bridge = window.appBridge;
  if (!bridge) return { error: 'appBridge unavailable' };
  await bridge.waitForRegexStoreReady?.();
  const store = bridge.getRegexStore?.();
  if (!store) return { error: 'regex store unavailable' };
  const baseContext = bridge.getRegexContext?.() || {};
  const localSets = store.listLocalSets?.() || [];
  const sourceByRuleId = new Map();
  localSets.forEach((set) => {
    (set.rules || []).forEach((rule) => {
      sourceByRuleId.set(String(rule.id || ''), String(set?.bind?.type || ''));
    });
  });

  const samples = new Map([
    ['苏晓彤', 'probe'],
    ['- juus -', 'juus的开局测试'],
    ['《凡人修仙传V10.91》', 'lucklyjkop'],
    ['【Sgw】又看一集', '<ztl>{"mode":"关"}</ztl>'],
    ['海贼王', '<content>正文</content><state_bar>状态</state_bar>'],
  ]);
  const results = [];
  for (const [worldId, input] of samples) {
    const context = {
      ...baseContext,
      worldId,
      worldIds: [worldId],
      macroVars: {},
    };
    const activeRules = store.computeActiveRules?.(context) || [];
    const types = activeRules
      .map(rule => sourceByRuleId.get(String(rule.id || '')))
      .filter(type => type === 'preset' || type === 'world');
    const firstWorldIndex = types.indexOf('world');
    const lastPresetIndex = types.lastIndexOf('preset');
    const startedAt = performance.now();
    const output = store.apply(input, context, 2, {
      isMarkdown: true,
      isPrompt: false,
      isEdit: false,
    });
    results.push({
      worldId,
      inputLength: input.length,
      outputLength: String(output).length,
      elapsedMs: Math.round((performance.now() - startedAt) * 100) / 100,
      activeRuleCount: activeRules.length,
      presetBeforeWorld: lastPresetIndex < 0 || firstWorldIndex < 0 || lastPresetIndex < firstWorldIndex,
      hasHtmlFence: /```\s*html/i.test(String(output)),
      hasScript: /<script\b/i.test(String(output)),
    });
  }

  const lagStartedAt = performance.now();
  await new Promise(resolve => setTimeout(resolve, 20));
  return {
    activePreset: baseContext.activePresets?.openai || '',
    results,
    postRunLagMs: Math.round((performance.now() - lagStartedAt - 20) * 100) / 100,
  };
})()
