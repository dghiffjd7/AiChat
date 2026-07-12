(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const settingsStore = window.appSettings || bridge.getAppSettings?.();
  let settingsPath = 'none';
  try {
    if (settingsStore?.set) { await settingsStore.set({ mirrorConsole: true }); settingsPath = 'store.set'; }
    else if (settingsStore?.update) { await settingsStore.update({ mirrorConsole: true }); settingsPath = 'store.update'; }
  } catch (e) { settingsPath = 'ERR ' + e.message; }
  window.__ps_rpc2 = [];
  await scriptRuntime.restartWorker?.();
  await new Promise(r => setTimeout(r, 15000));
  const inj = scriptRuntime.scriptPromptInjections;
  const methods = {};
  window.__ps_rpc2.forEach(r => { methods[r.method] = (methods[r.method] || 0) + 1; });
  return {
    settingsPath,
    rpcCount: window.__ps_rpc2.length,
    methods,
    logs: window.__ps_rpc2.filter(r => r.method === 'log').map(r => r.brief.slice(0, 260)).slice(-40),
    injSize: inj?.size,
  };
})()
