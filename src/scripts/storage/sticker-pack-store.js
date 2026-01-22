const STORAGE_KEY = 'sticker_packs_v1';

const DEFAULT_STATE = {
  version: 1,
  defaultEnabled: false,
  packs: [],
};

const normalizeImageMeta = (meta) => {
  const raw = meta && typeof meta === 'object' ? meta : {};
  const zoom = Number(raw.zoom);
  const rotate = Number(raw.rotate);
  const offsetX = Number(raw.offsetX);
  const offsetY = Number(raw.offsetY);
  const width = Number(raw.width);
  const height = Number(raw.height);
  return {
    zoom: Number.isFinite(zoom) ? zoom : 1,
    rotate: Number.isFinite(rotate) ? rotate : 0,
    offsetX: Number.isFinite(offsetX) ? offsetX : 0,
    offsetY: Number.isFinite(offsetY) ? offsetY : 0,
    width: Number.isFinite(width) ? width : 0,
    height: Number.isFinite(height) ? height : 0,
  };
};

const safeParse = (raw) => {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeSticker = (sticker) => {
  const raw = sticker && typeof sticker === 'object' ? sticker : {};
  const frames = Array.isArray(raw.frames)
    ? raw.frames.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  const fps = Number(raw.fps);
  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || '').trim(),
    keyword: String(raw.keyword || '').trim(),
    path: String(raw.path || '').trim(),
    dataUrl: String(raw.dataUrl || '').trim(),
    frames,
    fps: Number.isFinite(fps) ? fps : 0,
  };
};

const normalizePack = (pack) => {
  const raw = pack && typeof pack === 'object' ? pack : {};
  const stickers = Array.isArray(raw.stickers) ? raw.stickers.map(normalizeSticker) : [];
  const boundSessions = Array.isArray(raw.boundSessions)
    ? raw.boundSessions.map(item => String(item || '').trim()).filter(Boolean)
    : [];
  return {
    id: String(raw.id || '').trim(),
    name: String(raw.name || '').trim(),
    colorIndex: Number.isFinite(Number(raw.colorIndex)) ? Number(raw.colorIndex) : 0,
    iconPath: String(raw.iconPath || '').trim(),
    iconDataUrl: String(raw.iconDataUrl || '').trim(),
    iconMeta: normalizeImageMeta(raw.iconMeta),
    boundSessions,
    aiEnabled: Boolean(raw.aiEnabled),
    stickers,
  };
};

const normalizeState = (state) => {
  const raw = state && typeof state === 'object' ? state : {};
  const packs = Array.isArray(raw.packs) ? raw.packs.map(normalizePack).filter(p => p.id) : [];
  return {
    ...DEFAULT_STATE,
    defaultEnabled: typeof raw.defaultEnabled === 'boolean' ? raw.defaultEnabled : DEFAULT_STATE.defaultEnabled,
    packs,
  };
};

const readState = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE };
    return normalizeState(safeParse(raw));
  } catch {
    return { ...DEFAULT_STATE };
  }
};

const writeState = (state) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
};

export const stickerPackStore = {
  getState() {
    return readState();
  },
  update(mutator) {
    const current = readState();
    const next = normalizeState(typeof mutator === 'function' ? mutator({ ...current }) : current);
    writeState(next);
    return next;
  },
  getPacks() {
    return readState().packs;
  },
  getPack(id) {
    const key = String(id || '').trim();
    if (!key) return null;
    return readState().packs.find(p => p.id === key) || null;
  },
  upsertPack(pack) {
    const incoming = normalizePack(pack);
    if (!incoming.id) return readState();
    return this.update((state) => {
      const packs = state.packs.slice();
      const idx = packs.findIndex(p => p.id === incoming.id);
      if (idx >= 0) packs[idx] = { ...packs[idx], ...incoming };
      else packs.push(incoming);
      return { ...state, packs };
    });
  },
  updatePack(id, patch) {
    const key = String(id || '').trim();
    if (!key) return readState();
    return this.update((state) => {
      const packs = state.packs.map(pack => {
        if (pack.id !== key) return pack;
        const next = { ...pack, ...(patch || {}) };
        return normalizePack(next);
      });
      return { ...state, packs };
    });
  },
  removePack(id) {
    const key = String(id || '').trim();
    if (!key) return readState();
    return this.update((state) => ({ ...state, packs: state.packs.filter(p => p.id !== key) }));
  },
  setDefaultEnabled(enabled) {
    return this.update(state => ({ ...state, defaultEnabled: Boolean(enabled) }));
  },
  getDefaultEnabled() {
    return readState().defaultEnabled;
  },
  getEnabledCustomKeywords() {
    const state = readState();
    const keywords = [];
    state.packs.forEach((pack) => {
      if (!pack.aiEnabled) return;
      pack.stickers.forEach((sticker) => {
        const key = String(sticker.keyword || '').trim();
        if (key) keywords.push(key);
      });
    });
    return keywords;
  },
};
