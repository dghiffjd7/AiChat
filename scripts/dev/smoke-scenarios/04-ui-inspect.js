(async () => {
  const registry = window.appBridge.debugUiRegistry.stores.agentToolRegistry;
  const out = await registry.executeTool('app.ui.inspect', {}, {
    requestPermission: () => ({ decision: 'allow' }),
  });
  const result = out?.result || {};
  const pass = result.ok === true && Array.isArray(result.panels);
  const leaked = JSON.stringify(result).match(/sk-[A-Za-z0-9]{8,}/);
  return {
    pass: pass && !leaked,
    detail: { ok: result.ok, panelCount: (result.panels || []).length, sensitiveLeak: Boolean(leaked) },
  };
})()
