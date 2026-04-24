import assert from 'node:assert/strict';

import {
  buildMemoryTimelineLabel,
  computeNextMemoryRowSortOrder,
  extractMemoryTimelineRound,
  sortMemoryRows,
  sortMemoryRowsForSnapshot,
} from '../../src/scripts/memory/memory-row-order.js';

const makeRow = (overrides = {}) => ({
  id: overrides.id || `row_${Math.random().toString(16).slice(2, 8)}`,
  table_id: overrides.table_id || 'relationship',
  row_data: overrides.row_data || {},
  is_pinned: Boolean(overrides.is_pinned),
  priority: Number.isFinite(Number(overrides.priority)) ? Number(overrides.priority) : 0,
  sort_order: Number.isFinite(Number(overrides.sort_order)) ? Number(overrides.sort_order) : 0,
  created_at: Number.isFinite(Number(overrides.created_at)) ? Number(overrides.created_at) : 0,
  updated_at: Number.isFinite(Number(overrides.updated_at)) ? Number(overrides.updated_at) : 0,
});

const testTimelineRoundParsing = () => {
  assert.equal(extractMemoryTimelineRound('第12轮'), 12);
  assert.equal(extractMemoryTimelineRound('  第 3 轮  '), 3);
  assert.equal(extractMemoryTimelineRound('无轮次'), null);
  assert.equal(buildMemoryTimelineLabel(4), '第4轮');
};

const testPinRoundTripOrder = () => {
  const first = makeRow({
    id: 'first',
    sort_order: 100,
    created_at: 100,
    updated_at: 100,
  });
  const second = makeRow({
    id: 'second',
    sort_order: 200,
    created_at: 200,
    updated_at: 200,
  });
  const base = sortMemoryRows([second, first]).map(row => row.id);
  assert.deepEqual(base, ['first', 'second']);

  const pinned = sortMemoryRows([
    { ...second, is_pinned: true, updated_at: 9999 },
    first,
  ]).map(row => row.id);
  assert.deepEqual(pinned, ['second', 'first']);

  const unpinned = sortMemoryRows([
    { ...second, is_pinned: false, updated_at: 10000 },
    first,
  ]).map(row => row.id);
  assert.deepEqual(unpinned, ['first', 'second']);
};

const testTimelineOrderingAndNextSort = () => {
  const rows = [
    makeRow({
      id: 'r3',
      table_id: 'rp_summary',
      row_data: { time: '第3轮', summary: '第三轮' },
      updated_at: 3000,
      created_at: 3000,
    }),
    makeRow({
      id: 'r1',
      table_id: 'rp_summary',
      row_data: { time: '第1轮', summary: '第一轮' },
      updated_at: 9000,
      created_at: 1000,
    }),
    makeRow({
      id: 'r2',
      table_id: 'rp_summary',
      row_data: { time: '第2轮', summary: '第二轮' },
      updated_at: 8000,
      created_at: 2000,
    }),
  ];
  const ordered = sortMemoryRows(rows, { tableId: 'rp_summary' }).map(row => row.id);
  assert.deepEqual(ordered, ['r1', 'r2', 'r3']);
  assert.equal(computeNextMemoryRowSortOrder(rows, 'rp_summary'), 4);
};

const testSnapshotOrdering = () => {
  const rows = [
    makeRow({
      id: 'b',
      table_id: 'rp_summary',
      row_data: { time: '第2轮' },
      created_at: 20,
    }),
    makeRow({
      id: 'a',
      table_id: 'rp_summary',
      row_data: { time: '第1轮' },
      created_at: 10,
    }),
    makeRow({
      id: 'c',
      table_id: 'relationship',
      row_data: { relation: '朋友' },
      sort_order: 500,
      created_at: 500,
    }),
  ];
  const ordered = sortMemoryRowsForSnapshot(rows).map(row => row.id);
  assert.deepEqual(ordered, ['c', 'a', 'b']);
};

testTimelineRoundParsing();
testPinRoundTripOrder();
testTimelineOrderingAndNextSort();
testSnapshotOrdering();

console.log('memory-row-order tests passed');
