import { safeInvoke } from '../utils/tauri.js';

const STORAGE_KEY = 'ui_theme_store_v1';

const THEME_AVATAR_STYLES = new Set(['system', 'round', 'rectangular', 'square', 'rounded']);
const THEME_CHAT_DISPLAYS = new Set(['default', 'bubble', 'document']);
const THEME_TOAST_POSITIONS = new Set([
  'toast-top-right',
  'toast-top-center',
  'toast-bottom-right',
  'toast-bottom-center',
]);

const clone = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const isObj = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const clamp = (value, min, max, fallback) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return fallback;
  return Math.min(max, Math.max(min, next));
};

const normalizeAvatarStyle = (value, fallback = 'system') => {
  const raw = String(value || '').trim().toLowerCase();
  return THEME_AVATAR_STYLES.has(raw) ? raw : fallback;
};

const normalizeChatDisplay = (value, fallback = 'default') => {
  const raw = String(value || '').trim().toLowerCase();
  return THEME_CHAT_DISPLAYS.has(raw) ? raw : fallback;
};

const normalizeToastPosition = (value, fallback = 'toast-top-right') => {
  const raw = String(value || '').trim();
  return THEME_TOAST_POSITIONS.has(raw) ? raw : fallback;
};

const normalizeAppearance = (appearance = {}, fallback = {}) => {
  const base = isObj(fallback) ? fallback : {};
  const raw = isObj(appearance) ? appearance : {};
  return {
    avatarStyle: normalizeAvatarStyle(raw.avatarStyle, normalizeAvatarStyle(base.avatarStyle, 'system')),
    chatDisplay: normalizeChatDisplay(raw.chatDisplay, normalizeChatDisplay(base.chatDisplay, 'default')),
    toastrPosition: normalizeToastPosition(
      raw.toastrPosition,
      normalizeToastPosition(base.toastrPosition, 'toast-top-right'),
    ),
    fontScale: clamp(raw.fontScale, 0.85, 1.35, clamp(base.fontScale, 0.85, 1.35, 1)),
    reducedMotion: raw.reducedMotion === true ? true : base.reducedMotion === true,
    compactInputArea: raw.compactInputArea === true ? true : base.compactInputArea === true,
    hideChatAvatars: raw.hideChatAvatars === true ? true : base.hideChatAvatars === true,
  };
};

const deepMerge = (base, patch) => {
  const next = Array.isArray(base) ? [...base] : { ...(isObj(base) ? base : {}) };
  if (!isObj(patch)) return next;
  Object.entries(patch).forEach(([key, value]) => {
    if (isObj(value) && isObj(next[key])) {
      next[key] = deepMerge(next[key], value);
      return;
    }
    next[key] = value;
  });
  return next;
};

