(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge?.getScriptRuntime?.();
  if (!scriptRuntime) return { error: 'runtime not ready' };
  const presetStore = bridge.getPresetStore?.();
  await presetStore.ready;
  const active = presetStore.getActiveId('openai');
  // wait for scripts to boot and inject
  await new Promise(r => setTimeout(r, 12000));
  const inj = scriptRuntime.scriptPromptInjections;
  const detail = [];
  if (inj instanceof Map) {
    inj.forEach((v, k) => {
      const inner = v instanceof Map ? Array.from(v.entries()) : Object.entries(v || {});
      inner.forEach(([key, block]) => detail.push({
        session: String(k),
        key: String(key).slice(0, 60),
        position: block?.position || '',
        len: String(block?.content || block?.text || '').length,
        head: String(block?.content || block?.text || '').slice(0, 100),
      }));
    });
  }
  const iframeIds = (scriptRuntime.iframeRuntime?.iframes instanceof Map)
    ? Array.from(scriptRuntime.iframeRuntime.iframes.keys())
    : Object.keys(scriptRuntime.iframeRuntime?.iframes || {});
  return {
    activePreset: active,
    injSize: inj?.size,
    detail,
    iframeCount: iframeIds.length,
    currentSession: String(bridge.getChatStore?.()?.getCurrent?.() || ''),
  };
})()
