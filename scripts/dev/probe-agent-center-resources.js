(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const getSettings = registry.actions?.getAgentCenterSettings;
  const panel = registry.panels?.agentCenterPanel || registry.panels?.agentCenter;
  const view = panel?.view || null;
  const resources = Array.isArray(view?.resources) ? view.resources : [];
  return {
    panelFound: Boolean(panel),
    resourceTargets: resources.map(item => ({
      id: item.id,
      title: item.title,
      target: item.target || null,
      shortcuts: (item.shortcuts || []).map(s => ({ label: s.label, promptId: s.promptId })),
    })),
  };
})()
