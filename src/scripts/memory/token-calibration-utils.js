const DEFAULT_STORAGE_KEY = 'token_estimate_calibration_v1';
const DEFAULT_MIN_COEFFICIENT = 0.5;
const DEFAULT_MAX_COEFFICIENT = 4;
const DEFAULT_ALPHA = 0.25;
// 无样本时的保守默认：真机实测中文场景 rough 估算低估 ~28%（ratio 1.279），
// 系数偏低会超发撞 ctx、偏高只是少发——取保守方向；首个真实样本直接覆盖。
export const DEFAULT_CONSERVATIVE_COEFFICIENT = 1.25;

const toFiniteNonNegative = (value) => {
  const next = Number(value);
  return Number.isFinite(next) && next >= 0 ? next : null;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export const buildTokenCalibrationKey = (provider = '', model = '') => {
  const normalizedProvider = String(provider || '').trim().toLowerCase() || 'unknown';
  const normalizedModel = String(model || '').trim().toLowerCase() || 'unknown';
  return `${normalizedProvider}::${normalizedModel}`;
};

export const normalizeTokenCalibrationState = (value = null) => {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const recordsSource = source.records && typeof source.records === 'object' && !Array.isArray(source.records)
    ? source.records
    : {};
  const records = {};
  Object.entries(recordsSource).forEach(([key, record]) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    const coefficient = toFiniteNonNegative(record.coefficient);
    const samples = Math.max(0, Math.trunc(Number(record.samples)) || 0);
    if (coefficient === null || coefficient <= 0 || samples <= 0) return;
    records[String(key)] = {
      provider: String(record.provider || '').trim(),
      model: String(record.model || '').trim(),
      coefficient: clamp(coefficient, DEFAULT_MIN_COEFFICIENT, DEFAULT_MAX_COEFFICIENT),
      samples,
      lastRatio: toFiniteNonNegative(record.lastRatio),
      lastEstimatedTokens: toFiniteNonNegative(record.lastEstimatedTokens),
      lastActualTokens: toFiniteNonNegative(record.lastActualTokens),
      updatedAt: Math.max(0, Math.trunc(Number(record.updatedAt)) || 0),
    };
  });
  return { version: 1, records };
};

export const getTokenCalibrationRecord = (
  state,
  {
    provider = '',
    model = '',
  } = {},
) => {
  const normalized = normalizeTokenCalibrationState(state);
  const key = buildTokenCalibrationKey(provider, model);
  const record = normalized.records[key];
  return record ? { ...record } : {
    provider: String(provider || '').trim(),
    model: String(model || '').trim(),
    coefficient: DEFAULT_CONSERVATIVE_COEFFICIENT,
    samples: 0,
    lastRatio: null,
    lastEstimatedTokens: null,
    lastActualTokens: null,
    updatedAt: 0,
  };
};

export const updateTokenCalibrationState = (
  state,
  {
    provider = '',
    model = '',
    estimatedTokens = null,
    actualPromptTokens = null,
    alpha = DEFAULT_ALPHA,
    minCoefficient = DEFAULT_MIN_COEFFICIENT,
    maxCoefficient = DEFAULT_MAX_COEFFICIENT,
    now = Date.now(),
  } = {},
) => {
  const estimated = toFiniteNonNegative(estimatedTokens);
  const actual = toFiniteNonNegative(actualPromptTokens);
  const normalized = normalizeTokenCalibrationState(state);
  if (estimated === null || actual === null || estimated <= 0 || actual <= 0) {
    return {
      state: normalized,
      record: getTokenCalibrationRecord(normalized, { provider, model }),
      updated: false,
    };
  }
  const min = Math.max(0.01, Number(minCoefficient) || DEFAULT_MIN_COEFFICIENT);
  const max = Math.max(min, Number(maxCoefficient) || DEFAULT_MAX_COEFFICIENT);
  const smoothing = clamp(Number(alpha) || DEFAULT_ALPHA, 0.01, 1);
  const ratio = clamp(actual / estimated, min, max);
  const key = buildTokenCalibrationKey(provider, model);
  const previous = normalized.records[key] || null;
  const coefficient = previous
    ? clamp(previous.coefficient * (1 - smoothing) + ratio * smoothing, min, max)
    : ratio;
  const record = {
    provider: String(provider || '').trim(),
    model: String(model || '').trim(),
    coefficient,
    samples: Math.max(0, Math.trunc(Number(previous?.samples)) || 0) + 1,
    lastRatio: ratio,
    lastEstimatedTokens: Math.trunc(estimated),
    lastActualTokens: Math.trunc(actual),
    updatedAt: Math.max(0, Math.trunc(Number(now)) || 0),
  };
  return {
    state: {
      version: 1,
      records: {
        ...normalized.records,
        [key]: record,
      },
    },
    record: { ...record },
    updated: true,
  };
};

const resolveBrowserStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

// 逐记录按 updatedAt 取新：不同 provider::model 可能分别在 kv 与 localStorage 侧学到样本，
// 整块覆盖会把另一侧的模型系数一起丢掉。
export const mergeTokenCalibrationStates = (left, right) => {
  const base = normalizeTokenCalibrationState(left).records;
  const incoming = normalizeTokenCalibrationState(right).records;
  const records = { ...base };
  Object.entries(incoming).forEach(([key, record]) => {
    const current = records[key];
    if (!current || Number(record.updatedAt || 0) >= Number(current.updatedAt || 0)) {
      records[key] = record;
    }
  });
  return { version: 1, records };
};

// localStorage 配额满时 setItem 会静默失败（本项目真机已发生，见 app-settings.js），
// 因此 kv（Tauri 本地文件）为权威通道，localStorage 仅作同步读缓存；
// hydrate 之后内存态为权威，不再回读 localStorage。
export class TokenCalibrationStore {
  constructor({
    storage = resolveBrowserStorage(),
    storageKey = DEFAULT_STORAGE_KEY,
    loadKv = null,
    saveKv = null,
  } = {}) {
    this.storage = storage;
    this.storageKey = String(storageKey || DEFAULT_STORAGE_KEY);
    this.loadKv = typeof loadKv === 'function' ? loadKv : null;
    this.saveKv = typeof saveKv === 'function' ? saveKv : null;
    this.hydrated = false;
    this.state = this.load();
  }

  load() {
    if (this.hydrated) return this.state;
    try {
      const raw = this.storage?.getItem?.(this.storageKey);
      return normalizeTokenCalibrationState(raw ? JSON.parse(raw) : null);
    } catch {
      return normalizeTokenCalibrationState(null);
    }
  }

  save() {
    try {
      this.storage?.setItem?.(this.storageKey, JSON.stringify(this.state));
    } catch {}
    if (this.saveKv) {
      Promise.resolve(this.saveKv(this.storageKey, this.state)).catch(() => {});
    }
  }

  // boot 早期调用：注入 kv 通道，并把 kv 侧记录并入内存态。
  async hydrate({ loadKv = null, saveKv = null } = {}) {
    if (typeof loadKv === 'function') this.loadKv = loadKv;
    if (typeof saveKv === 'function') this.saveKv = saveKv;
    if (typeof this.loadKv !== 'function') {
      this.hydrated = true;
      return this.state;
    }
    try {
      const raw = await this.loadKv(this.storageKey);
      if (raw && typeof raw === 'object' && !raw._tooLarge) {
        this.state = mergeTokenCalibrationStates(this.state, raw);
      }
    } catch {}
    this.hydrated = true;
    return this.state;
  }

  get(provider = '', model = '') {
    return getTokenCalibrationRecord(this.state, { provider, model });
  }

  update(input = {}) {
    const result = updateTokenCalibrationState(this.state, input);
    this.state = result.state;
    if (result.updated) {
      this.hydrated = true;
      this.save();
    }
    return result.record;
  }
}

export const tokenCalibrationStore = new TokenCalibrationStore();
