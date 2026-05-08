const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolveRuntimeServiceBridge = (bridge = null) => bridge || getDefaultBridge();

export const getPluginRuntime = (bridge = null) => {
  const runtime = resolveRuntimeServiceBridge(bridge);
  if (typeof runtime?.getPluginRuntime === 'function') return runtime.getPluginRuntime() || null;
  return runtime?.['pluginRuntime'] || null;
};
