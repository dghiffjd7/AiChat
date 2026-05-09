const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

export const PERSONA_SWITCHER_TAB_STORAGE_KEY = 'persona_switcher_tab_v2';

const getDefaultLocalStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const resolvePersonaBridge = (bridge = null) => bridge || getDefaultBridge();

export const normalizePersonaSwitcherTab = (value = '') => {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'character' ? 'character' : 'user';
};

export const readPersonaSwitcherTab = ({
  storage = getDefaultLocalStorage(),
  key = PERSONA_SWITCHER_TAB_STORAGE_KEY,
} = {}) => {
  try {
    return normalizePersonaSwitcherTab(storage?.getItem?.(key));
  } catch {
    return 'user';
  }
};

export const writePersonaSwitcherTab = (
  value = 'user',
  {
    storage = getDefaultLocalStorage(),
    key = PERSONA_SWITCHER_TAB_STORAGE_KEY,
  } = {},
) => {
  try {
    storage?.setItem?.(key, normalizePersonaSwitcherTab(value));
    return true;
  } catch {
    return false;
  }
};

export const getCurrentCharacterId = (bridge = null) => {
  const runtime = resolvePersonaBridge(bridge);
  if (typeof runtime?.getCurrentCharacterId === 'function') {
    return String(runtime.getCurrentCharacterId() || '').trim();
  }
  return String(runtime?.['currentCharacterId'] || '').trim();
};

export const deletePersonaCard = async (bridge = null, personaId = '') => {
  const runtime = resolvePersonaBridge(bridge);
  if (typeof runtime?.deletePersonaCard === 'function') {
    return runtime.deletePersonaCard(personaId);
  }
  return runtime?.['deletePersonaCard']?.(personaId);
};

export const cleanupPersonaScopedData = async (
  bridge = null,
  keepPersonaIds = [],
  deletePersonaIds = [],
) => {
  const runtime = resolvePersonaBridge(bridge);
  if (typeof runtime?.cleanupPersonaScopedData === 'function') {
    return runtime.cleanupPersonaScopedData(keepPersonaIds, deletePersonaIds);
  }
  return runtime?.['cleanupPersonaScopedData']?.(keepPersonaIds, deletePersonaIds);
};
