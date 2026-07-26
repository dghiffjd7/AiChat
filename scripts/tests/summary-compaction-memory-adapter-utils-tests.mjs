import assert from 'node:assert/strict';

import {
  createMemoryTableSummaryCompactionAdapter,
  normalizeMemorySummaryRows,
  resolveMemorySummaryTableId,
} from '../../src/scripts/ui/chat/summary-compaction-memory-adapter-utils.js';
import { createSessionSummaryCompactionRuntime } from '../../src/scripts/ui/chat/summary-compaction-runtime-utils.js';
import { buildMemoryCoverageLine } from '../../src/scripts/memory/memory-coverage-utils.js';

assert.equal(resolveMemorySummaryTableId({ place: 'chat', isGroup: false }), 'chat_summary');
assert.equal(resolveMemorySummaryTableId({ place: 'chat', isGroup: true }), 'group_summary');
assert.equal(resolveMemorySummaryTableId({ place: 'writing' }), 'rp_summary');
assert.equal(resolveMemorySummaryTableId({ place: 'moments' }), 'moment_summary');

const rows = Array.from({ length: 4 }, (_, index) => ({
  id: `summary-${index + 1}`,
  table_id: 'rp_summary',
  contact_id: 'rp:test',
  row_data: {
    time: `第${index + 1}轮`,
    summary: `摘要${index + 1}`,
    _coverage: { from: index + 1, to: index + 1, source: 'app' },
  },
  is_active: true,
  sort_order: index + 1,
  created_at: index + 1,
}));
rows.push({
  id: 'compacted-old',
  table_id: 'rp_summary',
  contact_id: 'rp:test',
  row_data: {
    summary: '旧压缩',
    _summary_compaction: { level: 'rolling' },
  },
  is_active: true,
  sort_order: 10,
});

assert.deepEqual(
  normalizeMemorySummaryRows(rows, 'rp_summary').map(item => item.id),
  ['summary-1', 'summary-2', 'summary-3', 'summary-4'],
);

const updateCalls = [];
const createCalls = [];
const memoryTableStore = {
  async getMemories() {
    return rows;
  },
  async updateMemory(payload) {
    updateCalls.push(payload);
    const row = rows.find(item => item.id === payload.id);
    if (row && Object.prototype.hasOwnProperty.call(payload, 'is_active')) {
      row.is_active = payload.is_active;
    }
  },
  async createMemory(payload) {
    createCalls.push(payload);
    const created = { ...payload, id: 'compacted-new', created_at: 20 };
    rows.push(created);
    return created;
  },
};
const adapter = createMemoryTableSummaryCompactionAdapter({
  memoryTableStore,
  memoryTemplateStore: {
    async getTemplates() {
      return [{ id: 'default-v1' }];
    },
  },
  sessionId: 'rp:test',
  place: 'writing',
  isGroup: false,
});
const items = await adapter.getItems();
assert.equal(items.length, 4);
assert.equal(await adapter.getCompactedText(), '旧压缩');
await adapter.persist({
  text: '【关键事件】\n• 进入城市: 开始调查',
  raw: '<summary>...</summary>',
  items,
  keepItems: items.slice(-2),
});
assert.deepEqual(
  updateCalls.filter(call => call.is_active === false).map(call => call.id).sort(),
  ['compacted-old', 'summary-1', 'summary-2'],
);
// 系统停用必须打标：召回准入靠它区分用户手动禁用
for (const call of updateCalls.filter(item => item.is_active === false)) {
  assert.equal(call.row_data?._archived_by, 'compaction', `missing marker on ${call.id}`);
}
assert.equal(
  updateCalls.find(call => call.id === 'summary-1')?.row_data?.summary,
  '摘要1',
);
assert.equal(createCalls.length, 1);
assert.equal(createCalls[0].table_id, 'rp_summary');
assert.deepEqual(createCalls[0].row_data._coverage, {
  from: 1,
  to: 4,
  source: 'compaction',
});
assert.deepEqual(createCalls[0].row_data._summary_compaction.source_row_ids, [
  'summary-1',
  'summary-2',
  'summary-3',
  'summary-4',
]);

{
  const calls = [];
  const tableAdapter = {
    getItems: async () => [{ id: 'a', text: 'a' }, { id: 'b', text: 'b' }, { id: 'c', text: 'c' }],
    getCompactedText: async () => '旧压缩',
    normalizeItems: value => value,
    persist: async payload => calls.push(payload),
  };
  const runtime = createSessionSummaryCompactionRuntime({
    getIsSummaryMemoryEnabled: () => false,
    getIsCompactionEnabled: ({ place }) => place === 'writing',
    createAdapter: async ({ place }) => {
      assert.equal(place, 'writing');
      return tableAdapter;
    },
    getIsConfigured: () => true,
    buildMessages: () => [],
    backgroundChat: async () => '',
    buildSessionContext: () => ({}),
    requestCompactionRaw: async () => '<summary>有效</summary>',
    parseCompactionResult: () => ({ text: '有效压缩', valid: true }),
    shouldCompact: () => true,
    setTimeoutFn: async fn => fn(),
    delayMs: 0,
  });
  assert.equal(await runtime('rp:test', { place: 'writing' }), true);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].keepItems.map(item => item.id), ['b', 'c']);
}

