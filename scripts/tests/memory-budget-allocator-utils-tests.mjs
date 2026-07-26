import assert from 'node:assert/strict';

import {
  allocateMemoryTokenQuotas,
  reflowUnusedRecallToRecent,
  resolveMemoryBudgetEnvelope,
  resolveMemoryBudgetRatios,
} from '../../src/scripts/memory/memory-budget-allocator-utils.js';
import {
  buildSegmentedMemoryTablePlan,
  classifyMemoryTableSegment,
} from '../../src/scripts/memory/memory-segment-plan-utils.js';

assert.equal(classifyMemoryTableSegment('profile'), 'state');
assert.equal(classifyMemoryTableSegment('rp_summary'), 'mid');
assert.equal(classifyMemoryTableSegment('rp_outline'), 'far');
assert.equal(resolveMemoryBudgetRatios('writing').recent, 0.5);
assert.ok(resolveMemoryBudgetRatios('chat').state > resolveMemoryBudgetRatios('writing').state);

const reflow = allocateMemoryTokenQuotas({
  poolTokens: 1000,
  ratios: { state: 0.2, recent: 0.4, mid: 0.15, far: 0.1, recall: 0.15 },
  demands: { state: 50, recent: 800, mid: 20, far: 10, recall: 20 },
  reflowOrder: ['recent', 'state', 'mid', 'far', 'recall'],
});
assert.equal(reflow.allocations.state, 50);
assert.equal(reflow.allocations.recent, 800);
assert.equal(reflow.allocations.mid, 20);
assert.equal(reflow.allocations.far, 10);
assert.equal(reflow.allocations.recall, 20);
assert.equal(reflow.unallocatedTokens, 100);

const recallReflow = reflowUnusedRecallToRecent(
  { state: 100, recent: 200, mid: 100, far: 100, recall: 150 },
  40,
);
assert.deepEqual(recallReflow.allocations, {
  state: 100,
  recent: 310,
  mid: 100,
  far: 100,
  recall: 40,
});
assert.equal(recallReflow.releasedTokens, 110);

const envelope = resolveMemoryBudgetEnvelope({
  settings: {
    memoryBudgetMode: 'token',
    memoryInputBudgetTokens: 100000,
  },
  maxContextTokens: 131072,
  maxOutputTokens: 4096,
  place: 'writing',
  worldContextPercent: 20,
  demands: {
    state: 10000,
    recent: 50000,
    mid: 18000,
    far: 8000,
    recall: 12000,
  },
});
assert.equal(envelope.inputBudgetTokens, 100000);
assert.equal(envelope.worldBudgetTokens, 20000);
assert.equal(envelope.fixedReserveTokens, 4096);
assert.equal(
  Object.values(envelope.allocation.allocations).reduce((sum, value) => sum + value, 0)
    + envelope.worldBudgetTokens
    + envelope.fixedReserveTokens,
  100000,
);

const unboundedWorld = resolveMemoryBudgetEnvelope({
  settings: {
    memoryBudgetMode: 'token',
    memoryInputBudgetTokens: 10000,
  },
  maxContextTokens: 20000,
  maxOutputTokens: 1000,
  worldContextPercent: 0,
  worldBudgetCap: 0,
  demands: { state: 0, recent: 1000, mid: 0, far: 0, recall: 0 },
});
assert.equal(unboundedWorld.worldBudgetTokens, null);
assert.equal(unboundedWorld.distributableTokens, 9000);

const capOnlyWorld = resolveMemoryBudgetEnvelope({
  settings: {
    memoryBudgetMode: 'token',
    memoryInputBudgetTokens: 10000,
  },
  maxContextTokens: 20000,
  maxOutputTokens: 1000,
  worldContextPercent: 0,
  worldBudgetCap: 1200,
});
assert.equal(capOnlyWorld.worldBudgetTokens, 1200);

const rowsModeUnknown = resolveMemoryBudgetEnvelope({
  settings: {
    memoryBudgetMode: 'rows',
    memoryInputBudgetTokens: 100000,
  },
  maxContextTokens: 0,
  maxOutputTokens: 4096,
});
assert.equal(rowsModeUnknown.inputBudgetTokens, null);
assert.equal(rowsModeUnknown.allocation, null);

const tableById = new Map([
  ['profile', { id: 'profile', name: '状态', columns: [{ id: 'content', name: '内容' }] }],
  ['rp_summary', { id: 'rp_summary', name: '摘要', columns: [{ id: 'summary', name: '摘要' }] }],
  ['rp_outline', { id: 'rp_outline', name: '大纲', columns: [{ id: 'section' }, { id: 'outline' }] }],
]);
const segmented = buildSegmentedMemoryTablePlan({
  rows: [
    { id: 's', table_id: 'profile', row_data: { content: '状态'.repeat(100) }, updated_at: 3 },
    { id: 'm', table_id: 'rp_summary', row_data: { summary: '摘要'.repeat(100) }, updated_at: 2 },
    { id: 'f', table_id: 'rp_outline', row_data: { section: 'plot', outline: '远景'.repeat(100) }, updated_at: 1 },
  ],
  tableById,
  tableOrder: ['profile', 'rp_summary', 'rp_outline'],
  autoExtract: true,
  maxRows: 10,
  tokenQuotas: { state: 1, mid: 1, far: 1 },
  preserveState: true,
});
assert.equal(segmented.segments.state.items.length, 1);
assert.equal(segmented.segments.state.overflowed, true);
assert.equal(segmented.segments.mid.items.length, 0);
assert.equal(segmented.segments.far.items.length, 0);
assert.equal(segmented.truncated.filter(item => item.reason === 'max_tokens').length, 2);

console.log('ok - unified memory allocator reflows quotas, honors unknown context, and preserves over-quota state');

{
  // 淘汰次序直测：state 缺口按 recall→far→mid→recent 依次借出，不许越序
  const borrowed = allocateMemoryTokenQuotas({
    poolTokens: 1000,
    ratios: { state: 0.2, recent: 0.2, mid: 0.2, far: 0.2, recall: 0.2 },
    demands: { state: 550, recent: 200, mid: 200, far: 200, recall: 200 },
  });
  // base 各 200；state 缺 350：recall 先掏空（200→0），far 补足剩余 150（200→50），mid/recent 不动
  assert.equal(borrowed.allocations.state, 550);
  assert.equal(borrowed.allocations.recall, 0);
  assert.equal(borrowed.allocations.far, 50);
  assert.equal(borrowed.allocations.mid, 200);
  assert.equal(borrowed.allocations.recent, 200);
  assert.equal(
    Object.values(borrowed.allocations).reduce((sum, value) => sum + value, 0),
    1000,
  );
  // 被借走的段记入 overQuotaSegments（需求未被满足）
  assert.deepEqual([...borrowed.overQuotaSegments].sort(), ['far', 'recall']);

  // state 需求超过整池：四个 donor 全部掏空，state 记超配
  const drained = allocateMemoryTokenQuotas({
    poolTokens: 500,
    ratios: { state: 0.2, recent: 0.2, mid: 0.2, far: 0.2, recall: 0.2 },
    demands: { state: 900, recent: 100, mid: 100, far: 100, recall: 100 },
  });
  assert.equal(drained.allocations.state, 500);
  assert.equal(drained.allocations.recall, 0);
  assert.equal(drained.allocations.far, 0);
  assert.equal(drained.allocations.mid, 0);
  assert.equal(drained.allocations.recent, 0);
  assert.ok(drained.overQuotaSegments.includes('state'));
  console.log('ok - state shortfall borrows in recall→far→mid→recent order and reports over-quota segments');
}
