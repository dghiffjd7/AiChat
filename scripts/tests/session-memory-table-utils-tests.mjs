import assert from 'node:assert/strict';

import {
  applyMemoryTableSnapshot,
  buildMemoryTableSnapshot,
  loadSessionMemoryActionContext,
  loadSessionMemoryRollbackSnapshotContext,
  resolveDefaultMemoryTemplateDefinition,
  resolveDefaultMemoryTemplateId,
  resolveDefaultMemoryTemplateRecordAndDefinition,
  buildMemoryTemplateTableMaps,
  resolveSessionMemoryTemplateContext,
  resolveSessionMemoryTemplateContextSafe,
} from '../../src/scripts/ui/session-memory-table-utils.js';

{
  const calls = [];
  const result = await resolveDefaultMemoryTemplateId({
    memoryTemplateStore: {
      getTemplates: async (query) => {
        calls.push(query);
        if (query?.is_default) return [];
        if (query?.id === 'default-v1') return [{ id: 'default-v1' }];
        return [];
      },
    },
  });
  assert.equal(result, 'default-v1');
  assert.deepEqual(calls, [{ is_default: true }, { id: 'default-v1' }]);
  console.log('ok - resolveDefaultMemoryTemplateId falls back to default-v1 lookup');
}

{
  const result = await resolveDefaultMemoryTemplateDefinition({
    memoryTemplateStore: {
      getTemplates: async () => [{ id: 'default-v1', schema: { title: 'schema' } }],
    },
  });
  assert.deepEqual(result, { title: 'schema' });
  console.log('ok - resolveDefaultMemoryTemplateDefinition returns schema when template definition helper is absent');
}

{
  const result = await resolveDefaultMemoryTemplateRecordAndDefinition({
    memoryTemplateStore: {
      getTemplates: async () => [{ id: 'default-v1', schema: { title: 'schema' } }],
      toTemplateDefinition: (record) => ({ title: record.schema.title, via: 'helper' }),
    },
  });
  assert.deepEqual(result, {
    record: { id: 'default-v1', schema: { title: 'schema' } },
    template: { title: 'schema', via: 'helper' },
  });
  console.log('ok - resolveDefaultMemoryTemplateRecordAndDefinition returns record and converted template');
}

{
  const maps = buildMemoryTemplateTableMaps({
    tables: [
      { id: 'global_chat', name: 'Global Chat', scope: 'global', usage: 'chat' },
      { id: 'group_all', name: 'Group All', scope: 'group', usage: 'all' },
      { id: 'contact_rp', name: 'Contact RP', scope: 'contact', usage: 'rp' },
    ],
  }, {
    sessionId: 'group:1',
    isGroup: true,
    uiMode: 'chat',
  });
  assert.deepEqual([...maps.tableById.keys()], ['global_chat', 'group_all']);
  assert.equal(maps.tableNameMap.get('global chat'), 'global_chat');
  assert.deepEqual(maps.tableOrder, ['global_chat', 'group_all']);
  console.log('ok - buildMemoryTemplateTableMaps filters tables by memory context and preserves order');
}

{
  const context = await resolveSessionMemoryTemplateContext({
    memoryTemplateStore: {
      getTemplates: async () => [{
        id: 'default-v1',
        schema: {
          tables: [
            { id: 'global_chat', name: 'Global Chat', scope: 'global', usage: 'chat' },
            { id: 'group_all', name: 'Group All', scope: 'group', usage: 'all' },
            { id: 'contact_rp', name: 'Contact RP', scope: 'contact', usage: 'rp' },
          ],
        },
      }],
    },
    sessionId: 'group:1',
    isGroup: true,
    uiMode: 'chat',
  });
  assert.equal(context?.templateId, 'default-v1');
  assert.equal(context?.contextType, 'group');
  assert.equal(context?.sessionMode, 'chat');
  assert.deepEqual([...context.tableById.keys()], ['global_chat', 'group_all']);
  console.log('ok - resolveSessionMemoryTemplateContext resolves filtered table maps and session metadata');
}

{
  const context = await resolveSessionMemoryTemplateContextSafe({
    memoryTemplateStore: {
      getTemplates: async () => {
        throw new Error('boom');
      },
    },
  });
  assert.equal(context, null);
  console.log('ok - resolveSessionMemoryTemplateContextSafe returns null on store failures');
}

{
  const context = await loadSessionMemoryActionContext({
    memoryTemplateStore: {
      getTemplates: async () => [{
        id: 'default-v1',
        schema: {
          tables: [
            { id: 'profile', name: '角色表', scope: 'contact', usage: 'all', columns: [{ id: 'name' }] },
            { id: 'global_notes', name: '全局', scope: 'global', usage: 'all', columns: [{ id: 'note' }] },
          ],
        },
      }],
    },
    memoryTableStore: {
      getMemories: async (query) => {
        if (query.scope === 'contact') {
          return [{ id: 'row-1', table_id: 'profile', contact_id: 'chat:1', row_data: { name: 'Alice' } }];
        }
        if (query.scope === 'global') {
          return [{ id: 'row-2', table_id: 'global_notes', row_data: { note: 'Global' } }];
        }
        return [];
      },
    },
    sessionId: 'chat:1',
    isGroup: false,
    uiMode: 'chat',
    tableOrderOverride: ['profile', 'global_notes'],
    rowIndexMap: { profile: ['row-1'] },
  });
  assert.equal(context?.templateId, 'default-v1');
  assert.deepEqual(context?.tableOrder, ['profile', 'global_notes']);
  assert.equal(context?.rowsById.get('row-1')?.row_data?.name, 'Alice');
  assert.equal(context?.rowsByTableScope.get('profile:contact')?.length, 1);
  assert.equal(context?.rowsByTableScope.get('global_notes:global')?.length, 1);
  assert.equal(context?.resolveTableId({ tableName: '角色表' }), 'profile');
  assert.equal(context?.resolveRowId({ rowIndex: 0 }, 'profile'), 'row-1');
  assert.deepEqual(
    context?.resolveActionContext({ action: { tableId: 'profile' } }),
    {
      tableId: 'profile',
      table: { id: 'profile', name: '角色表', scope: 'contact', usage: 'all', columns: [{ id: 'name' }] },
      scopeKey: 'contact',
      contactId: 'chat:1',
      groupId: null,
      isSummaryTable: false,
    },
  );
  console.log('ok - loadSessionMemoryActionContext builds shared rows indexes and resolver context');
}