{
  // 存量会话：旧摘要行只有模型写的 time 文本、没有 _coverage，压缩后覆盖区间必须经兜底继承
  const legacyRows = [
    {
      id: 'legacy-1',
      table_id: 'chat_summary',
      contact_id: 'chat:test',
      row_data: { time: '第2轮', summary: '旧摘要A' },
      is_active: true,
      sort_order: 2,
      created_at: 2,
    },
    {
      id: 'legacy-2',
      table_id: 'chat_summary',
      contact_id: 'chat:test',
      row_data: { time: '第3-5轮', summary: '旧摘要B' },
      is_active: true,
      sort_order: 5,
      created_at: 5,
    },
  ];
  const legacyCreateCalls = [];
  const legacyAdapter = createMemoryTableSummaryCompactionAdapter({
    memoryTableStore: {
      async getMemories() { return legacyRows; },
      async updateMemory(payload) {
        const row = legacyRows.find(item => item.id === payload.id);
        if (row && Object.prototype.hasOwnProperty.call(payload, 'is_active')) {
          row.is_active = payload.is_active;
        }
      },
      async createMemory(payload) {
        legacyCreateCalls.push(payload);
        const created = { ...payload, id: 'legacy-compacted', created_at: 9 };
        legacyRows.push(created);
        return created;
      },
    },
    memoryTemplateStore: { async getTemplates() { return [{ id: 'default-v1' }]; } },
    sessionId: 'chat:test',
    place: 'chat',
    isGroup: false,
  });
  const legacyItems = await legacyAdapter.getItems();
  assert.deepEqual(legacyItems.map(item => [item.from, item.to]), [[2, 2], [3, 5]]);
  await legacyAdapter.persist({ text: '压缩后', raw: '<summary>...</summary>', items: legacyItems, keepItems: [] });
  assert.equal(legacyCreateCalls.length, 1);
  assert.deepEqual(legacyCreateCalls[0].row_data._coverage, { from: 2, to: 5, source: 'compaction' });
  assert.equal(legacyCreateCalls[0].row_data.time, '第2-5轮');
}

console.log('ok - table memory compaction reads summary rows and writes a rollback-friendly memory row through an adapter');
console.log('ok - legacy time-text summary rows keep coverage through compaction via fallback interval parsing');


{
  // 源行之间有真实空洞（第 3 轮无摘要）：产物 _coverage 必须保留区间并集，
  // 不得并成连续跨度把洞标成已覆盖（吞洞会让覆盖线护栏失效）。
  const holeRows = [
    {
      id: 'hole-1',
      table_id: 'chat_summary',
      contact_id: 'c1',
      row_data: { time: '第1-2轮', summary: '前段', _coverage: { from: 1, to: 2, source: 'app' } },
      is_active: true,
      sort_order: 2,
      created_at: 1,
    },
    {
      id: 'hole-2',
      table_id: 'chat_summary',
      contact_id: 'c1',
      row_data: { time: '第4-5轮', summary: '后段', _coverage: { from: 4, to: 5, source: 'app' } },
      is_active: true,
      sort_order: 5,
      created_at: 2,
    },
  ];
  const holeCreates = [];
  const holeStore = {
    async getMemories() {
      return holeRows;
    },
    async updateMemory(payload) {
      const row = holeRows.find(item => item.id === payload.id);
      if (row && Object.prototype.hasOwnProperty.call(payload, 'is_active')) {
        row.is_active = payload.is_active;
      }
    },
    async createMemory(payload) {
      holeCreates.push(payload);
      const created = { ...payload, id: 'hole-compacted', created_at: 30 };
      holeRows.push(created);
      return created;
    },
  };
  const holeAdapter = createMemoryTableSummaryCompactionAdapter({
    memoryTableStore: holeStore,
    memoryTemplateStore: {
      async getTemplates() {
        return [{ id: 'default-v1' }];
      },
    },
    sessionId: 'c1',
    place: 'chat',
    isGroup: false,
  });
  const holeItems = await holeAdapter.getItems();
  assert.deepEqual(holeItems.map(item => item.intervals), [
    [{ from: 1, to: 2 }],
    [{ from: 4, to: 5 }],
  ]);
  await holeAdapter.persist({ text: '压缩后', raw: '', items: holeItems, keepItems: [] });
  assert.deepEqual(holeCreates[0].row_data._coverage, {
    from: 1,
    to: 5,
    source: 'compaction',
    intervals: [{ from: 1, to: 2 }, { from: 4, to: 5 }],
  });
  const line = buildMemoryCoverageLine({
    summaryRows: [holeCreates[0]],
    fromTurn: 1,
    toTurn: 5,
  });
  assert.deepEqual(line.holes, [{ from: 3, to: 3 }]);
  // 再压缩时产物作为源行，区间并集必须继续传递
  const recompactedItems = normalizeMemorySummaryRows(
    [{ ...holeCreates[0], id: 'hole-compacted', created_at: 30, row_data: { ...holeCreates[0].row_data, _summary_compaction: undefined } }],
    'chat_summary',
  );
  assert.deepEqual(recompactedItems[0].intervals, [{ from: 1, to: 2 }, { from: 4, to: 5 }]);
  console.log('ok - compaction product keeps interval union so coverage holes stay detectable');
}
