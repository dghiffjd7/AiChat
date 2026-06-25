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
  assert.equal(store.setCurrentArchiveId(saved.id), true);
  assert.equal(store.getCurrentArchiveId(), saved.id);
  assert.equal(store.deleteArchive(saved.id), true);
  assert.equal(store.getCurrentArchiveId(), '');
  assert.equal(store.listArchives().length, 0);
  console.log('ok - PersonaArchiveStore adds lists reads and deletes role archives');
}

{
  const store = new PersonaArchiveStore({ scopeId: 'persona_a' });
  store.addArchive({ id: 'a', name: 'A' });
  store.setCurrentArchiveId('a');
  await store.setScope('persona_b');
  assert.equal(store.listArchives().length, 0);
  assert.equal(store.getCurrentArchiveId(), '');
  store.addArchive({ id: 'b', name: 'B' });
  store.setCurrentArchiveId('b');
  await store.setScope('persona_a');
  assert.deepEqual(store.listArchives().map(item => item.id), ['a']);
  assert.equal(store.getCurrentArchiveId(), 'a');
  await store.setScope('persona_b');
  assert.deepEqual(store.listArchives().map(item => item.id), ['b']);
  assert.equal(store.getCurrentArchiveId(), 'b');
  console.log('ok - PersonaArchiveStore keeps archives isolated by persona scope');
}
