import assert from 'node:assert/strict';

const INDEX_KEY = 'worldinfo_index_v2';

const makeLocalStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
  const setCalls = [];
  const removeCalls = [];
  return {
    values,
    setCalls,
    removeCalls,
    getItem(key) {
      return values.has(String(key)) ? values.get(String(key)) : null;
    },
    setItem(key, value) {
      setCalls.push([String(key), String(value)]);
      values.set(String(key), String(value));
    },
    removeItem(key) {
      removeCalls.push(String(key));
      values.delete(String(key));
    },
  };
};

const previousGlobals = {
  localStorage: globalThis.localStorage,
  tauri: globalThis.__TAURI__,
  tauriInvoke: globalThis.__TAURI_INVOKE__,
  tauriInternals: globalThis.__TAURI_INTERNALS__,
};

const installTauri = (invoke, localStorage = makeLocalStorage()) => {
  globalThis.localStorage = localStorage;
  delete globalThis.__TAURI__;
  delete globalThis.__TAURI_INVOKE__;
  globalThis.__TAURI_INTERNALS__ = { invoke };
  return localStorage;
};

const installWeb = (localStorage = makeLocalStorage()) => {
  globalThis.localStorage = localStorage;
  delete globalThis.__TAURI__;
  delete globalThis.__TAURI_INVOKE__;
  delete globalThis.__TAURI_INTERNALS__;
  return localStorage;
};

