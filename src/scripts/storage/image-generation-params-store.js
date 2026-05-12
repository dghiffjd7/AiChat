import { safeInvoke } from '../utils/tauri.js';
import {
  createDefaultImageGenerationPreset,
  DEFAULT_IMAGE_GENERATION_PRESET_ID,
  IMAGE_GENERATION_PARAM_STORE_KEY,
  normalizeImageGenerationPreset,
} from '../ui/image-generation-params-utils.js';

const clone = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const normalizeState = (state = {}) => {
  const fallbackPreset = createDefaultImageGenerationPreset();
  const rawPresets = state && typeof state === 'object' && state.presets && typeof state.presets === 'object'
    ? state.presets
    : {};
  const presets = {};
  Object.entries(rawPresets).forEach(([id, preset]) => {
    const normalized = normalizeImageGenerationPreset({ ...(preset || {}), id: preset?.id || id });
    presets[normalized.id] = normalized;
  });
  if (!presets[DEFAULT_IMAGE_GENERATION_PRESET_ID]) {
    presets[DEFAULT_IMAGE_GENERATION_PRESET_ID] = fallbackPreset;
  }
  const activePresetId = String(state?.activePresetId || '').trim();
  return {
    activePresetId: presets[activePresetId] ? activePresetId : DEFAULT_IMAGE_GENERATION_PRESET_ID,
    presets,
    savedAt: Number.isFinite(Number(state?.savedAt)) ? Number(state.savedAt) : 0,
  };
};

export class ImageGenerationParamsStore {
  constructor() {
    this.state = normalizeState();
    this.ready = this.load();
  }

  async load() {
    let state = null;
    try {
      state = await safeInvoke('load_kv', { name: IMAGE_GENERATION_PARAM_STORE_KEY });
    } catch {}
    if (!state) {
      try {
        const raw = localStorage.getItem(IMAGE_GENERATION_PARAM_STORE_KEY);
        if (raw) state = JSON.parse(raw);
      } catch {}
    }
    this.state = normalizeState(state || {});
    return this.getState();
  }

  async save() {
    this.state = normalizeState({ ...this.state, savedAt: Date.now() });
    try {
      localStorage.setItem(IMAGE_GENERATION_PARAM_STORE_KEY, JSON.stringify(this.state));
    } catch {}
    try {
      await safeInvoke('save_kv', { name: IMAGE_GENERATION_PARAM_STORE_KEY, data: this.state });
    } catch {}
    return this.getState();
  }

  getState() {
    return clone(this.state);
  }

  list() {
    return Object.values(this.state.presets || {})
      .map(normalizeImageGenerationPreset)
      .sort((a, b) => {
        if (a.id === DEFAULT_IMAGE_GENERATION_PRESET_ID) return -1;
        if (b.id === DEFAULT_IMAGE_GENERATION_PRESET_ID) return 1;
        return String(a.name || '').localeCompare(String(b.name || ''), 'zh-Hans-CN');
      });
  }

  getActiveId() {
    return this.state.activePresetId || DEFAULT_IMAGE_GENERATION_PRESET_ID;
  }

  getActive() {
    return normalizeImageGenerationPreset(this.state.presets?.[this.getActiveId()] || createDefaultImageGenerationPreset());
  }

  async setActive(id = '') {
    await this.ready;
    const nextId = String(id || '').trim();
    if (!this.state.presets?.[nextId]) return this.getActive();
    this.state.activePresetId = nextId;
    await this.save();
    return this.getActive();
  }

  async upsert(preset = {}) {
    await this.ready;
    const now = Date.now();
    const normalized = normalizeImageGenerationPreset({
      ...preset,
      id: String(preset?.id || '').trim() || `image-params-${now}-${Math.random().toString(16).slice(2, 8)}`,
      updatedAt: now,
      createdAt: preset?.createdAt || now,
    });
    this.state.presets[normalized.id] = normalized;
    this.state.activePresetId = normalized.id;
    await this.save();
    return normalized;
  }

  async rename(id = '', name = '') {
    await this.ready;
    const presetId = String(id || '').trim();
    if (!this.state.presets?.[presetId]) return null;
    const nextName = String(name || '').trim();
    if (!nextName) return this.state.presets[presetId];
    this.state.presets[presetId] = normalizeImageGenerationPreset({
      ...this.state.presets[presetId],
      name: nextName,
      updatedAt: Date.now(),
    });
    await this.save();
    return this.state.presets[presetId];
  }

  async delete(id = '') {
    await this.ready;
    const presetId = String(id || '').trim();
    if (!presetId || presetId === DEFAULT_IMAGE_GENERATION_PRESET_ID) return false;
    if (!this.state.presets?.[presetId]) return false;
    delete this.state.presets[presetId];
    if (this.state.activePresetId === presetId) {
      this.state.activePresetId = DEFAULT_IMAGE_GENERATION_PRESET_ID;
    }
    await this.save();
    return true;
  }
}

let singleton = null;

export const getImageGenerationParamsStore = () => {
  if (!singleton) singleton = new ImageGenerationParamsStore();
  return singleton;
};
