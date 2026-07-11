(() => {
  const ps = window.appBridge?.presets;
  const state = ps.getState?.() || {};
  const openaiPresets = Object.keys(state?.presets?.openai || {});
  return {
    activeOpenai: state?.active?.openai,
    openaiPresetIds: openaiPresets.slice(0, 25),
    hasTarget: openaiPresets.includes('preset-openai-1783349895'),
  };
})()
