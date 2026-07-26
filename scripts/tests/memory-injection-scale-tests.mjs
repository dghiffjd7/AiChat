import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';

import {
  buildMemoryTablePlan,
  estimateTokens,
  limitSummaryRowsForPrompt,
} from '../../src/scripts/memory/memory-prompt-utils.js';
import {
  reflowUnusedRecallToRecent,
  resolveMemoryBudgetEnvelope,
} from '../../src/scripts/memory/memory-budget-allocator-utils.js';
import {
  buildMemoryPromptRowLayers,
  buildSegmentedMemoryTablePlan,
  estimateMemorySegmentDemands,
} from '../../src/scripts/memory/memory-segment-plan-utils.js';
import { buildMemoryKeywordRecallPlan } from '../../src/scripts/memory/memory-keyword-recall-utils.js';
import { limitHistoryByTokenBudget } from '../../src/scripts/ui/chat/llm-history-utils.js';

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


{
  // 端到端总量护栏：任意合成规模下，常驻/中景/远景记忆 + 按需召回 + 裁剪后 history
  // + 世界书配额 + 固定预留 ≤ 用户预算 B（state 未超配的正常形态；state 超配属
  // 显式告警不裁的护栏例外，不在本断言范围）。
  const B = 20000;
  const fullTableById = new Map([
    ...tableById,
    ['rp_tasks', {
      id: 'rp_tasks',
      name: '任务',
      columns: [{ id: 'task', name: '任务' }, { id: 'status', name: '状态' }],
    }],
  ]);
  const fullTableOrder = ['rp_tasks', 'rp_summary', 'rp_outline'];
  for (const scale of [600, 3000]) {
    const stateRows = Array.from({ length: 5 }, (_, index) => ({
      id: `rp_tasks-${index + 1}`,
      table_id: 'rp_tasks',
      row_data: { task: `任务${index + 1}`, status: '进行中' },
      is_active: true,
      sort_order: index + 1,
      contact_id: 'rp:test',
    }));
    const layers = buildMemoryPromptRowLayers([
      ...stateRows,
      ...createRows('rp_summary', scale, 'summary'),
      ...createRows('rp_outline', scale, 'outline'),
    ]);
    const demands = estimateMemorySegmentDemands({
      rows: layers.limitedRows,
      tableById: fullTableById,
      tableOrder: fullTableOrder,
      autoExtract: true,
      tokenMode: 'rough',
    });
    const historyMessages = Array.from({ length: 400 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user',
      content: `历史消息${index}-${'中文'.repeat(30)}`,
    }));
    const historyDemand = historyMessages.reduce(
      (sum, message) => sum + estimateTokens(message.content, 'rough'),
      0,
    );
    const envelope = resolveMemoryBudgetEnvelope({
      settings: { memoryBudgetMode: 'token', memoryInputBudgetTokens: B },
      maxContextTokens: 200000,
      maxOutputTokens: 1024,
      place: 'writing',
      worldContextPercent: 20,
      worldBudgetCap: 0,
      demands: {
        state: demands.state,
        recent: historyDemand,
        mid: demands.mid,
        far: demands.far,
        recall: Number.POSITIVE_INFINITY,
      },
    });
    assert.equal(envelope.inputBudgetTokens, B);
    const allocations = { ...envelope.allocation.allocations };
    const segmented = buildSegmentedMemoryTablePlan({
      rows: layers.limitedRows,
      tableById: fullTableById,
      tableOrder: fullTableOrder,
      autoExtract: true,
      maxRows: 1000,
      tokenQuotas: allocations,
      tokenMode: 'rough',
      preserveState: true,
    });
    const memoryTokens = estimateTokens(segmented.tableData, 'rough');
    const recallPlan = buildMemoryKeywordRecallPlan({
      rows: layers.recallCandidateRows,
      tableById: fullTableById,
      queryText: `第${scale - 20}段内容`,
      tokenBudget: allocations.recall,
      maxRows: 20,
      tokenMode: 'rough',
    });
    const recallTokens = Math.max(0, Math.trunc(Number(recallPlan.tokens)) || 0);
    const reflowed = reflowUnusedRecallToRecent(allocations, recallTokens).allocations;
    const limitedHistory = limitHistoryByTokenBudget(historyMessages, {
      inputBudgetTokens: reflowed.recent,
      tokenMode: 'rough',
    });
    const total = memoryTokens
      + recallTokens
      + limitedHistory.stats.usedTokens
      + (envelope.worldBudgetTokens ?? 0)
      + envelope.fixedReserveTokens;
    assert.ok(memoryTokens > 0, `scale=${scale} 记忆段为空`);
    assert.ok(limitedHistory.stats.usedTokens > 0, `scale=${scale} history 为空`);
    assert.ok(total <= B, `scale=${scale} 总注入 ${total} 超过预算 ${B}`);
  }
  console.log('ok - end-to-end synthetic pipeline keeps total injection within user budget B');
}
