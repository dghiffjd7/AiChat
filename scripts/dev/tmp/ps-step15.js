(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const scriptStore = bridge.getScriptStore?.();
  const bucket = scriptStore.state.preset?.['preset-openai-1782195413072-8a6ff1'];
  const iframeIds = (scriptRuntime.iframeRuntime?.iframes instanceof Map)
    ? Array.from(scriptRuntime.iframeRuntime.iframes.keys())
    : Object.keys(scriptRuntime.iframeRuntime?.iframes || {});
  const scripts = (bucket?.scripts || []).map(s => ({
    id: String(s.id),
    name: String(s.name).slice(0, 30),
    size: String(s.content || '').length,
    inIframe: iframeIds.includes(String(s.id)),
  }));
  // limits
  return {
    scripts,
    iframeIds,
    limits: { max: window.SCRIPT_MAX_BYTES, total: window.SCRIPT_TOTAL_BYTES },
  };
})()
