(() => {
  const reg = window.appBridge?.debugUiRegistry || {};
  return {
    actions: Object.keys(reg.actions || {}),
    stores: Object.keys(reg.stores || {}),
    hasScriptRuntime: !!window.scriptRuntime,
    scriptRuntimeKeys: window.scriptRuntime ? Object.keys(window.scriptRuntime).slice(0, 40) : [],
    bridgeScriptRuntime: typeof window.appBridge?.getScriptRuntime,
  };
})()
