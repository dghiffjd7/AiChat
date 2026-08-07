import assert from 'node:assert/strict';

const localState = new Map();
globalThis.localStorage = {
  getItem: key => localState.get(String(key)) ?? null,
  setItem: (key, value) => localState.set(String(key), String(value)),
  removeItem: key => localState.delete(String(key)),
};
globalThis.__TAURI_INVOKE__ = async command => (command === 'load_kv' ? null : true);

const { ContactProfileStore } = await import('../../src/scripts/storage/contact-profile-store.js');

const createStore = async (scopeId = 'scope-a') => {
  const store = new ContactProfileStore({ scopeId });
  await store.ready;
  return store;
};

{
  const store = await createStore('scope-cas');
  store.upsertProfile({ contactId: 'alice', displayName: 'Alice', trigger_keywords: ['base'] });
  const snapshot = store.getProfileSnapshot('alice');

  store.upsertProfile({ contactId: 'alice', displayName: 'Alice user edit', trigger_keywords: ['user'] });
  const result = store.upsertProfileIfUnchanged({
    contactId: 'alice',
    displayName: 'Alice maid edit',
    trigger_keywords: ['maid'],
  }, snapshot);

  assert.equal(result.ok, false);
  assert.equal(result.conflict, true);
  assert.equal(result.reason, 'profile_changed_during_operation');
  assert.equal(store.getProfile('alice').displayName, 'Alice user edit');
  await store.whenPersisted();
  console.log('ok - ContactProfileStore rejects a stale whole-profile replacement');
}

{
  const store = await createStore('scope-aba');
  store.upsertProfile({ contactId: 'alice', displayName: 'Original Alice' });
  const snapshot = store.getProfileSnapshot('alice');
  assert.equal(store.deleteProfile('alice'), true);
  store.upsertProfile({ contactId: 'alice', displayName: 'Recreated Alice' });

  const result = store.upsertProfileIfUnchanged({
    contactId: 'alice',
    displayName: 'Stale Alice',
  }, snapshot);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'profile_changed_during_operation');
  assert.equal(store.getProfile('alice').displayName, 'Recreated Alice');
  assert.ok(store.getProfileSnapshot('alice').revision > snapshot.revision);
  await store.whenPersisted();
  console.log('ok - ContactProfileStore revision rejects delete and recreate ABA');
}

{
  const store = await createStore('scope-a');
  store.upsertProfile({ contactId: 'alice', displayName: 'Scope A Alice' });
  const snapshot = store.getProfileSnapshot('alice');
  await store.setScope('scope-b');
  await store.setScope('scope-a');

  const result = store.upsertProfileIfUnchanged({
    contactId: 'alice',
    displayName: 'Wrong scope Alice',
  }, snapshot);

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'target_scope_changed');
  assert.equal(store.getProfile('alice').displayName, 'Scope A Alice');
  await store.whenPersisted();
  console.log('ok - ContactProfileStore rejects a commit after scope switch ABA');
}

{
  const store = await createStore('scope-pending');
  store.upsertProfile({ contactId: 'alice', displayName: 'Base Alice' });
  const snapshot = store.getProfileSnapshot('alice');
  const pending = store.addPendingUpdate({
    contactId: 'alice',
    profile: { contactId: 'alice', displayName: 'Candidate Alice' },
    scopeId: snapshot.scopeId,
    baseRevision: snapshot.revision,
    baseExists: snapshot.exists,
  });
  store.upsertProfile({ contactId: 'alice', displayName: 'User Alice' });

  const result = store.approvePendingUpdate({ id: pending.id });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'profile_changed_during_operation');
  assert.equal(store.getProfile('alice').displayName, 'User Alice');
  assert.equal(store.listPendingUpdates().some(item => item.id === pending.id), true);
  await store.whenPersisted();
  console.log('ok - stale contact profile pending approval keeps the user edit and candidate');
}

{
  const store = await createStore('scope-pending-success');
  const snapshot = store.getProfileSnapshot('alice');
  const pending = store.addPendingUpdate({
    contactId: 'alice',
    profile: { contactId: 'alice', displayName: 'Candidate Alice' },
    scopeId: snapshot.scopeId,
    baseRevision: snapshot.revision,
    baseExists: snapshot.exists,
  });

  const result = store.approvePendingUpdate({ id: pending.id });

  assert.equal(result.ok, true);
  assert.equal(store.getProfile('alice').displayName, 'Candidate Alice');
  assert.equal(store.listPendingUpdates().some(item => item.id === pending.id), false);
  await store.whenPersisted();
  console.log('ok - current contact profile pending approval commits and clears atomically');
}

{
  const previousInvoker = globalThis.__TAURI_INVOKE__;
  const writes = [];
  let releaseFirst = () => {};
  const firstWriteGate = new Promise(resolve => { releaseFirst = resolve; });
  globalThis.__TAURI_INVOKE__ = async (command, args = {}) => {
    if (command === 'load_kv') return null;
    if (command !== 'save_kv') return null;
    const index = writes.length;
    writes.push({ name: args.name, data: args.data });
    if (index === 0) await firstWriteGate;
    return true;
  };
  try {
    const store = await createStore('scope-persist-order');
    store.upsertProfile({ contactId: 'alice', displayName: 'First' });
    store.upsertProfile({ contactId: 'alice', displayName: 'Second' });
    await Promise.resolve();
    await Promise.resolve();
    const startedBeforeRelease = writes.length;
    releaseFirst();
    await store.whenPersisted();

    assert.equal(startedBeforeRelease, 1);
    assert.deepEqual(writes.map(item => item.data.profiles[0].displayName), ['First', 'Second']);
    console.log('ok - ContactProfileStore serializes durable writes in mutation order');
  } finally {
    releaseFirst();
    if (previousInvoker === undefined) delete globalThis.__TAURI_INVOKE__;
    else globalThis.__TAURI_INVOKE__ = previousInvoker;
  }
}
