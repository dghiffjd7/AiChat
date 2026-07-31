import assert from 'node:assert/strict';

import {
  CAPABILITY_RETRIEVAL_STORE_KEY,
  CapabilityRetrievalStore,
  normalizeCapabilityRetrievalStoreState,
} from '../../src/scripts/storage/capability-retrieval-store.js';

const createStorage = () => {
  const values = new Map();
  return {
    values,
    getItem: key => values.get(String(key)) ?? null,
    setItem: (key, value) => values.set(String(key), String(value)),
    removeItem: key => values.delete(String(key)),
  };
};

{
  const state = normalizeCapabilityRetrievalStoreState({
    snapshots: [
      { id: 'old', createdAt: 1, candidates: [{ id: 'a' }] },
      { id: 'new-1', createdAt: 190_000, candidates: [{ id: 'b' }] },
      { id: 'new-2', createdAt: 195_000, candidates: [{ id: 'c' }] },
      { id: 'new-3', createdAt: 199_000, candidates: [{ id: 'd' }] },
    ],
  }, {
    now: () => 200_000,
    ttlMs: 60_000,
    maxSnapshots: 2,
  });
  assert.deepEqual(state.snapshots.map(item => item.id), ['new-2', 'new-3']);
  console.log('ok - capability retrieval store applies TTL and snapshot count caps');
}

{
  const state = normalizeCapabilityRetrievalStoreState({
    version: 1,
    snapshots: [{ id: 'kept-for-debug', createdAt: 190_000 }],
    aggregates: { legacy: { key: 'legacy', decisionCount: 99 } },
  }, {
    now: () => 200_000,
    ttlMs: 60_000,
  });
  assert.equal(state.snapshots[0].id, 'kept-for-debug');
  assert.deepEqual(state.aggregates, {});
  assert.equal(state.monotonicCounters.startedAt, 200_000);
  assert.deepEqual(state.monotonicCounters.pools, {});
  console.log('ok - store schema upgrades keep raw snapshots but restart incompatible rollout aggregates');
}

{
  const state = normalizeCapabilityRetrievalStoreState({
    snapshots: [
      { id: 'old-miss', createdAt: 180_000, validSelection: true, candidateHit: false },
      { id: 'recent-hit-1', createdAt: 190_000, validSelection: true, candidateHit: true },
      { id: 'recent-hit-2', createdAt: 195_000, validSelection: true, candidateHit: true },
      { id: 'recent-hit-3', createdAt: 199_000, validSelection: true, candidateHit: true },
    ],
  }, {
    now: () => 200_000,
    ttlMs: 60_000,
    maxSnapshots: 2,
  });
  assert.deepEqual(state.snapshots.map(item => item.id), ['old-miss', 'recent-hit-3']);
  console.log('ok - snapshot caps preserve attributable misses before sampling recent hits');
}

