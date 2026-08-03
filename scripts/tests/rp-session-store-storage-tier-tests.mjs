import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

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

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));
const largeGreeting = {
  id: 'large',
  title: '大开场',
  content: 'x'.repeat(170_000),
};
const rpState = (id = '', content = '', { updatedAt = 0 } = {}) => ({
  greetings: id ? [{ id, title: '', content }] : [],
  activeGreetingId: id,
  syncEvents: [],
  updatedAt,
});

try {
  installWeb();
  const {
    RpSessionStore,
    migrateRpSessionLocalMirrors,
  } = await import('../../src/scripts/storage/rp-session-store.js');

  {
    const key = 'rp_session_v1__persona_large';
    const diskState = {
      greetings: [largeGreeting],
      activeGreetingId: 'large',
      syncEvents: [],
      updatedAt: 10,
    };
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return diskState;
      return true;
    }, new MemoryLocalStorageMock({
      [key]: JSON.stringify({
        greetings: [{ id: 'stale', content: '旧' }],
        updatedAt: 5,
      }),
    }));

    const store = new RpSessionStore({ scopeId: 'persona:large' });
    await store.ready;

    assert.equal(store.getGreetings()[0]?.content.length, 170_000);
    assert.equal(storage.map.has(key), false, 'verified oversized KV state must remove its stale local mirror');
    console.log('ok - RP hydrate removes an oversized local mirror after a verified KV read');
  }

  {
    const key = 'rp_session_v1__persona_small';
    const diskState = {
      greetings: [{ id: 'small', title: '', content: '小开场' }],
      activeGreetingId: 'small',
      syncEvents: [],
    };
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return diskState;
      return true;
    });

    const store = new RpSessionStore({ scopeId: 'persona:small' });
    await store.ready;

    assert.equal(store.getGreetings()[0]?.content, '小开场');
    assert.equal(storage.map.has(key), false);
    console.log('ok - verified RP state remains KV-only in Tauri');
  }

  {
    const key = 'rp_session_v1__persona_backfill';
    const localState = {
      greetings: [{ id: 'local', title: '', content: '本地开场' }],
      activeGreetingId: 'local',
      syncEvents: [],
      updatedAt: 20,
    };
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(localState) }));
    const store = new RpSessionStore({ scopeId: 'persona:backfill' });
    await store.ready;

    assert.equal(store.getGreetings()[0]?.content, '本地开场');
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === key), true);
    assert.equal(storage.map.has(key), false);
    console.log('ok - missing RP KV state is backfilled before its local mirror is removed');
  }

  {
    const key = 'rp_session_v1__persona_persist';
    let resolveSave;
    const saveFinished = new Promise(resolve => { resolveSave = resolve; });
    let saveStarted = false;
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') {
        saveStarted = true;
        await saveFinished;
        return true;
      }
      return null;
    });
    const store = new RpSessionStore({ scopeId: 'persona:persist' });
    await store.ready;
    storage.removeCalls = [];

    store.setGreetings([largeGreeting], { activeId: 'large' });
    await flushMicrotasks();
    assert.equal(saveStarted, true);
    assert.equal(storage.removeCalls.includes(key), false, 'local state cannot be removed before KV confirms the write');

    resolveSave();
    await flushMicrotasks();
    assert.equal(storage.map.has(key), false);
    console.log('ok - RP persist removes oversized local state only after KV write success');
  }

  {
    const key = 'rp_session_v1__persona_fallback';
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') throw new Error('disk unavailable');
      return null;
    });
    const store = new RpSessionStore({ scopeId: 'persona:fallback' });
    await store.ready;

    store.setGreetings([largeGreeting], { activeId: 'large' });
    await flushMicrotasks();

    assert.equal(storage.map.has(key), true, 'failed KV writes retain the current RP state locally');
    assert.equal(JSON.parse(storage.map.get(key)).greetings[0].content.length, 170_000);
    console.log('ok - failed RP KV writes retain a recoverable local fallback');
  }

  {
    const key = 'rp_session_v1__persona_transient_read';
    let loadAttempts = 0;
    const calls = [];
    const diskState = {
      greetings: [{ id: 'disk', title: '', content: '磁盘开场' }],
      activeGreetingId: 'disk',
      syncEvents: [],
      updatedAt: 20,
    };
    installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') {
        loadAttempts += 1;
        if (loadAttempts === 1) throw new TypeError('Failed to fetch');
        return diskState;
      }
      if (cmd === 'save_kv') return true;
      return null;
    });
    const store = new RpSessionStore({ scopeId: 'persona:transient_read' });
    await store.ready;

    assert.equal(loadAttempts, 2);
    assert.equal(store.getGreetings()[0]?.content, '磁盘开场');
    assert.equal(store.persistenceBlocked, false);
    store.setGreetings([{ id: 'next', content: '下一段' }], { activeId: 'next' });
    await flushMicrotasks();
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), true);
    console.log('ok - RP hydrate retries a transient KV read before enabling writes');
  }

  {
    const key = 'rp_session_v1__persona_unreadable';
    const calls = [];
    const localState = {
      greetings: [{ id: 'local', title: '', content: '本地仍可读取' }],
      activeGreetingId: 'local',
      syncEvents: [],
      updatedAt: 20,
    };
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') throw new TypeError('Failed to fetch');
      if (cmd === 'save_kv') throw new Error('save_kv must remain blocked');
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(localState) }));
    const store = new RpSessionStore({ scopeId: 'persona:unreadable' });
    await store.ready;

    assert.equal(store.getGreetings()[0]?.content, '本地仍可读取');
    assert.equal(store.persistenceBlocked, true);
    assert.throws(
      () => store.setGreetings([{ id: 'new', content: '不可覆盖' }], { activeId: 'new' }),
      error => error?.code === 'rp_session_store_read_unavailable',
    );
    await assert.rejects(
      () => store.flush(),
      error => error?.code === 'rp_session_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    assert.equal(storage.map.has(key), true, 'unverified local recovery must be retained');
    console.log('ok - unreadable RP KV keeps the store read-only and preserves local recovery');
  }

  {
    const key = 'rp_session_v1__persona_equal_time_conflict';
    const backupKey = `${key}__legacy_tie_backup_v1`;
    const localState = rpState('local', '本地增量');
    const kvState = rpState('disk', '磁盘旧值');
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === key) return kvState;
      if (cmd === 'save_kv') return true;
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(localState) }));
    const store = new RpSessionStore({ scopeId: 'persona:equal_time_conflict' });
    await store.ready;

    assert.equal(store.getGreetings()[0]?.content, '本地增量');
    assert.equal(store.persistenceBlocked, false);
    assert.equal(storage.map.has(key), false);
    const backupCall = calls.find(([cmd, args]) => cmd === 'save_kv' && args.name === backupKey);
    assert.equal(backupCall?.[1]?.data?.local?.greetings?.[0]?.content, '本地增量');
    assert.equal(backupCall?.[1]?.data?.kv?.greetings?.[0]?.content, '磁盘旧值');
    assert.equal(Number.isFinite(backupCall?.[1]?.data?.resolvedAt), true);
    assert.equal(
      calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === key && args.data?.greetings?.[0]?.content === '本地增量'),
      true,
    );
    assert.equal(store.setActiveGreeting('local'), 'local');
    await flushMicrotasks();
    console.log('ok - legacy equal-time divergent RP states back up both sides and adopt local recovery');
  }

  {
    const key = 'rp_session_v1__persona_modern_equal_time_conflict';
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return rpState('disk', '磁盘现代值', { updatedAt: 20 });
      if (cmd === 'save_kv') throw new Error('modern tie must remain blocked');
      return null;
    }, new MemoryLocalStorageMock({
      [key]: JSON.stringify(rpState('local', '本地现代值', { updatedAt: 20 })),
    }));
    const store = new RpSessionStore({ scopeId: 'persona:modern_equal_time_conflict' });
    await store.ready;

    assert.equal(store.getGreetings()[0]?.content, '本地现代值');
    assert.equal(store.persistenceBlocked, true);
    assert.equal(storage.map.has(key), true);
    assert.throws(
      () => store.setActiveGreeting('local'),
      error => error?.code === 'rp_session_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    console.log('ok - modern equal-time divergent RP states remain read-only');
  }

  {
    const key = 'rp_session_v1__persona_legacy_empty_local';
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return rpState('disk', '磁盘有内容');
      if (cmd === 'save_kv') throw new Error('KV adoption must not write');
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(rpState()) }));
    const store = new RpSessionStore({ scopeId: 'persona:legacy_empty_local' });
    await store.ready;

    assert.equal(store.getGreetings()[0]?.content, '磁盘有内容');
    assert.equal(store.persistenceBlocked, false);
    assert.equal(storage.map.has(key), false);
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    console.log('ok - legacy RP tie adopts non-empty KV when the local mirror is empty');
  }

  {
    const key = 'rp_session_v1__persona_legacy_empty_kv';
    const backupKey = `${key}__legacy_tie_backup_v1`;
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return rpState();
      if (cmd === 'save_kv' && args.name === key) return true;
      throw new Error(`unexpected ${cmd}:${args.name}`);
    }, new MemoryLocalStorageMock({
      [key]: JSON.stringify(rpState('local', '本地有内容')),
    }));
    const store = new RpSessionStore({ scopeId: 'persona:legacy_empty_kv' });
    await store.ready;

    assert.equal(store.getGreetings()[0]?.content, '本地有内容');
    assert.equal(store.persistenceBlocked, false);
    assert.equal(storage.map.has(key), false);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === key), true);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === backupKey), false);
    console.log('ok - legacy RP tie backfills non-empty local state over an empty shaped KV state');
  }

  {
    const key = 'rp_session_v1__persona_legacy_backup_failure';
    const backupKey = `${key}__legacy_tie_backup_v1`;
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return rpState('disk', '磁盘值');
      if (cmd === 'save_kv' && args.name === backupKey) throw new Error('backup unavailable');
      if (cmd === 'save_kv' && args.name === key) throw new Error('main write must not run');
      return null;
    }, new MemoryLocalStorageMock({
      [key]: JSON.stringify(rpState('local', '本地值')),
    }));
    const store = new RpSessionStore({ scopeId: 'persona:legacy_backup_failure' });
    await store.ready;

    assert.equal(store.persistenceBlocked, true);
    assert.equal(storage.map.has(key), true);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === backupKey), true);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === key), false);
    console.log('ok - failed RP legacy tie backup keeps the store blocked and mirror intact');
  }

  {
    const key = 'rp_session_v1__persona_legacy_main_write_failure';
    const backupKey = `${key}__legacy_tie_backup_v1`;
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return rpState('disk', '磁盘值');
      if (cmd === 'save_kv' && args.name === backupKey) return true;
      if (cmd === 'save_kv' && args.name === key) throw new Error('main unavailable');
      return null;
    }, new MemoryLocalStorageMock({
      [key]: JSON.stringify(rpState('local', '本地值')),
    }));
    const store = new RpSessionStore({ scopeId: 'persona:legacy_main_write_failure' });
    await store.ready;

    assert.equal(store.persistenceBlocked, true);
    assert.equal(storage.map.has(key), true);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === backupKey), true);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === key), true);
    console.log('ok - failed RP legacy tie main write keeps the store blocked after a successful backup');
  }

  {
    const legacyKey = 'rp_session_v1__legacy_conflict';
    const modernKey = 'rp_session_v1__modern_conflict';
    const legacyBackupKey = `${legacyKey}__legacy_tie_backup_v1`;
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === legacyKey) return rpState('disk', '磁盘旧值');
      if (cmd === 'load_kv' && args.name === modernKey) return rpState('disk-modern', '磁盘现代值', { updatedAt: 10 });
      if (cmd === 'save_kv' && (args.name === legacyBackupKey || args.name === legacyKey)) return true;
      throw new Error(`unexpected ${cmd}:${args.name}`);
    }, new MemoryLocalStorageMock({
      [legacyKey]: JSON.stringify(rpState('local', '本地旧值')),
      [modernKey]: JSON.stringify(rpState('local-modern', '本地现代值', { updatedAt: 10 })),
    }));

    const result = await migrateRpSessionLocalMirrors();

    assert.deepEqual(result, {
      scanned: 2,
      removed: 1,
      backfilled: 0,
      retained: 1,
    });
    assert.equal(storage.map.has(legacyKey), false);
    assert.equal(storage.map.has(modernKey), true);
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === legacyBackupKey), true);
    assert.equal(
      calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === legacyKey && args.data?.greetings?.[0]?.content === '本地旧值'),
      true,
    );
    console.log('ok - bulk RP migration resolves legacy ties and retains modern conflicts');
  }

  {
    const sameKey = 'rp_session_v1__same';
    const missingKey = 'rp_session_v1__missing';
    const conflictKey = 'rp_session_v1__conflict';
    const same = {
      greetings: [{ id: 'same', title: '', content: '相同' }],
      activeGreetingId: 'same',
      syncEvents: [],
      updatedAt: 10,
    };
    const missing = {
      greetings: [{ id: 'missing', title: '', content: '缺失' }],
      activeGreetingId: 'missing',
      syncEvents: [],
      updatedAt: 10,
    };
    const conflict = {
      greetings: [{ id: 'local', title: '', content: '本地冲突' }],
      activeGreetingId: 'local',
      syncEvents: [],
      updatedAt: 10,
    };
    const storage = installTauri(async (cmd, args) => {
      if (cmd === 'load_kv' && args.name === sameKey) return same;
      if (cmd === 'load_kv' && args.name === missingKey) return {};
      if (cmd === 'load_kv' && args.name === conflictKey) {
        return {
          greetings: [{ id: 'disk', title: '', content: '磁盘冲突' }],
          activeGreetingId: 'disk',
          syncEvents: [],
          updatedAt: 10,
        };
      }
      if (cmd === 'save_kv' && args.name === missingKey) return true;
      throw new Error(`unexpected ${cmd}:${args.name}`);
    }, new MemoryLocalStorageMock({
      [sameKey]: JSON.stringify(same),
      [missingKey]: JSON.stringify(missing),
      [conflictKey]: JSON.stringify(conflict),
    }));

    const result = await migrateRpSessionLocalMirrors();

    assert.deepEqual(result, {
      scanned: 3,
      removed: 2,
      backfilled: 1,
      retained: 1,
    });
    assert.equal(storage.map.has(sameKey), false);
    assert.equal(storage.map.has(missingKey), false);
    assert.equal(storage.map.has(conflictKey), true);
    console.log('ok - bulk RP migration removes only verified mirrors');
  }

  {
    const exporterSource = await readFile(
      new URL('../../src/scripts/ui/custom-bundle-exporter.js', import.meta.url),
      'utf8',
    );
    const flushStart = exporterSource.indexOf('async flushRuntimeState(runtime)');
    const flushEnd = exporterSource.indexOf('getSessionWorldIds(runtime', flushStart);
    assert.ok(flushStart >= 0 && flushEnd > flushStart);
    const flushSource = exporterSource.slice(flushStart, flushEnd);
    assert.match(flushSource, /await runtime\.rpSessionStore\?\.flush\?\.\(\)/);
    assert.doesNotMatch(
      flushSource,
      /safeInvoke\('save_kv',\s*\{\s*name:\s*runtime\.rpSessionStore\.storeKey/,
    );
    console.log('ok - custom bundle flush respects RP store fail-closed persistence');
  }

  {
    const key = 'rp_session_v1__web';
    const storage = installWeb();
    const store = new RpSessionStore({ scopeId: 'web' });
    await store.ready;

    store.setGreetings([largeGreeting], { activeId: 'large' });
    assert.equal(JSON.parse(storage.map.get(key)).greetings[0].content.length, 170_000);
    console.log('ok - browser-only RP state keeps localStorage availability');
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
