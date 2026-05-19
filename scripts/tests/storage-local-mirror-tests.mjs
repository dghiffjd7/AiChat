import assert from 'node:assert/strict';

class MemoryLocalStorageMock {
  constructor() {
    this.map = new Map();
    this.setCalls = [];
    this.removeCalls = [];
  }

  seed(key, value) {
    this.map.set(String(key), String(value));
  }

  getItem(key) {
    return this.map.has(String(key)) ? this.map.get(String(key)) : null;
  }

  setItem(key, value) {
    this.setCalls.push(String(key));
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.removeCalls.push(String(key));
    this.map.delete(String(key));
  }

  clearCalls() {
    this.setCalls = [];
    this.removeCalls = [];
  }
}

const previousLocalStorage = globalThis.localStorage;
const previousInvoke = globalThis.__TAURI_INVOKE__;
const previousWindow = globalThis.window;
const previousSetTimeout = globalThis.setTimeout;
const previousClearTimeout = globalThis.clearTimeout;

const storage = new MemoryLocalStorageMock();
globalThis.localStorage = storage;
globalThis.window = globalThis;
globalThis.setTimeout = () => 0;
globalThis.clearTimeout = () => {};

const scopeId = 'persona_disk';
const keys = {
  contacts: `contacts_store_v1__${scopeId}`,
  moments: `moments_store_v1__${scopeId}`,
  chat: `chat_store_v1__${scopeId}`,
};
const diskData = {
  [keys.contacts]: {
    scopeId,
    contacts: {
      alice: { id: 'alice', name: 'Alice', addedAt: 1 },
    },
  },
  [keys.moments]: {
    moments: [
      { id: 'moment-1', author: 'Alice', content: 'hello', time: '10:00' },
    ],
  },
  [keys.chat]: {
    scopeId,
    currentId: 'alice',
    sessions: {
      alice: { messages: [], draft: '', pending: [] },
    },
  },
};
const saveCalls = [];

globalThis.__TAURI_INVOKE__ = async (cmd, args = {}) => {
  if (cmd === 'load_kv') return diskData[args.name] || {};
  if (cmd === 'save_kv') {
    saveCalls.push(args.name);
    return true;
  }
  if (cmd === 'chat_store_v2_read_index') return { version: 2, sessions: {} };
  if (cmd.startsWith('chat_store_v2_')) return null;
  return null;
};

try {
  const { ContactsStore } = await import('../../src/scripts/storage/contacts-store.js');
  const { MomentsStore } = await import('../../src/scripts/storage/moments-store.js');
  const { ChatStore } = await import('../../src/scripts/storage/chat-store.js');
  globalThis.setTimeout = (fn) => {
    if (typeof fn === 'function') fn();
    return 0;
  };

  storage.seed(keys.contacts, JSON.stringify({ contacts: { stale: { id: 'stale' } }, scopeId }));
  storage.seed(keys.moments, JSON.stringify({ moments: [{ id: 'stale' }] }));
  storage.seed(keys.chat, JSON.stringify({ sessions: { stale: { messages: [] } }, scopeId }));
  storage.clearCalls();

  const contactsStore = new ContactsStore({ scopeId });
  const momentsStore = new MomentsStore({ scopeId });
  const chatStore = new ChatStore({ scopeId });
  await Promise.all([contactsStore.ready, momentsStore.ready, chatStore.ready]);

  assert.equal(storage.setCalls.includes(keys.contacts), false);
  assert.equal(storage.setCalls.includes(keys.moments), false);
  assert.equal(storage.setCalls.includes(keys.chat), false);
  assert.equal(storage.removeCalls.includes(keys.contacts), true);
  assert.equal(storage.removeCalls.includes(keys.moments), true);
  assert.equal(storage.removeCalls.includes(keys.chat), true);

  storage.clearCalls();
  contactsStore.upsertContact({ id: 'bob', name: 'Bob' });
  momentsStore.upsert({ id: 'moment-2', author: 'Bob', content: 'new', time: '11:00' });
  chatStore._persist();
  await momentsStore.flush();
  await chatStore.flush();

  assert.equal(storage.setCalls.includes(keys.contacts), false);
  assert.equal(storage.setCalls.includes(keys.moments), false);
  assert.equal(storage.setCalls.includes(keys.chat), false);

  const fallbackScope = 'persona_local';
  const fallbackContactsKey = `contacts_store_v1__${fallbackScope}`;
  const fallbackStore = new ContactsStore({ scopeId: fallbackScope });
  await fallbackStore.ready;
  storage.clearCalls();
  fallbackStore.upsertContact({ id: 'local', name: 'Local' });
  assert.equal(storage.setCalls.includes(fallbackContactsKey), true);

  console.log('ok - disk-backed large stores skip full localStorage mirrors');
} finally {
  if (previousLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = previousLocalStorage;
  }
  if (previousInvoke === undefined) {
    delete globalThis.__TAURI_INVOKE__;
  } else {
    globalThis.__TAURI_INVOKE__ = previousInvoke;
  }
  if (previousWindow === undefined) {
    delete globalThis.window;
  } else {
    globalThis.window = previousWindow;
  }
  globalThis.setTimeout = previousSetTimeout;
  globalThis.clearTimeout = previousClearTimeout;
}
