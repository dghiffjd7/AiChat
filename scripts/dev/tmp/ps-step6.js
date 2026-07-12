(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const scriptStore = bridge.getScriptStore?.();
  const sid = '脚本测试室';
  const sessionSettings = scriptRuntime.getSessionSettings?.(sid) || {};
  const bucket = scriptStore.state.preset?.['preset-openai-1782195413072-8a6ff1'];
  const settings = (window.appSettings || bridge.getAppSettings?.())?.get?.() || {};
  return {
    isEnabledNoArg: scriptRuntime.isEnabled(),
    isEnabledSid: scriptRuntime.isEnabled(sid),
    sessionScriptEnabled: sessionSettings.scriptEnabled,
    globalScriptEnabled: settings.scriptEnabled,
    scriptFlags: (bucket?.scripts || []).map(s => ({
      name: String(s.name).slice(0, 24),
      enabled: s.enabled,
      authorized: s.authorized,
      esmLike: /\bimport\s|export\s/.test(String(s.content || '').slice(0, 2000)),
    })),
  };
})()
