import { buildCharacterCardMvuConversion } from '../import/mvu-card-conversion-utils.js';
import { normalizeCharacterCard } from '../utils/character-card.js';
import { getValueAtPath } from './variable-path-utils.js';
import { cloneMvuVariableValue } from './mvu-variable-defaults-utils.js';

export const isMvuRecoveryValueMissing = value => (
  value === undefined
  || value === null
  || (typeof value === 'string' && value.trim() === '')
);

const mergeRecoveredSchema = (convertedSchema, existingSchema, defaultValue) => {
  const converted = convertedSchema && typeof convertedSchema === 'object'
    ? convertedSchema
    : {};
  const existing = existingSchema && typeof existingSchema === 'object'
    ? existingSchema
    : {};
  const merged = {
    ...converted,
    ...existing,
    default: cloneMvuVariableValue(defaultValue),
  };
  if (converted.ui || existing.ui) {
    merged.ui = {
      ...(converted.ui || {}),
      ...(existing.ui || {}),
    };
  }
  return merged;
};

export const recoverMvuVariablesFromConversion = ({
  chatStore = null,
  sessionId = '',
  conversion = null,
  useGlobal = false,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const variables = conversion?.variables && typeof conversion.variables === 'object'
    ? conversion.variables
    : {};
  const schemas = conversion?.schemas && typeof conversion.schemas === 'object'
    ? conversion.schemas
    : {};
  const keys = Object.keys(variables).map(key => String(key || '').trim()).filter(Boolean);
  if (!chatStore || !sid) {
    return {
      ok: false,
      code: 'invalid_target',
      sessionId: sid,
      keys: [],
      filledKeys: [],
      preservedKeys: [],
    };
  }
  if (keys.length === 0) {
    return {
      ok: false,
      code: 'no_variables',
      sessionId: sid,
      keys: [],
      filledKeys: [],
      preservedKeys: [],
    };
  }

  const currentVariables = useGlobal
    ? (chatStore.listGlobalVariables?.() || {})
    : (chatStore.listVariables?.(sid) || {});
  const filledKeys = [];
  const preservedKeys = [];

  keys.forEach((key) => {
    const convertedValue = variables[key];
    const convertedSchema = schemas[key] && typeof schemas[key] === 'object'
      ? schemas[key]
      : {};
    const defaultValue = convertedSchema.default !== undefined
      ? convertedSchema.default
      : convertedValue;
    const existingSchema = chatStore.getVariableSchema?.(key, sid) || null;
    chatStore.setVariableSchema?.(
      key,
      mergeRecoveredSchema(convertedSchema, existingSchema, defaultValue),
      sid,
      { preserveExistingValue: true },
    );
    chatStore.setInitialVariable?.(key, cloneMvuVariableValue(convertedValue), sid);

    const currentValue = getValueAtPath(currentVariables, key);
    if (isMvuRecoveryValueMissing(currentValue)) {
      if (useGlobal) {
        chatStore.setGlobalVariable?.(key, cloneMvuVariableValue(convertedValue));
      } else {
        chatStore.setVariable?.(key, cloneMvuVariableValue(convertedValue), sid);
      }
      filledKeys.push(key);
    } else {
      preservedKeys.push(key);
    }
  });

  return {
    ok: true,
    code: 'recovered',
    sessionId: sid,
    keys,
    filledKeys,
    preservedKeys,
    schemaCount: Object.keys(schemas).length,
  };
};

const resolveRecoveryPersonaId = ({ sessionId, personaId, personaStore }) => {
  const explicit = String(personaId || '').trim();
  if (explicit) return explicit;
  const sid = String(sessionId || '').trim();
  if (sid.startsWith('rp:')) return sid.slice(3).trim();
  return String(personaStore?.getActive?.()?.id || '').trim();
};

export const createMvuVariableRecoveryAction = ({
  chatStore = null,
  personaStore = null,
  loadPersonaCard = null,
  isSharedVariableSession = () => false,
  normalizeCard = normalizeCharacterCard,
  buildConversion = buildCharacterCardMvuConversion,
} = {}) => async ({
  sessionId = '',
  personaId = '',
} = {}) => {
  const sid = String(sessionId || chatStore?.getCurrent?.() || '').trim();
  const pid = resolveRecoveryPersonaId({ sessionId: sid, personaId, personaStore });
  const persona = pid ? personaStore?.get?.(pid) : null;
  if (!sid || !pid || !persona) {
    return {
      ok: false,
      code: 'persona_not_found',
      sessionId: sid,
      personaId: pid,
    };
  }
  if (String(persona?.source?.type || '').trim() !== 'character_card') {
    return {
      ok: false,
      code: 'not_character_card',
      sessionId: sid,
      personaId: pid,
    };
  }

  let loadedCard = null;
  try {
    loadedCard = await loadPersonaCard?.(pid);
  } catch {}
  const rawCard = (
    loadedCard
    && typeof loadedCard === 'object'
    && loadedCard._tooLarge !== true
  )
    ? loadedCard
    : (persona.originalCard && typeof persona.originalCard === 'object' ? persona.originalCard : null);
  if (!rawCard) {
    return {
      ok: false,
      code: 'card_unavailable',
      sessionId: sid,
      personaId: pid,
    };
  }

  let card;
  try {
    card = normalizeCard(rawCard);
  } catch {
    return {
      ok: false,
      code: 'card_invalid',
      sessionId: sid,
      personaId: pid,
    };
  }
  const conversion = buildConversion({ card, rawCard });
  const result = recoverMvuVariablesFromConversion({
    chatStore,
    sessionId: sid,
    conversion,
    useGlobal: Boolean(isSharedVariableSession?.(sid)),
  });
  return {
    ...result,
    personaId: pid,
    source: conversion?.source || 'none',
  };
};
