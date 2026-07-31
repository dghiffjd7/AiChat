import assert from 'node:assert/strict';

class MemoryLocalStorageMock {
  constructor(initial = {}) {
    this.map = new Map(Object.entries(initial).map(([key, value]) => [String(key), String(value)]));
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

const makeState = (sessionId, label, { large = false } = {}) => ({
  version: 1,
  sessionId,
  updatedAt: 10,
  baselineSnapshotId: '',
  baselineCapturedAt: 0,
  pointer: {
    version: 1,
    sessionId,
    tailAssistantMessageId: `assistant-${label}`,
    tailSwipeIndex: 0,
    restoredAt: 10,
    source: 'test',
  },
  archivePointers: {},
  checkpoints: {
    [`assistant-${label}`]: {
      version: 1,
      sessionId,
      assistantMessageId: `assistant-${label}`,
      userMessageId: `user-${label}`,
      turnIndex: 1,
      aiFloor: 1,
      createdAt: 10,
      updatedAt: 10,
      deletedAt: 0,
      activeSwipeIndex: 0,
      state: 'final',
      branches: [{
        version: 1,
        swipeIndex: 0,
        messageContent: large ? 'x'.repeat(80_000) : label,
        messageRaw: '',
        memorySnapshotId: '',
        variableSnapshotId: '',
        memorySnapshotHash: '',
        variableSnapshotHash: '',
        checkpointState: 'final',
        replyState: 'complete',
        createdAt: 10,
      }],
    },
  },
});

const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve, 0));

