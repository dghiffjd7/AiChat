import {
  buildMemoryTimelineLabel,
  computeNextMemoryRowSortOrder,
  extractMemoryTimelineRound,
  isTimelineMemoryTableId,
} from '../../memory/memory-row-order.js';
import { normalizeMemoryCellValue } from './memory-edit-utils.js';

export const resolveMemoryActionTableId = ({
  action = null,
  tableById = null,
  tableNameMap = null,
  tableOrder = [],
} = {}) => {
  const rawId = String(action?.tableId || '').trim();
  if (rawId && tableById?.has(rawId)) return rawId;

  const rawName = String(action?.tableName || '')
    .trim()
    .toLowerCase();
  if (rawName && tableNameMap?.has(rawName)) return tableNameMap.get(rawName);

  const idxRaw = action?.tableIndex;
  const idx = Number.isFinite(Number(idxRaw)) ? Math.trunc(Number(idxRaw)) : null;
  if (idx !== null && idx >= 0 && idx < tableOrder.length) {
    const id = String(tableOrder[idx] || '').trim();
    if (id && tableById?.has(id)) return id;
  }

  return '';
};

export const resolveMemoryActionRowId = ({
  action = null,
  tableId = '',
  rowIndexMap = null,
} = {}) => {
  const rowId = String(action?.rowId || '').trim();
  if (rowId) return rowId;

  const rowIndexRaw = action?.rowIndex;
  const rowIndex = Number.isFinite(Number(rowIndexRaw)) ? Math.trunc(Number(rowIndexRaw)) : null;
  if (rowIndex === null || rowIndex < 0) return '';

  const map = rowIndexMap?.[tableId];
  if (Array.isArray(map) && rowIndex < map.length) return String(map[rowIndex] || '').trim();
  return '';
};

export const resolveMemoryActionRowIdByData = ({
  tableId = '',
  scopeKey = '',
  data = null,
  table = null,
  rowsByTableScope = null,
} = {}) => {
  if (!data || typeof data !== 'object') return '';
  const rows = rowsByTableScope?.get?.(`${tableId}:${scopeKey}`) || [];
  if (!rows.length) return '';

  const normalize = value => String(normalizeMemoryCellValue(value ?? '')).trim();
  const candidates = [];
  const preferredKeys = ['name', 'time', 'title', 'id'];
  preferredKeys.forEach((key) => {
    const value = normalize(data[key]);
    if (value) candidates.push({ key, value });
  });
  if (!candidates.length) {
    const firstColId = String(table?.columns?.[0]?.id || '').trim();
    const value = normalize(firstColId ? data[firstColId] : '');
    if (firstColId && value) candidates.push({ key: firstColId, value });
  }

  for (const candidate of candidates) {
    const matches = rows.filter(
      row => normalize(row?.row_data?.[candidate.key]) === candidate.value,
    );
    if (matches.length === 1) return String(matches[0]?.id || '').trim();
    if (matches.length > 1) return '';
  }

  if (rows.length === 1) return String(rows[0]?.id || '').trim();
  return '';
};

export const resolveMemoryTableScope = ({
  table = null,
  useSharedGlobalScope = false,
  sessionId = '',
  isGroup = false,
} = {}) => {
  if (useSharedGlobalScope) return { key: 'global', contactId: null, groupId: null };

  const scope = String(table?.scope || '')
    .trim()
    .toLowerCase();
  if (scope === 'global') return { key: 'global', contactId: null, groupId: null };
  if (scope === 'group') return { key: 'group', contactId: null, groupId: sessionId };
  if (scope === 'contact') return { key: 'contact', contactId: sessionId, groupId: null };
  return isGroup
    ? { key: 'group', contactId: null, groupId: sessionId }
    : { key: 'contact', contactId: sessionId, groupId: null };
};

export const countAssistantTurnsForMemoryTimeline = (messages = []) => {
  const list = Array.isArray(messages) ? messages : [];
  let count = 0;
  for (const message of list) {
    if (!message || message.role !== 'assistant') continue;
    if (message.status === 'pending' || message.status === 'sending') continue;
    const meta = message?.meta && typeof message.meta === 'object' ? message.meta : {};
    if (meta.isGreeting) continue;
    if (String(meta.kind || '').trim() === 'memory-table-push') continue;
    count += 1;
  }
  return count;
};

export const normalizeTimelineMemoryActionData = ({
  tableId = '',
  rowData = null,
  currentTurnNumber = 0,
} = {}) => {
  const next = rowData && typeof rowData === 'object' ? { ...rowData } : {};
  if (!isTimelineMemoryTableId(tableId)) return next;
  if (currentTurnNumber > 0) {
    next.time = buildMemoryTimelineLabel(currentTurnNumber);
    return next;
  }
  const round = extractMemoryTimelineRound(next.time);
  if (round !== null) next.time = buildMemoryTimelineLabel(round);
  return next;
};

export const resolveMemoryInsertSortOrder = ({
  tableId = '',
  existingRows = [],
  rowData = {},
} = {}) => {
  if (isTimelineMemoryTableId(tableId)) {
    const round = extractMemoryTimelineRound(rowData?.time);
    if (round !== null) return round;
  }
  return computeNextMemoryRowSortOrder(existingRows, tableId);
};

export const pickNewestMemoryRow = (rows = []) => {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;

  const scored = list.map((row, idx) => {
    const ts = Number(row?.updated_at || row?.created_at || 0);
    return { row, ts: Number.isFinite(ts) ? ts : 0, idx };
  });
  scored.sort((left, right) => right.ts - left.ts || right.idx - left.idx);
  return scored[0]?.row || null;
};
