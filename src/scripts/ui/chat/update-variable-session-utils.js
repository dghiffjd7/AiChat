const AI_OUTPUT_PLACEMENT = 2;

export const hasStatusPlaceholderDisplayRule = (rules = []) => (
  Array.isArray(rules) ? rules : []
).some((rule) => {
  if (!rule || rule.disabled === true) return false;
  if (rule.markdownOnly !== true || rule.promptOnly === true) return false;
  const placements = Array.isArray(rule.placement)
    ? rule.placement.map(value => Number(value)).filter(Number.isFinite)
    : [];
  if (placements.length && !placements.includes(AI_OUTPUT_PLACEMENT)) return false;
  return /StatusPlaceHolderImpl/i.test(String(rule.findRegex || ''));
});

export const isStatusPlaceholderDisplaySession = (
  sessionId,
  {
    getEffectivePersona,
    listActiveRegexRules,
  } = {},
) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const persona = typeof getEffectivePersona === 'function' ? getEffectivePersona(sid) : null;
  const source = persona && typeof persona.source === 'object' ? persona.source : null;
  if (!source || source.type !== 'character_card') return false;
  const rules = typeof listActiveRegexRules === 'function' ? listActiveRegexRules(sid) : [];
  return hasStatusPlaceholderDisplayRule(rules);
};

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
