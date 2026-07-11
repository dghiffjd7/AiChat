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

console.log('capability-retrieval-store-tests passed');
