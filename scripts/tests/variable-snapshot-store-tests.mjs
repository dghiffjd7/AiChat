import assert from 'node:assert/strict';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

class MemoryLocalStorageMock {
  constructor() { this.map = new Map(); }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) { this.map.set(String(key), String(value)); }
  removeItem(key) { this.map.delete(String(key)); }
  clear() { this.map.clear(); }
}

if (globalThis.localStorage === undefined) globalThis.localStorage = new MemoryLocalStorageMock();

const {
  VariableSnapshotStore,
  buildVariableSnapshotId,
  buildVariableSnapshotSignature,
  normalizeVariableSnapshotRecord,
} = await import('../../src/scripts/storage/variable-snapshot-store.js');

const withMockStorage = async fn => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = new MemoryLocalStorageMock();
  try { await fn(globalThis.localStorage); } finally {
    if (previous === undefined) delete globalThis.localStorage; else globalThis.localStorage = previous;
  }
};

test('normalize keeps only variables dict + metadata and stable-sorts', () => {
  const rec = normalizeVariableSnapshotRecord({
    sessionId: 's1', scope: 'SESSION',
    variables: { b: 2, a: { y: 1, x: 2 } },
    junk: 'dropped',
  });
  assert.equal(rec.version, 1);
  assert.equal(rec.scope, 'session');
  assert.equal(rec.sessionId, 's1');
  assert.equal(rec.junk, undefined);
  assert.deepEqual(Object.keys(rec.variables), ['a', 'b']);
  assert.deepEqual(Object.keys(rec.variables.a), ['x', 'y']);
});

test('content-addressed id: same variables → same id, different → different', () => {
  const a = buildVariableSnapshotId('s1', { variables: { hp: 10, name: 'x' } });
  const b = buildVariableSnapshotId('s1', { variables: { name: 'x', hp: 10 } }); // 顺序无关
  const c = buildVariableSnapshotId('s1', { variables: { hp: 11, name: 'x' } });
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.match(a, /^var_/);
  // 不同会话 → 不同 id
  assert.notEqual(a, buildVariableSnapshotId('s2', { variables: { hp: 10, name: 'x' } }));
});

test('persist + get round-trips variables', async () => {
  await withMockStorage(async () => {
    const store = new VariableSnapshotStore({ scopeId: 'persona:test' });
    const saved = await store.persistSnapshot('s1', { variables: { hp: 5, quest: { step: 2 } } });
    assert.match(saved.id, /^var_/);
    const got = await store.getSnapshot(saved.id);
    assert.deepEqual(got.variables, { hp: 5, quest: { step: 2 } });
    assert.equal(got.sessionId, 's1');
    const ids = await store.listSnapshotIds('s1');
    assert.deepEqual(ids, [saved.id]);
  });
});

test('markReachable + pruneUnreachable removes only stale unreachable snapshots', async () => {
  await withMockStorage(async () => {
    const store = new VariableSnapshotStore({ scopeId: 'persona:test' });
    const kept = await store.persistSnapshot('s1', { variables: { a: 1 } });
    const removed = await store.persistSnapshot('s1', { variables: { a: 2 } });
    assert.equal((await store.listSnapshotIds('s1')).length, 2);
    // 只保留 kept 可达；removed 标 unreachable
    await store.markReachable('s1', [kept.id]);
    // grace=0 → 立即回收 unreachable
    const prunedNow = await store.pruneUnreachable('s1', [kept.id], { graceMs: 0 });
    assert.deepEqual(prunedNow, [removed.id]);
    const ids = await store.listSnapshotIds('s1');
    assert.deepEqual(ids, [kept.id]);
    assert.equal(await store.getSnapshot(removed.id), null);
    assert.ok(await store.getSnapshot(kept.id));
  });
});

test('scope isolation: different scopeId sees different snapshots', async () => {
  await withMockStorage(async () => {
    const a = new VariableSnapshotStore({ scopeId: 'persona:A' });
    const b = new VariableSnapshotStore({ scopeId: 'persona:B' });
    const saved = await a.persistSnapshot('s1', { variables: { x: 1 } });
    assert.ok(await a.getSnapshot(saved.id));
    assert.equal(await b.getSnapshot(saved.id), null); // B scope 看不到 A 的快照
    assert.deepEqual(await b.listSnapshotIds('s1'), []);
  });
});

test('signature ignores id and capturedAt (pure content)', () => {
  const s1 = buildVariableSnapshotSignature({ sessionId: 's', variables: { a: 1 }, id: 'var_x', capturedAt: 111 });
  const s2 = buildVariableSnapshotSignature({ sessionId: 's', variables: { a: 1 }, id: 'var_y', capturedAt: 999 });
  assert.equal(s1, s2);
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok - ${t.name}`); }
  catch (err) { failed += 1; console.error(`not ok - ${t.name}`); console.error(err); }
}
if (failed > 0) process.exit(1);
