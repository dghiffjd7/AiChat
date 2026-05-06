export const ensureDebugUiRegistry = (appBridge) => {
  if (!appBridge || typeof appBridge !== 'object') return null;
  if (!appBridge.debugUiRegistry || typeof appBridge.debugUiRegistry !== 'object') {
    appBridge.debugUiRegistry = { panels: {}, stores: {}, actions: {} };
  }
  const registry = appBridge.debugUiRegistry;
  if (!registry.panels || typeof registry.panels !== 'object') registry.panels = {};
  if (!registry.stores || typeof registry.stores !== 'object') registry.stores = {};
  if (!registry.actions || typeof registry.actions !== 'object') registry.actions = {};
  return registry;
};

export const getDebugUiRegistry = (appBridge) => {
  if (!appBridge || typeof appBridge !== 'object') return null;
  const registry = appBridge.debugUiRegistry;
  if (!registry || typeof registry !== 'object') return null;
  return registry;
};
