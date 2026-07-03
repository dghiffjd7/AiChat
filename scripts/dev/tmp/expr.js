(async () => {
  const actions = window.appBridge.debugUiRegistry.actions;
  await actions.setAgentFeatureEnabled({ id: 'reply_check', enabled: true });
  const state = actions.getAgentFeatureSettings()?.features?.reply_check || {};
  return { enabled: state.enabled, triggerMode: state.triggerMode, modelMode: state.modelMode };
})()
