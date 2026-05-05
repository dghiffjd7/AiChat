import { safeInvoke } from './tauri.js';

export const hasTauriRuntime = () => {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || g?.__TAURI_INVOKE__);
};

export const isAndroidDevice = () => {
  try {
    return /android/i.test(globalThis?.navigator?.userAgent || '');
  } catch {
    return false;
  }
};

const normalizeFilters = (filters = []) =>
  (Array.isArray(filters) ? filters : []).map((filter) => ({
    name: String(filter?.name || '').trim(),
    extensions: Array.isArray(filter?.extensions)
      ? filter.extensions.map((ext) => String(ext || '').trim()).filter(Boolean)
      : [],
  })).filter((filter) => filter.name && filter.extensions.length);

export const pickSavePath = async ({ defaultName = '', filters = [] } = {}) => {
  if (!hasTauriRuntime() || isAndroidDevice()) {
    return { path: '', cancelled: false, fallback: true };
  }

  const normalizedFilters = normalizeFilters(filters);
  try {
    const result = await safeInvoke('pick_save_path', {
      defaultName: String(defaultName || '').trim(),
      filters: normalizedFilters,
    });
    const path = String(result || '').trim();
    if (!path) return { path: '', cancelled: true, fallback: false };
    return { path, cancelled: false, fallback: false };
  } catch (invokeError) {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const result = await save({
        defaultPath: String(defaultName || '').trim(),
        filters: normalizedFilters,
      });
      if (!result) return { path: '', cancelled: true, fallback: false };
      return { path: String(result), cancelled: false, fallback: false };
    } catch {
      return {
        path: '',
        cancelled: false,
        fallback: true,
        error: String(invokeError?.message || invokeError || '').trim(),
      };
    }
  }
};
