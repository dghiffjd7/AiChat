import { MVUConverter } from './mvu-converter.js';

export const extractMvuTavernHelperScripts = (card = {}) => {
  const extensions = card?.extensions && typeof card.extensions === 'object'
    ? card.extensions
    : {};
  const raw = extensions.tavern_helper
    || extensions.tavernHelper
    || extensions.tavern_helper_scripts
    || extensions.tavernHelperScripts;
  if (!raw || typeof raw !== 'object') return [];
  const container = Array.isArray(raw) ? Object.fromEntries(raw) : raw;
  return Array.isArray(container?.scripts) ? container.scripts : [];
};

const mergeMvuSchema = (primary, fallback) => {
  const base = primary && typeof primary === 'object' ? primary : {};
  const extra = fallback && typeof fallback === 'object' ? fallback : {};
  const merged = { ...extra };
  const prefer = (key) => {
    if (base[key] !== undefined) return base[key];
    if (extra[key] !== undefined) return extra[key];
    return undefined;
  };

  const type = prefer('type');
  if (type !== undefined) merged.type = type;

  const baseDefaultIsExplicit = base.defaultSource === 'schema';
  if (baseDefaultIsExplicit && base.default !== undefined) {
    merged.default = base.default;
    merged.defaultSource = 'schema';
  } else if (extra.default !== undefined) {
    merged.default = extra.default;
    merged.defaultSource = extra.defaultSource || 'stat_data';
  } else if (base.default !== undefined) {
    merged.default = base.default;
    merged.defaultSource = base.defaultSource || 'fallback';
  }

  const range = base.range ?? extra.range;
  if (range !== undefined) merged.range = range;
  const options = base.options ?? extra.options;
  if (options !== undefined) merged.options = options;
  if (base.ui || extra.ui) {
    merged.ui = { ...(extra.ui || {}), ...(base.ui || {}) };
  }
  return merged;
};

export const buildCharacterCardMvuConversion = ({
  card = {},
  rawCard = card,
} = {}) => {
  const scripts = extractMvuTavernHelperScripts(card);
  const zodScripts = scripts.filter(script => MVUConverter.detectZodScript(script));
  const result = {
    variables: {},
    schemas: {},
    rules: [],
    stageSchema: null,
    source: 'none',
    errors: [],
  };

  if (zodScripts.length > 0) {
    const parsed = MVUConverter.parseMultipleScripts(zodScripts);
    if (Object.keys(parsed.variables).length > 0) {
      result.variables = { ...parsed.variables };
      result.schemas = { ...parsed.schemas };
      result.source = 'zod_script';
    }
    if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
      result.errors = parsed.errors.slice();
    }
  }

  const fromCard = MVUConverter.detect(rawCard) ? MVUConverter.convert(rawCard) : null;
  if (!fromCard || Object.keys(fromCard.variables || {}).length === 0) {
    return result;
  }

  if (Object.keys(result.variables).length === 0) {
    return {
      ...fromCard,
      source: 'stat_data',
      errors: result.errors,
    };
  }

  result.variables = { ...result.variables, ...fromCard.variables };
  const schemas = { ...result.schemas };
  Object.entries(fromCard.schemas || {}).forEach(([key, schema]) => {
    if (!key) return;
    schemas[key] = schemas[key] ? mergeMvuSchema(schemas[key], schema) : schema;
  });
  result.schemas = schemas;
  result.source = 'zod_script+stat_data';
  return result;
};
