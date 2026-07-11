(async () => {
  await window.appBridge.presets.setActive('openai', 'Default');
  await window.appBridge.scriptRuntime.syncScripts();
  return { preset: window.appBridge.presets.getActiveId('openai') };
})()