// 解析颜色为 [r,g,b]（0-255），支持 #rgb/#rrggbb/#rrggbbaa 与 rgb()/rgba()；失败返回 null。
const parseRgb = (value) => {
  const s = String(value || '').trim();
  if (!s) return null;
  if (s[0] === '#') {
    let hex = s.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return [r, g, b].every(Number.isFinite) ? [r, g, b] : null;
  }
  const m = s.match(/rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (m) {
    const rgb = [Number(m[1]), Number(m[2]), Number(m[3])];
    return rgb.every(Number.isFinite) ? rgb : null;
  }
  return null;
};

// 表面色是否偏暗（感知亮度 < 0.5，忽略 alpha）；无法解析返回 null。
const surfaceIsDark = (value) => {
  const rgb = parseRgb(value);
  if (!rgb) return null;
  const [r, g, b] = rgb;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
};

// 从 surface token 取一个代表色（优先 page，其次 panel/card）判断明暗。
const resolveTokensDark = (tokens) => {
  const surface = isObj(tokens) && isObj(tokens.surface) ? tokens.surface : {};
  return surfaceIsDark(surface.page || surface.panel || surface.card);
};

const DEFAULT_TOKENS = Object.freeze({
  surface: {
    page: '#f4f5f6',
    pageAlt: '#e6e9f0',
    card: 'rgba(255, 255, 255, 0.96)',
    panel: 'rgba(255, 255, 255, 0.92)',
    topbar: 'rgba(255, 255, 255, 0.92)',
    input: 'rgba(255, 255, 255, 0.92)',
    overlay: 'rgba(15, 23, 42, 0.42)',
    subtle: '#f8fafc',
    hover: '#f1f5f9',
    elevated: '#eef2f7',
  },
  text: {
    primary: '#0f172a',
    secondary: '#475569',
    muted: '#94a3b8',
    inverse: '#ffffff',
    quote: '#475569',
    link: '#2563eb',
  },
  accent: {
    primary: '#199aff',
    strong: '#0b66c2',
    soft: 'rgba(25, 154, 255, 0.14)',
  },
  tint: {
    // 中性微调基色：深色规则用 rgba(var(--app-tint-neutral-rgb), α) 铺 subtle 表面/边框/hover。
    neutral: '#94a3b8',
    slate: '#64748b',
  },
  status: {
    // 语义状态色（可被自定义主题覆盖，默认标准红/琥/绿/蓝）。fill 供 rgba(var(--app-x-rgb), α) 微调；text 为深色上的可读文字。
    danger: '#dc2626',
    dangerStrong: '#b91c1c',
    warning: '#d97706',
    warningText: '#b45309',
    success: '#16a34a',
    successText: '#15803d',
    info: '#2563eb',
    infoText: '#1d4ed8',
    task: '#7c3aed',
  },
  border: {
    subtle: 'rgba(15, 23, 42, 0.08)',
    default: 'rgba(148, 163, 184, 0.32)',
    strong: 'rgba(15, 23, 42, 0.16)',
  },
  bubble: {
    user: '#199aff',
    assistant: '#ffffff',
    assistantAlt: '#c9c9c9',
    meta: 'rgba(255, 255, 255, 0.76)',
  },
  shadow: {
    sm: '0 1px 4px rgba(15, 23, 42, 0.08)',
    md: '0 12px 34px rgba(15, 23, 42, 0.18)',
    bubble: '0 8px 18px rgba(15, 23, 42, 0.1)',
    color: 'rgba(15, 23, 42, 0.18)',
  },
  radius: {
    sm: '8px',
    md: '12px',
    lg: '18px',
    pill: '999px',
    avatar: '18px',
  },
});

const DEFAULT_APPEARANCE = Object.freeze({
  avatarStyle: 'system',
  chatDisplay: 'default',
  toastrPosition: 'toast-top-right',
  fontScale: 1,
  reducedMotion: false,
  compactInputArea: false,
  hideChatAvatars: false,
});

const BUILTIN_THEMES = Object.freeze([
  {
    id: 'classic-light',
    name: 'Classic Light',
    version: 1,
    source: 'chat-app-builtin',
    mode: 'light',
    tokens: DEFAULT_TOKENS,
    appearance: DEFAULT_APPEARANCE,
    meta: {
      builtin: true,
      createdAt: '2026-04-19T00:00:00.000Z',
      updatedAt: '2026-04-19T00:00:00.000Z',
      importedFrom: 'builtin',
    },
  },
  {
    id: 'classic-dark',
    name: 'Classic Dark',
    version: 1,
    source: 'chat-app-builtin',
    mode: 'dark',
    tokens: {
      surface: {
        page: '#171b20',
        pageAlt: '#1d232a',
        card: 'rgba(30, 35, 42, 0.96)',
        panel: 'rgba(38, 44, 52, 0.96)',
        topbar: 'rgba(26, 30, 36, 0.96)',
        input: 'rgba(29, 34, 41, 0.98)',
        overlay: 'rgba(4, 8, 12, 0.76)',
        subtle: 'rgba(26, 32, 39, 0.92)',
        hover: 'rgba(34, 42, 51, 0.88)',
        elevated: '#22272e',
      },
      text: {
        primary: '#f0f6fc',
        secondary: '#c0cad6',
        muted: '#8b98a7',
        inverse: '#161b22',
        quote: '#b1bcc9',
        link: '#8cc7ff',
      },
      accent: {
        primary: '#79c0ff',
        strong: '#6cb6ff',
        soft: 'rgba(121, 192, 255, 0.18)',
      },
      tint: {
        neutral: '#cdd9e5',
        slate: '#94a3b8',
      },
      status: {
        danger: '#f85149',
        dangerStrong: '#ffb4aa',
        warning: '#fbbf24',
        warningText: '#fcd34d',
        success: '#2ea043',
        successText: '#7ee787',
        info: '#3b82f6',
        infoText: '#8ecbff',
        task: '#a78bfa',
      },
      border: {
        subtle: 'rgba(240, 246, 252, 0.08)',
        default: 'rgba(99, 110, 123, 0.76)',
        strong: 'rgba(139, 152, 167, 0.82)',
      },
      bubble: {
        user: '#2f81f7',
        assistant: 'rgba(30, 35, 42, 0.98)',
        assistantAlt: 'rgba(38, 44, 52, 0.98)',
        meta: 'rgba(30, 35, 42, 0.82)',
      },
      shadow: {
        sm: '0 1px 4px rgba(0, 0, 0, 0.26)',
        md: '0 16px 38px rgba(0, 0, 0, 0.34)',
        bubble: '0 10px 24px rgba(0, 0, 0, 0.28)',
        color: 'rgba(0, 0, 0, 0.34)',
      },
      radius: {
        sm: '8px',
        md: '12px',
        lg: '18px',
        pill: '999px',
        avatar: '18px',
      },
    },
    appearance: DEFAULT_APPEARANCE,
    meta: {
      builtin: true,
      createdAt: '2026-04-19T00:00:00.000Z',
      updatedAt: '2026-04-19T00:00:00.000Z',
      importedFrom: 'builtin',
    },
  },
  {
    id: 'paper-ink',
    name: '纸墨 Paper Ink',
    version: 1,
    source: 'chat-app-builtin',
    mode: 'light',
    tokens: {
      surface: {
        page: '#f3f1ec',
        pageAlt: '#eceae2',
        card: '#ffffff',
        panel: '#fdfcfa',
        topbar: 'rgba(253, 252, 250, 0.92)',
        input: '#ffffff',
        overlay: 'rgba(38, 34, 28, 0.45)',
        subtle: '#faf8f4',
        hover: '#f0ede4',
        elevated: '#fffdf8',
      },
      text: {
        primary: '#26221c',
        secondary: '#6e665b',
        muted: '#746c5e',
        inverse: '#fffdf8',
        quote: '#6e665b',
        link: '#a03c1c',
      },
      accent: {
        primary: '#bc4a26',
        strong: '#a03c1c',
        soft: 'rgba(188, 74, 38, 0.12)',
      },
      tint: {
        neutral: '#a89e90',
        slate: '#8d867b',
      },
      status: {
        danger: '#bf3a2b',
        dangerStrong: '#9e3b22',
        warning: '#a8761a',
        warningText: '#8a6116',
        success: '#3f8e5c',
        successText: '#2f7d5b',
        // 参考稿全暖调无冷蓝：info/task 用降饱和墨青/暖紫，避免破坏纸墨氛围。
        info: '#4a6f8a',
        infoText: '#3d5f78',
        task: '#7c5cad',
      },
      border: {
        subtle: 'rgba(38, 34, 28, 0.08)',
        default: '#e7e1d7',
        strong: '#d7d2c6',
      },
      bubble: {
        user: '#bc4a26',
        assistant: '#ffffff',
        assistantAlt: '#faf8f4',
        meta: 'rgba(255, 248, 240, 0.8)',
      },
      shadow: {
        sm: '0 1px 2px rgba(38, 34, 28, 0.05)',
        md: '0 16px 40px -12px rgba(38, 34, 28, 0.22)',
        bubble: '0 12px 32px -14px rgba(38, 34, 28, 0.18)',
        color: 'rgba(38, 34, 28, 0.2)',
      },
      radius: {
        sm: '8px',
        md: '12px',
        lg: '18px',
        pill: '999px',
        avatar: '18px',
      },
    },
    appearance: DEFAULT_APPEARANCE,
    meta: {
      builtin: true,
      createdAt: '2026-08-04T00:00:00.000Z',
      updatedAt: '2026-08-04T00:00:00.000Z',
      importedFrom: 'builtin',
    },
  },
]);

const BUILTIN_ID_SET = new Set(BUILTIN_THEMES.map((item) => item.id));
const BUILTIN_DARK = BUILTIN_THEMES.find((item) => item.mode === 'dark') || BUILTIN_THEMES[0];

const genThemeId = () => `theme-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const normalizeThemePreset = (input = {}, fallback = null) => {
  const raw = isObj(input) ? input : {};
  // 从 raw 提供的 surface 色推导初步明暗，用于选 merge base（拿不到才退回作者标注的 mode）。
  const declaredDark = String(raw.mode || '').trim().toLowerCase() === 'dark';
  const rawDark = resolveTokensDark(raw.tokens);
  const preliminaryDark = rawDark === null ? declaredDark : rawDark;
  // 深色主题以 classic-dark 为 merge 底：修「自定义深色主题漏给 text/border 等 token 时继承浅色默认→深底深字」。
  const base = fallback
    ? clone(fallback)
    : clone(preliminaryDark ? BUILTIN_DARK : BUILTIN_THEMES[0]);
  const tokens = deepMerge(base.tokens || DEFAULT_TOKENS, raw.tokens || {});
  // 最终 mode 从合并后的实际 surface 亮度推导，而非盲信作者 mode 字段：根除 mode 与色调不同步导致的深浅混。
  const mergedDark = resolveTokensDark(tokens);
  const mode = (mergedDark === null ? preliminaryDark : mergedDark) ? 'dark' : 'light';
  const next = {
    id: String(raw.id || base.id || genThemeId()).trim() || genThemeId(),
    name: String(raw.name || base.name || 'Untitled Theme').trim() || 'Untitled Theme',
    version: 1,
    source: String(raw.source || base.source || 'chat-app').trim() || 'chat-app',
    mode,
    tokens,
    appearance: normalizeAppearance(raw.appearance, base.appearance || DEFAULT_APPEARANCE),
    meta: {
      // builtin 只认输入的显式声明：merge base（内建主题）不得把 builtin 泄漏给自定义主题。
      builtin: raw?.meta?.builtin === true,
      createdAt: String(raw?.meta?.createdAt || base?.meta?.createdAt || new Date().toISOString()),
      updatedAt: String(raw?.meta?.updatedAt || new Date().toISOString()),
      importedFrom: String(raw?.meta?.importedFrom || base?.meta?.importedFrom || raw.source || 'chat-app'),
    },
  };
  return next;
};

const normalizeState = (input = {}) => {
  const raw = isObj(input) ? input : {};
  const customThemes = Array.isArray(raw.customThemes)
    ? raw.customThemes
        .filter((item) => isObj(item))
        .map((item) => normalizeThemePreset(item))
        .filter((item) => item && !BUILTIN_ID_SET.has(item.id))
    : [];
  return { customThemes };
};

const readLocalState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeState(JSON.parse(raw));
  } catch {
    return null;
  }
};

const writeLocalState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
};

const persistState = async (state) => {
  writeLocalState(state);
  try {
    await safeInvoke('save_kv', { name: STORAGE_KEY, data: state });
  } catch {}
};

let cachedState = null;

export const themeStore = {
  async hydrate() {
    if (cachedState) return clone(cachedState);
    try {
      const remote = await safeInvoke('load_kv', { name: STORAGE_KEY });
      if (remote && typeof remote === 'object' && !remote._tooLarge) {
        cachedState = normalizeState(remote);
        writeLocalState(cachedState);
        return clone(cachedState);
      }
    } catch {}
    cachedState = normalizeState(readLocalState() || {});
    return clone(cachedState);
  },

  ensureLoaded() {
    if (!cachedState) {
      cachedState = normalizeState(readLocalState() || {});
    }
    return cachedState;
  },

  getBuiltinThemes() {
    return BUILTIN_THEMES.map((item) => clone(item));
  },

  listThemes() {
    const state = this.ensureLoaded();
    return [...BUILTIN_THEMES, ...state.customThemes].map((item) => clone(item));
  },

  getTheme(id = '') {
    const key = String(id || '').trim();
    const all = this.listThemes();
    return all.find((item) => item.id === key) || clone(BUILTIN_THEMES[0]);
  },

  isBuiltin(id = '') {
    return BUILTIN_ID_SET.has(String(id || '').trim());
  },

  async saveTheme(input = {}) {
    const state = this.ensureLoaded();
    const preset = normalizeThemePreset({
      ...input,
      id: this.isBuiltin(input?.id) ? genThemeId() : (String(input?.id || '').trim() || genThemeId()),
      meta: {
        ...(isObj(input?.meta) ? input.meta : {}),
        builtin: false,
        updatedAt: new Date().toISOString(),
      },
    });
    const idx = state.customThemes.findIndex((item) => item.id === preset.id);
    if (idx >= 0) state.customThemes[idx] = preset;
    else state.customThemes.unshift(preset);
    await persistState(state);
    return clone(preset);
  },

  async deleteTheme(id = '') {
    const key = String(id || '').trim();
    if (!key || this.isBuiltin(key)) return false;
    const state = this.ensureLoaded();
    const next = state.customThemes.filter((item) => item.id !== key);
    if (next.length === state.customThemes.length) return false;
    state.customThemes = next;
    await persistState(state);
    return true;
  },

  buildExportPreset(theme, appearanceOverrides = null) {
    const preset = normalizeThemePreset(theme || this.getTheme('classic-light'));
    if (appearanceOverrides) {
      preset.appearance = normalizeAppearance(appearanceOverrides, preset.appearance);
    }
    preset.source = 'chat-app';
    preset.meta = {
      ...(preset.meta || {}),
      builtin: false,
      updatedAt: new Date().toISOString(),
      importedFrom: preset.meta?.importedFrom || preset.source || 'chat-app',
    };
    return preset;
  },
};

export { normalizeAppearance, normalizeThemePreset };
