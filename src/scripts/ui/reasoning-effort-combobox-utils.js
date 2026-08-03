import { isValidReasoningEffortValue } from '../api/model-capabilities.js';

const SEARCH_ALIASES = Object.freeze({
  auto: ['默认', '自动选择'],
  minimal: ['最低', '最小', '最少', 'min'],
  low: ['较低'],
  medium: ['中等', '适中'],
  high: ['较高'],
  xhigh: ['极高', '超高'],
  max: ['最大', '最高'],
});

const normalizeSearchText = (value) => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .toLowerCase();

const normalizeOption = (option = {}) => {
  const value = normalizeSearchText(option?.value);
  if (!value) return null;
  return {
    ...option,
    value,
    label: String(option?.label ?? value).trim() || value,
  };
};

const getSearchTokens = (option = {}) => {
  const value = normalizeSearchText(option?.value);
  return [
    value,
    normalizeSearchText(option?.label),
    ...(SEARCH_ALIASES[value] || []).map(normalizeSearchText),
    ...(Array.isArray(option?.aliases) ? option.aliases : []).map(normalizeSearchText),
  ].filter(Boolean);
};

export const filterReasoningEffortOptions = (options = [], query = '') => {
  const normalizedOptions = (Array.isArray(options) ? options : []).map(normalizeOption).filter(Boolean);
  const needle = normalizeSearchText(query);
  if (!needle) return normalizedOptions;
  return normalizedOptions.filter((option) => (
    getSearchTokens(option).some((token) => token.includes(needle))
  ));
};

export const resolveReasoningEffortInput = (options = [], input = '') => {
  const normalizedOptions = (Array.isArray(options) ? options : []).map(normalizeOption).filter(Boolean);
  const query = normalizeSearchText(input);
  if (!query) return { type: 'empty', value: '' };

  const exact = normalizedOptions.find((option) => (
    getSearchTokens(option).some((token) => token === query)
  ));
  if (exact) return { type: 'existing', value: exact.value };
  if (isValidReasoningEffortValue(query)) return { type: 'create', value: query };
  return {
    type: 'invalid',
    value: query,
    message: '未找到对应 API 值，请输入英文原始值（字母、数字、_ 或 -）。',
  };
};

export const buildReasoningEffortComboboxOptions = (options = [], currentValue = '') => {
  const out = [];
  const seen = new Set();
  (Array.isArray(options) ? options : []).forEach((option) => {
    const normalized = normalizeOption(option);
    if (!normalized || seen.has(normalized.value)) return;
    seen.add(normalized.value);
    out.push(normalized);
  });

  const current = normalizeSearchText(currentValue);
  if (current && !seen.has(current) && isValidReasoningEffortValue(current)) {
    out.push({
      value: current,
      label: `${current}（自定义 · 未验证）`,
      custom: true,
    });
  }
  return out;
};

export const getReasoningEffortOptionLabel = (options = [], value = '', fallback = '') => {
  const current = normalizeSearchText(value);
  const option = (Array.isArray(options) ? options : [])
    .map(normalizeOption)
    .find((item) => item?.value === current);
  return option?.label || String(fallback || current || '').trim();
};
