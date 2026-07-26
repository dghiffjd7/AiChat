import assert from 'node:assert/strict';

import {
  createAgentWritePreviewRuntimes,
  createMemoryPreviewCommitRuntime,
  createMemoryPreviewActionsRuntime,
  createVariablePreviewCommitRuntime,
  createVariablePreviewCommandsRuntime,
  createWorldbookPreviewCommitRuntime,
  createWorldbookPreviewActionsRuntime,
} from '../../src/scripts/ui/agent-write-preview-runtime-utils.js';
import {
  createMemoryActionResolvers,
} from '../../src/scripts/ui/chat/memory-table-action-utils.js';

{
  let loaded = null;
  let previewInput = null;
  const runtime = createMemoryPreviewActionsRuntime({
    memoryTableStore: { ready: true },
    memoryTemplateStore: { ready: true },
    getUiMode: () => 'rp',
    getContact: sid => ({ id: sid, isGroup: true }),
    getLastMemoryPlan: () => ({
      targetId: 'group:1',
      updateMode: 'summary',
      tableOrder: ['profile'],
      rowIndexMap: { profile: 1 },
    }),
    resolvePlanForSession: ({ rawPlan }) => ({ plan: rawPlan }),
    loadActionContext: async (input) => {
      loaded = input;
      return { templateId: 'tpl', record: { id: 'tpl' } };
    },
    buildPreview: (input) => {
      previewInput = input;
      return { changed: 1, skipped: 0 };
    },
  });

  const result = await runtime({
    sessionId: 'group:1',
    actions: [{ action: 'insert' }],
  });
  assert.deepEqual(result, { changed: 1, skipped: 0 });
  assert.equal(loaded.sessionId, 'group:1');
  assert.equal(loaded.isGroup, true);
  assert.equal(loaded.uiMode, 'rp');
  assert.deepEqual(loaded.tableOrderOverride, ['profile']);
  assert.deepEqual(loaded.rowIndexMap, { profile: 1 });
  assert.equal(previewInput.actionContext.templateId, 'tpl');
  assert.equal(previewInput.updateMode, 'summary');
  assert.equal(previewInput.isGroup, true);
  console.log('ok - memory write preview runtime loads contextual table preview state');
}

{
  const runtime = createVariablePreviewCommandsRuntime({
    chatStore: {
      listVariables: sid => ({ hp: sid === 's1' ? 10 : 0 }),
      listGlobalVariables: () => ({ mood: 'calm' }),
    },
  });
  const local = await runtime({
    sessionId: 's1',
    commands: [{ type: 'add', path: ['hp'], value: 2 }],
  });
  assert.equal(local.changed, 1);
  assert.equal(local.entries[0].key, 'hp');
  assert.equal(local.entries[0].after, 12);

  const global = await runtime({
    sessionId: 's1',
    useGlobal: true,
    commands: [{ type: 'set', path: ['mood'], value: 'tense' }],
  });
  assert.equal(global.changed, 1);
  assert.equal(global.entries[0].key, 'mood');
  assert.equal(global.entries[0].after, 'tense');
  console.log('ok - variable write preview runtime builds local and global command diffs');
}

{
  let loadedWorldId = '';
  const runtime = createWorldbookPreviewActionsRuntime({
    loadWorld: async (id) => {
      loadedWorldId = id;
      return {
        id,
        entries: [
          { id: 'e1', comment: '旧条目', content: 'before' },
        ],
      };
    },
  });
  const result = await runtime({
    worldId: 'world-1',
    actions: [{ action: 'update_entry', entryId: 'e1', patch: { content: 'after' } }],
  });
  assert.equal(loadedWorldId, 'world-1');
  assert.equal(result.changed, 1);
  assert.equal(result.updated, 1);
  assert.equal(result.entries[0].diff.after.content, 'after');
  console.log('ok - worldbook write preview runtime loads world data and builds entry diffs');
}

{
  const runtimes = createAgentWritePreviewRuntimes({
    chatStore: { listVariables: () => ({}) },
  });
  assert.equal(typeof runtimes.previewMemoryActions, 'function');
  assert.equal(typeof runtimes.previewVariableCommands, 'function');
  assert.equal(typeof runtimes.previewWorldbookActions, 'function');
  assert.equal(typeof runtimes.variableCommit.commit, 'function');
  console.log('ok - agent write preview runtime bundle exposes all preview runtimes');
}

{
  const localVars = { hp: 10, mood: 'calm' };
  const runtime = createVariablePreviewCommitRuntime({
    chatStore: {
      setVariable: (key, value) => {
        localVars[key] = value;
        return true;
      },
      deleteVariable: (key) => {
        delete localVars[key];
        return true;
      },
    },
  });
  const commit = await runtime.commit({
    args: { sessionId: 's1' },
    previewResult: {
      updates: { hp: 12, mood: undefined },
      rollbackSnapshot: { hp: 10, mood: 'calm' },
    },
  });
  assert.equal(commit.status, 'committed');
  assert.deepEqual(localVars, { hp: 12 });
  const undo = await runtime.undo({ commitResult: commit });
  assert.equal(undo.status, 'undone');
  assert.deepEqual(localVars, { hp: 10, mood: 'calm' });
  console.log('ok - variable write preview commit runtime writes changed keys and restores rollback keys');
}