try {
  installWeb();
  const {
    TurnCheckpointStore,
    buildTurnCheckpointStoreKey,
    migrateTurnCheckpointLocalMirrors,
  } = await import('../../src/scripts/storage/turn-checkpoint-store.js');

  {
    const scopeId = 'persona:verified';
    const sessionId = 'session-verified';
    const key = buildTurnCheckpointStoreKey(scopeId, sessionId);
    const staleLocal = makeState(sessionId, 'stale');
    staleLocal.updatedAt = 5;
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return makeState(sessionId, 'disk');
      return true;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(staleLocal) }));
    const store = new TurnCheckpointStore({ scopeId });
    const state = await store.getSessionState(sessionId);

    assert.equal(state.pointer.tailAssistantMessageId, 'assistant-disk');
    assert.equal(storage.map.has(key), false);
    console.log('ok - verified turn checkpoints hydrate from KV and remove the local mirror');
  }

  {
    const scopeId = 'persona:backfill';
    const sessionId = 'session-backfill';
    const key = buildTurnCheckpointStoreKey(scopeId, sessionId);
    const localState = makeState(sessionId, 'local', { large: true });
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(localState) }));
    const store = new TurnCheckpointStore({ scopeId });
    const state = await store.getSessionState(sessionId);

    assert.equal(state.pointer.tailAssistantMessageId, 'assistant-local');
    assert.equal(calls.some(([cmd, args]) => cmd === 'save_kv' && args.name === key), true);
    assert.equal(storage.map.has(key), false);
    console.log('ok - oversized legacy checkpoints backfill missing KV before local removal');
  }

  {
    const scopeId = 'persona:persist';
    const sessionId = 'session-persist';
    const key = buildTurnCheckpointStoreKey(scopeId, sessionId);
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') return true;
      return null;
    });
    const store = new TurnCheckpointStore({ scopeId });
    await store.upsertCheckpoint(sessionId, makeState(sessionId, 'new').checkpoints['assistant-new']);

    assert.equal(storage.map.has(key), false);
    console.log('ok - Tauri turn checkpoint writes stay KV-only');
  }

  {
    const scopeId = 'persona:fallback';
    const sessionId = 'session-fallback';
    const key = buildTurnCheckpointStoreKey(scopeId, sessionId);
    const storage = installTauri(async (cmd) => {
      if (cmd === 'load_kv') return {};
      if (cmd === 'save_kv') throw new Error('disk unavailable');
      return null;
    });
    const store = new TurnCheckpointStore({ scopeId });
    await store.upsertCheckpoint(sessionId, makeState(sessionId, 'fallback', { large: true }).checkpoints['assistant-fallback']);

    assert.equal(storage.map.has(key), true);
    assert.equal(String(storage.map.get(key)).length > 64_000, true, 'emergency fallback must preserve oversized state');
    console.log('ok - failed turn checkpoint KV writes retain an emergency local fallback');
  }

  {
    const scopeId = 'persona:unreadable';
    const sessionId = 'session-unreadable';
    const key = buildTurnCheckpointStoreKey(scopeId, sessionId);
    const calls = [];
    installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') throw new Error('disk unreadable');
      if (cmd === 'save_kv') throw new Error('must remain blocked');
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(makeState(sessionId, 'local')) }));
    const store = new TurnCheckpointStore({ scopeId });
    const state = await store.getSessionState(sessionId);

    assert.equal(state.pointer.tailAssistantMessageId, 'assistant-local');
    await assert.rejects(
      store.upsertCheckpoint(sessionId, makeState(sessionId, 'new').checkpoints['assistant-new']),
      error => error?.code === 'turn_checkpoint_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    console.log('ok - unreadable turn checkpoint KV remains read-only instead of accepting an empty overwrite');
  }

  {
    const scopeId = 'persona:unreadable-clear';
    const sessionId = 'session-unreadable-clear';
    const key = buildTurnCheckpointStoreKey(scopeId, sessionId);
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv') throw new Error('disk unreadable');
      if (cmd === 'save_kv') throw new Error('save_kv must remain blocked');
      return null;
    }, new MemoryLocalStorageMock({ [key]: JSON.stringify(makeState(sessionId, 'local')) }));
    const store = new TurnCheckpointStore({ scopeId });

    await assert.rejects(
      store.clearSession(sessionId),
      error => error?.code === 'turn_checkpoint_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    assert.equal(storage.map.has(key), true, 'blocked clear must preserve the recovery mirror');
    console.log('ok - clearSession cannot bypass an unreadable checkpoint store');
  }

  {
    const scopeId = 'persona:unreadable-rename';
    const from = 'session-unreadable-from';
    const to = 'session-unreadable-to';
    const fromKey = buildTurnCheckpointStoreKey(scopeId, from);
    const toKey = buildTurnCheckpointStoreKey(scopeId, to);
    const calls = [];
    const storage = installTauri(async (cmd, args) => {
      calls.push([cmd, args]);
      if (cmd === 'load_kv' && args.name === fromKey) throw new Error('source unreadable');
      if (cmd === 'load_kv' && args.name === toKey) return {};
      if (cmd === 'save_kv') throw new Error('save_kv must remain blocked');
      return null;
    }, new MemoryLocalStorageMock({ [fromKey]: JSON.stringify(makeState(from, 'local')) }));
    const store = new TurnCheckpointStore({ scopeId });

    await assert.rejects(
      store.renameSession(from, to),
      error => error?.code === 'turn_checkpoint_store_read_unavailable',
    );
    assert.equal(calls.some(([cmd]) => cmd === 'save_kv'), false);
    assert.equal(storage.map.has(fromKey), true, 'blocked rename must preserve its source recovery mirror');
    assert.equal(storage.map.has(toKey), false, 'blocked rename must not create an empty destination');
    console.log('ok - renameSession cannot bypass an unreadable checkpoint source');
  }

  {
    const sameSession = 'session-same';
    const missingSession = 'session-missing';
    const conflictSession = 'session-conflict';
    const sameKey = buildTurnCheckpointStoreKey('scope', sameSession);
    const missingKey = buildTurnCheckpointStoreKey('scope', missingSession);
    const conflictKey = buildTurnCheckpointStoreKey('scope', conflictSession);
    const same = makeState(sameSession, 'same');
    const missing = makeState(missingSession, 'missing');
    const conflict = makeState(conflictSession, 'local');
    const storage = installTauri(async (cmd, args) => {
      if (cmd === 'load_kv' && args.name === sameKey) return same;
      if (cmd === 'load_kv' && args.name === missingKey) return {};
      if (cmd === 'load_kv' && args.name === conflictKey) return makeState(conflictSession, 'disk');
      if (cmd === 'save_kv' && args.name === missingKey) return true;
      throw new Error(`unexpected ${cmd}:${args.name}`);
    }, new MemoryLocalStorageMock({
      [sameKey]: JSON.stringify(same),
      [missingKey]: JSON.stringify(missing),
      [conflictKey]: JSON.stringify(conflict),
    }));

    const result = await migrateTurnCheckpointLocalMirrors();

    assert.deepEqual(result, {
      scanned: 3,
      removed: 2,
      backfilled: 1,
      retained: 1,
    });
    assert.equal(storage.map.has(sameKey), false);
    assert.equal(storage.map.has(missingKey), false);
    assert.equal(storage.map.has(conflictKey), true);
    console.log('ok - bulk turn checkpoint migration removes only verified mirrors');
  }

  {
    const scopeId = 'web';
    const sessionId = 'session-web';
    const key = buildTurnCheckpointStoreKey(scopeId, sessionId);
    const storage = installWeb();
    const store = new TurnCheckpointStore({ scopeId });
    await store.upsertCheckpoint(sessionId, makeState(sessionId, 'web').checkpoints['assistant-web']);

    assert.equal(storage.map.has(key), true);
    console.log('ok - browser-only turn checkpoints retain localStorage availability');
  }
  await flushMicrotasks();
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
