import { getLocalizedPromptText, getPromptLocale } from '../i18n/prompt-locale.js';

export const formatMemoryPromptText = (key, fallback, params = {}) => {
  let text = getLocalizedPromptText(key, fallback);
  Object.entries(params || {}).forEach(([name, value]) => {
    text = text.replaceAll(`{${name}}`, String(value ?? ''));
  });
  return text;
};

export const getMemoryPromptListSeparator = () => (getPromptLocale() === 'en' ? ', ' : '、');
export const getMemoryPromptClauseSeparator = () => (getPromptLocale() === 'en' ? '; ' : '；');
export const getMemoryPromptSourceSeparator = () => (getPromptLocale() === 'en' ? ' + ' : '＋');
export const joinMemoryPromptLabel = (label, value) => (
  getPromptLocale() === 'en' ? `${label}: ${value}` : `${label}：${value}`
);
