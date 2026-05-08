const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolveWorldBridge = (bridge = null) => bridge || getDefaultBridge();

export const waitForWorldStoreReady = async (bridge = null) => {
  const runtime = resolveWorldBridge(bridge);
  if (typeof runtime?.waitForWorldStoreReady === 'function') {
    return await runtime.waitForWorldStoreReady();
  }
  return await runtime?.['worldStore']?.ready;
};

export const loadStoredWorldInfo = (bridge = null, worldId = '') => {
  const runtime = resolveWorldBridge(bridge);
  const id = String(worldId || '').trim();
  if (!id) return null;
  if (typeof runtime?.loadStoredWorldInfo === 'function') {
    return runtime.loadStoredWorldInfo(id) || null;
  }
  return runtime?.['worldStore']?.load?.(id) || null;
};

export const hasStoredWorldInfo = (bridge = null, worldId = '') => {
  const runtime = resolveWorldBridge(bridge);
  const id = String(worldId || '').trim();
  if (!id) return false;
  if (typeof runtime?.hasStoredWorldInfo === 'function') return Boolean(runtime.hasStoredWorldInfo(id));
  return Boolean(loadStoredWorldInfo(runtime, id));
};

export const listWorldIds = async (bridge = null) => {
  const runtime = resolveWorldBridge(bridge);
  if (typeof runtime?.listWorlds === 'function') return await runtime.listWorlds() || [];
  await waitForWorldStoreReady(runtime);
  return runtime?.['worldStore']?.list?.() || [];
};
