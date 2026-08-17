// 会话格式画像存储（格式修复触发与自定义格式计划 §4 缺口 6）。
// 缓存女仆调查链（格式提醒 -> 正则 -> 世界书/角色卡）提取的自定义格式规范，
// 二次修复免重查；修复引擎在无 formatHint 时自动取用。

import {
  MAID_FORMAT_PROFILE_EXTRACTOR_VERSION,
  MAID_FORMAT_PROFILE_SCHEMA_VERSION,
} from './maid-format-profile-evidence-utils.js';

export const MAID_FORMAT_PROFILE_STORE_KEY = 'maid_format_profile_store_v1';
export const MAID_FORMAT_PROFILE_STORE_VERSION = 2;

const MAX_PROFILES = 80;
const MAX_GUIDE_LENGTH = 6000;
const MAX_EVIDENCE = 12;

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const safeNow = (now = Date.now) => {
  try {
    const value = typeof now === 'function' ? now() : Date.now();
    return Number.isFinite(Number(value)) ? Number(value) : Date.now();
  } catch {
    return Date.now();
  }
};

const normalizeSources = value => (Array.isArray(value) ? value : [])
  .map(item => ({
    type: trim(item?.type, 'unknown'),
    ref: trim(item?.ref).slice(0, 160),
  }))
  .filter(item => item.type !== 'unknown' || item.ref)
  .slice(0, 8);

const normalizeEvidence = value => (Array.isArray(value) ? value : [])
  .map(item => ({
    id: trim(item?.id).slice(0, 160),
    sourceType: trim(item?.sourceType, 'unknown').slice(0, 40),
    ruleId: trim(item?.ruleId).slice(0, 120),
    ruleName: trim(item?.ruleName).slice(0, 120),
    kind: trim(item?.kind).slice(0, 80),
    markers: (Array.isArray(item?.markers) ? item.markers : [])
      .map(marker => trim(marker).slice(0, 160))
      .filter(Boolean)
      .slice(0, 8),
    confidence: ['low', 'medium', 'high'].includes(trim(item?.confidence).toLowerCase())
      ? trim(item.confidence).toLowerCase()
      : 'low',
  }))
  .filter(item => item.id || item.kind || item.markers.length)
  .slice(0, MAX_EVIDENCE);

