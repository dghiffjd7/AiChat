(async () => {
  const reg = window.appBridge?.debugUiRegistry;
  const actions = reg?.actions || {};
  const fn = actions.inspectVisiblePanels || actions.buildAgentVisiblePanelSummary || actions.appUiInspect;
  if (!fn) return { actions: Object.keys(actions).filter(k => /inspect|panel|ui/i.test(k)) };
  const out = await fn();
  return typeof out === 'string' ? out.slice(0, 1500) : JSON.stringify(out).slice(0, 1500);
})()
