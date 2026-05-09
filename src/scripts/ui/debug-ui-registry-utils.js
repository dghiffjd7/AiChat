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

export const patchDebugUiRegistry = (appBridge, mutator) => {
  try {
    if (typeof mutator !== 'function') return null;
    const registry = ensureDebugUiRegistry(appBridge);
    if (!registry) return null;
    mutator(registry);
    return registry;
  } catch {
    return null;
  }
};

export const registerDebugRuntimeContext = (appBridge, {
  panels = {},
  stores = {},
  actions = {},
  traceTimeline = null,
} = {}) => patchDebugUiRegistry(appBridge, (registry) => {
  registry.panels = panels && typeof panels === 'object' ? panels : {};
  registry.stores = stores && typeof stores === 'object' ? stores : {};
  if (traceTimeline) registry.stores.traceTimeline = traceTimeline;
  registry.actions = {
    ...(registry.actions && typeof registry.actions === 'object' ? registry.actions : {}),
    ...(actions && typeof actions === 'object' ? actions : {}),
  };
});

export const recordDebugTraceEvent = (appBridge, event) => {
  try {
    const record = appBridge?.debugUiRegistry?.actions?.recordTraceEvent;
    if (typeof record !== 'function') return null;
    return record(event);
  } catch {
    return null;
  }
};
