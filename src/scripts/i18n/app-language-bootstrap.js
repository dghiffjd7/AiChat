import { showFirstRunLanguageChooser } from './first-run-language.js';
import { initializeI18n, startDomLocalization } from './index.js';
import { normalizeLocalePreference } from './locale-utils.js';

const IGNORED_STORAGE_KEYS = new Set([
  'chatapp_renderer_lifecycle_v1',
  'chatapp_rich_script_guard_v1',
]);

const APP_STORAGE_KEY_PATTERN = /^(?:app_|chat_|phone_|contacts?_store|contact_groups|user_|persona_|llm_|prompt_|worldinfo_|world_|global_world_|memory_|moments?_|variable_|capability_|rp_session|sticker_|ui_theme|script_|regex_|plugin_|voice_|maid_|agent_)/i;

const listStorageKeys = (storage) => {
  const keys = [];
  const length = Math.max(0, Number(storage?.length || 0));
  for (let index = 0; index < length; index += 1) {
    try {
      const key = storage.key(index);
      if (key) keys.push(String(key));
    } catch {}
  }
  return keys;
};

export const detectExistingInstall = ({ storage = null, hasPersistedSettings = false } = {}) => {
  if (hasPersistedSettings) return true;
  return listStorageKeys(storage).some(key => (
    !IGNORED_STORAGE_KEYS.has(key) && APP_STORAGE_KEY_PATTERN.test(key)
  ));
};

export const getSystemLanguage = (navigatorLike = typeof navigator !== 'undefined' ? navigator : null) => {
  const first = Array.isArray(navigatorLike?.languages) ? navigatorLike.languages.find(Boolean) : '';
  return String(first || navigatorLike?.language || 'en');
};

export const bootstrapAppLanguage = async ({
  appSettings,
  documentLike = typeof document !== 'undefined' ? document : null,
  navigatorLike = typeof navigator !== 'undefined' ? navigator : null,
  storage = typeof localStorage !== 'undefined' ? localStorage : null,
  fetchFn = typeof fetch === 'function' ? fetch.bind(globalThis) : null,
  chooserFn = showFirstRunLanguageChooser,
  MutationObserverClass = typeof MutationObserver !== 'undefined' ? MutationObserver : null,
} = {}) => {
  if (!appSettings?.get || !appSettings?.update) {
    throw new Error('bootstrapAppLanguage requires appSettings');
  }
  const systemLocale = getSystemLanguage(navigatorLike);
  let settings = appSettings.get();
  if (settings.languageSetupCompleted !== true) {
    const persistenceMeta = appSettings.getPersistenceMeta?.() || {};
    const existingInstall = detectExistingInstall({
      storage,
      hasPersistedSettings: persistenceMeta.hasPersistedSettings === true,
    });
    if (existingInstall) {
      settings = appSettings.update({
        locale: 'zh-CN',
        languageSetupCompleted: true,
      });
    } else {
      const selected = await chooserFn({ documentLike, systemLocale });
      settings = appSettings.update({
        locale: normalizeLocalePreference(selected),
        languageSetupCompleted: true,
      });
    }
  }
  const state = await initializeI18n({
    preference: normalizeLocalePreference(settings.locale),
    systemLocale,
    fetchFn,
    documentLike,
  });
  startDomLocalization({ documentLike, MutationObserverClass });
  return { ...state, systemLocale };
};
