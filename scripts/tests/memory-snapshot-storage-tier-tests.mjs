import assert from 'node:assert/strict';

class MemoryLocalStorageMock {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
    this.setCalls = [];
    this.removeCalls = [];
  }

  get length() {
    return this.map.size;
  }

  key(index) {
    return Array.from(this.map.keys())[index] ?? null;
  }

  getItem(key) {
    return this.map.has(String(key)) ? this.map.get(String(key)) : null;
  }

  setItem(key, value) {
    this.setCalls.push([String(key), String(value)]);
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.removeCalls.push(String(key));
    this.map.delete(String(key));
  }
}

const previousGlobals = {
  localStorage: globalThis.localStorage,
  requestIdleCallback: globalThis.requestIdleCallback,
  tauri: globalThis.__TAURI__,
  tauriInvoke: globalThis.__TAURI_INVOKE__,
  tauriInternals: globalThis.__TAURI_INTERNALS__,
};

const installWeb = (storage = new MemoryLocalStorageMock()) => {
  globalThis.localStorage = storage;
  globalThis.requestIdleCallback = () => 0;
  delete globalThis.__TAURI__;
  delete globalThis.__TAURI_INVOKE__;
  delete globalThis.__TAURI_INTERNALS__;
  return storage;
};

const installTauri = (invoke, storage = new MemoryLocalStorageMock()) => {
  installWeb(storage);
  globalThis.__TAURI_INTERNALS__ = { invoke };
  return storage;
};

const makeSnapshot = (id, sessionId = 'session-a', content = '内容') => ({
  id,
  version: 1,
  sessionId,
  templateId: 'default-v1',
  scope: 'contact',
  capturedAt: 1,
  schemaVersion: 1,
  rows: [{
    id: `row-${id}`,
    template_id: 'default-v1',
    table_id: 'profile',
    contact_id: null,
    group_id: null,
    row_data: { content },
    is_active: true,
    is_pinned: false,
    priority: 0,
    sort_order: 0,
  }],
});

