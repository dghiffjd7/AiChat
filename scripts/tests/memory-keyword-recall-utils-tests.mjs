import assert from 'node:assert/strict';

import {
  buildMemoryKeywordRecallPlan,
  buildMemoryRecallCandidate,
  parseMemoryKeywordList,
} from '../../src/scripts/memory/memory-keyword-recall-utils.js';
import {
  classifyMemoryRowSegment,
  isMemoryRowArchiveCandidate,
  isMemoryRowRecallEligible,
  partitionMemoryRowsForPrompt,
} from '../../src/scripts/memory/memory-segment-plan-utils.js';

const tableById = new Map([
  ['events', {
    id: 'events',
    name: '重要事件',
    columns: [
      { id: 'time', name: '时间' },
      { id: 'description', name: '事件描述' },
      { id: 'keywords', name: '召回关键词' },
    ],
  }],
  ['chat_summary', {
    id: 'chat_summary',
    name: '私聊摘要',
    columns: [
      { id: 'time', name: '时间/轮次' },
      { id: 'summary', name: '摘要' },
      { id: 'keywords', name: '召回关键词' },
    ],
  }],
]);

assert.deepEqual(parseMemoryKeywordList('林家，旧仓库; 黑曜石'), ['林家', '旧仓库', '黑曜石']);
assert.equal(isMemoryRowArchiveCandidate({ table_id: 'events', row_data: {} }), false);
assert.equal(isMemoryRowArchiveCandidate({ table_id: 'rp_tasks', row_data: { status: '已完成' } }), true);
assert.equal(isMemoryRowArchiveCandidate({ table_id: 'rp_tasks', row_data: { status: '未完成' } }), false);
assert.equal(isMemoryRowArchiveCandidate({ table_id: 'rp_important_people', row_data: { status: '已退出剧情' } }), true);
assert.equal(isMemoryRowArchiveCandidate({ table_id: 'rp_important_people', row_data: { status: '未退出剧情' } }), false);
assert.equal(classifyMemoryRowSegment({ table_id: 'events', row_data: {} }), 'state');
assert.equal(classifyMemoryRowSegment({ table_id: 'chat_summary', row_data: {} }), 'mid');
const eventLayers = partitionMemoryRowsForPrompt([
  { id: 'e1', table_id: 'events', row_data: {}, updated_at: 1 },
  { id: 'e2', table_id: 'events', row_data: {}, updated_at: 2 },
  { id: 'e3', table_id: 'events', row_data: {}, updated_at: 3 },
  { id: 'e4', table_id: 'events', row_data: {}, updated_at: 4 },
]);
assert.deepEqual(eventLayers.workingRows.map(row => row.id), ['e2', 'e3', 'e4']);
assert.deepEqual(eventLayers.archiveRows.map(row => row.id), ['e1']);
assert.equal(partitionMemoryRowsForPrompt(eventLayers.workingRows, {
  archiveRetentionByTable: { events: 0 },
}).archiveRows.length, 3);

const explicit = buildMemoryRecallCandidate({
  row: {
    id: 'event-explicit',
    table_id: 'events',
    row_data: {
      time: '去年冬天',
      description: '在旧仓库发现了被调包的账本。',
      keywords: '林家, 旧仓库, 账本',
    },
  },
  table: tableById.get('events'),
  queryText: '林家的账本后来去哪了？',
});
assert.ok(explicit);
assert.deepEqual(explicit.explicitHits.sort(), ['林家', '账本']);
assert.ok(explicit.sourceKinds.includes('显式关键词'));
assert.doesNotMatch(explicit.rowText, /召回关键词|keywords/);

