import assert from 'node:assert/strict';

const values = new Map();
globalThis.localStorage = {
  getItem: key => values.get(key) || null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: key => values.delete(key),
};

const { ContactsStore } = await import('../../src/scripts/storage/contacts-store.js');

const store = new ContactsStore({ scopeId: 'card-a' });
await store.ready;
store.upsertContact({ id: 'character', name: '角色', voiceRef: 'voice-a' });
assert.equal(store.getContact('character').voiceRef, 'voice-a');

await store.setScope('card-b');
assert.equal(store.getContact('character'), null);
store.upsertContact({ id: 'character', name: '角色', voiceRef: 'voice-b' });
assert.equal(store.getContact('character').voiceRef, 'voice-b');

await store.setScope('card-a');
assert.equal(store.getContact('character').voiceRef, 'voice-a');

console.log('ok - contact voice bindings persist independently across character-card scopes');
