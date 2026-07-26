import assert from 'node:assert/strict';

import {
  buildLegacyOutlineMigrationPlan,
  findOutlineSectionRow,
  getOutlineSectionLabel,
  normalizeOutlinePatchData,
  normalizeOutlineSection,
} from '../../src/scripts/memory/outline-section-utils.js';
import {
  buildMemoryRowsIndex,
  createMemoryActionResolvers,
  executeMemoryActionBatchMutation,
  resolveMemoryActionMutationPlan,
} from '../../src/scripts/ui/chat/memory-table-action-utils.js';

assert.equal(normalizeOutlineSection('关系'), 'relationships');
assert.equal(normalizeOutlineSection('非法节名'), 'current');
assert.equal(getOutlineSectionLabel('open_threads'), '未决线索');
assert.deepEqual(
  normalizeOutlinePatchData({ section: '剧情', outline: '主角抵达港口' }),
  { section: 'plot', outline: '主角抵达港口' },
);

const legacyRows = [
  {
    id: 'old-1',
    table_id: 'rp_outline',
    contact_id: 'rp:test',
    row_data: { time: '第1轮', outline: '抵达城门' },
    is_active: true,
    sort_order: 1,
  },
  {
    id: 'old-2',
    table_id: 'rp_outline',
    contact_id: 'rp:test',
    row_data: { time: '第2轮', outline: '进入城市' },
    is_active: true,
    sort_order: 2,
  },
];
const migration = buildLegacyOutlineMigrationPlan({ rows: legacyRows });
assert.equal(migration.needed, true);
assert.equal(migration.legacyRows.length, 2);
assert.equal(migration.archiveData.section, 'history');
assert.match(migration.archiveData.outline, /抵达城门/);
assert.match(migration.archiveData.outline, /进入城市/);
assert.equal(migration.archiveData._outline_archive.legacy_count, 2);

const stableRow = {
  id: 'stable-current',
  row_data: { section: 'current', outline: '旧局面' },
  is_active: true,
};
assert.equal(findOutlineSectionRow([stableRow], '当前')?.id, 'stable-current');
const upsertPlan = resolveMemoryActionMutationPlan({
  action: { action: 'insert' },
  actionContext: {
    tableId: 'rp_outline',
    table: { id: 'rp_outline' },
    scopeKey: 'contact',
    contactId: 'rp:test',
    groupId: null,
    isSummaryTable: true,
    isOutlineTable: true,
  },
  data: { section: 'current', outline: '新局面' },
  rowsByTableScope: new Map([['rp_outline:contact', [stableRow]]]),
  rowsById: new Map([['stable-current', stableRow]]),
});
assert.equal(upsertPlan.kind, 'updateRow');
assert.equal(upsertPlan.rowId, 'stable-current');
assert.equal(upsertPlan.merged.outline, '新局面');

const table = {
  id: 'rp_outline',
  name: '总体大纲',
  scope: 'contact',
  columns: [
    { id: 'section', name: '大纲分节' },
    { id: 'outline', name: '总体大纲' },
  ],
};
const tableById = new Map([['rp_outline', table]]);
const { rowsById, rowsByTableScope } = buildMemoryRowsIndex(legacyRows);
const resolvers = createMemoryActionResolvers({
  tableById,
  tableNameMap: new Map([['总体大纲', 'rp_outline']]),
  tableOrder: ['rp_outline'],
  rowIndexMap: {},
  rowsByTableScope,
  sessionId: 'rp:test',
  isGroup: false,
});
const updateCalls = [];
let createdInputs = [];
const result = await executeMemoryActionBatchMutation({
  actions: [{
    action: 'update',
    tableId: 'rp_outline',
    data: { section: '当前', outline: '正在城内调查' },
  }],
  actionContext: {
    templateId: 'default-v1',
    tableById,
    rowsById,
    rowsByTableScope,
    ...resolvers,
  },
  updateMode: 'full',
  memoryTableStore: {
    updateMemory: async payload => updateCalls.push(payload),
  },
  createMemories: async (inputs) => {
    createdInputs = inputs;
    return inputs.length;
  },
  currentTurnNumber: 3,
  isGroup: false,
});

assert.equal(result.updated, 2);
assert.equal(result.inserted, 2);
assert.equal(result.changed, 4);
assert.equal(result.rollbackSnapshot.tables[0].rows.length, 2);
assert.equal(updateCalls.filter(call => call.is_active === false).length, 2);
assert.deepEqual(
  createdInputs.map(input => input.row_data.section).sort(),
  ['current', 'history'],
);
assert.equal(createdInputs.find(input => input.row_data.section === 'current')?.row_data.outline, '正在城内调查');

console.log('ok - outline patches upsert stable sections and migrate legacy per-turn rows with rollback data');

