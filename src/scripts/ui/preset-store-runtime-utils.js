const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolvePresetBridge = (bridge = null) => bridge || getDefaultBridge();

export const getPresetStore = (bridge = null) => {
  const runtime = resolvePresetBridge(bridge);
  if (typeof runtime?.getPresetStore === 'function') return runtime.getPresetStore() || null;
  return runtime?.['presets'] || null;
};

export const createPresetStoreRuntimeAdapter = (bridge = null) => getPresetStore(bridge);
