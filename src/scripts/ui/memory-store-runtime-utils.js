const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolveMemoryBridge = (bridge = null) => bridge || getDefaultBridge();

export const getMemoryTableStore = (bridge = null) => {
  const runtime = resolveMemoryBridge(bridge);
  if (typeof runtime?.getMemoryTableStore === 'function') return runtime.getMemoryTableStore() || null;
  return runtime?.['memoryTableStore'] || null;
};

export const getMemoryTemplateStore = (bridge = null) => {
  const runtime = resolveMemoryBridge(bridge);
  if (typeof runtime?.getMemoryTemplateStore === 'function') return runtime.getMemoryTemplateStore() || null;
  return runtime?.['memoryTemplateStore'] || null;
};

export const createMemoryStoreRuntimeAdapter = (bridge = null) => ({
  memoryTableStore: getMemoryTableStore(bridge),
  memoryTemplateStore: getMemoryTemplateStore(bridge),
});
