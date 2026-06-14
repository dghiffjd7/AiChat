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
  assert.equal(store.renameArchive(archiveId, '重命名', 's-name'), true);
  assert.equal(store.state.sessions['s-name'].archives[0].name, '重命名');
  assert.equal(store.renameArchive(archiveId, '   ', 's-name'), false);

  const autoArchiveId = store.startNewChat('s-auto', '');
  assert.equal(Boolean(autoArchiveId), true);
  assert.match(store.state.sessions['s-auto'].archives[0].name, /^存档 \(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}\)$/);
  console.log('ok - ChatStore startNewChat preserves typed archive names and auto-names blank archives');
}

{
  const sid = 'rp:persona_archive_recover';
  const store = new ChatStore({ scopeId: 'persona_archive_recover' });
  store.state = {
    currentId: sid,
    sessions: {
      [sid]: {
        messages: [],
        archives: [
          { id: '1700000000000-a111', name: '保留命名', timestamp: 1700000000000, messageCount: 1 },
        ],
      },
    },
  };
  store._useV2 = true;
  store._v2.index = {
    sessions: {
      [sid]: {
        archives: {
          '1700000000000-a111': { total: 7, lastMessageAt: 1700000000700, parts: [{ id: 'part_0001' }] },
          '1700000100000-b222': { total: 3, lastMessageAt: 1700000100300, parts: [{ id: 'part_0001' }] },
        },
      },
    },
  };

  assert.equal(store._recoverV2ArchiveMetadata(), true);
  const archives = store.getArchives(sid);
  assert.deepEqual(archives.map(item => item.id), ['1700000100000-b222', '1700000000000-a111']);
  assert.equal(archives.find(item => item.id === '1700000000000-a111')?.name, '保留命名');
  assert.equal(archives.find(item => item.id === '1700000000000-a111')?.messageCount, 7);
  assert.match(
    archives.find(item => item.id === '1700000100000-b222')?.name || '',
    /^存档 \(\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}\)$/,
  );
  console.log('ok - ChatStore recovers missing archive metadata from v2 sidecar index');
}

{
  const sid = 'rp:persona_archive_persist';
  const store = new ChatStore({ scopeId: 'persona_archive_persist' });
  store.storeKey = 'chat_store_v1__persona_archive_persist_test';
  store.state = {
    currentId: sid,
    sessions: {
      [sid]: {
        messages: [],
        archives: Array.from({ length: 10 }, (_, index) => ({
          id: `17000000${String(index).padStart(4, '0')}-arc`,
          name: `A${index}`,
          timestamp: 1700000000000 + index,
          messageCount: index,
          messages: [],
        })),
      },
    },
  };
  store._skipMessagePersist = true;

  await store.flush();
  const persisted = JSON.parse(memoryStorage.get(store.storeKey));
  assert.equal(persisted.sessions[sid].archives.length, 10);
  assert.deepEqual(
    persisted.sessions[sid].archives.map(item => item.name),
    ['A9', 'A8', 'A7', 'A6', 'A5', 'A4', 'A3', 'A2', 'A1', 'A0'],
  );
  console.log('ok - ChatStore persists archive metadata beyond the old six item cap');
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