{
  const storage = createStorage();
  const saved = [];
  let now = 1000;
  const store = new CapabilityRetrievalStore({
    storage,
    loadKv: async () => null,
    saveKv: async (name, data) => saved.push({ name, data }),
    now: () => now,
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });
  await store.load();
  store.recordDecision({
    id: 'snapshot-1',
    requestId: 'request-1',
    phase: 'planner',
    mode: 'shadow',
    effectiveMode: 'shadow',
    retrieverVersion: 'v1',
    createdAt: now,
    candidates: [
      { id: 'worldbook.open', version: '1', rank: 1, score: 100, reasonCodes: ['intent'] },
      { id: 'app.capabilities.search', version: '1', rank: 2, score: 80, reasonCodes: ['control_plane'] },
    ],
    candidateCount: 2,
    selectedCapabilityId: 'worldbook.open',
    selectedToolName: 'app.open_panel',
    selectedRank: 1,
    reciprocalRank: 1,
    candidateHit: true,
    validSelection: true,
    estimatedFullSchemaTokens: 200,
    estimatedCandidateSchemaTokens: 40,
    correction: {
      originalId: 'worldbook.opne',
      resolvedId: 'worldbook.open',
      rule: 'edit_distance',
      confidence: 0.92,
    },
    cohort: { provider: 'custom', model: 'weak-model', uiMode: 'chat', language: 'zh', riskLevel: 'low' },
    prompt: '不得持久化',
    schema: { secret: true },
    userText: '不得持久化',
  });
  now += 10;
  store.recordDecision({
    id: 'snapshot-2',
    requestId: 'request-1',
    phase: 'react',
    mode: 'shadow',
    retrieverVersion: 'v1',
    createdAt: now,
    candidates: [{ id: 'app.resource.read', rank: 1 }],
    selectedCapabilityId: 'danger.delete',
    selectedToolName: 'danger.delete',
    candidateHit: false,
    candidateViolation: true,
    validSelection: false,
    policyExcluded: true,
    cohort: { provider: 'custom', model: 'weak-model', uiMode: 'chat', language: 'zh', riskLevel: 'low' },
  });
  store.recordRequestSummary({
    retrieverVersion: 'v1',
    mode: 'shadow',
    cohort: { provider: 'custom', model: 'weak-model', uiMode: 'chat', language: 'zh', riskLevel: 'low' },
    allValidSelectionsCovered: true,
  });
  now += 10;
  store.recordDecision({
    id: 'snapshot-verification',
    requestId: 'request-1',
    phase: 'verification',
    mode: 'shadow',
    retrieverVersion: 'v1',
    createdAt: now,
    candidates: [{ id: 'app.resource.read', rank: 1 }],
    selectedCapabilityId: 'app.resource.read',
    selectedToolName: 'app.read_resource',
    metricEligible: false,
  });
  const stats = store.getStats();
  assert.equal(stats.snapshotCount, 3);
  assert.equal(stats.aggregates.length, 1);
  assert.equal(stats.aggregates[0].effectiveMode, 'shadow');
  assert.equal(stats.aggregates[0].validSelectionCount, 1);
  assert.equal(stats.aggregates[0].hitCount, 1);
  assert.equal(stats.aggregates[0].reciprocalRankTotal, 1);
  assert.equal(stats.aggregates[0].candidateCountTotal, 3);
  assert.equal(stats.aggregates[0].candidateViolationCount, 1);
  assert.equal(stats.aggregates[0].correctionCount, 1);
  assert.equal(stats.aggregates[0].schemaTokenSampleCount, 1);
  assert.equal(stats.aggregates[0].estimatedFullSchemaTokensTotal, 200);
  assert.equal(stats.aggregates[0].estimatedCandidateSchemaTokensTotal, 40);
  assert.equal(store.listSnapshots({ limit: 1 })[0].metricEligible, false);
  assert.equal(stats.aggregates[0].policyExcludedCount, 1);
  assert.equal(stats.aggregates[0].runCount, 1);
  assert.equal(stats.aggregates[0].runCoveredCount, 1);

  const exported = store.exportState();
  assert.equal(Object.hasOwn(exported.snapshots[0], 'prompt'), false);
  assert.equal(Object.hasOwn(exported.snapshots[0], 'schema'), false);
  assert.equal(Object.hasOwn(exported.snapshots[0], 'userText'), false);
  await store.flush();
  assert.equal(saved.at(-1).name, CAPABILITY_RETRIEVAL_STORE_KEY);
  assert.ok(storage.values.get(CAPABILITY_RETRIEVAL_STORE_KEY)?.includes('snapshot-1'));
  console.log('ok - retrieval decisions persist compact snapshots and aggregate hit/policy metrics');
}

{
  const store = new CapabilityRetrievalStore({
    storage: createStorage(),
    loadKv: async () => null,
    saveKv: async () => { throw new Error('disk unavailable'); },
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });
  store.recordDecision({
    id: 'snapshot-fallback',
    createdAt: Date.now(),
    candidates: [{ id: 'app.state.read' }],
  });
  assert.equal(await store.flush(), false);
  assert.equal(store.listSnapshots()[0].id, 'snapshot-fallback');
  console.log('ok - retrieval persistence failure does not block in-memory routing facts');
}

{
  // 开发期旧口径 key 在 load 时清除
  const storage = createStorage();
  storage.setItem('capability_retrieval_store_v1', '{"old":true}');
  storage.setItem(CAPABILITY_RETRIEVAL_STORE_KEY, JSON.stringify({ version: 2, snapshots: [], aggregates: {} }));
  const store = new CapabilityRetrievalStore({
    storage,
    loadKv: async () => null,
    saveKv: async () => true,
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });
  await store.load();
  assert.equal(storage.getItem('capability_retrieval_store_v1'), null);
  assert.ok(storage.getItem(CAPABILITY_RETRIEVAL_STORE_KEY));
  console.log('ok - legacy v1 store key is removed on load');
}

