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

const archiveState = (id, name = id) => ({
  version: 1,
  currentArchiveId: id,
  archives: [{
    version: 1,
    id,
    name,
    personaId: 'persona',
    personaName: '角色',
    createdAt: 10,
    sessionArchives: [],
    memoryOnlySnapshots: [],
    globalMemorySnapshot: null,
    momentsSnapshot: null,
    momentSummarySnapshot: null,
    stats: {},
  }],
});

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

try {
  installWeb();
  const {
    PersonaArchiveStore,
    migratePersonaArchiveLocalMirrors,
  } = await import('../../src/scripts/storage/persona-archive-store.js');

  {
    const key = 'persona_archive_store_v1__verified';
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return { ...archiveState('disk'), updatedAt: 10 };
      return true;
    }, new MemoryLocalStorageMock({
      [key]: JSON.stringify({ ...archiveState('stale'), updatedAt: 5 }),
    }));
    const store = new PersonaArchiveStore({ scopeId: 'verified' });
    await store.ready;

    assert.deepEqual(store.listArchives().map(item => item.id), ['disk']);
    assert.equal(storage.map.has(key), false);
    console.log('ok - verified persona archives hydrate from KV and remove the full local mirror');
  }

  {
    const key = 'persona_archive_store_v1__backfill';
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(archiveState('local')) }));
    const store = new PersonaArchiveStore({ scopeId: 'backfill' });
    await store.ready;

    assert.deepEqual(store.listArchives().map(item => item.id), ['local']);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === key), true);
    assert.equal(storage.map.has(key), false);
    console.log('ok - missing persona archive KV state is backfilled before its local mirror is removed');
  }

  {
    const key = 'persona_archive_store_v1__persist';
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    });
    const store = new PersonaArchiveStore({ scopeId: 'persist' });
    await store.ready;
    store.addArchive({ id: 'new', name: '新存档' });
    await flushMicrotasks();

    assert.equal(storage.map.has(key), false);
    console.log('ok - Tauri persona archive writes stay KV-only');
  }

  {
    const key = 'persona_archive_store_v1__fallback';
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') throw new Error('disk unavailable');
      return null;
    });
    const store = new PersonaArchiveStore({ scopeId: 'fallback' });
    await store.ready;
    store.addArchive({ id: 'fallback', name: '兜底' });
    await flushMicrotasks();

    assert.deepEqual(JSON.parse(storage.map.get(key)).archives.map(item => item.id), ['fallback']);
    console.log('ok - failed persona archive KV writes retain a local fallback');
  }

  {
    const key = 'persona_archive_store_v1__transient_read';
    let loadAttempts = 0;
    const calls = [];
    installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') {
        loadAttempts += 1;
        if (loadAttempts === 1) throw new TypeError('Failed to fetch');
        return archiveState('disk');
      }
      if (cmd === 'save_kv') return true;
      return null;
    });
    const store = new PersonaArchiveStore({ scopeId: 'transient_read' });
    await store.ready;

    assert.equal(loadAttempts, 2);
    assert.deepEqual(store.listArchives().map(item => item.id), ['disk']);
    assert.equal(store.persistenceBlocked, false);
    store.addArchive({ id: 'next', name: '下一份' });
    await flushMicrotasks();
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), true);
    console.log('ok - persona archive hydrate retries a transient KV read before enabling writes');
  }

  {
    const key = 'persona_archive_store_v1__unreadable';
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') throw new TypeError('Failed to fetch');
      if (cmd === 'save_kv') throw new Error('save_kv must remain blocked');
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(archiveState('local')) }));
    const store = new PersonaArchiveStore({ scopeId: 'unreadable' });
    await store.ready;

    assert.deepEqual(store.listArchives().map(item => item.id), ['local']);
    assert.equal(store.persistenceBlocked, true);
    assert.throws(
      () => store.addArchive({ id: 'new', name: '不可覆盖' }),
      error => error?.code === 'persona_archive_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    assert.equal(storage.map.has(key), true, 'unverified persona archive recovery must be retained');
    console.log('ok - unreadable persona archive KV keeps the store read-only');
  }

  {
    const key = 'persona_archive_store_v1__equal_time_conflict';
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return archiveState('disk');
      if (cmd === 'save_kv') throw new Error('ambiguous tie must remain blocked');
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(archiveState('local')) }));
    const store = new PersonaArchiveStore({ scopeId: 'equal_time_conflict' });
    await store.ready;

    assert.deepEqual(store.listArchives().map(item => item.id), ['local']);
    assert.equal(store.persistenceBlocked, true);
    assert.equal(storage.map.has(key), true);
    assert.throws(
      () => store.deleteArchive('local'),
      error => error?.code === 'persona_archive_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    console.log('ok - equal-time divergent persona archives retain local recovery instead of silently preferring KV');
  }

  {
    const sameKey = 'persona_archive_store_v1__same';
    const missingKey = 'persona_archive_store_v1__missing';
    const conflictKey = 'persona_archive_store_v1__conflict';
    const storage = installTauri(async (cmd, args) => {
      if (cmd === 'load_kv' && args.name === sameKey) return archiveState('same');
      if (cmd === 'load_kv' && args.name === missingKey) return {};
      if (cmd === 'load_kv' && args.name === conflictKey) return archiveState('disk-conflict');
      if (cmd === 'save_kv' && args.name === missingKey) return true;
      throw new Error(`unexpected ${cmd}:${args.name}`);
    }, new MemoryLocalStorageMock({
      [sameKey]: JSON.stringify(archiveState('same')),
      [missingKey]: JSON.stringify(archiveState('missing')),
      [conflictKey]: JSON.stringify(archiveState('local-conflict')),
    }));

    const result = await migratePersonaArchiveLocalMirrors();

    assert.deepEqual(result, {
      scanned: 3,
      removed: 2,
      backfilled: 1,
      retained: 1,
    });
    assert.equal(storage.map.has(sameKey), false);
    assert.equal(storage.map.has(missingKey), false);
    assert.equal(storage.map.has(conflictKey), true);
    console.log('ok - bulk persona archive migration retains conflicts and removes verified mirrors');
  }

  {
    const key = 'persona_archive_store_v1__web';
    const storage = installWeb();
    const store = new PersonaArchiveStore({ scopeId: 'web' });
    await store.ready;
    store.addArchive({ id: 'web', name: '浏览器存档' });

    assert.deepEqual(JSON.parse(storage.map.get(key)).archives.map(item => item.id), ['web']);
    console.log('ok - browser-only persona archives retain localStorage availability');
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