{
  const context = await loadSessionMemoryRollbackSnapshotContext({
    memoryTemplateStore: {
      getTemplates: async () => [{
        id: 'default-v1',
        schema: { tables: [{ id: 'profile', name: '角色表', scope: 'contact', usage: 'all' }] },
      }],
    },
    memoryTableStore: {
      getMemories: async (query) => {
        if (query.scope === 'contact') {
          return [
            { id: 'row-1', table_id: 'profile', contact_id: 'chat:1', row_data: { name: 'Alice' } },
            { id: 'row-2', table_id: 'other', contact_id: 'chat:1', row_data: { note: 'skip' } },
          ];
        }
        return [];
      },
    },
    sessionId: 'chat:1',
    isGroup: false,
    uiMode: 'chat',
    rollback: {
      tables: [
        { table_id: 'profile', scope: 'contact', rows: [{ id: 'row-1', row_data: { name: 'Restored' } }] },
      ],
    },
  });
  assert.equal(context?.templateId, 'default-v1');
  assert.equal(context?.tables?.length, 1);
  assert.deepEqual(context?.tables?.[0], {
    tableId: 'profile',
    scopeKey: 'contact',
    scopeFields: { contact_id: 'chat:1', group_id: null },
    currentRows: [
      { id: 'row-1', table_id: 'profile', contact_id: 'chat:1', row_data: { name: 'Alice' } },
    ],
    snapshotRows: [{ id: 'row-1', row_data: { name: 'Restored' } }],
  });
  console.log('ok - loadSessionMemoryRollbackSnapshotContext prepares rollback table contexts');
}

{
  const calls = [];
  const result = await buildMemoryTableSnapshot({
    sessionId: 'chat:1',
    isGroup: false,
    memoryTableStore: {
      getMemories: async (query) => {
        calls.push(query);
        return [
          { id: '2', table_id: 'chat_outline', sort_order: 2, row_data: { b: 2 }, is_pinned: true },
          { id: '1', table_id: 'chat_summary', sort_order: 1, row_data: { a: 1 }, priority: 3 },
        ];
      },
    },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
  });
  assert.deepEqual(calls, [{
    scope: 'contact',
    group_id: undefined,
    contact_id: 'chat:1',
    template_id: 'default-v1',
  }]);
  assert.equal(result?.templateId, 'default-v1');
  assert.deepEqual(result?.rows, [
    {
      id: '2',
      table_id: 'chat_outline',
      row_data: { b: 2 },
      is_active: true,
      is_pinned: true,
      priority: 0,
      sort_order: 2,
    },
    {
      id: '1',
      table_id: 'chat_summary',
      row_data: { a: 1 },
      is_active: true,
      is_pinned: false,
      priority: 3,
      sort_order: 1,
    },
  ]);
  console.log('ok - buildMemoryTableSnapshot normalizes and sorts memory table rows');
}

{
  const calls = [];
  const result = await applyMemoryTableSnapshot({
    sessionId: 'group:1',
    isGroup: true,
    snapshot: {
      templateId: 'default-v1',
      rows: [
        { id: 'r2', table_id: 'group_outline', row_data: { b: 2 }, sort_order: 2 },
        { id: 'r1', table_id: 'group_summary', row_data: { a: 1 }, sort_order: 1, is_pinned: true },
      ],
    },
    memoryTableStore: {
      getMemories: async (query) => {
        calls.push(['get', query]);
        return [{ id: 'old-1' }, { id: 'old-2' }];
      },
      batchDeleteMemories: async (ids) => calls.push(['delete', ids]),
      batchCreateMemories: async (inputs) => calls.push(['create', inputs]),
    },
    notifyRowsUpdated: (detail) => calls.push(['notify', detail]),
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['get', {
      scope: 'group',
      group_id: 'group:1',
      contact_id: undefined,
      template_id: 'default-v1',
    }],
    ['delete', ['old-1', 'old-2']],
    ['create', [
      {
        id: 'r2',
        template_id: 'default-v1',
        table_id: 'group_outline',
        contact_id: null,
        group_id: 'group:1',
        row_data: { b: 2 },
        is_active: true,
        is_pinned: false,
        priority: 0,
        sort_order: 2,
      },
      {
        id: 'r1',
        template_id: 'default-v1',
        table_id: 'group_summary',
        contact_id: null,
        group_id: 'group:1',
        row_data: { a: 1 },
        is_active: true,
        is_pinned: true,
        priority: 0,
        sort_order: 1,
      },
    ]],
    ['notify', { sessionId: 'group:1', templateId: 'default-v1' }],
  ]);
  console.log('ok - applyMemoryTableSnapshot replaces scoped rows and emits update notification');
}
