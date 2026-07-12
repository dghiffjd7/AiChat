(async () => {
  const bridge = window.appBridge;
  const presetStore = bridge.getPresetStore?.();
  await presetStore.ready;
  const b = presetStore.getBindings?.('openai') || {};
  return {
    bindings: b,
    active: presetStore.getActiveId('openai'),
  };
})()
