const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolveScriptBridge = (bridge = null) => bridge || getDefaultBridge();

export const getScriptStore = (bridge = null) => {
  const runtime = resolveScriptBridge(bridge);
  if (typeof runtime?.getScriptStore === 'function') return runtime.getScriptStore() || null;
  return runtime?.['scriptStore'] || null;
};

export const getScriptRuntime = (bridge = null) => {
  const runtime = resolveScriptBridge(bridge);
  if (typeof runtime?.getScriptRuntime === 'function') return runtime.getScriptRuntime() || null;
  return runtime?.['scriptRuntime'] || null;
};

export const waitForScriptStoreReady = async (bridge = null) => {
  const store = getScriptStore(bridge);
  if (store?.ready) await store.ready;
  return store || null;
};

export const restartScriptWorker = (bridge = null, reason = '') => {
  const runtime = resolveScriptBridge(bridge);
  if (typeof runtime?.restartScriptWorker === 'function') {
    return runtime.restartScriptWorker(reason);
  }
  return getScriptRuntime(runtime)?.restartWorker?.(reason);
};

export const allowScriptOnce = (bridge = null, sessionId = '', scriptIds = []) => {
  const runtime = resolveScriptBridge(bridge);
  if (typeof runtime?.allowScriptOnce === 'function') {
    return runtime.allowScriptOnce(sessionId, scriptIds);
  }
  return getScriptRuntime(runtime)?.allowOnce?.(sessionId, scriptIds);
};

export const syncScripts = (bridge = null, payload = {}) => {
  const runtime = resolveScriptBridge(bridge);
  if (typeof runtime?.syncScripts === 'function') {
    return runtime.syncScripts(payload);
  }
  return getScriptRuntime(runtime)?.syncScripts?.(payload);
};

export const dispatchScriptEvent = (bridge = null, eventName = '', payload = {}, options = {}) => {
  const runtime = resolveScriptBridge(bridge);
  if (typeof runtime?.dispatchScriptEvent === 'function') {
    return runtime.dispatchScriptEvent(eventName, payload, options);
  }
  return getScriptRuntime(runtime)?.dispatchEvent?.(eventName, payload, options);
};

export const createScriptRuntimeAdapter = (bridge = null) => ({
  get store() {
    return getScriptStore(bridge);
  },
  get runtime() {
    return getScriptRuntime(bridge);
  },
  waitForStoreReady: () => waitForScriptStoreReady(bridge),
  restartWorker: reason => restartScriptWorker(bridge, reason),
  allowOnce: (sessionId, scriptIds) => allowScriptOnce(bridge, sessionId, scriptIds),
  syncScripts: payload => syncScripts(bridge, payload),
  dispatchEvent: (eventName, payload, options) => dispatchScriptEvent(bridge, eventName, payload, options),
});
