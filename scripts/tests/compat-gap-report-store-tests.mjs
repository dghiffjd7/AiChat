import assert from 'node:assert/strict';

import {
  CompatGapReportStore,
  fingerprintCompatGapValue,
  formatCompatGapReports,
  sanitizeCompatGapApi,
  upsertCompatGapReport,
} from '../../src/scripts/storage/compat-gap-report-store.js';

assert.equal(sanitizeCompatGapApi('_.camelCase'), '_.camelCase');
assert.equal(sanitizeCompatGapApi('_().groupBy'), '_().groupBy');
assert.equal(sanitizeCompatGapApi('$.ajax'), '$.ajax');
assert.equal(sanitizeCompatGapApi('$().animate'), '$().animate');
assert.equal(sanitizeCompatGapApi('_.用户输入'), '');
assert.equal(sanitizeCompatGapApi('_.method name'), '');
assert.equal(sanitizeCompatGapApi('getContext.foo'), '');
assert.equal(fingerprintCompatGapValue('card-a'), fingerprintCompatGapValue('card-a'));
assert.notEqual(fingerprintCompatGapValue('card-a'), fingerprintCompatGapValue('card-b'));
console.log('ok - compat gap API names and privacy-safe fingerprints are normalized');

{
  let state = null;
  ({ state } = upsertCompatGapReport(state, {
    scopeFingerprint: 'scope-a',
    revisionFingerprint: 'revision-1',
    api: '_.camelCase',
    status: 'candidate',
  }, { now: 1000, limit: 3 }));
  ({ state } = upsertCompatGapReport(state, {
    scopeFingerprint: 'scope-a',
    revisionFingerprint: 'revision-1',
    api: '_.camelCase',
    status: 'candidate',
  }, { now: 1100, limit: 3 }));
  ({ state } = upsertCompatGapReport(state, {
    scopeFingerprint: 'scope-b',
    revisionFingerprint: 'revision-1',
    api: '_.camelCase',
    status: 'candidate',
  }, { now: 1200, limit: 3 }));
  assert.equal(state.reports.length, 2, 'different cards must not share a dedupe bucket');
  assert.equal(state.reports.find(item => item.scopeFingerprint === 'scope-a')?.candidateCount, 2);

  ({ state } = upsertCompatGapReport(state, {
    scopeFingerprint: 'scope-a',
    revisionFingerprint: 'revision-1',
    api: '_.camelCase',
    status: 'confirmed',
    phase: 'runtime',
    errorCategory: 'api_shape',
    errorFingerprint: 'error-a',
  }, { now: 1300, limit: 3 }));
  const confirmed = state.reports.find(item => item.scopeFingerprint === 'scope-a');
  assert.equal(confirmed.status, 'confirmed');
  assert.equal(confirmed.candidateCount, 2);
  assert.equal(confirmed.confirmedCount, 1);
  assert.equal(confirmed.errorCategory, 'api_shape');

  ({ state } = upsertCompatGapReport(state, {
    scopeFingerprint: 'scope-a',
    revisionFingerprint: 'revision-2',
    api: '$.ajax',
  }, { now: 1400, limit: 3 }));
  ({ state } = upsertCompatGapReport(state, {
    scopeFingerprint: 'scope-c',
    revisionFingerprint: 'revision-1',
    api: '$().animate',
  }, { now: 1500, limit: 3 }));
  assert.equal(state.reports.length, 3);
  assert.equal(state.reports.some(item => item.scopeFingerprint === 'scope-b'), false, 'bounded store evicts the least-recent record instead of stopping forever');
  console.log('ok - compat gaps dedupe by card revision, confirm candidates, and use bounded LRU eviction');
}

{
  const disk = new Map();
  const local = new Map();
  const storage = {
    getItem: key => local.get(key) ?? null,
    setItem: (key, value) => { local.set(key, String(value)); },
    removeItem: key => { local.delete(key); },
  };
  const createStore = () => new CompatGapReportStore({
    storage,
    loadKv: async key => disk.get(key) ?? null,
    saveKv: async (key, value) => { disk.set(key, structuredClone(value)); },
    getAppVersion: async () => '0.7.0-test',
    now: () => 2000,
    limit: 5,
  });
  const first = createStore();
  await first.record({
    scopeFingerprint: 'scope-persisted',
    revisionFingerprint: 'revision-persisted',
    api: '_().uniq',
  });
  const second = createStore();
  const reports = await second.getReports();
  assert.equal(reports.length, 1);
  assert.equal(reports[0].appVersion, '0.7.0-test');
  assert.match(formatCompatGapReports(reports), /_\(\)\.uniq/);
  assert.match(formatCompatGapReports(reports), /scope-persisted/);
  console.log('ok - compat gap reports survive store recreation and format for support export');
}


{
  const saveCalls = [];
  const store = new CompatGapReportStore({
    storage: null,
    loadKv: async () => null,
    saveKv: async (key, value) => { saveCalls.push(structuredClone(value)); },
    getAppVersion: async () => '',
    now: () => 3000,
    limit: 5,
    persistDebounceMs: 10,
  });
  const gap = {
    scopeFingerprint: 'scope-debounce',
    revisionFingerprint: 'revision-debounce',
    api: '_.camelCase',
  };
  await store.record(gap);
  assert.equal(saveCalls.length, 1, 'new report is material and flushes KV immediately');
  await store.record(gap);
  await store.record(gap);
  assert.equal(saveCalls.length, 1, 'counter-only repeats must not write KV synchronously');
  await new Promise(resolve => setTimeout(resolve, 40));
  await store.writeQueue;
  assert.equal(saveCalls.length, 2, 'debounced flush merges counter-only updates into one KV write');
  assert.equal(saveCalls.at(-1).reports[0].candidateCount, 3);
  await store.record({ ...gap, status: 'confirmed', errorCategory: 'api_shape', errorFingerprint: 'fp-1' });
  assert.equal(saveCalls.length, 3, 'status transition is material and flushes immediately');
  await store.clear();
  assert.equal(saveCalls.at(-1).reports.length, 0);
  console.log('ok - compat gap store debounces counter-only KV writes and flushes material changes');
}
