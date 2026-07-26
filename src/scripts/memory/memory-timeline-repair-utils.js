import {
  buildMemoryTimelineLabel,
  extractMemoryTimelineRound,
  getMemoryRowSortOrder,
  isTimelineMemoryTableId,
} from './memory-row-order.js';
import {
  mergeMemoryCoverageIntervals,
  normalizeMemoryCoverageInterval,
  parseMemoryCoverageInterval,
} from './memory-coverage-utils.js';

const DEFAULT_MAX_MATCH_DISTANCE_MS = 15 * 60 * 1000;
export const MEMORY_TIMELINE_AUTO_REPAIR_VERSION = 'user-turn-v2';

export const normalizeMemoryTimelineAutoRepairState = (raw = null) => {
  if (!raw || typeof raw !== 'object') return {};
  const entries = raw.entries && typeof raw.entries === 'object' ? raw.entries : raw;
  const next = {};
  for (const [key, value] of Object.entries(entries || {})) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey || !value || typeof value !== 'object') continue;
    next[normalizedKey] = {
      status: String(value.status || '').trim() || 'done',
      at: Number.isFinite(Number(value.at)) ? Number(value.at) : 0,
      changed: Number.isFinite(Number(value.changed)) ? Number(value.changed) : 0,
      checked: Number.isFinite(Number(value.checked)) ? Number(value.checked) : 0,
      version: String(value.version || '').trim(),
    };
  }
  return next;
};

export const buildMemoryTimelineAutoRepairStateKey = ({
  scopeId = '',
  sessionId = '',
  version = MEMORY_TIMELINE_AUTO_REPAIR_VERSION,
} = {}) => {
  const scope = String(scopeId || 'default').trim() || 'default';
  const session = String(sessionId || '').trim();
  const ver = String(version || MEMORY_TIMELINE_AUTO_REPAIR_VERSION).trim();
  if (!session || !ver) return '';
  return `${scope}::${session}::${ver}`;
};

export const isMemoryTimelineAutoRepairDone = (state = {}, key = '') => {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return false;
  const entry = normalizeMemoryTimelineAutoRepairState(state)[normalizedKey];
  return entry?.status === 'done';
};

export const markMemoryTimelineAutoRepairDone = ({
  state = {},
  key = '',
  version = MEMORY_TIMELINE_AUTO_REPAIR_VERSION,
  changed = 0,
  checked = 0,
  now = Date.now(),
} = {}) => {
  const normalizedKey = String(key || '').trim();
  if (!normalizedKey) return normalizeMemoryTimelineAutoRepairState(state);
  return {
    ...normalizeMemoryTimelineAutoRepairState(state),
    [normalizedKey]: {
      status: 'done',
      at: Number.isFinite(Number(now)) ? Number(now) : Date.now(),
      changed: Math.max(0, Math.trunc(Number(changed) || 0)),
      checked: Math.max(0, Math.trunc(Number(checked) || 0)),
      version: String(version || MEMORY_TIMELINE_AUTO_REPAIR_VERSION).trim(),
    },
  };
};