{
  const storage = createStorage();
  let now = Date.UTC(2026, 6, 1, 12, 0, 0);
  let persisted = null;
  const store = new CapabilityRetrievalStore({
    storage,
    loadKv: async () => null,
    saveKv: async (_name, data) => { persisted = structuredClone(data); },
    now: () => now,
    maxSnapshots: 2,
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });
  await store.load();

  for (let index = 0; index < 200; index += 1) {
    store.recordDecision({
      id: `monotonic-${index}`,
      requestId: `request-${index}`,
      phase: 'react',
      mode: 'shadow',
      effectiveMode: 'shadow',
      retrieverVersion: 'v3',
      createdAt: now,
      candidates: [{ id: 'session.list', rank: 1 }],
      candidateCount: 1,
      selectedCapabilityId: 'session.list',
      selectedToolName: 'app.read_resource',
      candidateHit: index % 10 !== 0,
      validSelection: true,
      cohort: {
        provider: 'deepseek',
        model: `cohort-${index}`,
        uiMode: 'chat',
        language: 'zh',
        taskDomain: `domain-${index}`,
        riskLevel: 'low',
        maidContextVersion: 'maid-context-v4-p1d',
      },
    });
  }
  store.recordRequestSummary({
    retrieverVersion: 'v3',
    mode: 'shadow',
    effectiveMode: 'shadow',
    cohort: {
      provider: 'deepseek',
      model: 'cohort-199',
      uiMode: 'chat',
      language: 'zh',
      taskDomain: 'domain-199',
      riskLevel: 'low',
      maidContextVersion: 'maid-context-v4-p1d',
    },
    allValidSelectionsCovered: false,
  });
  await store.flush();

  const stats = store.getStats();
  assert.equal(stats.snapshotCount, 2, 'diagnostic snapshots remain capped');
  assert.equal(stats.aggregateCount, 160, 'diagnostic cohorts remain capped');
  assert.equal(stats.monotonicPools.length, 1);
  assert.equal(stats.monotonicPools[0].decisionCount, 200);
  assert.equal(stats.monotonicPools[0].validSelectionCount, 200);
  assert.equal(stats.monotonicPools[0].hitCount, 180);
  assert.equal(stats.monotonicPools[0].missCount, 20);
  assert.equal(stats.monotonicPools[0].attributedMissCount, 0);
  assert.equal(stats.monotonicPools[0].unexplainedMissCount, 20);
  assert.equal(stats.monotonicPools[0].runCount, 1);
  assert.equal(stats.monotonicPools[0].runCoveredCount, 0);
  assert.equal(stats.monotonicPools[0].dailyBuckets['2026-07-01'].validSelectionCount, 200);

  const reloaded = new CapabilityRetrievalStore({
    storage: createStorage(),
    loadKv: async () => persisted,
    saveKv: async () => true,
    now: () => now,
    maxSnapshots: 2,
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });
  await reloaded.load();
  assert.equal(reloaded.getStats().monotonicPools[0].validSelectionCount, 200);
  console.log('ok - monotonic Shadow counters survive snapshot and aggregate cohort caps');
}

{
  let now = Date.UTC(2026, 6, 10, 8, 0, 0);
  const store = new CapabilityRetrievalStore({
    storage: createStorage(),
    loadKv: async () => null,
    saveKv: async () => true,
    now: () => now,
    setTimeoutFn: null,
    clearTimeoutFn: null,
  });
  await store.load();
  const base = {
    mode: 'shadow',
    effectiveMode: 'shadow',
    retrieverVersion: 'v3',
    candidates: [{ id: 'maid.memory.archive', rank: 1 }],
    selectedCapabilityId: 'maid.memory.archive',
    selectedToolName: 'maid.memory.archive',
    validSelection: true,
    candidateHit: false,
    cohort: {
      provider: 'deepseek',
      model: 'v4-flash',
      uiMode: 'chat',
      language: 'zh',
      taskDomain: 'maid',
      riskLevel: 'medium',
      maidContextVersion: 'maid-context-v4-p1d',
    },
  };
  store.recordDecision({ ...base, id: 'miss-attributed', requestId: 'r1', createdAt: now });
  store.recordDecision({
    ...base,
    id: 'policy-excluded',
    requestId: 'r2',
    createdAt: now,
    policyExcluded: true,
  });
  now += 24 * 60 * 60 * 1000;
  store.recordDecision({
    ...base,
    id: 'next-day-hit',
    requestId: 'r3',
    createdAt: now,
    candidateHit: true,
  });
  store.recordDecision({
    ...base,
    id: 'different-context',
    requestId: 'r4',
    createdAt: now,
    candidateHit: true,
    cohort: {
      ...base.cohort,
      maidContextVersion: 'maid-context-v5',
    },
  });

  const attributed = store.recordMissAttribution('miss-attributed', {
    code: 'known_memory_alias_gap',
  });
  assert.equal(attributed?.missAttribution?.code, 'known_memory_alias_gap');
  store.recordMissAttribution('miss-attributed', {
    code: 'must_not_double_count',
  });

  const stats = store.getStats();
  assert.equal(stats.monotonicPools.length, 2, 'maid context versions stay in separate measurement pools');
  const pool = stats.monotonicPools.find(item => item.maidContextVersion === 'maid-context-v4-p1d');
  assert.equal(pool.decisionCount, 3);
  assert.equal(pool.policyExcludedCount, 1);
  assert.equal(pool.validSelectionCount, 2);
  assert.equal(pool.hitCount, 1);
  assert.equal(pool.missCount, 1);
  assert.equal(pool.attributedMissCount, 1);
  assert.equal(pool.unexplainedMissCount, 0);
  assert.equal(pool.dailyBuckets['2026-07-10'].attributedMissCount, 1);
  assert.equal(pool.dailyBuckets['2026-07-10'].unexplainedMissCount, 0);
  assert.equal(pool.dailyBuckets['2026-07-11'].hitCount, 1);
  assert.equal(
    store.listSnapshots({ requestId: 'r1' })[0].missAttribution.code,
    'known_memory_alias_gap',
  );
  const rolling = store.getMonotonicStats({ rollingDays: 1 });
  const rollingPool = rolling.pools.find(item => item.maidContextVersion === 'maid-context-v4-p1d');
  assert.equal(rollingPool.rolling.validSelectionCount, 1);
  assert.equal(rollingPool.rolling.hitCount, 1);
  assert.equal(rollingPool.rolling.unexplainedMissCount, 0);
  console.log('ok - miss attribution and context-version pools remain idempotent and auditable');
}

