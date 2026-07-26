import assert from 'node:assert/strict';

import {
  buildMemoryCoverageLine,
  expandMemoryCoverageHoles,
  mergeMemoryCoverageIntervals,
  parseMemoryCoverageInterval,
  readMemoryCoverageInterval,
  readMemoryCoverageIntervals,
  resolveMemoryCoverageStampInterval,
  stampMemoryCoverage,
} from '../../src/scripts/memory/memory-coverage-utils.js';
import {
  buildMemoryTimelineLabel,
  extractMemoryTimelineRound,
} from '../../src/scripts/memory/memory-row-order.js';
import {
  normalizeTimelineMemoryActionData,
} from '../../src/scripts/ui/chat/memory-table-action-utils.js';

assert.deepEqual(parseMemoryCoverageInterval('第3-8轮'), { from: 3, to: 8 });
assert.deepEqual(parseMemoryCoverageInterval('第8至3轮'), { from: 3, to: 8 });
assert.deepEqual(parseMemoryCoverageInterval('第12轮'), { from: 12, to: 12 });
assert.equal(buildMemoryTimelineLabel(3, 8), '第3-8轮');
assert.equal(extractMemoryTimelineRound('第3-8轮'), 8);

const stamped = stampMemoryCoverage(
  { time: '模型写错格式', summary: '本轮摘要' },
  { from: 4, to: 6, messageId: 'assistant-6', source: 'app' },
);
assert.deepEqual(stamped._coverage, {
  from: 4,
  to: 6,
  source: 'app',
  message_id: 'assistant-6',
});
assert.deepEqual(readMemoryCoverageInterval({ row_data: stamped }), {
  from: 4,
  to: 6,
  source: 'app',
});

const normalized = normalizeTimelineMemoryActionData({
  tableId: 'rp_summary',
  rowData: { time: '第999轮', summary: '摘要' },
  currentTurnNumber: 8,
  coverage: { from: 6, to: 8, messageId: 'm8', source: 'app' },
});
assert.equal(normalized.time, '第6-8轮');
assert.deepEqual(normalized._coverage, {
  from: 6,
  to: 8,
  source: 'app',
  message_id: 'm8',
});

const outline = normalizeTimelineMemoryActionData({
  tableId: 'rp_outline',
  rowData: { section: 'current', outline: '当前局面' },
  currentTurnNumber: 8,
  coverage: { from: 6, to: 8 },
});
assert.deepEqual(outline, { section: 'current', outline: '当前局面' });

assert.deepEqual(
  mergeMemoryCoverageIntervals([
    { from: 3, to: 5 },
    { from: 1, to: 2 },
    { from: 7, to: 9 },
    { from: 8, to: 10 },
  ]),
  [{ from: 1, to: 5 }, { from: 7, to: 10 }],
);

const summaryRow = (from, to = from, active = true) => ({
  is_active: active,
  row_data: {
    summary: `${from}-${to}`,
    _coverage: { from, to, source: 'app' },
  },
});

// memoryFillEveryN > 1：第 3 轮没有被任何摘要覆盖。
const fillEveryNHole = buildMemoryCoverageLine({
  summaryRows: [summaryRow(1, 2), summaryRow(4, 6)],
  fromTurn: 1,
  toTurn: 6,
});
assert.deepEqual(fillEveryNHole.holes, [{ from: 3, to: 3 }]);
assert.equal(fillEveryNHole.complete, false);

// separate 请求失败：第 5-6 轮形成连续空洞。
const separateFailureHole = buildMemoryCoverageLine({
  summaryRows: [summaryRow(1, 4), summaryRow(7, 8)],
  fromTurn: 1,
  toTurn: 8,
});
assert.deepEqual(separateFailureHole.holes, [{ from: 5, to: 6 }]);

// 删楼 / 停用摘要：停用行不得作为覆盖来源。
const deletedSummaryHole = buildMemoryCoverageLine({
  summaryRows: [summaryRow(1, 2), summaryRow(3, 3, false), summaryRow(4, 4)],
  fromTurn: 1,
  toTurn: 4,
});
assert.deepEqual(expandMemoryCoverageHoles(deletedSummaryHole.holes), [3]);

