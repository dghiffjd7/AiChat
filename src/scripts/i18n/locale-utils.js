export const SUPPORTED_LOCALES = Object.freeze(['zh-CN', 'zh-TW', 'en']);
export const LOCALE_PREFERENCES = Object.freeze(['system', ...SUPPORTED_LOCALES]);

const normalizeTag = (value = '') => String(value || '')
  .trim()
  .replace(/_/g, '-');

export const normalizeLocalePreference = (value = 'system') => {
  const normalized = normalizeTag(value);
  if (normalized.toLowerCase() === 'system') return 'system';
  const match = SUPPORTED_LOCALES.find(locale => locale.toLowerCase() === normalized.toLowerCase());
  return match || 'system';
};

export const mapSystemLocale = (value = '') => {
  const normalized = normalizeTag(value);
  const lower = normalized.toLowerCase();
  if (lower === 'zh' || lower.startsWith('zh-hans') || lower.startsWith('zh-cn') || lower.startsWith('zh-sg')) {
    return 'zh-CN';
  }
  if (
    lower.startsWith('zh-hant')
    || lower.startsWith('zh-tw')
    || lower.startsWith('zh-hk')
    || lower.startsWith('zh-mo')
  ) {
    return 'zh-TW';
  }
  if (lower === 'en' || lower.startsWith('en-')) return 'en';
  return 'en';
};

export const resolveLocale = ({ preference = 'system', systemLocale = '' } = {}) => {
  const normalized = normalizeLocalePreference(preference);
  return normalized === 'system' ? mapSystemLocale(systemLocale) : normalized;
};

export const buildCatalogKey = (source = '', context = '') => {
  const text = String(source ?? '');
  const normalizedContext = String(context || '').trim();
  return normalizedContext ? `${text}\u0004${normalizedContext}` : text;
};

export const interpolateTranslation = (value = '', params = {}) => String(value ?? '')
  .replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, name) => (
    Object.prototype.hasOwnProperty.call(params || {}, name)
      ? String(params[name] ?? '')
      : match
  ));

const pickPluralValue = (value, { locale = 'zh-CN', count } = {}) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const numericCount = Number(count);
  if (!Number.isFinite(numericCount)) return value.other ?? value.one ?? '';
  let category = 'other';
  try {
    category = new Intl.PluralRules(locale).select(numericCount);
  } catch {}
  return value[category] ?? value.other ?? value.one ?? '';
};

export const translateFromCatalog = ({
  source = '',
  catalog = {},
  locale = 'zh-CN',
  params = {},
  context = '',
} = {}) => {
  const original = String(source ?? '');
  if (!original || locale === 'zh-CN') return interpolateTranslation(original, params);
  const key = buildCatalogKey(original, context);
  const candidate = Object.prototype.hasOwnProperty.call(catalog || {}, key)
    ? catalog[key]
    : original;
  const pluralValue = pickPluralValue(candidate, { locale, count: params?.count });
  return interpolateTranslation(typeof pluralValue === 'string' ? pluralValue : original, params);
};
