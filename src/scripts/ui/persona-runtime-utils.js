const getDefaultBridge = () => {
  if (typeof window !== 'undefined') return window.appBridge || null;
  return globalThis?.window?.appBridge || null;
};

const resolvePersonaBridge = (bridge = null) => bridge || getDefaultBridge();

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
