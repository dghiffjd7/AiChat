import { mapSystemLocale, normalizeLocalePreference } from './locale-utils.js';

export const LANGUAGE_OPTIONS = Object.freeze([
  { value: 'system', label: '跟随系统 / Follow system', nativeLabel: '跟隨系統 / Follow system' },
  { value: 'zh-CN', label: '简体中文', nativeLabel: '简体中文' },
  { value: 'zh-TW', label: '繁體中文', nativeLabel: '繁體中文' },
  { value: 'en', label: 'English', nativeLabel: 'English' },
]);

const COPY = Object.freeze({
  'zh-CN': {
    subtitle: '之后可以在通用设置中更改。',
    continueText: '继续',
    recommended: '系统推荐',
  },
  'zh-TW': {
    subtitle: '之後可以在通用設定中更改。',
    continueText: '繼續',
    recommended: '系統建議',
  },
  en: {
    subtitle: 'You can change this later in General Settings.',
    continueText: 'Continue',
    recommended: 'Recommended for your system',
  },
});

export const getLanguageChooserCopy = ({ preference = 'system', systemLocale = '' } = {}) => {
  const normalized = normalizeLocalePreference(preference);
  const locale = normalized === 'system' ? mapSystemLocale(systemLocale) : normalized;
  return COPY[locale] || COPY.en;
};

export const showFirstRunLanguageChooser = ({
  documentLike = typeof document !== 'undefined' ? document : null,
  systemLocale = '',
} = {}) => new Promise((resolve, reject) => {
  if (!documentLike?.createElement) {
    reject(new Error('language chooser requires a document'));
    return;
  }
  const recommendedLocale = mapSystemLocale(systemLocale);
  let selected = 'system';
  const splash = documentLike.getElementById?.('app-splash');
  const host = splash || documentLike.body;
  if (!host) {
    reject(new Error('language chooser host is unavailable'));
    return;
  }
  splash?.setAttribute?.('data-language-setup', 'true');
  splash?.querySelector?.('#splash-icon')?.setAttribute?.('aria-hidden', 'true');

  const root = documentLike.createElement('section');
  root.id = 'first-run-language';
  root.className = 'first-run-language';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'first-run-language-title');

  const eyebrow = documentLike.createElement('div');
  eyebrow.className = 'first-run-language-eyebrow';
  eyebrow.textContent = 'Aria · 语言 / 語言 / Language';
  root.appendChild(eyebrow);

  const title = documentLike.createElement('h1');
  title.id = 'first-run-language-title';
  title.textContent = '选择语言 / 選擇語言 / Choose language';
  root.appendChild(title);
  const subtitle = documentLike.createElement('p');
  subtitle.className = 'first-run-language-subtitle';
  root.appendChild(subtitle);

  const list = documentLike.createElement('div');
  list.className = 'first-run-language-options';
  list.setAttribute('role', 'radiogroup');
  const buttons = [];
  LANGUAGE_OPTIONS.forEach(option => {
    const button = documentLike.createElement('button');
    button.type = 'button';
    button.className = 'first-run-language-option';
    button.dataset.localePreference = option.value;
    button.setAttribute('role', 'radio');
    const label = documentLike.createElement('strong');
    label.textContent = option.label;
    const detail = documentLike.createElement('span');
    detail.textContent = option.value === 'system'
      ? `${option.nativeLabel} · ${recommendedLocale}`
      : option.nativeLabel;
    button.append(label, detail);
    button.addEventListener('click', () => {
      selected = option.value;
      refresh();
    });
    buttons.push(button);
    list.appendChild(button);
  });
  root.appendChild(list);

  const recommended = documentLike.createElement('div');
  recommended.className = 'first-run-language-recommended';
  root.appendChild(recommended);
  const continueButton = documentLike.createElement('button');
  continueButton.type = 'button';
  continueButton.className = 'first-run-language-continue';
  continueButton.addEventListener('click', () => {
    root.remove();
    splash?.removeAttribute?.('data-language-setup');
    resolve(selected);
  });
  root.appendChild(continueButton);

  const refresh = () => {
    const copy = getLanguageChooserCopy({ preference: selected, systemLocale });
    subtitle.textContent = copy.subtitle;
    continueButton.textContent = copy.continueText;
    recommended.textContent = `${copy.recommended}: ${recommendedLocale}`;
    buttons.forEach(button => {
      const active = button.dataset.localePreference === selected;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-checked', active ? 'true' : 'false');
    });
  };

  refresh();
  host.appendChild(root);
  buttons[0]?.focus?.();
});
