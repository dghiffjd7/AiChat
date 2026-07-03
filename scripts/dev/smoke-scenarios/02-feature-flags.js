(async () => {
  const state = window.appBridge.debugUiRegistry.actions.getAgentFeatureSettings()?.features?.reply_check || {};
  const pass = state.enabled === true && state.modelMode === 'profile' && Boolean(state.modelProfileId);
  return { pass, detail: state };
})()
