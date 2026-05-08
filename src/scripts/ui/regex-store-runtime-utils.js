const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolveRegexBridge = (bridge = null) => bridge || getDefaultBridge();

export const getRegexStore = (bridge = null) => {
  const runtime = resolveRegexBridge(bridge);
  if (typeof runtime?.getRegexStore === 'function') return runtime.getRegexStore() || null;
  return runtime?.['regex'] || null;
};

export const waitForRegexStoreReady = async (bridge = null) => {
  const runtime = resolveRegexBridge(bridge);
  if (typeof runtime?.waitForRegexStoreReady === 'function') return await runtime.waitForRegexStoreReady();
  return await getRegexStore(runtime)?.ready;
};

export const getRegexSession = (bridge = null, sessionId = '') => {
  const runtime = resolveRegexBridge(bridge);
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  if (typeof runtime?.getRegexSession === 'function') return runtime.getRegexSession(sid) || null;
  return getRegexStore(runtime)?.getSession?.(sid) || null;
};

export const listRegexLocalSets = (bridge = null) => {
  const runtime = resolveRegexBridge(bridge);
  if (typeof runtime?.listRegexLocalSets === 'function') return runtime.listRegexLocalSets() || [];
  return getRegexStore(runtime)?.listLocalSets?.() || [];
};

export const getRegexLocalSet = (bridge = null, setId = '') => {
  const runtime = resolveRegexBridge(bridge);
  const id = String(setId || '').trim();
  if (!id) return null;
  if (typeof runtime?.getRegexLocalSet === 'function') return runtime.getRegexLocalSet(id) || null;
  return getRegexStore(runtime)?.getLocalSet?.(id) || null;
};

export const upsertRegexLocalSet = async (bridge = null, set = {}) => {
  const runtime = resolveRegexBridge(bridge);
  if (typeof runtime?.upsertRegexLocalSet === 'function') return await runtime.upsertRegexLocalSet(set);
  return await getRegexStore(runtime)?.upsertLocalSet?.(set);
};

export const removeRegexLocalSet = async (bridge = null, setId = '') => {
  const runtime = resolveRegexBridge(bridge);
  if (typeof runtime?.removeRegexLocalSet === 'function') return await runtime.removeRegexLocalSet(setId);
  return await getRegexStore(runtime)?.removeLocalSet?.(setId);
};

export const createRegexStoreRuntimeAdapter = (bridge = null) => {
  const runtime = resolveRegexBridge(bridge);
  return {
    get ready() {
      return getRegexStore(runtime)?.ready;
    },
    getSession: sessionId => getRegexSession(runtime, sessionId),
    listLocalSets: () => listRegexLocalSets(runtime),
    getLocalSet: setId => getRegexLocalSet(runtime, setId),
    upsertLocalSet: set => upsertRegexLocalSet(runtime, set),
    removeLocalSet: setId => removeRegexLocalSet(runtime, setId),
  };
};
