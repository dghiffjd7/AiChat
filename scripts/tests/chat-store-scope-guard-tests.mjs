import assert from 'node:assert/strict';

const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: key => memoryStorage.get(String(key)) ?? null,
  setItem: (key, value) => {
    memoryStorage.set(String(key), String(value));
  },
  removeItem: key => {
    memoryStorage.delete(String(key));
  },
};
globalThis.document = { body: { dataset: {} } };
globalThis.window = globalThis;
globalThis.setTimeout = () => 0;

const { ChatStore, __chatStoreStorageInternals } = await import('../../src/scripts/storage/chat-store.js');
const { ContactsStore, __contactsStoreInternals } = await import('../../src/scripts/storage/contacts-store.js');

const makeSession = (timestamp = 1) => ({
  messages: [{ id: `m-${timestamp}`, role: 'user', content: 'x', timestamp }],
  draft: '',
  pending: [],
});

{
  const storage = __chatStoreStorageInternals;
  assert.equal(storage.isScopedDataMatch({ sessions: {} }, 'persona_1'), false);
  assert.equal(storage.isScopedDataMatch({ sessions: {} }, 'default'), true);
  assert.equal(storage.isScopedDataMatch({ sessions: {}, scopeId: 'persona_1' }, 'persona_1'), true);
  assert.equal(storage.isScopedDataMatch({ sessions: {}, scopeId: 'persona_2' }, 'persona_1'), false);
  assert.equal(storage.isForeignRpSessionForScope('rp:persona_2', 'persona_1'), true);
  assert.equal(storage.isForeignRpSessionForScope('rp:persona_1', 'persona_1'), false);
  assert.equal(storage.isForeignRpSessionForScope('room-a', 'persona_1'), false);
  assert.equal(storage.resolveCurrentId({
    currentId: 'rp:persona_2',
    sessions: {
      'rp:persona_2': makeSession(3),
      'rp:persona_1': makeSession(2),
      'room-a': makeSession(1),
    },
  }, 'persona_1'), 'rp:persona_1');
  console.log('ok - ChatStore internals reject foreign RP session ids for scoped current selection');
}

{
  const store = new ChatStore({ scopeId: 'persona_1' });
  store.state = {
    currentId: 'rp:persona_2',
    sessions: {
      'rp:persona_2': makeSession(3),
      'rp:persona_1': makeSession(2),
      'room-a': makeSession(1),
    },
  };
  store.currentId = 'rp:persona_2';

  assert.deepEqual(store.listSessions(), ['rp:persona_1', 'room-a']);
  assert.equal(store.hasSession('rp:persona_2'), false);
  assert.equal(store.hasSession('rp:persona_1'), true);
  assert.equal(store.setCurrent('rp:persona_2'), false);
  assert.equal(store.currentId, 'rp:persona_2');
  assert.equal(store.switchSession('rp:persona_2'), false);
  assert.equal(store.hasSession('room-a'), true);
  console.log('ok - ChatStore public session list and switch paths hide foreign RP ids');
}

{
  const store = new ChatStore({ scopeId: 'persona_archive_name' });
  store.state = {
    currentId: 's-name',
    sessions: {
      's-name': makeSession(10),
      's-auto': makeSession(11),
    },
  };
  store.currentId = 's-name';

  const archiveId = store.startNewChat('s-name', '流');
  assert.equal(Boolean(archiveId), true);
  assert.equal(store.state.sessions['s-name'].archives[0].name, '流');

  const autoArchiveId = store.startNewChat('s-auto', '');
  assert.equal(Boolean(autoArchiveId), true);
  assert.match(store.state.sessions['s-auto'].archives[0].name, /^存档 \(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}\)$/);
  console.log('ok - ChatStore startNewChat preserves typed archive names and auto-names blank archives');
}

{
  const contacts = __contactsStoreInternals;
  assert.equal(contacts.isScopedDataMatch({ contacts: {} }, 'persona_1'), false);
  assert.equal(contacts.isScopedDataMatch({ contacts: {} }, 'default'), true);
  assert.equal(contacts.isScopedDataMatch({ contacts: {}, scopeId: 'persona_1' }, 'persona_1'), true);
  assert.equal(contacts.isScopedDataMatch({ contacts: {}, scopeId: 'persona_2' }, 'persona_1'), false);
  assert.equal(contacts.isForeignRpContactForScope('rp:persona_2', 'persona_1'), true);
  assert.equal(contacts.isForeignRpContactForScope('rp:persona_1', 'persona_1'), false);

  const store = new ContactsStore({ scopeId: 'persona_1' });
  await store.ready;
  store.state = {
    contacts: {
      'rp:persona_2': { id: 'rp:persona_2', name: 'Foreign', addedAt: 3 },
      'rp:persona_1': { id: 'rp:persona_1', name: 'Own', addedAt: 2 },
      'room-a': { id: 'room-a', name: 'Room', addedAt: 1 },
    },
  };

  assert.deepEqual(store.listContacts().map(item => item.id), ['rp:persona_1', 'room-a']);
  assert.equal(store.getContact('rp:persona_2'), null);
  store.upsertContact({ id: 'rp:persona_2', name: 'Still foreign' });
  store.ensureFromSessions(['rp:persona_2', 'room-b']);
  assert.equal(store.state.contacts['rp:persona_2'].name, 'Foreign');
  assert.equal(Boolean(store.state.contacts['room-b']), true);
  console.log('ok - ContactsStore filters and refuses foreign RP contacts per scope');
}
