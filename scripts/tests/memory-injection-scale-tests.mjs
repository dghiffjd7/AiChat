import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  buildMemoryTablePlan,
  limitSummaryRowsForPrompt,
} from '../../src/scripts/memory/memory-prompt-utils.js';

const tableById = new Map([
  ['rp_summary', {
    id: 'rp_summary',
    name: '剧情摘要',
    columns: [{ id: 'time', name: '轮次' }, { id: 'summary', name: '摘要' }],
  }],
  ['rp_outline', {
    id: 'rp_outline',
    name: '总体大纲',
    columns: [{ id: 'time', name: '轮次' }, { id: 'outline', name: '大纲' }],
  }],
]);

const createRows = (tableId, count, field) => Array.from({ length: count }, (_, index) => ({
  id: `${tableId}-${index + 1}`,
  table_id: tableId,
  row_data: {
    time: `第${index + 1}轮`,
    [field]: `第${index + 1}段内容-${'中文'.repeat(20)}`,
  },
  is_active: true,
  is_pinned: false,
  priority: 0,
  sort_order: index + 1,
  updated_at: index + 1,
  contact_id: 'rp:test',
}));

const summaries = createRows('rp_summary', 3000, 'summary');
const outlines = createRows('rp_outline', 3000, 'outline');

const bridgeLimited = limitSummaryRowsForPrompt([...summaries, ...outlines], 10);
assert.equal(bridgeLimited.filter(row => row.table_id === 'rp_summary').length, 10);
assert.equal(bridgeLimited.filter(row => row.table_id === 'rp_outline').length, 3000);
assert.equal(
  bridgeLimited.find(row => row.table_id === 'rp_summary')?.id,
  'rp_summary-2991',
);

const startedAt = performance.now();
const rowLimited = buildMemoryTablePlan({
  rows: bridgeLimited,
  tableById,
  tableOrder: ['rp_summary', 'rp_outline'],
  autoExtract: true,
  maxRows: 120,
  tokenBudgetData: 1000000,
  tokenMode: 'rough',
});
const elapsedMs = performance.now() - startedAt;
assert.equal(rowLimited.items.length, 120);
assert.equal(rowLimited.truncated.length, 2890);
assert.ok(rowLimited.truncated.every(item => item.reason === 'max_rows'));
assert.equal(rowLimited.rowIndexMap.rp_outline.length, 110);
assert.equal(rowLimited.rowIndexMap.rp_outline[0], 'rp_outline-2891');
assert.equal(rowLimited.rowIndexMap.rp_outline[109], 'rp_outline-3000');
assert.ok(elapsedMs < 3000, `3000 行裁剪耗时过长：${elapsedMs.toFixed(1)}ms`);

const tokenLimited = buildMemoryTablePlan({
  rows: outlines,
  tableById,
  tableOrder: ['rp_outline'],
  autoExtract: true,
  maxRows: 3000,
  tokenBudgetData: 500,
  tokenMode: 'rough',
});
assert.ok(tokenLimited.items.length > 0 && tokenLimited.items.length < outlines.length);
assert.ok(tokenLimited.truncated.some(item => item.reason === 'max_tokens'));
assert.equal(tokenLimited.rowIndexMap.rp_outline.length, tokenLimited.items.length);
assert.ok(
  tokenLimited.items.reduce((sum, item) => sum + Number(item.tokens || 0), 0) <= 500,
);

console.log('ok - 3000-row memory injection obeys bridge summary cap, row/token limits, ordering and row index mapping');

