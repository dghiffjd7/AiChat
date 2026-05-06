export const isTavernMvuVariableSession = (
  sessionId,
  {
    getEffectivePersona,
    listVariableSchemas,
  } = {},
) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const persona = typeof getEffectivePersona === 'function' ? getEffectivePersona(sid) : null;
  const source = persona && typeof persona.source === 'object' ? persona.source : null;
  if (!source || source.type !== 'character_card') return false;
  const mvuSource = String(source.mvuSource || '').trim().toLowerCase();
  const hasCardMvu = source.mvuConverted === true || (mvuSource && mvuSource !== 'none');
  if (!hasCardMvu) return false;
  const schemas = typeof listVariableSchemas === 'function' ? (listVariableSchemas(sid) || {}) : {};
  return Object.keys(schemas).length > 0;
};