try {
  installWeb();
  const { WorldInfoStore } = await import('../../src/scripts/storage/worldinfo.js');

  {
    const calls = [];
    const huge = {
      name: 'huge',
      entries: Array.from({ length: 3 }, (_, index) => ({ id: `entry-${index}`, content: `正文-${index}` })),
      updatedAt: 123,
    };
    installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        return {
          version: 2,
          legacyAggregateMigrated: true,
          worlds: {
            huge: { name: 'huge', entriesCount: 2784, updatedAt: 123, refs: [] },
          },
        };
      }
      if (cmd === 'list_world_info_files') return ['huge'];
      if (cmd === 'get_world_info') return huge;
      if (cmd === 'save_kv') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;

    assert.deepEqual(store.list(), ['huge']);
    assert.equal(store.load('huge'), null, 'index hydration must not load the large body');
    assert.equal(store.getMetadata('huge')?.entriesCount, 2784);
    assert.equal(
      calls.some(([cmd, args]) => cmd === 'load_kv' && args.name === 'worldinfo_store'),
      false,
      'an existing v2 index must bypass the legacy aggregate',
    );
    assert.equal(
      calls.some(([cmd]) => cmd === 'delete_worldinfo_legacy_store'),
      true,
      'a verified v2 index and sidecar directory may remove the obsolete aggregate without loading it',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'get_world_info'), false);

    const first = await store.ensureLoaded('huge');
    const second = await store.ensureLoaded('huge');
    assert.equal(first?.entries?.length, 3);
    assert.equal(second, first);
    assert.equal(calls.filter(([cmd]) => cmd === 'get_world_info').length, 1);
    console.log('ok - indexed startup keeps large world bodies lazy and loads each body once');
  }

  {
    const calls = [];
    installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        return {
          version: 2,
          legacyAggregateMigrated: true,
          worlds: {
            recoverable: { name: 'recoverable', entriesCount: 1, refs: [] },
            healthy: { name: 'healthy', entriesCount: 0, refs: [] },
          },
        };
      }
      if (cmd === 'load_kv' && args.name === 'worldinfo_store') {
        return { _tooLarge: true, size: 40 * 1024 * 1024 };
      }
      if (cmd === 'list_world_info_files') return ['healthy'];
      if (cmd === 'save_kv') return true;
      if (cmd === 'delete_worldinfo_legacy_store') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;
    assert.equal(store.persistenceBlocked, true);
    assert.deepEqual(store.list().sort(), ['healthy', 'recoverable']);
    assert.equal(
      calls.some(([cmd]) => cmd === 'delete_worldinfo_legacy_store'),
      false,
      'legacy recovery data must remain when an indexed sidecar is missing',
    );
    console.log('ok - legacy aggregate cleanup fails closed when indexed sidecars are missing');
  }

  {
    const calls = [];
    installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        return {
          version: 2,
          legacyAggregateMigrated: true,
          worlds: { live: { name: 'live', entriesCount: 1, refs: [] } },
        };
      }
      if (cmd === 'list_world_info_files') return ['live'];
      if (cmd === 'get_world_info') return {};
      if (cmd === 'world_info_exists') throw new TypeError('Failed to fetch');
      if (cmd === 'save_kv') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;
    calls.length = 0;
    assert.equal(await store.ensureLoaded('live'), null);
    assert.equal(store.has('live'), true, 'an inconclusive existence probe must retain indexed metadata');
    assert.deepEqual(store.list(), ['live']);
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false, 'transient IPC failure must not rewrite the index');
    console.log('ok - transient sidecar existence failures do not remove live worldbooks from the index');
  }

  {
    const calls = [];
    installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        return {
          version: 2,
          legacyAggregateMigrated: true,
          worlds: { countable: { name: 'countable', entriesCount: null, refs: [] } },
        };
      }
      if (cmd === 'list_world_info_files') return ['countable'];
      if (cmd === 'get_world_info') return { name: 'countable', entries: [{ id: 'a' }, { id: 'b' }] };
      if (cmd === 'save_kv') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;
    calls.length = 0;
    await store.ensureLoaded('countable');
    assert.equal(store.getMetadata('countable')?.entriesCount, 2);
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false, 'entry-count-only hydration stays in memory');
    console.log('ok - first body load does not rewrite the index only to backfill entry count');
  }

  {
    const calls = [];
    let releaseFirst;
    let markSecondStarted;
    const firstGate = new Promise(resolve => { releaseFirst = resolve; });
    const secondStarted = new Promise(resolve => { markSecondStarted = resolve; });
    installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        return {
          version: 2,
          legacyAggregateMigrated: true,
          worlds: {
            first: { name: 'first', entriesCount: 0, refs: [] },
            second: { name: 'second', entriesCount: 0, refs: [] },
          },
        };
      }
      if (cmd === 'list_world_info_files') return ['first', 'second'];
      if (cmd === 'get_world_info' && args.characterId === 'first') {
        await firstGate;
        return { name: 'first', entries: [] };
      }
      if (cmd === 'get_world_info' && args.characterId === 'second') {
        markSecondStarted();
        return { name: 'second', entries: [] };
      }
      if (cmd === 'save_kv') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;
    const loading = store.ensureLoadedMany(['first', 'second'], { includeRefs: false });
    await Promise.race([
      secondStarted,
      new Promise((_, reject) => setTimeout(() => reject(new Error('second sibling did not start in parallel')), 120)),
    ]);
    releaseFirst();
    const loaded = await loading;
    assert.deepEqual(loaded.map(item => item.name), ['first', 'second']);
    console.log('ok - ensureLoadedMany loads each breadth-first layer in parallel');
  }

  {
    const calls = [];
    installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        return {
          version: 2,
          legacyAggregateMigrated: true,
          worlds: { kept: { name: 'kept', entriesCount: 1, refs: [] } },
        };
      }
      if (cmd === 'list_world_info_files') return ['kept'];
      if (cmd === 'get_world_info') return { name: 'kept', entries: [{ id: 'old' }] };
      if (cmd === 'save_world_info' || cmd === 'save_kv') return true;
      if (cmd === 'delete_world_info') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;
    await store.save('added', { name: 'added', entries: [{ id: 'new' }], refs: [{ sourceId: 'kept' }] });

    const nativeSaveAt = calls.findIndex(([cmd]) => cmd === 'save_world_info');
    const indexSaveAt = calls.findIndex(([cmd, args]) => cmd === 'save_kv' && args.name === INDEX_KEY);
    assert.ok(nativeSaveAt >= 0 && indexSaveAt > nativeSaveAt, 'body must be durable before its index entry');
    assert.equal(
      calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === 'worldinfo_store'),
      false,
      'saving one world must not rewrite the aggregate',
    );
    assert.equal(store.getMetadata('added')?.entriesCount, 1);
    assert.deepEqual(store.getMetadata('added')?.refs, ['kept']);

    calls.length = 0;
    await store.remove('added');
    assert.equal(calls[0][0], 'delete_world_info');
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === INDEX_KEY), true);
    assert.equal(store.has('added'), false);
    console.log('ok - per-book saves and deletes update only the sidecar plus lightweight index');
  }

  {
    const calls = [];
    const nativeBodies = new Map([
      ['native-only', { name: 'native-only', entries: [] }],
    ]);
    const storage = installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        return {
          version: 2,
          worlds: { 'native-only': { name: 'native-only', entriesCount: 0, refs: [] } },
        };
      }
      if (cmd === 'load_kv' && args.name === 'worldinfo_store') {
        return {
          legacy: { name: 'legacy', entries: [{ id: 'entry-1' }], updatedAt: 77 },
        };
      }
      if (cmd === 'list_world_info_files') return Array.from(nativeBodies.keys());
      if (cmd === 'save_world_info') {
        nativeBodies.set(args.characterId, args.data);
        return true;
      }
      if (cmd === 'get_world_info') return nativeBodies.get(args.characterId) || {};
      if (cmd === 'save_kv') return true;
      if (cmd === 'delete_worldinfo_legacy_store') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;

    assert.deepEqual(store.list().sort(), ['legacy', 'native-only']);
    assert.equal(nativeBodies.get('legacy')?.entries?.length, 1, 'legacy body is migrated to a sidecar first');
    assert.equal(store.load('legacy'), null, 'migration must release the aggregate body after indexing');
    assert.equal(store.getMetadata('legacy')?.entriesCount, 1);
    assert.equal(store.getMetadata('native-only')?.entriesCount, 0);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === INDEX_KEY), true);
    const savedIndex = calls.findLast(([cmd, args]) => cmd === 'save_kv' && args.name === INDEX_KEY)?.[1]?.data;
    assert.equal(savedIndex?.legacyAggregateMigrated, true);
    assert.equal(calls.some(([cmd]) => cmd === 'delete_worldinfo_legacy_store'), true);
    assert.equal(storage.removeCalls.includes('worldinfo_store'), true);
    console.log('ok - one-time migration creates missing sidecars and a metadata-only index');
  }

  {
    const calls = [];
    installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) return {};
      if (cmd === 'load_kv' && args.name === 'worldinfo_store') {
        return { _tooLarge: true, size: 40 * 1024 * 1024 };
      }
      if (cmd === 'list_world_info_files') return ['oversize'];
      if (cmd === 'save_kv') return true;
      if (cmd === 'save_world_info') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;

    assert.equal(store.persistenceBlocked, false, 'native sidecars are authoritative even when legacy KV is oversized');
    assert.deepEqual(store.list(), ['oversize']);
    assert.equal(store.getMetadata('oversize')?.entriesCount, null);
    await store.save('new-book', { name: 'new-book', entries: [] });
    assert.equal(calls.some(([cmd]) => cmd === 'save_world_info'), true);
    console.log('ok - an oversized legacy aggregate no longer blocks indexed sidecar writes');
  }

  {
    const calls = [];
    let indexAttempts = 0;
    const storage = installTauri(async (cmd, args = {}) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        indexAttempts += 1;
        throw new TypeError('Failed to fetch');
      }
      if (cmd === 'list_world_info_files') throw new TypeError('Failed to fetch');
      throw new Error('writes must remain blocked');
    }, makeLocalStorage({
      [INDEX_KEY]: JSON.stringify({
        version: 2,
        worlds: { indexed: { name: 'indexed', entriesCount: 4, refs: [] } },
      }),
    }));

    const store = new WorldInfoStore();
    await store.ready;

    assert.equal(indexAttempts, 3);
    assert.equal(store.persistenceBlocked, true);
    assert.deepEqual(store.list(), ['indexed']);
    assert.equal(storage.setCalls.some(([key]) => key === INDEX_KEY), false);
    await assert.rejects(
      store.save('new-book', { name: 'new-book', entries: [] }),
      error => error?.code === 'worldinfo_store_read_unavailable',
    );
    console.log('ok - worldinfo stays read-only only when neither index nor sidecar directory is readable');
  }

  {
    const pending = {
      name: 'pending',
      entries: Array.from({ length: 5 }, (_, index) => ({ id: `entry-${index}`, content: `正文-${index}` })),
      updatedAt: 456,
    };
    installTauri(async (cmd, args = {}) => {
      if (cmd === 'load_kv' && args.name === INDEX_KEY) {
        return {
          version: 2,
          legacyAggregateMigrated: true,
          worlds: {
            pending: { name: 'pending', entriesCount: null, updatedAt: 456, refs: [] },
          },
        };
      }
      if (cmd === 'list_world_info_files') return ['pending'];
      if (cmd === 'get_world_info') return pending;
      if (cmd === 'save_kv') return true;
      if (cmd === 'delete_worldinfo_legacy_store') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;
    assert.equal(store.getMetadata('pending')?.entriesCount, null);

    const backfills = [];
    store.onEntriesCountBackfill = (id, metadata) => backfills.push([id, metadata?.entriesCount]);
    await store.ensureLoaded('pending');
    assert.deepEqual(backfills, [['pending', 5]]);

    await store.ensureLoaded('pending');
    assert.deepEqual(backfills, [['pending', 5]], 'cached reload must not re-notify');
    console.log('ok - lazy entriesCount backfill notifies the UI hook exactly once');
  }

  {
    const storage = installWeb();
    const store = new WorldInfoStore();
    await store.ready;

    assert.equal(store.persistenceBlocked, false);
    await store.save('web-only', { name: 'web-only', entries: [] });
    assert.equal(
      JSON.parse(storage.values.get('worldinfo_store'))['web-only'].name,
      'web-only',
    );
    console.log('ok - browser-only worldinfo keeps its localStorage aggregate fallback writable');
  }
} finally {
  if (previousGlobals.localStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousGlobals.localStorage;
  if (previousGlobals.tauri === undefined) delete globalThis.__TAURI__;
  else globalThis.__TAURI__ = previousGlobals.tauri;
  if (previousGlobals.tauriInvoke === undefined) delete globalThis.__TAURI_INVOKE__;
  else globalThis.__TAURI_INVOKE__ = previousGlobals.tauriInvoke;
  if (previousGlobals.tauriInternals === undefined) delete globalThis.__TAURI_INTERNALS__;
  else globalThis.__TAURI_INTERNALS__ = previousGlobals.tauriInternals;
}
