import assert from 'node:assert/strict';

import { extractTableEditBlocks } from '../../src/scripts/memory/memory-edit-parser.js';
import { createDebugTraceTimeline } from '../../src/scripts/ui/debug-trace-timeline-utils.js';
import {
  executeMemoryActionBatchMutation,
  restoreMemoryRowsFromRollbackSnapshot,
} from '../../src/scripts/ui/chat/memory-table-action-utils.js';
import { handleMemoryEditsFromRawWithUi } from '../../src/scripts/ui/chat/memory-update-runtime-utils.js';
import {
  loadSessionMemoryActionContext,
  loadSessionMemoryRollbackSnapshotContext,
} from '../../src/scripts/ui/session-memory-table-utils.js';

let currentTime = 3000;
const timeline = createDebugTraceTimeline({
  maxEvents: 80,
  now: () => currentTime,
});
const recordTraceEvent = (event) => {
  currentTime += 17;
  return timeline.record(event);
};

const template = {
  id: 'tpl-memory',
  tables: [
    {
      id: 'relationship',
      name: '关系记录',
      scope: 'contact',
      columns: [{ id: 'relation', name: '关系', type: 'text' }],
    },
  ],
};
const memoryTemplateStore = {
  async getTemplates(query = {}) {
    if (query.is_default || query.id === 'default-v1') {
      return [{ id: 'tpl-memory', schema: template }];
    }
    return [];
  },
  toTemplateDefinition(record) {
    return record?.schema || null;
  },
};

let nextRowId = 2;
const rows = [
  {
    id: 'row-1',
    template_id: 'tpl-memory',
    table_id: 'relationship',
    contact_id: 'contact:memory',
    group_id: null,
    row_data: { relation: '朋友' },
    is_active: true,
    is_pinned: false,
    priority: 0,
    sort_order: 1,
  },
];
const clone = value => JSON.parse(JSON.stringify(value));
const memoryTableStore = {
  async getMemories(query = {}) {
    return rows
      .filter(row => !query.template_id || row.template_id === query.template_id)
      .filter((row) => {
        if (query.scope === 'contact') return row.contact_id === query.contact_id;
        if (query.scope === 'group') return row.group_id === query.group_id;
        if (query.scope === 'global') return !row.contact_id && !row.group_id;
        return true;
      })
      .map(clone);
  },
  async updateMemory(payload = {}) {
    const index = rows.findIndex(row => row.id === payload.id);
    if (index < 0) return null;
    rows[index] = { ...rows[index], ...payload, row_data: payload.row_data || rows[index].row_data };
    return clone(rows[index]);
  },
  async deleteMemory(id) {
    const index = rows.findIndex(row => row.id === id);
    if (index >= 0) rows.splice(index, 1);
    return true;
  },
  async createMemory(input = {}) {
    const saved = {
      id: input.id || `row-${nextRowId += 1}`,
      is_active: input.is_active !== false,
      is_pinned: Boolean(input.is_pinned),
      priority: Number(input.priority || 0),
      sort_order: Number(input.sort_order || 0),
      ...input,
    };
    rows.push(saved);
    return clone(saved);
  },
  async batchCreateMemories(inputs = []) {
    for (const input of inputs) {
      await this.createMemory(input);
    }
    return inputs.length;
  },
};

let lastMemoryUpdate = null;
const appBridge = {
  lastMemoryPlan: {
    targetId: 'contact:memory',
    tableOrder: ['relationship'],
    rowIndexMap: { relationship: ['row-1'] },
    updateMode: 'full',
  },
  lastRequest: { messages: [{ role: 'user', content: 'history' }] },
  getLastMemoryUpdate: () => lastMemoryUpdate,
  setLastMemoryUpdate: (sessionId, entry) => {
    lastMemoryUpdate = { ...(entry || {}), sessionId };
  },
};

const applyMemoryEdits = async ({ actions, sessionId, isGroup }) => {
  const actionContext = await loadSessionMemoryActionContext({
    memoryTemplateStore,
    memoryTableStore,
    sessionId,
    isGroup,
    uiMode: 'chat',
    filterTables: true,
    tableOrderOverride: appBridge.lastMemoryPlan.tableOrder,
    rowIndexMap: appBridge.lastMemoryPlan.rowIndexMap,
  });
  const result = await executeMemoryActionBatchMutation({
    actions,
    actionContext,
    updateMode: appBridge.lastMemoryPlan.updateMode,
    memoryTableStore,
    createMemories: inputs => memoryTableStore.batchCreateMemories(inputs),
    currentTurnNumber: 1,
    isGroup,
  });
  if (result.rollbackSnapshot) {
    appBridge.setLastMemoryUpdate(sessionId, {
      ...(appBridge.getLastMemoryUpdate(sessionId) || {}),
      rollback: result.rollbackSnapshot,
      rollbackAt: 1234,
    });
  }
  return {
    inserted: result.inserted,
    updated: result.updated,
    deleted: result.deleted,
    skipped: result.skipped,
  };
};

const raw = [
  'assistant reply',
  '<tableEdit>',
  'updateRow(0, 0, {"关系":"朋友（更亲近）"})',
  'insertRow(0, {"关系":"共同经历"})',
  '</tableEdit>',
].join('\n');
const parsed = await handleMemoryEditsFromRawWithUi({
  raw,
  sessionId: 'contact:memory',
  isGroup: false,
  force: false,
  requestPrompt: 'request prompt',
  isMemoryAutoExtractInline: () => true,
  extractTableEditBlocks,
  appBridge,
  buildRequestPrompt: () => 'fallback prompt',
  confirmMemoryEdits: async actions => actions,
  applyMemoryEdits,
  recordTraceEvent,
});

assert.equal(parsed.actions.length, 2);
assert.equal(rows.length, 2);
assert.equal(rows.find(row => row.id === 'row-1')?.row_data.relation, '朋友（更亲近）');
assert.equal(rows.some(row => row.row_data.relation === '共同经历'), true);
assert.equal(lastMemoryUpdate.rollback.tables.length, 1);

const rollbackContext = await loadSessionMemoryRollbackSnapshotContext({
  memoryTemplateStore,
  memoryTableStore,
  sessionId: 'contact:memory',
  isGroup: false,
  uiMode: 'chat',
  rollback: lastMemoryUpdate.rollback,
});
let changed = 0;
for (const tableContext of rollbackContext.tables) {
  changed += await restoreMemoryRowsFromRollbackSnapshot({
    memoryTableStore,
    templateId: rollbackContext.templateId,
    tableId: tableContext.tableId,
    scopeFields: tableContext.scopeFields,
    currentRows: tableContext.currentRows,
    snapshotRows: tableContext.snapshotRows,
  });
}

assert.equal(changed, 2);
assert.equal(rows.length, 1);
assert.equal(rows[0].id, 'row-1');
assert.equal(rows[0].row_data.relation, '朋友');
assert.deepEqual(
  timeline.snapshot({ category: 'memory', sessionId: 'contact:memory' }).map(event => [event.phase, event.status]),
  [
    ['edit.apply', 'started'],
    ['edit.apply', 'success'],
  ],
);

console.log('ok - memory lifecycle integration applies table edits stores rollback and restores snapshot');
