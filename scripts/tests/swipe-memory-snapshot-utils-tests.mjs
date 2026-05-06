import assert from 'node:assert/strict';

import {
  buildSwipeMemorySnapshot,
  buildSwipeMemorySnapshotInputs,
  buildSwipeMemorySnapshotRows,
  replaceScopedMemoriesWithSnapshot,
} from '../../src/scripts/ui/chat/swipe-memory-snapshot-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildSwipeMemorySnapshotRows normalizes rows and clones row_data', () => {
  const source = [
    {
      id: 'row-2',
      template_id: 't-1',
      table_id: 'profile',
      row_data: { name: 'Alice' },
      is_active: false,
      is_pinned: 1,
      priority: '7',
      sort_order: '9',
    },
    {
      id: 'row-1',
      table_id: '',
      row_data: { ignored: true },
    },
  ];
  const rows = buildSwipeMemorySnapshotRows({
    rows: source,
    templateId: 'default-v1',
    scopeFields: { contact_id: 'chat-a', group_id: null },
    cloneValue: value => JSON.parse(JSON.stringify(value)),
  });

  assert.deepEqual(rows, [
    {
      id: 'row-2',
      template_id: 't-1',
      table_id: 'profile',
      contact_id: 'chat-a',
      group_id: null,
      row_data: { name: 'Alice' },
      is_active: false,
      is_pinned: true,
      priority: 7,
      sort_order: 9,
    },
  ]);

  source[0].row_data.name = 'Changed';
  assert.equal(rows[0].row_data.name, 'Alice');
});

test('buildSwipeMemorySnapshot wraps normalized rows into snapshot payload', () => {
  const snapshot = buildSwipeMemorySnapshot({
    rows: [{ id: 'row-1', table_id: 'summary', row_data: { note: 'x' } }],
    templateId: 'default-v1',
    scope: 'group',
    scopeFields: { contact_id: null, group_id: 'group:a' },
    cloneValue: value => JSON.parse(JSON.stringify(value)),
    capturedAt: 123,
  });

  assert.deepEqual(snapshot, {
    templateId: 'default-v1',
    scope: 'group',
    rows: [
      {
        id: 'row-1',
        template_id: 'default-v1',
        table_id: 'summary',
        contact_id: null,
        group_id: 'group:a',
        row_data: { note: 'x' },
        is_active: true,
        is_pinned: false,
        priority: 0,
        sort_order: 0,
      },
    ],
    capturedAt: 123,
  });
});

test('buildSwipeMemorySnapshotInputs prepares create payloads for snapshot restore', () => {
  const inputs = buildSwipeMemorySnapshotInputs({
    rows: [{ id: 'row-1', table_id: 'summary', row_data: { note: 'x' } }],
    templateId: 'default-v1',
    scopeFields: { contact_id: null, group_id: 'group:a' },
    cloneValue: value => JSON.parse(JSON.stringify(value)),
  });

  assert.deepEqual(inputs, [
    {
      id: 'row-1',
      template_id: 'default-v1',
      table_id: 'summary',
      contact_id: null,
      group_id: 'group:a',
      row_data: { note: 'x' },
      is_active: true,
      is_pinned: false,
      priority: 0,
      sort_order: 0,
    },
  ]);
});

test('replaceScopedMemoriesWithSnapshot uses batch APIs when available', async () => {
  const deleted = [];
  const created = [];
  const memoryTableStore = {
    async batchDeleteMemories(ids) {
      deleted.push(ids);
    },
    async batchCreateMemories(inputs) {
      created.push(inputs);
    },
  };

  const result = await replaceScopedMemoriesWithSnapshot({
    memoryTableStore,
    existingRows: [{ id: 'old-1' }, { id: 'old-2' }],
    snapshotRows: [{ id: 'new-1', table_id: 'summary', row_data: { note: 'x' } }],
    templateId: 'default-v1',
    scopeFields: { contact_id: 'chat-a', group_id: null },
    cloneValue: value => JSON.parse(JSON.stringify(value)),
  });

  assert.deepEqual(deleted, [['old-1', 'old-2']]);
  assert.deepEqual(created, [[
    {
      id: 'new-1',
      template_id: 'default-v1',
      table_id: 'summary',
      contact_id: 'chat-a',
      group_id: null,
      row_data: { note: 'x' },
      is_active: true,
      is_pinned: false,
      priority: 0,
      sort_order: 0,
    },
  ]]);
  assert.deepEqual(result.deletedIds, ['old-1', 'old-2']);
  assert.equal(result.inputs.length, 1);
});

test('replaceScopedMemoriesWithSnapshot falls back to per-row delete/create when batch fails', async () => {
  const deleted = [];
  const created = [];
  const memoryTableStore = {
    async batchDeleteMemories() {
      throw new Error('delete fail');
    },
    async deleteMemory(id) {
      deleted.push(id);
    },
    async batchCreateMemories() {
      throw new Error('create fail');
    },
    async createMemory(input) {
      created.push(input);
    },
  };

  await replaceScopedMemoriesWithSnapshot({
    memoryTableStore,
    existingRows: [{ id: 'old-1' }, { id: 'old-2' }],
    snapshotRows: [{ id: 'new-1', table_id: 'summary', row_data: { note: 'x' } }],
    templateId: 'default-v1',
    scopeFields: { contact_id: null, group_id: 'group:a' },
    cloneValue: value => JSON.parse(JSON.stringify(value)),
  });

  assert.deepEqual(deleted, ['old-1', 'old-2']);
  assert.deepEqual(created, [
    {
      id: 'new-1',
      template_id: 'default-v1',
      table_id: 'summary',
      contact_id: null,
      group_id: 'group:a',
      row_data: { note: 'x' },
      is_active: true,
      is_pinned: false,
      priority: 0,
      sort_order: 0,
    },
  ]);
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