const extractLongTimestamp = (value) => {
  const text = String(value || '');
  const match = text.match(/(?:^|[_-])(\d{10,})(?:[_-]|$)/) || text.match(/^(\d{10,})/);
  if (!match) return 0;
  const n = Number(match[1]);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export const getMemoryTimelineRowTimestamp = (row = null) => {
  const fromId = extractLongTimestamp(row?.id);
  if (fromId > 0) return fromId;
  const created = Number(row?.created_at || row?.createdAt || 0);
  if (Number.isFinite(created) && created > 0) return created;
  const updated = Number(row?.updated_at || row?.updatedAt || 0);
  if (Number.isFinite(updated) && updated > 0) return updated;
  return 0;
};

export const getMemoryTimelineMessageTimestamp = (message = null) => {
  const direct = Number(message?.timestamp || message?.created_at || message?.createdAt || 0);
  if (Number.isFinite(direct) && direct > 0) return direct;
  return extractLongTimestamp(message?.id);
};

export const isDefaultTimelineAssistantMessage = (message = null) => {
  if (!message || message.role !== 'assistant') return false;
  if (message.status === 'pending' || message.status === 'sending') return false;
  const meta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
  if (meta.isGreeting) return false;
  if (String(meta.kind || '').trim() === 'memory-table-push') return false;
  return true;
};

export const isDefaultTimelineUserMessage = (message = null) => {
  if (!message || message.role !== 'user') return false;
  const meta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
  if (meta.generatedByAssistant === true) return false;
  return true;
};

export const buildAssistantTimelineForMemoryRepair = ({
  messages = [],
  isTrackedAssistantMessage = isDefaultTimelineAssistantMessage,
  isTrackedUserMessage = isDefaultTimelineUserMessage,
} = {}) => {
  const timeline = [];
  let userTurn = 0;
  let assistantFloor = 0;
  for (const message of Array.isArray(messages) ? messages : []) {
    let trackedUser = false;
    try {
      trackedUser = Boolean(isTrackedUserMessage(message));
    } catch {
      trackedUser = false;
    }
    if (trackedUser) userTurn += 1;

    let tracked = false;
    try {
      tracked = Boolean(isTrackedAssistantMessage(message));
    } catch {
      tracked = false;
    }
    if (!tracked) continue;
    assistantFloor += 1;
    timeline.push({
      id: String(message?.id || '').trim(),
      floor: userTurn || assistantFloor,
      userTurn,
      assistantFloor,
      timestamp: getMemoryTimelineMessageTimestamp(message),
    });
  }
  return timeline;
};

// 锚点反查表：盖章锚点可能是用户消息（主发送链，盖章时本轮助手消息尚未 append）
// 或助手消息（滑动重生成 / 继续 / 手动编辑原文指定的具体楼层），两类都要能查到轮号。
export const buildMemoryTimelineMessageTurnMap = ({
  messages = [],
  isTrackedAssistantMessage = isDefaultTimelineAssistantMessage,
  isTrackedUserMessage = isDefaultTimelineUserMessage,
} = {}) => {
  const turnById = new Map();
  let userTurn = 0;
  let assistantFloor = 0;
  for (const message of Array.isArray(messages) ? messages : []) {
    let trackedUser = false;
    try {
      trackedUser = Boolean(isTrackedUserMessage(message));
    } catch {
      trackedUser = false;
    }
    if (trackedUser) userTurn += 1;

    let tracked = false;
    try {
      tracked = Boolean(isTrackedAssistantMessage(message));
    } catch {
      tracked = false;
    }
    if (tracked) assistantFloor += 1;
    if (!trackedUser && !tracked) continue;
    const id = String(message?.id || '').trim();
    if (!id || turnById.has(id)) continue;
    turnById.set(id, tracked ? (userTurn || assistantFloor) : userTurn);
  }
  return turnById;
};

export const matchMemoryTimelineRowToAssistant = ({
  row = null,
  assistantTimeline = [],
  maxDistanceMs = DEFAULT_MAX_MATCH_DISTANCE_MS,
} = {}) => {
  const rowTs = getMemoryTimelineRowTimestamp(row);
  if (!rowTs || !Array.isArray(assistantTimeline) || !assistantTimeline.length) return null;
  const tolerance = 1500;
  let candidate = null;
  for (const item of assistantTimeline) {
    const ts = Number(item?.timestamp || 0);
    if (!Number.isFinite(ts) || ts <= 0) continue;
    if (ts <= rowTs + tolerance) {
      const distance = Math.abs(rowTs - ts);
      const candidateDistance = candidate ? Math.abs(rowTs - Number(candidate.timestamp || 0)) : Infinity;
      if (!candidate || distance < candidateDistance) candidate = item;
    }
  }
  if (!candidate) {
    for (const item of assistantTimeline) {
      const ts = Number(item?.timestamp || 0);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      const distance = Math.abs(rowTs - ts);
      if (!candidate || distance < Math.abs(rowTs - candidate.timestamp)) candidate = item;
    }
  }
  if (!candidate) return null;
  const distance = Math.abs(rowTs - Number(candidate.timestamp || 0));
  const limit = Number(maxDistanceMs);
  if (Number.isFinite(limit) && limit > 0 && distance > limit) return null;
  return {
    ...candidate,
    distanceMs: distance,
    rowTimestamp: rowTs,
  };
};

const findTimelineRoundCandidate = ({
  assistantTimeline = [],
  round = null,
  rowTimestamp = 0,
  maxDistanceMs = DEFAULT_MAX_MATCH_DISTANCE_MS,
} = {}) => {
  const expectedRound = Math.trunc(Number(round));
  if (!Number.isFinite(expectedRound) || expectedRound <= 0) return null;
  if (!Array.isArray(assistantTimeline) || !assistantTimeline.length) return null;
  const rowTs = Number(rowTimestamp || 0);
  let candidate = null;
  for (const item of assistantTimeline) {
    if (Math.trunc(Number(item?.floor || 0)) !== expectedRound) continue;
    const ts = Number(item?.timestamp || 0);
    const distance = Number.isFinite(ts) && ts > 0 && rowTs > 0 ? Math.abs(rowTs - ts) : 0;
    const limit = Number(maxDistanceMs);
    if (Number.isFinite(limit) && limit > 0 && distance > limit) continue;
    if (!candidate || distance < Number(candidate.distanceMs || Infinity)) {
      candidate = {
        ...item,
        distanceMs: distance,
        rowTimestamp: rowTs,
      };
    }
  }
  return candidate;
};

export const buildMemoryTimelineRepairPlan = ({
  rows = [],
  messages = [],
  tables = [],
  isTrackedAssistantMessage = isDefaultTimelineAssistantMessage,
  isTrackedUserMessage = isDefaultTimelineUserMessage,
  maxDistanceMs = DEFAULT_MAX_MATCH_DISTANCE_MS,
} = {}) => {
  const tableById = new Map();
  for (const table of Array.isArray(tables) ? tables : []) {
    const id = String(table?.id || '').trim();
    if (id) tableById.set(id, table);
  }
  const assistantTimeline = buildAssistantTimelineForMemoryRepair({
    messages,
    isTrackedAssistantMessage,
    isTrackedUserMessage,
  });
  const messageTurnById = buildMemoryTimelineMessageTurnMap({
    messages,
    isTrackedAssistantMessage,
    isTrackedUserMessage,
  });
  const maxTimelineRound = assistantTimeline.reduce((max, item) => {
    const round = Math.trunc(Number(item?.floor || 0));
    return Number.isFinite(round) ? Math.max(max, round) : max;
  }, 0);
  const repairable = [];
  const unrepairable = [];
  let checked = 0;

  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.id || '').trim();
    const tableId = String(row?.table_id || row?.tableId || '').trim();
    if (!id || !tableId || !isTimelineMemoryTableId(tableId)) continue;
    const table = tableById.get(tableId);
    if (table && String(table.scope || '').trim().toLowerCase() === 'global') continue;
    checked += 1;
    const baseRowData = row?.row_data && typeof row.row_data === 'object' ? row.row_data : {};
    const coverageMeta = baseRowData?._coverage && typeof baseRowData._coverage === 'object'
      ? baseRowData._coverage
      : null;
    const coverageInterval = coverageMeta ? normalizeMemoryCoverageInterval(coverageMeta) : null;
    const coverageAnchorId = String(coverageMeta?.message_id || '').trim();
    if (coverageInterval && coverageAnchorId) {
      // app 盖章行：按锚定消息精确重排。删楼重编号后时间戳吸附会指错楼，
      // 且 _coverage 才是覆盖线护栏的权威输入，必须与 time 标签一起同步。
      const anchoredTurn = Math.trunc(Number(messageTurnById.get(coverageAnchorId) || 0));
      if (!anchoredTurn) continue; // 锚定消息已删除：保守不动，绝不退回时间戳吸附
      const expectedTo = anchoredTurn;
      const delta = expectedTo - coverageInterval.to;
      const anchoredSortOrder = getMemoryRowSortOrder(row);
      if (delta === 0 && anchoredSortOrder === expectedTo) continue;
      // 平移取 fail-closed：delta 由区间**末端**的锚点算出，被删楼层若落在区间内部，
      // 起点的真实位移小于 delta——起点不得随 delta 前移，否则会多 claim 一轮把洞盖住。
      // 多报洞只是多留几轮原文（费预算、可观测）；漏报洞会让覆盖护栏静默失效。
      // 同时夹住 from ≤ to，避免连续删楼把区间挤成反向。
      const shiftCoverageStart = value => Math.max(1, Math.max(value, value + delta));
      const shiftCoverageEnd = value => Math.max(1, value + delta);
      const expectedFrom = Math.min(shiftCoverageStart(coverageInterval.from), expectedTo);
      const nextCoverage = { ...coverageMeta, from: expectedFrom, to: expectedTo };
      if (Array.isArray(coverageMeta.intervals)) {
        // 夹到 expectedTo 后不同源区间可能压成同一段，落库前归一化，别存重复段
        nextCoverage.intervals = mergeMemoryCoverageIntervals(
          coverageMeta.intervals
            .map(interval => normalizeMemoryCoverageInterval(interval || {}))
            .filter(Boolean)
            .map((interval) => {
              const from = Math.min(shiftCoverageStart(interval.from), expectedTo);
              return { from, to: Math.min(Math.max(shiftCoverageEnd(interval.to), from), expectedTo) };
            }),
        );
      }
      repairable.push({
        rowId: id,
        tableId,
        currentRound: extractMemoryTimelineRound(baseRowData.time),
        currentSortOrder: anchoredSortOrder,
        expectedRound: expectedTo,
        assistantMessageId: coverageAnchorId,
        distanceMs: 0,
        rowTimestamp: getMemoryTimelineRowTimestamp(row),
        rowData: {
          ...baseRowData,
          time: buildMemoryTimelineLabel(expectedFrom, expectedTo),
          _coverage: nextCoverage,
        },
        sortOrder: expectedTo,
      });
      continue;
    }
    // 无锚定的 _coverage 行（压缩产物等）与滚动压缩行：区间权威在 _coverage，
    // 行时间戳是压缩/写入时刻，按时间戳吸附会把区间标签改写成错误的单点。
    if (coverageInterval || baseRowData?._summary_compaction?.level === 'rolling') continue;
    // 无 _coverage 的模型区间标签（第A-B轮）是展示兜底，禁止塌缩成单点。
    const fallbackInterval = parseMemoryCoverageInterval(baseRowData.time);
    if (fallbackInterval && fallbackInterval.from !== fallbackInterval.to) continue;
    const currentRound = extractMemoryTimelineRound(row?.row_data?.time);
    const currentSortOrder = getMemoryRowSortOrder(row);
    const rowTimestamp = getMemoryTimelineRowTimestamp(row);
    const match = matchMemoryTimelineRowToAssistant({
      row,
      assistantTimeline,
      maxDistanceMs,
    });
    const roundCandidate = findTimelineRoundCandidate({
      assistantTimeline,
      round: currentRound,
      rowTimestamp,
      maxDistanceMs,
    });
    if (
      currentRound !== null
      && currentSortOrder === currentRound
      && roundCandidate
    ) {
      continue;
    }
    if (!match?.floor) {
      if (currentRound !== null && maxTimelineRound && currentRound > maxTimelineRound) {
        unrepairable.push({
          rowId: id,
          tableId,
          currentRound,
          reason: 'unmatched-out-of-range',
        });
      }
      continue;
    }
    const expectedRound = Number(match.floor);
    if (currentRound === expectedRound && currentSortOrder === expectedRound) continue;
    const rowData = row?.row_data && typeof row.row_data === 'object' ? { ...row.row_data } : {};
    rowData.time = buildMemoryTimelineLabel(expectedRound);
    repairable.push({
      rowId: id,
      tableId,
      currentRound,
      currentSortOrder,
      expectedRound,
      assistantMessageId: match.id,
      distanceMs: match.distanceMs,
      rowTimestamp: match.rowTimestamp,
      rowData,
      sortOrder: expectedRound,
    });
  }

  return {
    checked,
    assistantCount: assistantTimeline.length,
    turnCount: maxTimelineRound,
    repairable,
    unrepairable,
    hasIssues: repairable.length > 0 || unrepairable.length > 0,
  };
};