{
  const previousTauriInternals = globalThis.__TAURI_INTERNALS__;
  const storage = createStorage();
  storage.setItem(CAPABILITY_RETRIEVAL_STORE_KEY, JSON.stringify({
    version: 2,
    snapshots: [{ id: 'stale-local', createdAt: Date.now() }],
    aggregates: {},
  }));
  globalThis.__TAURI_INTERNALS__ = { invoke: async () => true };
  try {
    const store = new CapabilityRetrievalStore({
      storage,
      loadKv: async () => ({
        version: 2,
        snapshots: [{ id: 'disk-snapshot', createdAt: Date.now() }],
        aggregates: {},
      }),
      saveKv: async () => true,
      setTimeoutFn: null,
      clearTimeoutFn: null,
    });
    await store.load();
    assert.equal(store.listSnapshots()[0].id, 'disk-snapshot');
    assert.equal(storage.getItem(CAPABILITY_RETRIEVAL_STORE_KEY), null);

    store.recordDecision({
      id: 'new-snapshot',
      mode: 'shadow',
      retrieverVersion: 'v3',
      createdAt: Date.now(),
      candidates: [{ id: 'app.state.read' }],
    });
    await store.flush();
    assert.equal(
      storage.getItem(CAPABILITY_RETRIEVAL_STORE_KEY),
      null,
      'Tauri Shadow diagnostics must not recreate a multi-megabyte local mirror',
    );
    console.log('ok - Tauri capability retrieval state stays KV-only');
  } finally {
    if (previousTauriInternals === undefined) delete globalThis.__TAURI_INTERNALS__;
    else globalThis.__TAURI_INTERNALS__ = previousTauriInternals;
  }
}

{
  const previousTauriInternals = globalThis.__TAURI_INTERNALS__;
  const storage = createStorage();
  globalThis.__TAURI_INTERNALS__ = { invoke: async () => true };
  try {
    const store = new CapabilityRetrievalStore({
      storage,
      loadKv: async () => ({}),
      saveKv: async () => { throw new Error('disk unavailable'); },
      setTimeoutFn: null,
      clearTimeoutFn: null,
    });
    await store.load();
    store.recordDecision({
      id: 'fallback-snapshot',
      mode: 'shadow',
      retrieverVersion: 'v3',
      createdAt: Date.now(),
      candidates: [{ id: 'app.state.read' }],
    });
    assert.equal(await store.flush(), false);
    assert.ok(storage.getItem(CAPABILITY_RETRIEVAL_STORE_KEY)?.includes('fallback-snapshot'));
    console.log('ok - failed Tauri Shadow persistence retains a local recovery copy');
  } finally {
    if (previousTauriInternals === undefined) delete globalThis.__TAURI_INTERNALS__;
    else globalThis.__TAURI_INTERNALS__ = previousTauriInternals;
  }
}

console.log('capability-retrieval-store-tests passed');
