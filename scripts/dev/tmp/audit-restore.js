(async () => {
  const ps = window.appBridge?.presets;
  await ps.setActive('openai', 'Default');
  await window.appBridge?.scriptRuntime?.syncScripts?.();
  return { restored: ps.getActiveId?.('openai'), workerAlive: !!window.appBridge?.scriptRuntime?.worker };
})()
