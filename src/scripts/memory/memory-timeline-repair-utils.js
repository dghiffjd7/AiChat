import {
  buildMemoryTimelineLabel,
  extractMemoryTimelineRound,
  getMemoryRowSortOrder,
  isTimelineMemoryTableId,
} from './memory-row-order.js';

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
    const match = matchMemoryTimelineRowToAssistant({
      row,
      assistantTimeline,
      maxDistanceMs,
    });
    if (!match?.floor) {
      const currentRound = extractMemoryTimelineRound(row?.row_data?.time);
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
    const currentRound = extractMemoryTimelineRound(row?.row_data?.time);
    const currentSortOrder = getMemoryRowSortOrder(row);
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