try {
  installWeb();
  const {
    MemorySnapshotStore,
    buildMemorySnapshotPayloadKey,
    migrateMemorySnapshotLocalPayloads,
  } = await import('../../src/scripts/storage/memory-snapshot-store.js');

  {
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    });
    const store = new MemorySnapshotStore({ scopeId: 'persona:test' });
    const saved = await store.persistSnapshot('session-a', makeSnapshot('', 'session-a', '新快照'));
    const payloadKey = buildMemorySnapshotPayloadKey('persona:test', saved.id);

    assert.equal(
      storage.setCalls.some(([key]) => key === payloadKey),
      false,
      'Tauri payload must not be duplicated into localStorage after a verified KV write',
    );
    assert.equal(storage.removeCalls.includes(payloadKey), true);
    assert.equal(
      calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === payloadKey),
      true,
    );
    console.log('ok - Tauri memory snapshot payloads live in KV without a localStorage duplicate');
  }

  {
    const storage = installTauri(async (cmd, args) => {
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv' && String(args.name).startsWith('memory_snapshot_payload_v1__')) {
        throw new Error('disk unavailable');
      }
      if (cmd === 'save_kv') return true;
      return null;
    });
    const store = new MemorySnapshotStore({ scopeId: 'persona:fallback' });
    const saved = await store.persistSnapshot('session-a', makeSnapshot('', 'session-a', '本地兜底'));
    const payloadKey = buildMemorySnapshotPayloadKey('persona:fallback', saved.id);

    assert.equal(storage.map.has(payloadKey), true, 'failed KV writes must retain a recoverable local payload');
    const refs = await store._loadRefs('session-a');
    assert.equal(refs.refs[saved.id]?.state, 'reachable', '本地兜底成功时 ref 仍应可达');
    console.log('ok - failed KV writes retain the memory snapshot local fallback');
  }

  {
    const storage = installTauri(async (cmd, args) => {
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv' && String(args.name).startsWith('memory_snapshot_payload_v1__')) {
        throw new Error('disk unavailable');
      }
      if (cmd === 'save_kv') return true;
      return null;
    });
    const store = new MemorySnapshotStore({ scopeId: 'persona:oversized' });
    const saved = await store.persistSnapshot(
      'session-a',
      makeSnapshot('', 'session-a', 'x'.repeat(241000)),
    );
    const payloadKey = buildMemorySnapshotPayloadKey('persona:oversized', saved.id);

    assert.equal(storage.map.has(payloadKey), false, '超大 payload 本地兜底被拒后不应留下部分副本');
    const refs = await store._loadRefs('session-a');
    assert.equal(
      refs.refs[saved.id]?.state,
      'unreachable',
      '超大 payload 的 KV 写失败必须把 ref 标记为 unreachable，不得谎报可达',
    );
    assert.equal(Number(refs.refs[saved.id]?.lastUnreachableAt || 0) > 0, true);
    console.log('ok - oversized payload KV write failure marks the snapshot ref unreachable');
  }

  {
    const snapshot = makeSnapshot('mem_local', 'session-a', '旧镜像');
    const payloadKey = buildMemorySnapshotPayloadKey('persona:migrate', snapshot.id);
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    }, new MemoryLocalStorageMock({ [payloadKey]: JSON.stringify(snapshot) }));
    const store = new MemorySnapshotStore({ scopeId: 'persona:migrate' });
    const loaded = await store.getSnapshot(snapshot.id);

    assert.equal(loaded?.rows?.[0]?.row_data?.content, '旧镜像');
    assert.equal(
      calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === payloadKey),
      true,
      'a verified missing KV payload should be backfilled from the local mirror',
    );
    assert.equal(storage.map.has(payloadKey), false, 'local mirror is removed only after KV backfill succeeds');
    console.log('ok - local memory snapshot payloads migrate to KV on read');
  }

  {
    const snapshot = makeSnapshot('mem_unreadable', 'session-a', '只读兜底');
    const payloadKey = buildMemorySnapshotPayloadKey('persona:unreadable', snapshot.id);
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') throw new Error('disk unreadable');
      if (cmd === 'save_kv') throw new Error('must not overwrite unreadable KV');
      return null;
    }, new MemoryLocalStorageMock({ [payloadKey]: JSON.stringify(snapshot) }));
    const store = new MemorySnapshotStore({ scopeId: 'persona:unreadable' });
    const loaded = await store.getSnapshot(snapshot.id);

    assert.equal(loaded?.rows?.[0]?.row_data?.content, '只读兜底');
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    assert.equal(storage.map.has(payloadKey), true);
    console.log('ok - unreadable KV keeps the memory snapshot mirror without backfilling');
  }

  {
    const scopeId = 'persona:bulk';
    const same = makeSnapshot('mem_same', 'session-a', '相同');
    const missing = makeSnapshot('mem_missing', 'session-a', '缺失');
    const conflict = makeSnapshot('mem_conflict', 'session-a', '本地版本');
    const sameKey = buildMemorySnapshotPayloadKey(scopeId, same.id);
    const missingKey = buildMemorySnapshotPayloadKey(scopeId, missing.id);
    const conflictKey = buildMemorySnapshotPayloadKey(scopeId, conflict.id);
    const storage = installTauri(async (cmd, args) => {
      if (cmd === 'load_kv' && args.name === sameKey) return same;
      if (cmd === 'load_kv' && args.name === missingKey) return {};
      if (cmd === 'load_kv' && args.name === conflictKey) {
        return makeSnapshot(conflict.id, 'session-a', 'KV 不同版本');
      }
      if (cmd === 'save_kv' && args.name === missingKey) return true;
      throw new Error(`unexpected ${cmd}:${args.name}`);
    }, new MemoryLocalStorageMock({
      [sameKey]: JSON.stringify(same),
      [missingKey]: JSON.stringify(missing),
      [conflictKey]: JSON.stringify(conflict),
    }));

    const result = await migrateMemorySnapshotLocalPayloads();

    assert.deepEqual(result, {
      scanned: 3,
      removed: 2,
      backfilled: 1,
      retained: 1,
    });
    assert.equal(storage.map.has(sameKey), false);
    assert.equal(storage.map.has(missingKey), false);
    assert.equal(storage.map.has(conflictKey), true, 'conflicting copies must remain for manual recovery');
    console.log('ok - bulk migration removes only verified or successfully backfilled payload mirrors');
  }

  {
    const storage = installWeb();
    const store = new MemorySnapshotStore({ scopeId: 'web' });
    const saved = await store.persistSnapshot('session-a', makeSnapshot('', 'session-a', '浏览器'));
    const payloadKey = buildMemorySnapshotPayloadKey('web', saved.id);
    assert.equal(storage.map.has(payloadKey), true);
    console.log('ok - browser-only memory snapshots retain localStorage availability');
  }
} finally {
  if (previousGlobals.localStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousGlobals.localStorage;
  if (previousGlobals.requestIdleCallback === undefined) delete globalThis.requestIdleCallback;
  else globalThis.requestIdleCallback = previousGlobals.requestIdleCallback;
  if (previousGlobals.tauri === undefined) delete globalThis.__TAURI__;
  else globalThis.__TAURI__ = previousGlobals.tauri;
  if (previousGlobals.tauriInvoke === undefined) delete globalThis.__TAURI_INVOKE__;
  else globalThis.__TAURI_INVOKE__ = previousGlobals.tauriInvoke;
  if (previousGlobals.tauriInternals === undefined) delete globalThis.__TAURI_INTERNALS__;
  else globalThis.__TAURI_INTERNALS__ = previousGlobals.tauriInternals;
}
