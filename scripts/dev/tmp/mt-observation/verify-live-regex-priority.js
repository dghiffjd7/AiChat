(async () => {
  const bridge = window.appBridge;
  if (!bridge) return { error: 'appBridge unavailable' };
  await bridge.waitForRegexStoreReady?.();
  const context = bridge.getRegexContext?.() || {};
  const store = bridge.getRegexStore?.();
  if (!store) return { error: 'regex store unavailable' };

  const localSets = store.listLocalSets?.() || [];
  const ruleSources = new Map();
  localSets.forEach((set) => {
    (set.rules || []).forEach((rule) => {
      ruleSources.set(String(rule.id || ''), {
        bindType: String(set?.bind?.type || ''),
        setName: String(set?.name || ''),
      });
    });
  });
  const activeRules = (store.computeActiveRules?.(context) || []).map((rule) => ({
    id: String(rule.id || ''),
    name: String(rule.scriptName || ''),
    ...(ruleSources.get(String(rule.id || '')) || { bindType: 'global-or-session', setName: '' }),
  }));
  const localTypes = activeRules
    .map(rule => rule.bindType)
    .filter(type => type === 'preset' || type === 'world');
  const firstWorldIndex = localTypes.indexOf('world');
  const lastPresetIndex = localTypes.lastIndexOf('preset');

  const frames = Array.from(document.querySelectorAll('.chat-codeblock iframe')).map((iframe) => ({
    srcdocLength: String(iframe.srcdoc || '').length,
    source: String(iframe.dataset?.iframeSource || ''),
    allowScripts: String(iframe.dataset?.iframeAllowScripts || ''),
    execution: String(iframe.closest('.chat-codeblock')?.dataset?.richRenderExecution || ''),
  }));

  const lagSamples = [];
  for (let index = 0; index < 12; index += 1) {
    const startedAt = performance.now();
    await new Promise(resolve => setTimeout(resolve, 10));
    lagSamples.push(Math.round((performance.now() - startedAt - 10) * 100) / 100);
  }

  return {
    readyState: document.readyState,
    activeSessionId: bridge.getActiveSessionId?.() || '',
    uiMode: context.uiMode || '',
    worldId: context.worldId || '',
    worldIds: context.worldIds || [],
    activePresets: context.activePresets || {},
    activeRuleCount: activeRules.length,
    activeRuleTypes: localTypes,
    presetBeforeWorld: lastPresetIndex < 0 || firstWorldIndex < 0 || lastPresetIndex < firstWorldIndex,
    activeRules,
    frameCount: frames.length,
    frames,
    lagMaxMs: Math.max(...lagSamples),
    lagAverageMs: Math.round((lagSamples.reduce((sum, value) => sum + value, 0) / lagSamples.length) * 100) / 100,
  };
})()
