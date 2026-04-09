import { getCharacterCardDisplayName, getCharacterCardSource } from '../utils/character-card-display.js';

const normalizeName = (value, fallback = '未命名角色') => {
  const raw = String(value || '').trim();
  return raw || fallback;
};

const normalizeBindingItem = (persona = null, { activePersonaId = '', effectivePersonaId = '' } = {}) => {
  const item = persona && typeof persona === 'object' ? persona : {};
  const personaId = String(item.id || '').trim();
  if (!personaId) return null;
  const source = getCharacterCardSource(item);
  const worldId = String(source.worldbookId || '').trim();
  const enabled = Boolean(worldId) && source.worldbookEnabled !== false;
  const activeId = String(effectivePersonaId || activePersonaId || '').trim();
  return {
    personaId,
    personaName: normalizeName(getCharacterCardDisplayName(item, personaId), personaId),
    worldId,
    enabled,
    hasWorld: Boolean(worldId),
    isActive: Boolean(activeId) ? personaId === activeId : personaId === String(activePersonaId || '').trim(),
  };
};

export function buildRoleWorldBindingsImpl({
  personas = [],
  activePersonaId = '',
  effectivePersonaId = '',
  includeAll = false,
  includeEmpty = false,
} = {}) {
  const list = Array.isArray(personas) ? personas : [];
  const targetPersonaId = String(effectivePersonaId || activePersonaId || '').trim();
  const seen = new Set();
  const out = [];

  list.forEach((persona) => {
    const binding = normalizeBindingItem(persona, { activePersonaId, effectivePersonaId });
    if (!binding) return;
    if (seen.has(binding.personaId)) return;
    seen.add(binding.personaId);
    if (!includeAll && targetPersonaId && binding.personaId !== targetPersonaId) return;
    if (!includeEmpty && !binding.hasWorld && !binding.isActive) return;
    out.push(binding);
  });

  out.sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
    if (a.hasWorld !== b.hasWorld) return a.hasWorld ? -1 : 1;
    return a.personaName.localeCompare(b.personaName, 'zh-Hans', { sensitivity: 'base' });
  });

  return out;
}

export function collectEnabledRoleWorldIds(bindings = []) {
  const list = Array.isArray(bindings) ? bindings : [];
  const seen = new Set();
  const out = [];
  list.forEach((item) => {
    const worldId = String(item?.worldId || '').trim();
    if (!worldId || item?.enabled === false || seen.has(worldId)) return;
    seen.add(worldId);
    out.push(worldId);
  });
  return out;
}
