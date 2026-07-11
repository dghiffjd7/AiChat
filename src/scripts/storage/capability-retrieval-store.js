import { safeInvoke } from '../utils/tauri.js';

export const CAPABILITY_RETRIEVAL_STORE_KEY = 'capability_retrieval_store_v2';
export const CAPABILITY_RETRIEVAL_STORE_VERSION = 2;
// 开发期旧口径 key，load 时顺手清除（旧聚合不迁入 v2，见 PROGRESS 2026-07-10）。
const LEGACY_STORE_KEYS = ['capability_retrieval_store_v1'];

const DEFAULT_MAX_SNAPSHOTS = 500;
const DEFAULT_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const DEFAULT_FLUSH_DELAY_MS = 1500;
const MAX_AGGREGATES = 160;

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const finite = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};

const clone = (value, fallback = null) => {
  if (value === undefined) return fallback;
  if (value === null || typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const normalizeReasonCodes = value => (Array.isArray(value) ? value : [value])
  .map(item => trim(item).slice(0, 60))
  .filter(Boolean)
  .slice(0, 6);

const normalizeCandidateRef = (raw = {}, index = 0) => {
  const src = isPlainObject(raw) ? raw : {};
  const id = trim(src.id).slice(0, 120);
  if (!id) return null;
  return {
    id,
    version: trim(src.version, '1').slice(0, 40),
    kind: trim(src.kind, 'tool').slice(0, 40),
    rank: Math.max(1, Math.trunc(finite(src.rank, index + 1))),
    score: Math.max(0, Math.round(finite(src.score, 0) * 100) / 100),
    reasonCodes: normalizeReasonCodes(src.reasonCodes || src.reasons),
  };
};

const normalizeCohort = (raw = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  return {
    provider: trim(src.provider).slice(0, 60),
    model: trim(src.model).slice(0, 120),
    profileId: trim(src.profileId).slice(0, 80),
    uiMode: trim(src.uiMode).slice(0, 40),
    activePage: trim(src.activePage).slice(0, 60),
    language: trim(src.language).slice(0, 20),
    taskDomain: trim(src.taskDomain).slice(0, 60),
    riskLevel: trim(src.riskLevel).slice(0, 20),
  };
};

export const normalizeCapabilityRetrievalSnapshot = (raw = {}, {
  now = Date.now,
} = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const createdAt = Math.max(0, finite(src.createdAt, now?.() || Date.now()));
  const candidates = (Array.isArray(src.candidates) ? src.candidates : [])
    .map(normalizeCandidateRef)
    .filter(Boolean)
    .slice(0, 16);
  return {
    id: trim(src.id).slice(0, 160),
    requestId: trim(src.requestId).slice(0, 160),
    phase: trim(src.phase, 'planner').slice(0, 40),
    mode: trim(src.mode, 'shadow').slice(0, 40),
    effectiveMode: trim(src.effectiveMode, 'shadow').slice(0, 40),
    retrieverVersion: trim(src.retrieverVersion, 'unknown').slice(0, 80),
    createdAt,
    latencyMs: Math.max(0, Math.round(finite(src.latencyMs, 0))),
    candidates,
    candidateCount: Math.max(0, Math.trunc(finite(src.candidateCount, candidates.length))),
    selectedCapabilityId: trim(src.selectedCapabilityId).slice(0, 120),
    selectedToolName: trim(src.selectedToolName).slice(0, 120),
    selectedRank: Math.max(0, Math.trunc(finite(src.selectedRank, 0))),
    reciprocalRank: Math.max(0, Math.min(1, finite(src.reciprocalRank, 0))),
    candidateHit: src.candidateHit === true,
    candidateViolation: src.candidateViolation === true,
    metricEligible: src.metricEligible !== false,
    validSelection: src.validSelection === true,
    policyExcluded: src.policyExcluded === true,
    estimatedFullSchemaTokens: Math.max(0, Math.trunc(finite(src.estimatedFullSchemaTokens, 0))),
    estimatedCandidateSchemaTokens: Math.max(0, Math.trunc(finite(src.estimatedCandidateSchemaTokens, 0))),
    correction: isPlainObject(src.correction) ? {
      originalId: trim(src.correction.originalId).slice(0, 120),
      resolvedId: trim(src.correction.resolvedId).slice(0, 120),
      rule: trim(src.correction.rule).slice(0, 60),
      confidence: Math.max(0, Math.min(1, finite(src.correction.confidence, 0))),
    } : null,
    cohort: normalizeCohort(src.cohort),
  };
};

const buildAggregateKey = (snapshot = {}) => [
  trim(snapshot.retrieverVersion, 'unknown'),
  trim(snapshot.mode, 'shadow'),
  trim(snapshot.effectiveMode, 'shadow'),
  trim(snapshot.cohort?.provider, '-'),
  trim(snapshot.cohort?.model, '-'),
  trim(snapshot.cohort?.uiMode, '-'),
  trim(snapshot.cohort?.language, '-'),
  trim(snapshot.cohort?.taskDomain, '-'),
  trim(snapshot.cohort?.riskLevel, '-'),
].join('|').slice(0, 420);

const normalizeAggregate = (raw = {}, key = '') => {
  const src = isPlainObject(raw) ? raw : {};
  return {
    key: trim(src.key || key).slice(0, 420),
    retrieverVersion: trim(src.retrieverVersion, 'unknown').slice(0, 80),
    mode: trim(src.mode, 'shadow').slice(0, 40),
    effectiveMode: trim(src.effectiveMode, 'shadow').slice(0, 40),
    cohort: normalizeCohort(src.cohort),
    decisionCount: Math.max(0, Math.trunc(finite(src.decisionCount, 0))),
    candidateCountTotal: Math.max(0, Math.trunc(finite(src.candidateCountTotal, 0))),
    validSelectionCount: Math.max(0, Math.trunc(finite(src.validSelectionCount, 0))),
    hitCount: Math.max(0, Math.trunc(finite(src.hitCount, 0))),
    missCount: Math.max(0, Math.trunc(finite(src.missCount, 0))),
    reciprocalRankTotal: Math.max(0, finite(src.reciprocalRankTotal, 0)),
    candidateViolationCount: Math.max(0, Math.trunc(finite(src.candidateViolationCount, 0))),
    correctionCount: Math.max(0, Math.trunc(finite(src.correctionCount, 0))),
    policyExcludedCount: Math.max(0, Math.trunc(finite(src.policyExcludedCount, 0))),
    schemaTokenSampleCount: Math.max(0, Math.trunc(finite(src.schemaTokenSampleCount, 0))),
    estimatedFullSchemaTokensTotal: Math.max(0, Math.trunc(finite(src.estimatedFullSchemaTokensTotal, 0))),
    estimatedCandidateSchemaTokensTotal: Math.max(0, Math.trunc(finite(src.estimatedCandidateSchemaTokensTotal, 0))),
    runCount: Math.max(0, Math.trunc(finite(src.runCount, 0))),
    runCoveredCount: Math.max(0, Math.trunc(finite(src.runCoveredCount, 0))),
    updatedAt: Math.max(0, finite(src.updatedAt, 0)),
  };
};

const capSnapshots = (snapshots = [], maxSnapshots = DEFAULT_MAX_SNAPSHOTS) => {
  const limit = Math.max(1, Math.trunc(finite(maxSnapshots, DEFAULT_MAX_SNAPSHOTS)));
  const sorted = (Array.isArray(snapshots) ? snapshots : [])
    .slice()
    .sort((a, b) => a.createdAt - b.createdAt);
  if (sorted.length <= limit) return sorted;
  const misses = sorted.filter(item => item.validSelection && !item.policyExcluded && !item.candidateHit);
  if (misses.length >= limit) return misses.slice(-limit);
  const missIds = new Set(misses.map(item => item.id));
  const recentOthers = sorted
    .filter(item => !missIds.has(item.id))
    .slice(-(limit - misses.length));
  return [...misses, ...recentOthers].sort((a, b) => a.createdAt - b.createdAt);
};

export const normalizeCapabilityRetrievalStoreState = (raw = {}, {
  now = Date.now,
  maxSnapshots = DEFAULT_MAX_SNAPSHOTS,
  ttlMs = DEFAULT_TTL_MS,
} = {}) => {
  const src = isPlainObject(raw) ? raw : {};
  const currentTime = Math.max(0, finite(now?.(), Date.now()));
  const cutoff = currentTime - Math.max(60_000, finite(ttlMs, DEFAULT_TTL_MS));
  const snapshots = (Array.isArray(src.snapshots) ? src.snapshots : [])
    .map(item => normalizeCapabilityRetrievalSnapshot(item, { now }))
    .filter(item => item.id && item.createdAt >= cutoff);
  const cappedSnapshots = capSnapshots(snapshots, maxSnapshots);
  const aggregateSource = Number(src.version || 0) === CAPABILITY_RETRIEVAL_STORE_VERSION
    ? src.aggregates
    : {};
  const aggregates = Object.fromEntries(
    Object.entries(isPlainObject(aggregateSource) ? aggregateSource : {})
      .map(([key, value]) => [key, normalizeAggregate(value, key)])
      .sort((a, b) => b[1].updatedAt - a[1].updatedAt)
      .slice(0, MAX_AGGREGATES),
  );
  return {
    version: CAPABILITY_RETRIEVAL_STORE_VERSION,
    updatedAt: Math.max(0, finite(src.updatedAt, currentTime)),
    snapshots: cappedSnapshots,
    aggregates,
  };
};

const readLocalJson = (storage, key) => {
  try {
    const raw = storage?.getItem?.(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeLocalJson = (storage, key, value) => {
  try {
    storage?.setItem?.(key, JSON.stringify(value));
    return Boolean(storage);
  } catch {
    return false;
  }
};

const defaultLoadKv = name => safeInvoke('load_kv', { name });
const defaultSaveKv = (name, data) => safeInvoke('save_kv', { name, data });

export class CapabilityRetrievalStore {
  constructor({
    storage = globalThis?.localStorage || null,
    loadKv = defaultLoadKv,
    saveKv = defaultSaveKv,
    now = Date.now,
    maxSnapshots = DEFAULT_MAX_SNAPSHOTS,
    ttlMs = DEFAULT_TTL_MS,
    flushDelayMs = DEFAULT_FLUSH_DELAY_MS,
    setTimeoutFn = globalThis?.setTimeout?.bind(globalThis) || null,
    clearTimeoutFn = globalThis?.clearTimeout?.bind(globalThis) || null,
  } = {}) {
    this.storage = storage;
    this.loadKv = typeof loadKv === 'function' ? loadKv : null;
    this.saveKv = typeof saveKv === 'function' ? saveKv : null;
    this.now = typeof now === 'function' ? now : Date.now;
    this.maxSnapshots = Math.max(1, Math.trunc(finite(maxSnapshots, DEFAULT_MAX_SNAPSHOTS)));
    this.ttlMs = Math.max(60_000, finite(ttlMs, DEFAULT_TTL_MS));
    this.flushDelayMs = Math.max(0, finite(flushDelayMs, DEFAULT_FLUSH_DELAY_MS));
    this.setTimeoutFn = typeof setTimeoutFn === 'function' ? setTimeoutFn : null;
    this.clearTimeoutFn = typeof clearTimeoutFn === 'function' ? clearTimeoutFn : null;
    this.state = normalizeCapabilityRetrievalStoreState({}, {
      now: this.now,
      maxSnapshots: this.maxSnapshots,
      ttlMs: this.ttlMs,
    });
    this.loaded = false;
    this.writeChain = Promise.resolve();
    this.flushTimer = null;
  }

  async load() {
    for (const legacyKey of LEGACY_STORE_KEYS) {
      try {
        this.storage?.removeItem?.(legacyKey);
      } catch {}
    }
    let raw = null;
    try {
      raw = await this.loadKv?.(CAPABILITY_RETRIEVAL_STORE_KEY);
      if (raw?._tooLarge) raw = null;
    } catch {}
    if (!raw) raw = readLocalJson(this.storage, CAPABILITY_RETRIEVAL_STORE_KEY);
    this.state = normalizeCapabilityRetrievalStoreState(raw || {}, {
      now: this.now,
      maxSnapshots: this.maxSnapshots,
      ttlMs: this.ttlMs,
    });
    this.loaded = true;
    return this.exportState();
  }

  ensureLoaded() {
    if (this.loaded) return;
    this.state = normalizeCapabilityRetrievalStoreState(
      readLocalJson(this.storage, CAPABILITY_RETRIEVAL_STORE_KEY) || {},
      { now: this.now, maxSnapshots: this.maxSnapshots, ttlMs: this.ttlMs },
    );
    this.loaded = true;
  }

  scheduleFlush() {
    if (!this.setTimeoutFn) return;
    if (this.flushTimer && this.clearTimeoutFn) this.clearTimeoutFn(this.flushTimer);
    this.flushTimer = this.setTimeoutFn(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushDelayMs);
  }

  recordDecision(raw = {}) {
    this.ensureLoaded();
    const snapshot = normalizeCapabilityRetrievalSnapshot(raw, { now: this.now });
    if (!snapshot.id) return null;
    const existingIndex = this.state.snapshots.findIndex(item => item.id === snapshot.id);
    if (existingIndex >= 0) this.state.snapshots[existingIndex] = snapshot;
    else this.state.snapshots.push(snapshot);
    const currentTime = this.now();
    const cutoff = currentTime - this.ttlMs;
    this.state.snapshots = capSnapshots(
      this.state.snapshots.filter(item => Number(item?.createdAt || 0) >= cutoff),
      this.maxSnapshots,
    );
    this.state.updatedAt = currentTime;

    if (!snapshot.metricEligible) {
      this.scheduleFlush();
      return clone(snapshot);
    }

    const key = buildAggregateKey(snapshot);
    const aggregate = normalizeAggregate(this.state.aggregates[key], key);
    aggregate.retrieverVersion = snapshot.retrieverVersion;
    aggregate.mode = snapshot.mode;
    aggregate.effectiveMode = snapshot.effectiveMode;
    aggregate.cohort = snapshot.cohort;
    aggregate.decisionCount += 1;
    aggregate.candidateCountTotal += snapshot.candidateCount;
    if (snapshot.candidateViolation) aggregate.candidateViolationCount += 1;
    if (snapshot.correction) aggregate.correctionCount += 1;
    if (snapshot.estimatedFullSchemaTokens > 0 || snapshot.estimatedCandidateSchemaTokens > 0) {
      aggregate.schemaTokenSampleCount += 1;
      aggregate.estimatedFullSchemaTokensTotal += snapshot.estimatedFullSchemaTokens;
      aggregate.estimatedCandidateSchemaTokensTotal += snapshot.estimatedCandidateSchemaTokens;
    }
    if (snapshot.policyExcluded) {
      aggregate.policyExcludedCount += 1;
    } else if (snapshot.validSelection) {
      aggregate.validSelectionCount += 1;
      aggregate.reciprocalRankTotal += snapshot.reciprocalRank;
      if (snapshot.candidateHit) aggregate.hitCount += 1;
      else aggregate.missCount += 1;
    }
    aggregate.updatedAt = this.now();
    this.state.aggregates[key] = aggregate;
    this.scheduleFlush();
    return clone(snapshot);
  }

  recordRequestSummary(raw = {}) {
    this.ensureLoaded();
    const src = isPlainObject(raw) ? raw : {};
    const key = trim(src.aggregateKey) || buildAggregateKey({
      retrieverVersion: src.retrieverVersion,
      mode: src.mode,
      effectiveMode: src.effectiveMode,
      cohort: src.cohort,
    });
    const aggregate = normalizeAggregate(this.state.aggregates[key], key);
    aggregate.retrieverVersion = trim(src.retrieverVersion, aggregate.retrieverVersion);
    aggregate.mode = trim(src.mode, aggregate.mode);
    aggregate.effectiveMode = trim(src.effectiveMode, aggregate.effectiveMode);
    aggregate.cohort = normalizeCohort(src.cohort || aggregate.cohort);
    aggregate.runCount += 1;
    if (src.allValidSelectionsCovered === true) aggregate.runCoveredCount += 1;
    aggregate.updatedAt = this.now();
    this.state.aggregates[key] = aggregate;
    this.state.updatedAt = this.now();
    this.scheduleFlush();
    return clone(aggregate);
  }

  listSnapshots({ requestId = '', limit = 0 } = {}) {
    this.ensureLoaded();
    const rid = trim(requestId);
    const count = Math.max(0, Math.trunc(finite(limit, 0)));
    const list = this.state.snapshots
      .filter(item => !rid || item.requestId === rid)
      .sort((a, b) => b.createdAt - a.createdAt);
    return (count > 0 ? list.slice(0, count) : list).map(item => clone(item));
  }

  getStats() {
    this.ensureLoaded();
    const aggregates = Object.values(this.state.aggregates).map(item => clone(item));
    return {
      snapshotCount: this.state.snapshots.length,
      aggregateCount: aggregates.length,
      aggregates,
    };
  }

  exportState() {
    this.ensureLoaded();
    return clone(this.state, {
      version: CAPABILITY_RETRIEVAL_STORE_VERSION,
      updatedAt: this.now(),
      snapshots: [],
      aggregates: {},
    });
  }

  async persist() {
    this.ensureLoaded();
    this.state = normalizeCapabilityRetrievalStoreState({
      ...this.state,
      updatedAt: this.now(),
    }, {
      now: this.now,
      maxSnapshots: this.maxSnapshots,
      ttlMs: this.ttlMs,
    });
    const payload = this.exportState();
    writeLocalJson(this.storage, CAPABILITY_RETRIEVAL_STORE_KEY, payload);
    try {
      await this.saveKv?.(CAPABILITY_RETRIEVAL_STORE_KEY, payload);
      return true;
    } catch {
      return false;
    }
  }

  flush() {
    if (this.flushTimer && this.clearTimeoutFn) {
      this.clearTimeoutFn(this.flushTimer);
      this.flushTimer = null;
    }
    this.writeChain = this.writeChain.then(() => this.persist()).catch(() => false);
    return this.writeChain;
  }

  clear() {
    this.state = normalizeCapabilityRetrievalStoreState({}, {
      now: this.now,
      maxSnapshots: this.maxSnapshots,
      ttlMs: this.ttlMs,
    });
    this.loaded = true;
    this.scheduleFlush();
  }
}