const rows = [
  explicit.row,
  {
    id: 'legacy-summary',
    table_id: 'chat_summary',
    is_active: false,
    row_data: {
      time: '第18-21轮',
      summary: '顾青在雨夜把黑曜石钥匙交给用户保管。',
    },
  },
  {
    id: 'irrelevant',
    table_id: 'chat_summary',
    is_active: false,
    row_data: {
      time: '第1轮',
      summary: '讨论了晚餐要吃什么。',
    },
  },
];
const lazyPlan = buildMemoryKeywordRecallPlan({
  rows,
  tableById,
  queryText: '我记得顾青给过一把黑曜石钥匙，细节是什么？',
  tokenBudget: 500,
  maxRows: 5,
});
assert.equal(lazyPlan.items.length, 1);
assert.equal(lazyPlan.items[0].id, 'legacy-summary');
assert.ok(lazyPlan.items[0].sourceKinds.includes('旧行懒索引'));
assert.match(lazyPlan.text, /按需召回｜只读历史/);
assert.match(lazyPlan.detail, /顾青|黑曜石/);
assert.doesNotMatch(lazyPlan.text, /\[0\]/);

const bounded = buildMemoryKeywordRecallPlan({
  rows,
  tableById,
  queryText: '林家旧仓库的账本',
  tokenBudget: 1,
  maxRows: 5,
});
assert.equal(bounded.items.length, 0);
assert.ok(bounded.truncated.length >= 1);
assert.equal(bounded.overflowed, true);

const numbered = buildMemoryKeywordRecallPlan({
  rows: [
    {
      id: 'short-prefix',
      table_id: 'events',
      row_data: { description: '林299的旧记录', keywords: '林299' },
    },
    {
      id: 'exact-number',
      table_id: 'events',
      row_data: { description: '林2999的旧记录', keywords: '林2999' },
    },
  ],
  tableById,
  queryText: '请找林2999',
  tokenBudget: 500,
  maxRows: 5,
});
assert.equal(numbered.items[0].id, 'exact-number');
assert.equal(numbered.items.some(item => item.id === 'short-prefix'), false);

const scaleRows = Array.from({ length: 3000 }, (_, index) => ({
  id: `scale-${index}`,
  table_id: 'events',
  row_data: {
    description: `第 ${index} 条旧事件，林${index}在仓库${index}留下线索。`,
    keywords: `林${index},仓库${index}`,
  },
}));
const scalePlan = buildMemoryKeywordRecallPlan({
  rows: scaleRows,
  tableById,
  queryText: '请回忆林2999与仓库2999',
  tokenBudget: 400,
  maxRows: 10,
});
assert.equal(scalePlan.items[0].id, 'scale-2999');
assert.equal(scalePlan.items.length, 1);
assert.ok(scalePlan.tokens <= 400);

console.log('ok - keyword recall prefers explicit keywords, lazily indexes legacy rows, and honors Q_recall');

// 召回准入：用户手动禁用（无系统标记）的行不得复活；系统停用（压缩/迁移）可召回
const systemArchivedRow = {
  id: 'r1',
  table_id: 'chat_summary',
  is_active: false,
  row_data: { summary: '被压缩的旧摘要', _archived_by: 'compaction' },
};
const migratedRow = {
  id: 'r2',
  table_id: 'chat_outline',
  is_active: false,
  row_data: { outline: '迁移归档', _archived_by: 'outline_migration' },
};
const userDisabledRow = {
  id: 'r3',
  table_id: 'events',
  is_active: false,
  row_data: { event: '死敌/林昭想杀了我' },
};
const activeArchiveStatusRow = {
  id: 'r4',
  table_id: 'rp_tasks',
  is_active: true,
  row_data: { task: '旧任务', status: '已完成' },
};
assert.equal(isMemoryRowRecallEligible(systemArchivedRow), true);
assert.equal(isMemoryRowRecallEligible(migratedRow), true);
assert.equal(isMemoryRowRecallEligible(userDisabledRow), false);
assert.equal(isMemoryRowRecallEligible(activeArchiveStatusRow), true);
// 分层职责不变：用户禁用行仍归档（不进 working 注入），只是不可召回
assert.equal(isMemoryRowArchiveCandidate(userDisabledRow), true);

console.log('ok - recall admission requires a system archive marker for inactive rows');
