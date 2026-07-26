const toPositiveTurn = (value) => {
  const next = Math.trunc(Number(value));
  return Number.isFinite(next) && next > 0 ? next : null;
};

export const normalizeMemoryCoverageInterval = ({ from = null, to = null } = {}) => {
  const start = toPositiveTurn(from);
  const end = toPositiveTurn(to);
  if (start === null && end === null) return null;
  const left = start ?? end;
  const right = end ?? start;
  return {
    from: Math.min(left, right),
    to: Math.max(left, right),
  };
};

export const parseMemoryCoverageInterval = (value) => {
  const text = String(value ?? '').replace(/\s+/g, '');
  if (!text) return null;
  const range = text.match(/第(\d+)(?:-|—|~|～|至|到)(\d+)轮/);
  if (range) return normalizeMemoryCoverageInterval({ from: range[1], to: range[2] });
  const single = text.match(/第(\d+)轮/);
  return single ? normalizeMemoryCoverageInterval({ from: single[1], to: single[1] }) : null;
};

export const stampMemoryCoverage = (
  rowData = {},
  {
    from = null,
    to = null,
    messageId = '',
    source = 'app',
  } = {},
) => {
  const interval = normalizeMemoryCoverageInterval({ from, to });
  const next = rowData && typeof rowData === 'object' ? { ...rowData } : {};
  if (!interval) return next;
  next._coverage = {
    ...interval,
    source: String(source || 'app').trim() || 'app',
    ...(String(messageId || '').trim() ? { message_id: String(messageId).trim() } : {}),
  };
  return next;
};

export const readMemoryCoverageInterval = (row = {}) => {
  const data = row?.row_data && typeof row.row_data === 'object'
    ? row.row_data
    : (row && typeof row === 'object' ? row : {});
  const stamped = normalizeMemoryCoverageInterval(data?._coverage || {});
  if (stamped) return { ...stamped, source: String(data?._coverage?.source || 'app') };
  const fallback = parseMemoryCoverageInterval(data?.time);
  return fallback ? { ...fallback, source: 'model_text_fallback' } : null;
};

// 盖章区间推导：写表指引只要求模型产出「本轮」摘要，区间不能按独立请求
// 带了几轮上下文（contextRounds）放大——那会抹平覆盖线要检测的空洞（fail-open）。
// from = clamp(已有覆盖最大 to + 1, 1, currentTurn)：恰好补上「上次摘要到现在」的缺口；
// 每轮都填时退化为单点；无先例摘要行时取单点（保守，勿用 contextRounds 推首行）。
export const resolveMemoryCoverageStampInterval = ({
  currentTurnNumber = 0,
  summaryRows = [],
} = {}) => {
  const turn = toPositiveTurn(currentTurnNumber);
  if (turn === null) return null;
  const maxCoveredTurn = (Array.isArray(summaryRows) ? summaryRows : [])
    .filter(row => row?.is_active !== false)
    .map(readMemoryCoverageInterval)
    .filter(Boolean)
    .reduce((max, interval) => Math.max(max, interval.to), 0);
  const from = maxCoveredTurn > 0 ? Math.min(turn, maxCoveredTurn + 1) : turn;
  return { from, to: turn };
};

export const mergeMemoryCoverageIntervals = (intervals = []) => {
  const normalized = (Array.isArray(intervals) ? intervals : [])
    .map(interval => normalizeMemoryCoverageInterval(interval || {}))
    .filter(Boolean)
    .sort((a, b) => a.from - b.from || a.to - b.to);
  const merged = [];
  normalized.forEach((interval) => {
    const tail = merged[merged.length - 1];
    if (!tail || interval.from > tail.to + 1) {
      merged.push({ ...interval });
      return;
    }
    tail.to = Math.max(tail.to, interval.to);
  });
  return merged;
};

// 行级覆盖读取（复数版）：压缩产物用 _coverage.intervals 保留源区间并集，
// 单点 from/to 只是展示/排序用的跨度——覆盖线必须按并集算，否则源区间之间的
// 真实空洞会被跨度掩盖（吞洞），护栏恰在最需要它的场景失效。
export const readMemoryCoverageIntervals = (row = {}) => {
  const data = row?.row_data && typeof row.row_data === 'object'
    ? row.row_data
    : (row && typeof row === 'object' ? row : {});
  const meta = data?._coverage;
  if (meta && Array.isArray(meta.intervals)) {
    const merged = mergeMemoryCoverageIntervals(meta.intervals);
    if (merged.length) {
      const source = String(meta?.source || 'app');
      return merged.map(interval => ({ ...interval, source }));
    }
  }
  const single = readMemoryCoverageInterval(row);
  return single ? [single] : [];
};

export const buildMemoryCoverageLine = ({
  summaryRows = [],
  fromTurn = 1,
  toTurn = 0,
} = {}) => {
  const from = toPositiveTurn(fromTurn) || 1;
  const to = toPositiveTurn(toTurn);
  const intervals = mergeMemoryCoverageIntervals(
    (Array.isArray(summaryRows) ? summaryRows : [])
      .filter(row => row?.is_active !== false)
      .flatMap(readMemoryCoverageIntervals),
  );
  if (to === null || to < from) {
    return {
      fromTurn: from,
      toTurn: to,
      intervals,
      holes: [],
      coveredTurns: 0,
      targetTurns: 0,
      coverageRate: 1,
      complete: true,
    };
  }
  const holes = [];
  let cursor = from;
  intervals.forEach((interval) => {
    if (interval.to < from || interval.from > to) return;
    const start = Math.max(from, interval.from);
    const end = Math.min(to, interval.to);
    if (start > cursor) holes.push({ from: cursor, to: start - 1 });
    cursor = Math.max(cursor, end + 1);
  });
  if (cursor <= to) holes.push({ from: cursor, to });
  const targetTurns = to - from + 1;
  const missingTurns = holes.reduce((sum, hole) => sum + hole.to - hole.from + 1, 0);
  const coveredTurns = Math.max(0, targetTurns - missingTurns);
  return {
    fromTurn: from,
    toTurn: to,
    intervals,
    holes,
    coveredTurns,
    targetTurns,
    coverageRate: targetTurns > 0 ? coveredTurns / targetTurns : 1,
    complete: holes.length === 0,
  };
};

export const expandMemoryCoverageHoles = (holes = [], maxTurns = 10000) => {
  const out = [];
  const limit = Math.max(0, Math.trunc(Number(maxTurns)) || 0);
  for (const hole of Array.isArray(holes) ? holes : []) {
    const interval = normalizeMemoryCoverageInterval(hole || {});
    if (!interval) continue;
    for (let turn = interval.from; turn <= interval.to; turn += 1) {
      out.push(turn);
      if (limit > 0 && out.length >= limit) return out;
    }
  }
  return out;
};

