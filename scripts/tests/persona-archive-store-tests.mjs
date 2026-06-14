import assert from 'node:assert/strict';

const storage = new Map();
globalThis.localStorage = {
  getItem: key => storage.get(String(key)) ?? null,
  setItem: (key, value) => storage.set(String(key), String(value)),
  removeItem: key => storage.delete(String(key)),
};

const { PersonaArchiveStore } = await import('../../src/scripts/storage/persona-archive-store.js');

{
  const store = new PersonaArchiveStore({ scopeId: 'persona_a' });
  const saved = store.addArchive({
    name: 'A1',
    personaId: 'persona_a',
    sessionArchives: [{ sessionId: 'contact:a', archiveId: 'arc-1', sessionMode: 'chat' }],
    momentsSnapshot: { moments: [{ id: 'm1' }] },
  });
  assert.equal(saved.name, 'A1');
  assert.equal(store.listArchives().length, 1);
  assert.deepEqual(store.getArchive(saved.id).momentsSnapshot, { moments: [{ id: 'm1' }] });
  assert.equal(store.deleteArchive(saved.id), true);
  assert.equal(store.listArchives().length, 0);
  console.log('ok - PersonaArchiveStore adds lists reads and deletes role archives');
}

{
  const store = new PersonaArchiveStore({ scopeId: 'persona_a' });
  store.addArchive({ id: 'a', name: 'A' });
  await store.setScope('persona_b');
  assert.equal(store.listArchives().length, 0);
  store.addArchive({ id: 'b', name: 'B' });
  await store.setScope('persona_a');
  assert.deepEqual(store.listArchives().map(item => item.id), ['a']);
  await store.setScope('persona_b');
  assert.deepEqual(store.listArchives().map(item => item.id), ['b']);
  console.log('ok - PersonaArchiveStore keeps archives isolated by persona scope');
}
