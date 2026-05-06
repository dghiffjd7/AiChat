import assert from 'node:assert/strict';

import {
  countAssistantTurnsForMemoryTimeline,
  normalizeTimelineMemoryActionData,
  pickNewestMemoryRow,
  resolveMemoryActionRowId,
  resolveMemoryActionRowIdByData,
  resolveMemoryActionTableId,
  resolveMemoryInsertSortOrder,
  resolveMemoryTableScope,
} from '../../src/scripts/ui/chat/memory-table-action-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('resolveMemoryActionTableId supports explicit id, name, and tableIndex fallback', () => {
  const tableById = new Map([
    ['chat_summary', { id: 'chat_summary' }],
    ['profile', { id: 'profile' }],
  ]);
  const tableNameMap = new Map([
    ['聊天摘要', 'chat_summary'],
    ['角色表', 'profile'],
  ]);
  const tableOrder = ['profile', 'chat_summary'];

  assert.equal(
    resolveMemoryActionTableId({
      action: { tableId: 'profile' },
      tableById,
      tableNameMap,
      tableOrder,
    }),
    'profile',
  );
  assert.equal(
    resolveMemoryActionTableId({
      action: { tableName: '聊天摘要' },
      tableById,
      tableNameMap,
      tableOrder,
    }),
    'chat_summary',
  );
  assert.equal(
    resolveMemoryActionTableId({
      action: { tableIndex: 0 },
      tableById,
      tableNameMap,
      tableOrder,
    }),
    'profile',
  );
});

test('resolveMemoryActionRowId supports explicit rowId and rowIndex lookup', () => {
  assert.equal(
    resolveMemoryActionRowId({
      action: { rowId: 'row-1' },
      tableId: 'profile',
      rowIndexMap: { profile: ['row-a'] },
    }),
    'row-1',
  );
  assert.equal(
    resolveMemoryActionRowId({
      action: { rowIndex: 1 },
      tableId: 'profile',
      rowIndexMap: { profile: ['row-a', 'row-b'] },
    }),
    'row-b',
  );
});

test('resolveMemoryActionRowIdByData matches preferred keys and single-row fallback', () => {
  const rowsByTableScope = new Map([
    ['profile:contact', [
      { id: 'row-1', row_data: { name: 'Alice' } },
      { id: 'row-2', row_data: { name: 'Bob' } },
    ]],
    ['summary:group', [
      { id: 'row-3', row_data: { note: 'only row' } },
    ]],
  ]);

  assert.equal(
    resolveMemoryActionRowIdByData({
      tableId: 'profile',
      scopeKey: 'contact',
      data: { name: 'Bob' },
      table: { columns: [{ id: 'name' }] },
      rowsByTableScope,
    }),
    'row-2',
  );
  assert.equal(
    resolveMemoryActionRowIdByData({
      tableId: 'summary',
      scopeKey: 'group',
      data: { note: 'does not match preferred keys' },
      table: { columns: [{ id: 'note' }] },
      rowsByTableScope,
    }),
    'row-3',
  );
});

test('resolveMemoryTableScope returns contact, group, or global placement', () => {
  assert.deepEqual(
    resolveMemoryTableScope({
      table: { scope: 'contact' },
      sessionId: 'chat-a',
      isGroup: false,
    }),
    { key: 'contact', contactId: 'chat-a', groupId: null },
  );
  assert.deepEqual(
    resolveMemoryTableScope({
      table: { scope: 'group' },
      sessionId: 'group:a',
      isGroup: true,
    }),
    { key: 'group', contactId: null, groupId: 'group:a' },
  );
  assert.deepEqual(
    resolveMemoryTableScope({
      table: { scope: 'anything' },
      useSharedGlobalScope: true,
      sessionId: 'chat-a',
      isGroup: false,
    }),
    { key: 'global', contactId: null, groupId: null },
  );
});

test('countAssistantTurnsForMemoryTimeline ignores pending, greetings, and memory-table pushes', () => {
  assert.equal(
    countAssistantTurnsForMemoryTimeline([
      { role: 'assistant', meta: { isGreeting: true } },
      { role: 'assistant', status: 'pending' },
      { role: 'assistant', meta: { kind: 'memory-table-push' } },
      { role: 'assistant', content: '有效1' },
      { role: 'user', content: '用户' },
      { role: 'assistant', content: '有效2' },
    ]),
    2,
  );
});

test('normalizeTimelineMemoryActionData and resolveMemoryInsertSortOrder preserve timeline rounds', () => {
  assert.deepEqual(
    normalizeTimelineMemoryActionData({
      tableId: 'chat_summary',
      rowData: { note: 'x' },
      currentTurnNumber: 3,
    }),
    { note: 'x', time: '第3轮' },
  );
  assert.deepEqual(
    normalizeTimelineMemoryActionData({
      tableId: 'chat_summary',
      rowData: { time: '第7轮 / 备注' },
      currentTurnNumber: 0,
    }),
    { time: '第7轮' },
  );
  assert.equal(
    resolveMemoryInsertSortOrder({
      tableId: 'chat_summary',
      existingRows: [{ row_data: { time: '第2轮' } }],
      rowData: { time: '第7轮' },
    }),
    7,
  );
});

test('pickNewestMemoryRow prefers latest updated/created timestamp and later index ties', () => {
  const rows = [
    { id: 'row-1', updated_at: 100 },
    { id: 'row-2', created_at: 200 },
    { id: 'row-3', updated_at: 200 },
  ];

  assert.equal(pickNewestMemoryRow(rows)?.id, 'row-3');
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
