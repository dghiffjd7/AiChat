const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolveWorldSessionBridge = (bridge = null) => bridge || getDefaultBridge();

const isObjectMap = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const normalizeWorldIds = (value) => {
  const list = Array.isArray(value) ? value : (value ? [value] : []);
  return list.map(item => String(item || '').trim()).filter(Boolean);
};

export const getWorldSessionMap = (bridge = null) => {
  const runtime = resolveWorldSessionBridge(bridge);
  if (typeof runtime?.getWorldSessionMap === 'function') {
    const map = runtime.getWorldSessionMap();
    return isObjectMap(map) ? map : {};
  }
  return isObjectMap(runtime?.['worldSessionMap']) ? runtime['worldSessionMap'] : {};
};

export const getWorldIdsForSession = (bridge = null, sessionId = '') => {
  const runtime = resolveWorldSessionBridge(bridge);
  const sid = String(sessionId || '').trim();
  if (typeof runtime?.getWorldIdsForSession === 'function') {
    return normalizeWorldIds(runtime.getWorldIdsForSession(sid));
  }
  const map = getWorldSessionMap(runtime);
  return normalizeWorldIds(map?.[sid]);
};

export const getCurrentWorldIds = (bridge = null) => {
  const runtime = resolveWorldSessionBridge(bridge);
  if (typeof runtime?.getCurrentWorldIds === 'function') {
    return normalizeWorldIds(runtime.getCurrentWorldIds());
  }
  if (Array.isArray(runtime?.['currentWorldIds'])) return normalizeWorldIds(runtime['currentWorldIds']);
  return normalizeWorldIds(runtime?.['currentWorldId']);
};

export const getCurrentWorldId = (bridge = null) => {
  const runtime = resolveWorldSessionBridge(bridge);
  if (typeof runtime?.getCurrentWorldId === 'function') {
    return String(runtime.getCurrentWorldId() || '').trim();
  }
  return getCurrentWorldIds(runtime)[0] || '';
};

export const getGlobalWorldId = (bridge = null) => {
  const runtime = resolveWorldSessionBridge(bridge);
  if (typeof runtime?.getGlobalWorldId === 'function') {
    return String(runtime.getGlobalWorldId() || '').trim();
  }
  if (Array.isArray(runtime?.['globalWorldIds'])) {
    return normalizeWorldIds(runtime['globalWorldIds'])[0] || '';
  }
  return String(runtime?.['globalWorldId'] || '').trim();
};

export const getGlobalWorldIds = (bridge = null) => {
  const runtime = resolveWorldSessionBridge(bridge);
  if (typeof runtime?.getGlobalWorldIds === 'function') {
    return Array.from(new Set(normalizeWorldIds(runtime.getGlobalWorldIds())));
  }
  if (Array.isArray(runtime?.['globalWorldIds'])) {
    return Array.from(new Set(normalizeWorldIds(runtime['globalWorldIds'])));
  }
  return Array.from(new Set(normalizeWorldIds(runtime?.['globalWorldId'])));
};

export const emitWorldInfoChanged = (bridge = null, detail = {}) => {
  const runtime = resolveWorldSessionBridge(bridge);
  if (typeof runtime?.emitWorldInfoChanged === 'function') {
    runtime.emitWorldInfoChanged(detail);
    return true;
  }
  return false;
};

export const setCurrentWorld = (bridge = null, worldId = '', sessionId = '') => {
  const runtime = resolveWorldSessionBridge(bridge);
  if (typeof runtime?.setCurrentWorld === 'function') {
    runtime.setCurrentWorld(worldId, sessionId);
    return true;
  }
  return false;
};

export const persistWorldSessionMap = (bridge = null) => {
  const runtime = resolveWorldSessionBridge(bridge);
  if (typeof runtime?.persistWorldSessionMap === 'function') {
    runtime.persistWorldSessionMap();
    return true;
  }
  return false;
};

export const replaceWorldSessionMap = (bridge = null, worldSessionMap = {}) => {
  const runtime = resolveWorldSessionBridge(bridge);
  const map = isObjectMap(worldSessionMap) ? worldSessionMap : {};
  if (typeof runtime?.replaceWorldSessionMap === 'function') {
    runtime.replaceWorldSessionMap(map);
    return true;
  }
  if (!runtime || typeof runtime !== 'object') return false;
  runtime['worldSessionMap'] = map;
  persistWorldSessionMap(runtime);
  return true;
};

export const renameWorldSessionMapEntry = (bridge = null, fromSessionId = '', toSessionId = '') => {
  const runtime = resolveWorldSessionBridge(bridge);
  const from = String(fromSessionId || '').trim();
  const to = String(toSessionId || '').trim();
  if (!from || !to) return false;
  if (typeof runtime?.renameWorldSessionMapEntry === 'function') {
    return runtime.renameWorldSessionMapEntry(from, to) === true;
  }
  const map = getWorldSessionMap(runtime);
  if (!Object.prototype.hasOwnProperty.call(map, from)) return false;
  map[to] = map[from];
  delete map[from];
  persistWorldSessionMap(runtime);
  return true;
};

export const deleteWorldSessionMapEntry = (bridge = null, sessionId = '') => {
  const runtime = resolveWorldSessionBridge(bridge);
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  if (typeof runtime?.deleteWorldSessionMapEntry === 'function') {
    return runtime.deleteWorldSessionMapEntry(sid) === true;
  }
  const map = getWorldSessionMap(runtime);
  if (!Object.prototype.hasOwnProperty.call(map, sid)) return false;
  delete map[sid];
  persistWorldSessionMap(runtime);
  return true;
};