{
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
  ]);
  const rowsById = new Map([['row-1', row]]);
  const rowsByTableScope = new Map([['profile:contact', [row]]]);
  const resolvers = createMemoryActionResolvers({
    tableById,
    tableOrder: ['profile'],
    rowsByTableScope,
    sessionId: 'chat:1',
    isGroup: false,
  });
  const updated = [];
  let committed = null;
  let undone = null;
  const memoryTableStore = {
    async updateMemory(payload) {
      updated.push(payload);
    },
  };
  const runtime = createMemoryPreviewCommitRuntime({
    memoryTableStore,
    memoryTemplateStore: { ready: true },
    getUiMode: () => 'chat',
    getContact: sid => ({ id: sid, isGroup: false }),
    loadActionContext: async () => ({
      templateId: 'tpl-memory',
      record: { id: 'tpl-memory' },
      tableById,
      rowsById,
      rowsByTableScope,
      ...resolvers,
    }),
    loadRollbackContext: async ({ rollback }) => ({
      templateId: 'tpl-memory',
      tables: rollback.tables.map(table => ({
        tableId: table.table_id,
        scopeFields: { contact_id: 'chat:1', group_id: null },
        currentRows: Array.from(rowsById.values()),
        snapshotRows: table.rows,
      })),
    }),
    onMemoryCommitted: commit => {
      committed = commit;
    },
    onMemoryUndone: undo => {
      undone = undo;
    },
  });
  const commit = await runtime.commit({
    args: {
      sessionId: 'chat:1',
      actions: [{ action: 'update', tableId: 'profile', rowId: 'row-1', data: { title: 'next' } }],
    },
  });
  assert.equal(commit.status, 'committed');
  assert.equal(commit.changed, 1);
  assert.deepEqual(rowsById.get('row-1')?.row_data, { title: 'next' });
  assert.deepEqual(updated[0], { id: 'row-1', row_data: { title: 'next' } });
  assert.equal(committed?.changed, 1);

  const undo = await runtime.undo({ commitResult: commit });
  assert.equal(undo.status, 'undone');
  assert.deepEqual(updated[1], {
    id: 'row-1',
    row_data: { title: 'old' },
    is_active: true,
    is_pinned: false,
    priority: 0,
    sort_order: 1,
  });
  assert.equal(undone?.changed, 1);
  console.log('ok - memory write preview commit runtime writes actions and restores rollback rows');
}

{
  const saved = [];
  let world = {
    id: 'world-2',
    entries: [{ id: 'e1', comment: '旧条目', content: 'before' }],
  };
  const runtime = createWorldbookPreviewCommitRuntime({
    loadWorld: async () => world,
    saveWorld: async (id, data) => {
      saved.push([id, data.entries.map(entry => entry.content).join('|')]);
      world = data;
      return true;
    },
  });
  const commit = await runtime.commit({
    args: {
      worldId: 'world-2',
      actions: [{ action: 'update_entry', entryId: 'e1', patch: { content: 'after' } }],
    },
  });
  assert.equal(commit.status, 'committed');
  assert.equal(world.entries[0].content, 'after');
  const undo = await runtime.undo({ commitResult: commit });
  assert.equal(undo.status, 'undone');
  assert.equal(world.entries[0].content, 'before');
  assert.deepEqual(saved, [
    ['world-2', 'after'],
    ['world-2', 'before'],
  ]);
  console.log('ok - worldbook write preview commit runtime saves next data and restores rollback snapshot');
}

{
  // 代写路径盖章：commit 落的摘要行必须带 app _coverage（轮次经 DI 解析），
  // 与主链 applyMemoryEdits 同规则，不再只有模型 time 文本兜底。
  const summaryTable = {
    id: 'chat_summary',
    name: '摘要',
    scope: 'contact',
    columns: [{ id: 'time', name: '轮次' }, { id: 'summary', name: '摘要' }],
  };
  const summaryTableById = new Map([['chat_summary', summaryTable]]);
  const summaryRowsById = new Map();
  const summaryRowsByTableScope = new Map();
  const summaryResolvers = createMemoryActionResolvers({
    tableById: summaryTableById,
    tableNameMap: new Map([['摘要', 'chat_summary']]),
    tableOrder: ['chat_summary'],
    rowIndexMap: {},
    rowsByTableScope: summaryRowsByTableScope,
    sessionId: 'chat:1',
    isGroup: false,
  });
  const createdInputs = [];
  const runtime = createMemoryPreviewCommitRuntime({
    memoryTableStore: {
      async updateMemory() {},
      async batchCreateMemories(inputs) {
        createdInputs.push(...inputs);
        return inputs.length;
      },
    },
    memoryTemplateStore: { ready: true },
    getUiMode: () => 'chat',
    getContact: sid => ({ id: sid, isGroup: false }),
    resolveCurrentTurnNumber: async () => 3,
    loadActionContext: async () => ({
      templateId: 'tpl-memory',
      record: { id: 'tpl-memory' },
      tableById: summaryTableById,
      rowsById: summaryRowsById,
      rowsByTableScope: summaryRowsByTableScope,
      allRows: [],
      ...summaryResolvers,
    }),
  });
  const commit = await runtime.commit({
    args: {
      sessionId: 'chat:1',
      actions: [{ action: 'insert', tableId: 'chat_summary', data: { summary: '本轮摘要' } }],
    },
  });
  assert.equal(commit.status, 'committed');
  assert.equal(createdInputs.length, 1);
  assert.deepEqual(createdInputs[0].row_data._coverage, { from: 3, to: 3, source: 'app' });
  assert.equal(createdInputs[0].row_data.time, '第3轮');
  console.log('ok - agent write commit stamps app coverage on summary rows via resolved turn number');
}
