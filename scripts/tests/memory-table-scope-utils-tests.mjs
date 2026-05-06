import assert from 'node:assert/strict';

import {
  buildMemoryScopeQuery,
  buildScopedMemoryRowFields,
  loadScopedMemories,
  resolveSessionMemoryScopeKey,
} from '../../src/scripts/ui/chat/memory-table-scope-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('resolveSessionMemoryScopeKey respects group and shared-global modes', () => {
  assert.equal(resolveSessionMemoryScopeKey({ isGroup: true }), 'group');
  assert.equal(resolveSessionMemoryScopeKey({ isGroup: false }), 'contact');
  assert.equal(
    resolveSessionMemoryScopeKey({ isGroup: false, useSharedGlobalScope: true }),
    'global',
  );
});

test('buildMemoryScopeQuery maps scope to the expected store query', () => {
  assert.deepEqual(
    buildMemoryScopeQuery({
      scopeKey: 'group',
      sessionId: 'group:a',
      templateId: 'default-v1',
    }),
    { scope: 'group', group_id: 'group:a', template_id: 'default-v1' },
  );
  assert.deepEqual(
    buildMemoryScopeQuery({
      scopeKey: 'contact',
      sessionId: 'chat-a',
      templateId: 'default-v1',
    }),
    { scope: 'contact', contact_id: 'chat-a', template_id: 'default-v1' },
  );
  assert.deepEqual(
    buildMemoryScopeQuery({
      scopeKey: 'global',
      sessionId: 'chat-a',
      templateId: 'default-v1',
    }),
    { scope: 'global', template_id: 'default-v1' },
  );
});

test('buildScopedMemoryRowFields maps row ownership to scope', () => {
  assert.deepEqual(
    buildScopedMemoryRowFields({ scopeKey: 'group', sessionId: 'group:a' }),
    { contact_id: null, group_id: 'group:a' },
  );
  assert.deepEqual(
    buildScopedMemoryRowFields({ scopeKey: 'contact', sessionId: 'chat-a' }),
    { contact_id: 'chat-a', group_id: null },
  );
  assert.deepEqual(
    buildScopedMemoryRowFields({ scopeKey: 'global', sessionId: 'chat-a' }),
    { contact_id: null, group_id: null },
  );
});

test('loadScopedMemories forwards the normalized query and tolerates failures', async () => {
  const calls = [];
  const rows = [{ id: 'row-1' }];
  const memoryTableStore = {
    async getMemories(query) {
      calls.push(query);
      return rows;
    },
  };

  assert.deepEqual(
    await loadScopedMemories({
      memoryTableStore,
      scopeKey: 'contact',
      sessionId: 'chat-a',
      templateId: 'default-v1',
    }),
    rows,
  );
  assert.deepEqual(calls, [
    { scope: 'contact', contact_id: 'chat-a', template_id: 'default-v1' },
  ]);

  assert.deepEqual(
    await loadScopedMemories({
      memoryTableStore: {
        async getMemories() {
          throw new Error('boom');
        },
      },
      scopeKey: 'global',
      sessionId: 'chat-a',
      templateId: 'default-v1',
    }),
    [],
  );
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
