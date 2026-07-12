(async () => {
  const bridge = window.appBridge;
  const chatStore = bridge?.getChatStore?.() || window.chatStore;
  const presetStore = bridge.getPresetStore?.();
  const scriptRuntime = bridge.getScriptRuntime?.();
  await presetStore.ready;
  const snapshot = {
    activePreset: presetStore.getActiveId('openai'),
    currentSession: String(chatStore?.getCurrent?.() || ''),
    runtimeEnabled: scriptRuntime?.isEnabled?.() ?? null,
    runtimeKeys: scriptRuntime ? Object.getOwnPropertyNames(Object.getPrototypeOf(scriptRuntime)).slice(0, 50) : [],
  };
  window.__ps_audit_snapshot = snapshot;
  return snapshot;
})()
