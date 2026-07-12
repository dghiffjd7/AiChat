(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const wire = window.__ps_wire || [];
  const byType = {};
  wire.forEach(w => { const k = `${w.dir}:${w.type}`; byType[k] = (byType[k] || 0) + 1; });
  const le = scriptRuntime.listenerEvents;
  const listeners = le instanceof Set ? Array.from(le) : (le instanceof Map ? Array.from(le.keys()) : Object.keys(le || {}));
  return {
    wireByType: byType,
    listeners,
    injSize: scriptRuntime.scriptPromptInjections?.size,
    iframeScripts: (scriptRuntime.iframeRuntime?.iframes instanceof Map) ? Array.from(scriptRuntime.iframeRuntime.iframes.keys()) : Object.keys(scriptRuntime.iframeRuntime?.iframes || {}),
  };
})()