const cloneSourceRevisions = (value) => {
  if (!isPlainObject(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
};

const normalizeConfidence = value => {
  const normalized = trim(value).toLowerCase();
  return ['low', 'medium', 'high'].includes(normalized) ? normalized : 'low';
};

const normalizeProfile = (sessionId = '', raw = {}, { now = Date.now, forWrite = false } = {}) => {
  const sid = trim(sessionId || raw?.sessionId);
  const guide = trim(raw?.guide).slice(0, MAX_GUIDE_LENGTH);
  if (!sid || !guide) return null;
  const schemaVersion = forWrite
    ? MAID_FORMAT_PROFILE_SCHEMA_VERSION
    : (Number(raw?.schemaVersion) > 0 ? Number(raw.schemaVersion) : 1);
  const extractorVersion = forWrite
    ? MAID_FORMAT_PROFILE_EXTRACTOR_VERSION
    : trim(raw?.extractorVersion, 'legacy');
  return {
    sessionId: sid,
    guide,
    sources: normalizeSources(raw?.sources),
    schemaVersion,
    extractorVersion,
    sourceFingerprint: trim(raw?.sourceFingerprint).slice(0, 200),
    sourceRevisions: cloneSourceRevisions(raw?.sourceRevisions),
    evidence: normalizeEvidence(raw?.evidence),
    confidence: normalizeConfidence(raw?.confidence),
    manualOverride: raw?.manualOverride === true,
    updatedAt: Number(raw?.updatedAt) > 0 ? Number(raw.updatedAt) : safeNow(now),
  };
};

const cloneProfile = profile => (profile ? {
  ...profile,
  sources: profile.sources.map(item => ({ ...item })),
  evidence: profile.evidence.map(item => ({ ...item, markers: item.markers.slice() })),
  sourceRevisions: cloneSourceRevisions(profile.sourceRevisions),
} : null);

export const resolveMaidFormatProfileValidity = (profile = null, sourceState = {}) => {
  if (!profile) return null;
  const currentFingerprint = trim(sourceState?.fingerprint || sourceState?.sourceFingerprint);
  const currentSchemaVersion = Number(sourceState?.schemaVersion || MAID_FORMAT_PROFILE_SCHEMA_VERSION);
  const currentExtractorVersion = trim(
    sourceState?.extractorVersion,
    MAID_FORMAT_PROFILE_EXTRACTOR_VERSION,
  );
  const staleReasons = [];
  const schemaChanged = Number(profile.schemaVersion || 0) !== currentSchemaVersion;
  const extractorChanged = trim(profile.extractorVersion) !== currentExtractorVersion;
  const sourceChanged = Boolean(currentFingerprint) && (
    !trim(profile.sourceFingerprint) || trim(profile.sourceFingerprint) !== currentFingerprint
  );
  if (schemaChanged) staleReasons.push('schema_changed');
  if (extractorChanged) staleReasons.push('extractor_changed');
  if (sourceChanged) staleReasons.push(trim(profile.sourceFingerprint) ? 'source_changed' : 'source_fingerprint_missing');
  const stale = staleReasons.length > 0;
  return {
    ...cloneProfile(profile),
    stale,
    staleReasons,
    sourceChanged,
    schemaChanged,
    extractorChanged,
    usable: !stale || profile.manualOverride === true,
  };
};

export const normalizeMaidFormatProfileState = (raw = {}, { now = Date.now } = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const profilesRaw = isPlainObject(src.profiles) ? src.profiles : {};
  const profiles = {};
  Object.entries(profilesRaw).forEach(([sessionId, profile]) => {
    const normalized = normalizeProfile(sessionId, profile, { now });
    if (normalized) profiles[normalized.sessionId] = normalized;
  });
  const keptIds = Object.values(profiles)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PROFILES)
    .map(profile => profile.sessionId);
  const keptSet = new Set(keptIds);
  Object.keys(profiles).forEach((sessionId) => {
    if (!keptSet.has(sessionId)) delete profiles[sessionId];
  });
  return {
    version: MAID_FORMAT_PROFILE_STORE_VERSION,
    updatedAt: Number(src.updatedAt) > 0 ? Number(src.updatedAt) : safeNow(now),
    profiles,
  };
};

export const createMaidFormatProfileStore = ({
  storage = globalThis?.localStorage || null,
  loadKv = null,
  saveKv = null,
  key = MAID_FORMAT_PROFILE_STORE_KEY,
  now = Date.now,
  logger = console,
} = {}) => {
  let state = null;

  const load = () => {
    if (state) return state;
    let raw = null;
    try {
      const text = storage?.getItem?.(key);
      raw = text ? JSON.parse(text) : null;
    } catch {}
    state = normalizeMaidFormatProfileState(raw || {}, { now });
    return state;
  };

  // kv 为主通道（localStorage 可能配额已满，写入会静默失败），localStorage 仅作尽力缓存。
  const hydrate = async () => {
    load();
    if (typeof loadKv !== 'function') return state;
    try {
      const kvRaw = await loadKv(key);
      if (kvRaw && typeof kvRaw === 'object' && !kvRaw._tooLarge) {
        const kvState = normalizeMaidFormatProfileState(kvRaw, { now });
        if (Number(kvState.updatedAt || 0) >= Number(state.updatedAt || 0) ||
          !Object.keys(state.profiles).length) {
          state = kvState;
        }
      }
    } catch (err) {
      logger?.debug?.('maid format profile kv hydrate skipped', err);
    }
    return state;
  };

  const save = () => {
    if (!state) return false;
    state.updatedAt = safeNow(now);
    const payload = JSON.stringify(state);
    let localOk = false;
    try {
      storage?.setItem?.(key, payload);
      localOk = true;
    } catch {}
    if (typeof saveKv === 'function') {
      Promise.resolve(saveKv(key, JSON.parse(payload))).catch((err) => {
        logger?.warn?.('maid format profile kv save failed', err);
      });
      return true;
    }
    return localOk;
  };

  return {
    hydrate,
    peek(sessionId = '') {
      const sid = trim(sessionId);
      const profile = sid ? load().profiles[sid] : null;
      return cloneProfile(profile);
    },
    get(sessionId = '', sourceState = {}) {
      const sid = trim(sessionId);
      const profile = sid ? load().profiles[sid] : null;
      return resolveMaidFormatProfileValidity(profile, sourceState);
    },
    set(sessionId = '', profile = {}) {
      const normalized = normalizeProfile(sessionId, profile, { now, forWrite: true });
      if (!normalized) return null;
      load().profiles[normalized.sessionId] = normalized;
      state = normalizeMaidFormatProfileState(state, { now });
      save();
      return cloneProfile(normalized);
    },
    remove(sessionId = '') {
      const sid = trim(sessionId);
      if (!sid || !load().profiles[sid]) return false;
      delete state.profiles[sid];
      save();
      return true;
    },
    list() {
      return Object.values(load().profiles)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(profile => resolveMaidFormatProfileValidity(profile));
    },
  };
};
