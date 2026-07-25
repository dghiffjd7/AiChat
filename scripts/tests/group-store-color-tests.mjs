import assert from 'node:assert/strict';

const memory = new Map();
globalThis.localStorage = {
  getItem: key => memory.get(key) ?? null,
  setItem: (key, value) => memory.set(key, String(value)),
};

const { GroupStore } = await import('../../src/scripts/storage/group-store.js');

{
  const store = new GroupStore();
  await store.ready;
  const created = store.createGroup('饭搭子', '', 'amber');
  assert.equal(created.color, 'amber');

  const updated = store.updateGroup(created.id, { color: 'violet' });
  assert.equal(updated.color, 'violet');

  const fallback = store.createGroup('默认颜色', '', 'not-a-color');
  assert.equal(fallback.color, 'sky');
  console.log('ok - contact grouping colors are normalized and persisted by GroupStore');
}
