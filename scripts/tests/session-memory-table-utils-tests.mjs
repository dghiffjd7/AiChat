import assert from 'node:assert/strict';

import {
  applyMemoryTableSnapshot,
  buildMemoryTableSnapshot,
  resolveDefaultMemoryTemplateDefinition,
  resolveDefaultMemoryTemplateId,
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