// 压缩行带区间时可继续证明旧轮次被覆盖。
const compactedCoverage = buildMemoryCoverageLine({
  summaryRows: [summaryRow(1, 20), summaryRow(21), summaryRow(22)],
  fromTurn: 1,
  toTurn: 22,
});
assert.equal(compactedCoverage.complete, true);
assert.equal(compactedCoverage.coverageRate, 1);

console.log('ok - app-stamped summary coverage survives bad model text and detects fill/failed/deleted holes');

// 盖章区间推导：模型只被要求写「本轮」摘要，区间不得按 contextRounds 放大。
// from = clamp(已有覆盖最大 to + 1, 1, currentTurn)；无先例 → 单点（保守）。
const coverageRow = (from, to, active = true) => ({
  is_active: active,
  row_data: { _coverage: { from, to, source: 'app' } },
});

// 无先例摘要行 → 单点，别用 contextRounds 推首行区间
assert.deepEqual(
  resolveMemoryCoverageStampInterval({ currentTurnNumber: 6, summaryRows: [] }),
  { from: 6, to: 6 },
);
// fillEveryN=3 的缺口：上次覆盖到 5、当前第 9 轮 → 恰好补上 6-9
assert.deepEqual(
  resolveMemoryCoverageStampInterval({ currentTurnNumber: 9, summaryRows: [coverageRow(1, 5)] }),
  { from: 6, to: 9 },
);
// 每轮都填时自动退化为单点
assert.deepEqual(
  resolveMemoryCoverageStampInterval({ currentTurnNumber: 6, summaryRows: [coverageRow(1, 5)] }),
  { from: 6, to: 6 },
);
// 手动编辑旧楼再抽取：已有覆盖 ≥ 当前轮 → 钳成单点，不得 from > to
assert.deepEqual(
  resolveMemoryCoverageStampInterval({ currentTurnNumber: 4, summaryRows: [coverageRow(1, 9)] }),
  { from: 4, to: 4 },
);
// 存量行只有 time 文本也算覆盖证据（兜底解析）
assert.deepEqual(
  resolveMemoryCoverageStampInterval({
    currentTurnNumber: 8,
    summaryRows: [{ is_active: true, row_data: { time: '第3-5轮', summary: '旧' } }],
  }),
  { from: 6, to: 8 },
);
// 停用行不算覆盖证据
assert.deepEqual(
  resolveMemoryCoverageStampInterval({ currentTurnNumber: 8, summaryRows: [coverageRow(1, 7, false)] }),
  { from: 8, to: 8 },
);
// 当前轮未知 → 不盖章
assert.equal(resolveMemoryCoverageStampInterval({ currentTurnNumber: 0, summaryRows: [] }), null);

console.log('ok - coverage stamp interval derives from prior covered turns instead of context rounds');


// 复数区间读取：_coverage.intervals（压缩产物的源区间并集）优先于单点跨度
assert.deepEqual(
  readMemoryCoverageIntervals({
    row_data: {
      _coverage: { from: 1, to: 5, source: 'compaction', intervals: [{ from: 1, to: 2 }, { from: 4, to: 5 }] },
    },
  }),
  [{ from: 1, to: 2, source: 'compaction' }, { from: 4, to: 5, source: 'compaction' }],
);
// 无 intervals 时退回单区间读取（含 time 文本兜底）
assert.deepEqual(
  readMemoryCoverageIntervals({ row_data: { time: '第3-4轮' } }),
  [{ from: 3, to: 4, source: 'model_text_fallback' }],
);
assert.deepEqual(readMemoryCoverageIntervals({ row_data: { summary: '无区间' } }), []);
// 覆盖线按并集算：压缩产物跨度 1-5、实际只盖 1-2 与 4-5 → 第 3 轮必须报洞
{
  const line = buildMemoryCoverageLine({
    summaryRows: [{
      is_active: true,
      row_data: {
        summary: '压缩',
        _coverage: { from: 1, to: 5, source: 'compaction', intervals: [{ from: 1, to: 2 }, { from: 4, to: 5 }] },
      },
    }],
    fromTurn: 1,
    toTurn: 5,
  });
  assert.deepEqual(line.holes, [{ from: 3, to: 3 }]);
  assert.equal(line.complete, false);
  assert.equal(line.coveredTurns, 4);
}
console.log('ok - coverage line honors interval union on compaction rows instead of span');
