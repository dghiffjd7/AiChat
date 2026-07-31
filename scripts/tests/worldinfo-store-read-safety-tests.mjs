import assert from 'node:assert/strict';

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
    let loadAttempts = 0;
    const existing = {
      kept: { name: 'kept', entries: [{ id: 'entry-1', content: '保留' }] },
    };
    installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') {
        loadAttempts += 1;
        if (loadAttempts === 1) throw new TypeError('Failed to fetch');
        return existing;
      }
      if (cmd === 'save_kv') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;

    assert.equal(loadAttempts, 2);
    assert.equal(store.load('kept')?.entries?.[0]?.content, '保留');
    assert.equal(store.persistenceBlocked, false);

    await store.save('added', { name: 'added', entries: [] });
    const saves = calls.filter(([cmd]) => cmd === 'save_kv');
    assert.equal(saves.length, 1);
    assert.deepEqual(Object.keys(saves[0][1].data).sort(), ['added', 'kept']);
    console.log('ok - worldinfo retries a transient KV read before allowing a full-cache write');
  }

  {
    const calls = [];
    let loadAttempts = 0;
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') {
        loadAttempts += 1;
        throw new TypeError('Failed to fetch');
      }
      if (cmd === 'save_kv') throw new Error('save_kv must remain blocked');
      return null;
    }, makeLocalStorage({
      worldinfo_store_index_v1: JSON.stringify(['indexed-book']),
    }));

    const store = new WorldInfoStore();
    await store.ready;

    assert.equal(loadAttempts, 3);
    assert.equal(store.persistenceBlocked, true);
    assert.deepEqual(store.list(), ['indexed-book']);
    assert.equal(
      storage.setCalls.some(([key]) => key === 'worldinfo_store_index_v1'),
      false,
      'an uncertain load must not replace the existing index with an empty cache',
    );

    for (const write of [
      () => store.save('new-book', { name: 'new-book', entries: [] }),
      () => store.remove('indexed-book'),
      () => store.saveMany({ other: { name: 'other', entries: [] } }),
    ]) {
      await assert.rejects(write, error => error?.code === 'worldinfo_store_read_unavailable');
    }
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    console.log('ok - worldinfo stays read-only when every startup KV read fails');
  }

  {
    const calls = [];
    const localBook = { local: { name: 'local', entries: [{ id: 'entry-1' }] } };
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') throw new TypeError('Failed to fetch');
      if (cmd === 'save_kv') throw new Error('save_kv must remain blocked');
      return null;
    }, makeLocalStorage({
      worldinfo_store: JSON.stringify(localBook),
      worldinfo_store_index_v1: JSON.stringify(['local']),
    }));

    const store = new WorldInfoStore();
    await store.ready;

    assert.equal(store.load('local')?.name, 'local', 'local mirror remains readable');
    assert.equal(store.persistenceBlocked, true, 'an unverified mirror must not become writable');
    assert.equal(
      storage.setCalls.some(([key]) => key === 'worldinfo_store_index_v1'),
      false,
      'reading an unverified mirror must not rewrite the index',
    );
    await assert.rejects(
      store.save('new-book', { name: 'new-book', entries: [] }),
      error => error?.code === 'worldinfo_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    console.log('ok - worldinfo can read a local fallback without letting it overwrite unreadable KV');
  }

  {
    const calls = [];
    installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return { _tooLarge: true, size: 12 * 1024 * 1024 };
      if (cmd === 'save_kv') throw new Error('save_kv must remain blocked');
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;

    assert.equal(store.persistenceBlocked, true);
    await assert.rejects(
      store.save('new-book', { name: 'new-book', entries: [] }),
      error => error?.code === 'worldinfo_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    console.log('ok - worldinfo refuses full-cache writes after a too-large KV response');
  }

  {
    const calls = [];
    installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    });

    const store = new WorldInfoStore();
    await store.ready;

    assert.equal(store.persistenceBlocked, false);
    await store.save('first', { name: 'first', entries: [] });
    assert.equal(calls.filter(([cmd]) => cmd === 'save_kv').length, 1);
    console.log('ok - a successful empty KV read remains a writable empty worldinfo store');
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
    console.log('ok - browser-only worldinfo keeps its localStorage fallback writable');
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
