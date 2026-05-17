const TIMELINE_TABLE_IDS = new Set([
  'chat_summary',
  'group_summary',
  'chat_outline',
  'group_outline',
  'rp_summary',
  'rp_outline',
  'moment_summary',
  'moment_outline',
]);

const TIMELINE_ROUND_RE = /第\s*(\d+)\s*轮/;

const toFiniteNumber = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const normalizeTimelineText = (value) => String(value ?? '').replace(/\s*\r?\n\s*/g, ' / ').trim();

export const isTimelineMemoryTableId = (tableId) => TIMELINE_TABLE_IDS.has(String(tableId || '').trim());

export const extractMemoryTimelineRound = (value) => {
  const text = normalizeTimelineText(value);
  if (!text) return null;
  const match = text.match(TIMELINE_ROUND_RE);
  if (!match) return null;
  return toFiniteNumber(match[1]);
};

export const buildMemoryTimelineLabel = (turnNumber) => {
  const round = Math.trunc(Number(turnNumber));
  return Number.isFinite(round) && round >= 0 ? `第${round}轮` : '';
};

export const getMemoryRowPriority = (row) => {
  const priority = toFiniteNumber(row?.priority);
  return priority ?? 0;
};

export const getMemoryRowSortOrder = (row) => {
  const direct = toFiniteNumber(row?.sort_order);
  if (direct !== null && direct !== 0) return direct;
  const camel = toFiniteNumber(row?.sortOrder);
  if (camel !== null && camel !== 0) return camel;
  return null;
};

export const getMemoryRowCreatedAt = (row) => {
  const direct = toFiniteNumber(row?.created_at);
  if (direct !== null && direct > 0) return direct;
  const camel = toFiniteNumber(row?.createdAt);
  if (camel !== null && camel > 0) return camel;
  return null;
};

export const getMemoryRowUpdatedAt = (row) => {
  const direct = toFiniteNumber(row?.updated_at);
  if (direct !== null && direct > 0) return direct;
  const camel = toFiniteNumber(row?.updatedAt);
  if (camel !== null && camel > 0) return camel;
  return null;
};

export const resolveMemoryRowOrderKey = (row, tableId = '', fallback = 0) => {
  const normalizedTableId = String(tableId || row?.table_id || row?.tableId || '').trim();
  const sortOrder = getMemoryRowSortOrder(row);
  if (sortOrder !== null) return sortOrder;
  if (isTimelineMemoryTableId(normalizedTableId)) {
    const round = extractMemoryTimelineRound(row?.row_data?.time ?? row?.rowData?.time ?? row?.time);
    if (round !== null) return round;
  }
  const createdAt = getMemoryRowCreatedAt(row);
  if (createdAt !== null) return createdAt;
  const updatedAt = getMemoryRowUpdatedAt(row);
  if (updatedAt !== null) return updatedAt;
  return toFiniteNumber(fallback) ?? 0;
};

export const compareMemoryRows = (left, right, options = {}) => {
  const tableId = String(options?.tableId || left?.table_id || right?.table_id || '').trim();
  if (options?.preferPinned !== false) {
    const leftPinned = Boolean(left?.is_pinned);
    const rightPinned = Boolean(right?.is_pinned);
    if (leftPinned !== rightPinned) return leftPinned ? -1 : 1;
  }
  if (options?.preferPriority !== false) {
    const leftPriority = getMemoryRowPriority(left);
    const rightPriority = getMemoryRowPriority(right);
    if (leftPriority !== rightPriority) return rightPriority - leftPriority;
  }
  const leftKey = resolveMemoryRowOrderKey(left, tableId, options?.leftFallback ?? 0);
  const rightKey = resolveMemoryRowOrderKey(right, tableId, options?.rightFallback ?? 0);
  if (leftKey !== rightKey) return leftKey - rightKey;

  const leftCreatedAt = getMemoryRowCreatedAt(left);
  const rightCreatedAt = getMemoryRowCreatedAt(right);
  if (leftCreatedAt !== rightCreatedAt) {
    return (leftCreatedAt ?? 0) - (rightCreatedAt ?? 0);
  }

  const leftUpdatedAt = getMemoryRowUpdatedAt(left);
  const rightUpdatedAt = getMemoryRowUpdatedAt(right);
  if (leftUpdatedAt !== rightUpdatedAt) {
    return (leftUpdatedAt ?? 0) - (rightUpdatedAt ?? 0);
  }

  return String(left?.id || '').localeCompare(String(right?.id || ''));
};

export const sortMemoryRows = (rows = [], options = {}) => (
  (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const cmp = compareMemoryRows(left.row, right.row, {
        ...options,
        leftFallback: left.index,
        rightFallback: right.index,
      });
      return cmp || left.index - right.index;
    })
    .map(item => item.row)
);

export const sortMemoryRowsForSnapshot = (rows = []) => (
  (Array.isArray(rows) ? rows : [])
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const leftTableId = String(left.row?.table_id || '').trim();
      const rightTableId = String(right.row?.table_id || '').trim();
      if (leftTableId !== rightTableId) return leftTableId.localeCompare(rightTableId);
      const cmp = compareMemoryRows(left.row, right.row, {
        tableId: leftTableId,
        leftFallback: left.index,
        rightFallback: right.index,
      });
      return cmp || left.index - right.index;
    })
    .map(item => item.row)
);

export const computeNextMemoryRowSortOrder = (rows = [], tableId = '') => {
  const list = Array.isArray(rows) ? rows : [];
  const normalizedTableId = String(tableId || '').trim();
  if (isTimelineMemoryTableId(normalizedTableId)) {
    let maxRound = 0;
    list.forEach((row, index) => {
      const round = extractMemoryTimelineRound(row?.row_data?.time ?? row?.rowData?.time ?? row?.time);
      const sortOrder = getMemoryRowSortOrder(row);
      const candidate = round ?? (sortOrder !== null && sortOrder > 0 && sortOrder < 1_000_000 ? sortOrder : null);
      if (candidate !== null) maxRound = Math.max(maxRound, candidate);
      else maxRound = Math.max(maxRound, index + 1);
    });
    return maxRound + 1;
  }

  let maxOrder = 0;
  list.forEach((row) => {
    const sortOrder = getMemoryRowSortOrder(row);
    if (sortOrder !== null && sortOrder > 0) {
      maxOrder = Math.max(maxOrder, sortOrder);
      return;
    }
    const createdAt = getMemoryRowCreatedAt(row);
    const updatedAt = getMemoryRowUpdatedAt(row);
    if (createdAt !== null) maxOrder = Math.max(maxOrder, createdAt);
    if (updatedAt !== null) maxOrder = Math.max(maxOrder, updatedAt);
  });
  return Math.max(maxOrder, Date.now()) + 1;
};
