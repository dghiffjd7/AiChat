import assert from 'node:assert/strict';

import {
  buildMemoryRowMergeResult,
  buildMemoryRollbackSnapshot,
  buildMemoryRollbackRestorePayload,
  buildMemoryRollbackRestorePlan,
  buildMemoryActionBatchPreview,
  buildMemoryRowBucketKey,
  buildMemoryRowsIndex,
  countAssistantTurnsForMemoryTimeline,
  countUserTurnsForMemoryTimeline,
  createMemoryActionResolvers,
  deleteNewestMatchingMemoryRow,
  executeMemoryActionBatchMutation,
  executeMemoryActionMutationPlan,
  executeMemoryRollbackRestorePlan,
  getMemoryRowScopeKey,
  normalizeTimelineMemoryActionData,
  pickNewestMemoryRow,
  queueMemoryInsert,
  restoreMemoryRowsFromRollbackSnapshot,
  resolveMemoryActionBatchPermissions,
  resolveMemoryActionMutationPlan,
  resolveMemoryActionTableContext,
  resolveMemoryActionTargetRow,
  resolveMemoryActionRowId,
  resolveMemoryActionRowIdByData,
  resolveMemoryActionTableId,
  resolveMemoryInsertSortOrder,
  resolveMemoryTableScope,
  removeMemoryRowFromIndexes,
  updateMemoryRowInIndexes,
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

test('resolveMemoryActionTableContext enforces table scope and summary gating', () => {
  const tableById = new Map([
    ['chat_summary', { id: 'chat_summary', scope: 'contact' }],
    ['group_summary', { id: 'group_summary', scope: 'group' }],
    ['profile', { id: 'profile', scope: 'contact' }],
  ]);
  const resolveScopeForTable = table =>
    table.scope === 'group'
      ? { key: 'group', contactId: null, groupId: 'group:1' }
      : { key: 'contact', contactId: 'chat:1', groupId: null };

  assert.deepEqual(
    resolveMemoryActionTableContext({
      action: { tableId: 'chat_summary' },
      resolveTableId: action => action.tableId,
      tableById,
      resolveScopeForTable,
      allowSummaryTables: true,
      allowStandardTables: false,
      isGroup: false,
    }),
    {
      tableId: 'chat_summary',
      table: { id: 'chat_summary', scope: 'contact' },
      scopeKey: 'contact',
      contactId: 'chat:1',
      groupId: null,
      isSummaryTable: true,
    },
  );

  assert.equal(
    resolveMemoryActionTableContext({
      action: { tableId: 'profile' },
      resolveTableId: action => action.tableId,
      tableById,
      resolveScopeForTable,
      allowSummaryTables: true,
      allowStandardTables: false,
      isGroup: false,
    }),
    null,
  );

  assert.equal(
    resolveMemoryActionTableContext({
      action: { tableId: 'group_summary' },
      resolveTableId: action => action.tableId,
      tableById,
      resolveScopeForTable,
      allowSummaryTables: true,
      allowStandardTables: true,
      isGroup: false,
    }),
    null,
  );
});

test('createMemoryActionResolvers wires table row scope and action context closures', () => {
  const tableById = new Map([
    ['profile', { id: 'profile', scope: 'contact', columns: [{ id: 'name' }] }],
  ]);
  const rowsByTableScope = new Map([
    ['profile:contact', [{ id: 'row-2', row_data: { name: 'Bob' } }]],
  ]);
  const resolvers = createMemoryActionResolvers({
    tableById,
    tableNameMap: new Map([['角色表', 'profile']]),
    tableOrder: ['profile'],
    rowIndexMap: { profile: ['row-1', 'row-2'] },
    rowsByTableScope,
    sessionId: 'chat:1',
    isGroup: false,
  });

  assert.equal(resolvers.resolveTableId({ tableName: '角色表' }), 'profile');
  assert.equal(resolvers.resolveRowId({ rowIndex: 1 }, 'profile'), 'row-2');
  assert.equal(
    resolvers.resolveRowIdByData('profile', 'contact', { name: 'Bob' }, tableById.get('profile')),
    'row-2',
  );
  assert.deepEqual(
    resolvers.resolveScopeForTable(tableById.get('profile')),
    { key: 'contact', contactId: 'chat:1', groupId: null },
  );
  assert.deepEqual(
    resolvers.resolveActionContext({
      action: { tableId: 'profile' },
      allowSummaryTables: false,
      allowStandardTables: true,
    }),
    {
      tableId: 'profile',
      table: { id: 'profile', scope: 'contact', columns: [{ id: 'name' }] },
      scopeKey: 'contact',
      contactId: 'chat:1',
      groupId: null,
      isSummaryTable: false,
    },
  );
});

test('getMemoryRowScopeKey resolves contact group and global ownership', () => {
  assert.equal(getMemoryRowScopeKey({ contact_id: 'c1' }), 'contact');
  assert.equal(getMemoryRowScopeKey({ group_id: 'g1' }), 'group');
  assert.equal(getMemoryRowScopeKey({}), 'global');
});

test('buildMemoryRowsIndex builds id and table/scope buckets from mixed rows', () => {
  const { rowsById, rowsByTableScope } = buildMemoryRowsIndex([
    { id: 'r1', table_id: 'chat_summary', contact_id: 'c1', row_data: { a: 1 } },
    { id: 'r2', table_id: 'chat_summary', group_id: 'g1', row_data: { b: 2 } },
    { id: 'r3', table_id: 'profile', row_data: { c: 3 } },
    { id: '', table_id: 'ignored' },
  ]);

  assert.equal(rowsById.get('r1')?.row_data?.a, 1);
  assert.equal(rowsByTableScope.get('chat_summary:contact')?.length, 1);
  assert.equal(rowsByTableScope.get('chat_summary:group')?.length, 1);
  assert.equal(rowsByTableScope.get('profile:global')?.length, 1);
});

test('queueMemoryInsert appends normalized rows and rejects duplicate or full buckets', () => {
  const createInputs = [];
  const rowsByTableScope = new Map([
    ['chat_summary:contact', [{ row_data: { title: '旧', time: '第1轮' }, sort_order: 1 }]],
  ]);

  const queued = queueMemoryInsert({
    createInputs,
    rowsByTableScope,
    templateId: 'default-v1',
    tableId: 'chat_summary',
    table: { maxRows: 3 },
    scopeKey: 'contact',
    contactId: 'chat:1',
    groupId: null,
    data: { title: '新' },
    currentTurnNumber: 4,
  });
  assert.equal(queued.queued, true);
  assert.equal(createInputs.length, 1);
  assert.deepEqual(createInputs[0], {
    template_id: 'default-v1',
    table_id: 'chat_summary',
    contact_id: 'chat:1',
    group_id: null,
    row_data: { title: '新', time: '第4轮' },
    is_active: true,
    sort_order: 4,
  });

  const duplicate = queueMemoryInsert({
    createInputs,
    rowsByTableScope,
    templateId: 'default-v1',
    tableId: 'chat_summary',
    table: { maxRows: 3 },
    scopeKey: 'contact',
    contactId: 'chat:1',
    groupId: null,
    data: { title: '新' },
    currentTurnNumber: 4,
  });
  assert.equal(duplicate.queued, false);
  assert.equal(duplicate.reason, 'duplicate');

  const full = queueMemoryInsert({
    createInputs: [],
    rowsByTableScope: new Map([
      ['profile:contact', [{ row_data: { name: 'a' } }]],
    ]),
    templateId: 'default-v1',
    tableId: 'profile',
    table: { maxRows: 1 },
    scopeKey: 'contact',
    contactId: 'chat:1',
    groupId: null,
    data: { name: 'b' },
    currentTurnNumber: 0,
  });
  assert.equal(full.queued, false);
  assert.equal(full.reason, 'maxRows');
});

test('resolveMemoryActionTargetRow resolves row fallback and reports validation failures', () => {
  const rowsById = new Map([
    ['row-1', { id: 'row-1', table_id: 'profile', row_data: { name: 'Alice' } }],
    ['row-2', { id: 'row-2', table_id: 'profile', row_data: { name: 'Bob' }, is_pinned: true }],
  ]);
  const rowsByTableScope = new Map([
    ['profile:contact', [{ id: 'row-1', row_data: { name: 'Alice' } }]],
  ]);
  const actionContext = {
    tableId: 'profile',
    scopeKey: 'contact',
    table: { columns: [{ id: 'name' }] },
  };

  assert.deepEqual(
    resolveMemoryActionTargetRow({
      action: { rowId: 'row-1' },
      actionContext,
      resolveRowId: action => action.rowId,
      resolveRowIdByData: () => '',
      rowsById,
      rowsByTableScope,
    }),
    {
      rowId: 'row-1',
      row: { id: 'row-1', table_id: 'profile', row_data: { name: 'Alice' } },
      reason: 'ok',
      hasRowsInBucket: true,
    },
  );

  assert.equal(
    resolveMemoryActionTargetRow({
      action: { data: { name: 'Alice' } },
      actionContext,
      data: { name: 'Alice' },
      resolveRowId: () => '',
      resolveRowIdByData: () => 'row-1',
      rowsById,
      rowsByTableScope,
    }).rowId,
    'row-1',
  );

  assert.equal(
    resolveMemoryActionTargetRow({
      action: { rowId: 'row-2' },
      actionContext,
      resolveRowId: action => action.rowId,
      resolveRowIdByData: () => '',
      rowsById,
      rowsByTableScope,
    }).reason,
    'pinned',
  );

  assert.deepEqual(
    resolveMemoryActionTargetRow({
      action: {},
      actionContext,
      data: { name: 'Nobody' },
      resolveRowId: () => '',
      resolveRowIdByData: () => '',
      rowsById,
      rowsByTableScope: new Map(),
    }),
    {
      rowId: '',
      row: null,
      reason: 'missingRowId',
      hasRowsInBucket: false,
      countKey: 'profile:contact',
    },
  );
});

test('buildMemoryRowMergeResult updateMemoryRowInIndexes and removeMemoryRowFromIndexes update row state helpers', () => {
  assert.deepEqual(
    buildMemoryRowMergeResult({
      row: { row_data: { name: 'Alice', title: 'A' } },
      data: { title: 'B' },
    }),
    {
      changed: true,
      merged: { name: 'Alice', title: 'B' },
    },
  );
  assert.equal(
    buildMemoryRowMergeResult({
      row: { row_data: { title: 'A' } },
      data: { title: 'A' },
    }).changed,
    false,
  );

  const rowsById = new Map([
    ['row-1', { id: 'row-1', table_id: 'profile', contact_id: 'chat:1', row_data: { title: 'A' } }],
  ]);
  const rowsByTableScope = new Map([
    ['profile:contact', [{ id: 'row-1', table_id: 'profile', contact_id: 'chat:1', row_data: { title: 'A' } }]],
  ]);
  const updatedRow = updateMemoryRowInIndexes({
    rowsById,
    rowsByTableScope,
    rowId: 'row-1',
    row: { id: 'row-1', table_id: 'profile', contact_id: 'chat:1', row_data: { title: 'A' } },
    rowData: { title: 'B' },
  });
  assert.deepEqual(updatedRow?.row_data, { title: 'B' });
  assert.deepEqual(rowsById.get('row-1')?.row_data, { title: 'B' });
  assert.deepEqual(rowsByTableScope.get('profile:contact')?.[0]?.row_data, { title: 'B' });
  assert.equal(
    removeMemoryRowFromIndexes({
      rowsById,
      rowsByTableScope,
      rowId: 'row-1',
      row: updatedRow,
    }),
    true,
  );
  assert.equal(rowsById.has('row-1'), false);
  assert.deepEqual(rowsByTableScope.get('profile:contact'), []);
});

test('resolveMemoryActionMutationPlan normalizes insert update delete and skip decisions', () => {
  const rowsById = new Map([
    ['row-1', { id: 'row-1', table_id: 'profile', row_data: { title: 'old' } }],
  ]);
  const rowsByTableScope = new Map([
    ['profile:contact', [{ id: 'row-1', table_id: 'profile', row_data: { title: 'old' } }]],
  ]);
  const actionContext = {
    tableId: 'profile',
    table: { columns: [{ id: 'title' }] },
    scopeKey: 'contact',
    contactId: 'chat:1',
    groupId: null,
    isSummaryTable: false,
  };

  assert.deepEqual(
    resolveMemoryActionMutationPlan({
      action: { action: 'insert' },
      actionContext,
      data: { title: 'new' },
      rowsByTableScope,
    }),
    {
      kind: 'queueInsert',
      tableId: 'profile',
      table: { columns: [{ id: 'title' }] },
      scopeKey: 'contact',
      contactId: 'chat:1',
      groupId: null,
      data: { title: 'new' },
      allowDuplicate: false,
    },
  );

  const updatePlan = resolveMemoryActionMutationPlan({
    action: { action: 'update', rowId: 'row-1' },
    actionContext,
    data: { title: 'next' },
    rowsByTableScope,
    resolveRowId: action => action.rowId,
    resolveRowIdByData: () => '',
    rowsById,
  });
  assert.equal(updatePlan.kind, 'updateRow');
  assert.equal(updatePlan.rowId, 'row-1');
  assert.deepEqual(updatePlan.merged, { title: 'next' });

  const deletePlan = resolveMemoryActionMutationPlan({
    action: { action: 'delete', rowId: 'row-1' },
    actionContext,
    data: {},
    rowsByTableScope,
    resolveRowId: action => action.rowId,
    resolveRowIdByData: () => '',
    rowsById,
  });
  assert.equal(deletePlan.kind, 'deleteRow');
  assert.equal(deletePlan.rowId, 'row-1');

  assert.deepEqual(
    resolveMemoryActionMutationPlan({
      action: { action: 'init' },
      actionContext,
      data: { title: 'new' },
      rowsByTableScope,
    }),
    { kind: 'skip', reason: 'initExistingRows' },
  );
});

test('executeMemoryActionMutationPlan applies queue update delete and skip counters', async () => {
  const createInputs = [];
  const rowsById = new Map([
    ['row-1', { id: 'row-1', table_id: 'profile', contact_id: 'chat:1', row_data: { title: 'old' } }],
  ]);
  const rowsByTableScope = new Map([
    ['profile:contact', [{ id: 'row-1', table_id: 'profile', contact_id: 'chat:1', row_data: { title: 'old' } }]],
  ]);
  const memoryTableStore = {
    updated: [],
    deleted: [],
    async updateMemory(payload) {
      this.updated.push(payload);
    },
    async deleteMemory(id) {
      this.deleted.push(id);
    },
  };

  assert.deepEqual(
    await executeMemoryActionMutationPlan({
      plan: {
        kind: 'queueInsert',
        tableId: 'profile',
        table: { maxRows: 2 },
        scopeKey: 'contact',
        contactId: 'chat:1',
        groupId: null,
        data: { title: 'new' },
        allowDuplicate: false,
      },
      memoryTableStore,
      createInputs,
      rowsById,
      rowsByTableScope,
      templateId: 'default-v1',
      currentTurnNumber: 0,
    }),
    { inserted: 0, updated: 0, deleted: 0, skipped: 0 },
  );
  assert.equal(createInputs.length, 1);

  assert.deepEqual(
    await executeMemoryActionMutationPlan({
      plan: {
        kind: 'updateRow',
        rowId: 'row-1',
        row: rowsById.get('row-1'),
        merged: { title: 'next' },
      },
      memoryTableStore,
      createInputs,
      rowsById,
      rowsByTableScope,
    }),
    { inserted: 0, updated: 1, deleted: 0, skipped: 0 },
  );
  assert.deepEqual(memoryTableStore.updated, [{ id: 'row-1', row_data: { title: 'next' } }]);
  assert.deepEqual(rowsByTableScope.get('profile:contact')?.[0]?.row_data, { title: 'next' });

  assert.deepEqual(
    await executeMemoryActionMutationPlan({
      plan: {
        kind: 'deleteRow',
        rowId: 'row-1',
        row: rowsById.get('row-1'),
      },
      memoryTableStore,
      createInputs,
      rowsById,
      rowsByTableScope,
    }),
    { inserted: 0, updated: 0, deleted: 1, skipped: 0 },
  );
  assert.deepEqual(memoryTableStore.deleted, ['row-1']);
  assert.equal(rowsById.has('row-1'), false);

  assert.deepEqual(
    await executeMemoryActionMutationPlan({
      plan: { kind: 'skip', reason: 'unsupportedAction' },
      memoryTableStore,
      createInputs,
      rowsById,
      rowsByTableScope,
    }),
    { inserted: 0, updated: 0, deleted: 0, skipped: 1 },
  );
});

test('resolveMemoryActionBatchPermissions normalizes update-mode table gates', () => {
  assert.deepEqual(resolveMemoryActionBatchPermissions('summary-only'), {
    updateMode: 'summary',
    allowSummaryTables: true,
    allowStandardTables: false,
  });
  assert.deepEqual(resolveMemoryActionBatchPermissions('standard_only'), {
    updateMode: 'standard',
    allowSummaryTables: false,
    allowStandardTables: true,
  });
  assert.deepEqual(resolveMemoryActionBatchPermissions('unified'), {
    updateMode: 'full',
    allowSummaryTables: true,
    allowStandardTables: true,
  });
});

test('executeMemoryActionBatchMutation applies actions, queues inserts, and snapshots rollback scope', async () => {
  const row = {
    id: 'row-1',
    template_id: 'tpl-memory',
    table_id: 'profile',
    contact_id: 'chat:1',
    group_id: null,
    row_data: { title: 'old' },
    is_active: true,
    is_pinned: false,
    priority: 0,
    sort_order: 1,
  };
  const tableById = new Map([
    ['profile', {
      id: 'profile',
      scope: 'contact',
      maxRows: 3,
      columns: [{ id: 'title', name: '标题' }],
    }],
    ['chat_summary', {
      id: 'chat_summary',
      scope: 'contact',
      maxRows: 3,
      columns: [{ id: 'summary', name: '摘要' }],
    }],
  ]);
  const rowsById = new Map([['row-1', row]]);
  const rowsByTableScope = new Map([
    ['profile:contact', [row]],
    ['chat_summary:contact', []],
  ]);
  const resolvers = createMemoryActionResolvers({
    tableById,
    tableOrder: ['profile', 'chat_summary'],
    rowsByTableScope,
    sessionId: 'chat:1',
    isGroup: false,
  });
  const updated = [];
  const created = [];
  const memoryTableStore = {
    async updateMemory(payload) {
      updated.push(payload);
    },
  };

  const result = await executeMemoryActionBatchMutation({
    actions: [
      { action: 'update', tableId: 'profile', rowId: 'row-1', data: { title: 'next' } },
      { action: 'insert', tableId: 'profile', data: { title: 'fresh' } },
      { action: 'insert', tableId: 'chat_summary', data: { summary: 'should skip' } },
    ],
    actionContext: {
      templateId: 'tpl-memory',
      tableById,
      rowsById,
      rowsByTableScope,
      ...resolvers,
    },
    updateMode: 'standard',
    memoryTableStore,
    createMemories: async (inputs) => {
      created.push(...inputs);
      return inputs.length;
    },
    currentTurnNumber: 5,
    isGroup: false,
  });

  assert.equal(result.inserted, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.deleted, 0);
  assert.equal(result.skipped, 1);
  assert.equal(result.changed, 2);
  assert.deepEqual(updated, [{ id: 'row-1', row_data: { title: 'next' } }]);
  assert.deepEqual(rowsById.get('row-1')?.row_data, { title: 'next' });
  assert.equal(created.length, 1);
  const { sort_order: createdSortOrder, ...createdPayload } = created[0];
  assert.equal(Number.isFinite(Number(createdSortOrder)), true);
  assert.deepEqual(createdPayload, {
    template_id: 'tpl-memory',
    table_id: 'profile',
    contact_id: 'chat:1',
    group_id: null,
    row_data: { title: 'fresh' },
    is_active: true,
  });
  assert.deepEqual(result.rollbackSnapshot, {
    tables: [{
      table_id: 'profile',
      scope: 'contact',
      rows: [{
        id: 'row-1',
        table_id: 'profile',
        template_id: 'tpl-memory',
        contact_id: 'chat:1',
        group_id: null,
        row_data: { title: 'old' },
        is_active: true,
        is_pinned: false,
        priority: 0,
        sort_order: 1,
      }],
    }],
  });
});

test('buildMemoryActionBatchPreview returns diff and rollback data without mutating indexes', () => {
  const row = {
    id: 'row-1',
    template_id: 'tpl-memory',
    table_id: 'profile',
    contact_id: 'chat:1',
    group_id: null,
    row_data: { title: 'old' },
    is_active: true,
    is_pinned: false,
    priority: 0,
    sort_order: 1,
  };
  const tableById = new Map([
    ['profile', {
      id: 'profile',
      scope: 'contact',
      maxRows: 3,
      columns: [{ id: 'title', name: '标题' }],
    }],
    ['chat_summary', {
      id: 'chat_summary',
      scope: 'contact',
      maxRows: 3,
      columns: [{ id: 'summary', name: '摘要' }],
    }],
  ]);
  const rowsById = new Map([['row-1', row]]);
  const rowsByTableScope = new Map([
    ['profile:contact', [row]],
    ['chat_summary:contact', []],
  ]);
  const resolvers = createMemoryActionResolvers({
    tableById,
    tableOrder: ['profile', 'chat_summary'],
    rowsByTableScope,
    sessionId: 'chat:1',
    isGroup: false,
  });
  const preview = buildMemoryActionBatchPreview({
    actions: [
      { action: 'update', tableId: 'profile', rowId: 'row-1', data: { title: 'next' } },
      { action: 'insert', tableId: 'profile', data: { title: 'fresh' } },
      { action: 'insert', tableId: 'chat_summary', data: { summary: 'skip summary' } },
    ],
    actionContext: {
      templateId: 'tpl-memory',
      tableById,
      rowsById,
      rowsByTableScope,
      ...resolvers,
    },
    updateMode: 'standard',
    currentTurnNumber: 5,
    isGroup: false,
  });

  assert.equal(preview.inserted, 1);
  assert.equal(preview.updated, 1);
  assert.equal(preview.deleted, 0);
  assert.equal(preview.skipped, 1);
  assert.equal(preview.changed, 2);
  assert.deepEqual(preview.entries.map(entry => entry.kind), ['update', 'insert', 'skip']);
  assert.deepEqual(preview.entries[0].diff, {
    before: { title: 'old' },
    after: { title: 'next' },
  });
  assert.deepEqual(preview.entries[1].diff, {
    before: null,
    after: { title: 'fresh' },
  });
  assert.equal(preview.entries[2].reason, 'invalidContext');
  assert.equal(preview.createInputs.length, 1);
  assert.equal(rowsById.get('row-1')?.row_data.title, 'old');
  assert.equal(rowsByTableScope.get('profile:contact').length, 1);
  assert.deepEqual(preview.rollbackSnapshot.tables[0].rows[0].row_data, { title: 'old' });
});

test('buildMemoryRowBucketKey normalizes table and scope identifiers', () => {
  assert.equal(buildMemoryRowBucketKey(' chat_summary ', ' contact '), 'chat_summary:contact');
});

test('buildMemoryRollbackSnapshot serializes unique eligible table/scope buckets', () => {
  const snapshot = buildMemoryRollbackSnapshot({
    actions: [
      { tableId: 'chat_summary' },
      { tableId: 'chat_summary' },
      { tableId: 'profile' },
      { tableId: 'group_only' },
    ],
    templateId: 'default-v1',
    resolveTableId: action => String(action?.tableId || ''),
    tableById: new Map([
      ['chat_summary', { id: 'chat_summary', scope: 'contact' }],
      ['profile', { id: 'profile', scope: 'contact' }],
      ['group_only', { id: 'group_only', scope: 'group' }],
    ]),
    resolveScopeForTable: table => (
      table.id === 'chat_summary'
        ? { key: 'contact' }
        : table.id === 'profile'
          ? { key: 'contact' }
          : { key: 'group' }
    ),
    rowsByTableScope: new Map([
      ['chat_summary:contact', [
        { id: 'r1', table_id: 'chat_summary', row_data: { a: 1 }, is_active: true },
      ]],
      ['profile:contact', [
        { id: 'r2', table_id: 'profile', row_data: { b: 2 }, priority: 3 },
      ]],
      ['group_only:group', [
        { id: 'r3', table_id: 'group_only', row_data: { c: 3 } },
      ]],
    ]),
    allowSummaryTables: true,
    allowStandardTables: true,
    isGroup: false,
  });

  assert.deepEqual(snapshot, {
    tables: [
      {
        table_id: 'chat_summary',
        scope: 'contact',
        rows: [{
          id: 'r1',
          table_id: 'chat_summary',
          template_id: 'default-v1',
          contact_id: null,
          group_id: null,
          row_data: { a: 1 },
          is_active: true,
          is_pinned: false,
          priority: 0,
          sort_order: 0,
        }],
      },
      {
        table_id: 'profile',
        scope: 'contact',
        rows: [{
          id: 'r2',
          table_id: 'profile',
          template_id: 'default-v1',
          contact_id: null,
          group_id: null,
          row_data: { b: 2 },
          is_active: false,
          is_pinned: false,
          priority: 3,
          sort_order: 0,
        }],
      },
    ],
  });
});

test('buildMemoryRollbackRestorePayload normalizes row flags and numeric fields', () => {
  assert.deepEqual(
    buildMemoryRollbackRestorePayload({
      row: { row_data: { a: 1 }, is_active: 1, is_pinned: 0, priority: '3', sort_order: '7' },
    }),
    {
      row_data: { a: 1 },
      is_active: true,
      is_pinned: false,
      priority: 3,
      sort_order: 7,
    },
  );
});

test('buildMemoryRollbackRestorePlan computes delete update create operations', () => {
  const plan = buildMemoryRollbackRestorePlan({
    templateId: 'default-v1',
    tableId: 'chat_summary',
    scopeFields: { contact_id: 'chat:1', group_id: null },
    currentRows: [
      { id: 'keep-update', row_data: { a: 1 }, is_active: true, is_pinned: false, priority: 0, sort_order: 0 },
      { id: 'delete-me', row_data: { b: 2 }, is_active: true, is_pinned: false, priority: 0, sort_order: 0 },
      { id: 'keep-same', row_data: { c: 3 }, is_active: false, is_pinned: true, priority: 4, sort_order: 5 },
    ],
    snapshotRows: [
      { id: 'keep-update', row_data: { a: 9 }, is_active: false, is_pinned: true, priority: 1, sort_order: 2 },
      { id: 'keep-same', row_data: { c: 3 }, is_active: false, is_pinned: true, priority: 4, sort_order: 5 },
      { id: 'create-me', row_data: { d: 4 }, is_active: true, is_pinned: false, priority: 0, sort_order: 8 },
    ],
  });

  assert.deepEqual(plan, {
    deleteIds: ['delete-me'],
    updateOps: [
      {
        id: 'keep-update',
        row_data: { a: 9 },
        is_active: false,
        is_pinned: true,
        priority: 1,
        sort_order: 2,
      },
    ],
    createOps: [
      {
        template_id: 'default-v1',
        table_id: 'chat_summary',
        contact_id: 'chat:1',
        group_id: null,
        row_data: { d: 4 },
        is_active: true,
        is_pinned: false,
        priority: 0,
        sort_order: 8,
      },
    ],
  });
});

test('deleteNewestMatchingMemoryRow removes the latest matching row for a table', async () => {
  const deleted = [];
  const memoryTableStore = {
    async deleteMemory(id) {
      deleted.push(id);
    },
  };
  const currentRows = [
    { id: 'row-1', table_id: 'profile', row_data: { name: 'Alice' }, created_at: 1 },
    { id: 'row-2', table_id: 'profile', row_data: { name: 'Alice' }, updated_at: 2 },
    { id: 'row-3', table_id: 'other', row_data: { name: 'Alice' }, updated_at: 3 },
  ];

  assert.equal(
    await deleteNewestMatchingMemoryRow({
      memoryTableStore,
      currentRows,
      tableId: 'profile',
      data: { name: 'Alice' },
    }),
    1,
  );
  assert.deepEqual(deleted, ['row-2']);
  assert.equal(
    await deleteNewestMatchingMemoryRow({
      memoryTableStore,
      currentRows,
      tableId: 'profile',
      data: { name: 'Bob' },
    }),
    0,
  );
});

test('executeMemoryRollbackRestorePlan and restoreMemoryRowsFromRollbackSnapshot apply rollback writes', async () => {
  const deleted = [];
  const updated = [];
  const created = [];
  const memoryTableStore = {
    async deleteMemory(id) {
      deleted.push(id);
    },
    async updateMemory(payload) {
      updated.push(payload);
    },
    async createMemory(payload) {
      created.push(payload);
    },
  };

  assert.equal(
    await executeMemoryRollbackRestorePlan({
      memoryTableStore,
      plan: {
        deleteIds: ['row-1'],
        updateOps: [{ id: 'row-2', row_data: { name: 'next' } }],
        createOps: [{ id: 'row-3', row_data: { name: 'new' } }],
      },
    }),
    3,
  );
  assert.deepEqual(deleted, ['row-1']);
  assert.deepEqual(updated, [{ id: 'row-2', row_data: { name: 'next' } }]);
  assert.deepEqual(created, [{ id: 'row-3', row_data: { name: 'new' } }]);

  deleted.length = 0;
  updated.length = 0;
  created.length = 0;

  assert.equal(
    await restoreMemoryRowsFromRollbackSnapshot({
      memoryTableStore,
      templateId: 'default-v1',
      tableId: 'profile',
      scopeFields: { contact_id: 'chat:1', group_id: null },
      currentRows: [
        { id: 'row-1', table_id: 'profile', row_data: { name: 'old' }, is_active: true },
      ],
      snapshotRows: [
        { id: 'row-1', table_id: 'profile', row_data: { name: 'restored' }, is_active: true },
        { id: 'row-2', table_id: 'profile', row_data: { name: 'fresh' }, is_active: true },
      ],
    }),
    2,
  );
  assert.deepEqual(updated, [{
    id: 'row-1',
    row_data: { name: 'restored' },
    is_active: true,
    is_pinned: false,
    priority: 0,
    sort_order: 0,
  }]);
  assert.deepEqual(created, [{
    template_id: 'default-v1',
    table_id: 'profile',
    contact_id: 'chat:1',
    group_id: null,
    row_data: { name: 'fresh' },
    is_active: true,
    is_pinned: false,
    priority: 0,
    sort_order: 0,
  }]);
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

test('countUserTurnsForMemoryTimeline ignores assistant-generated user messages', () => {
  assert.equal(
    countUserTurnsForMemoryTimeline([
      { role: 'user', content: '用户1' },
      { role: 'assistant', content: '助手1' },
      { role: 'user', meta: { generatedByAssistant: true }, content: '旁白生成' },
      { role: 'user', content: '用户2' },
      { role: 'assistant', content: '助手2' },
    ]),
    2,
  );
});

test('normalizeTimelineMemoryActionData and resolveMemoryInsertSortOrder use canonical timeline rounds', () => {
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
  assert.deepEqual(
    normalizeTimelineMemoryActionData({
      tableId: 'group_summary',
      rowData: { summary: 'new', time: '第640轮' },
      currentTurnNumber: 324,
    }),
    { summary: 'new', time: '第324轮' },
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

test('executeMemoryActionMutationPlan keeps timeline update sort_order aligned', async () => {
  const rowsById = new Map([
    ['row-1', {
      id: 'row-1',
      table_id: 'chat_summary',
      contact_id: 'chat:1',
      row_data: { summary: 'old', time: '第1轮' },
      sort_order: 1,
    }],
  ]);
  const rowsByTableScope = new Map([
    ['chat_summary:contact', [rowsById.get('row-1')]],
  ]);
  const updated = [];
  const memoryTableStore = {
    async updateMemory(payload) {
      updated.push(payload);
    },
  };

  assert.deepEqual(
    await executeMemoryActionMutationPlan({
      plan: {
        kind: 'updateRow',
        tableId: 'chat_summary',
        rowId: 'row-1',
        row: rowsById.get('row-1'),
        merged: { summary: 'next', time: '第99轮' },
      },
      memoryTableStore,
      rowsById,
      rowsByTableScope,
      currentTurnNumber: 4,
    }),
    { inserted: 0, updated: 1, deleted: 0, skipped: 0 },
  );
  assert.deepEqual(updated, [{
    id: 'row-1',
    row_data: { summary: 'next', time: '第4轮' },
    sort_order: 4,
  }]);
  assert.deepEqual(rowsById.get('row-1')?.row_data, { summary: 'next', time: '第4轮' });
  assert.equal(rowsById.get('row-1')?.sort_order, 4);
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
