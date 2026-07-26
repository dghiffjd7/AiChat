import {
  buildMemoryTablePlan,
  estimateTokens,
  isSummaryLimitTableId,
  isSummaryTableId,
  limitSummaryRowsForPrompt,
} from './memory-prompt-utils.js';
import { resolveMemoryRowOrderKey } from './memory-row-order.js';
import { isOutlineTableId } from './outline-section-utils.js';

export const classifyMemoryTableSegment = (tableId = '') => {
  if (isOutlineTableId(tableId)) return 'far';
  if (isSummaryTableId(tableId)) return 'mid';
  return 'state';
};

const ARCHIVE_STATUS_RE = /(?:已完成|完成|已结束|结束|已关闭|关闭|已离场|离场|已退出|退出|已死亡|死亡|作废|失效|completed|complete|closed|done|inactive|left|dead|cancelled|canceled)/i;
const ACTIVE_TASK_STATUS_RE = /(?:未完成|进行中|处理中|待办|待处理|开放|开启|active|open|pending|in[\s_-]*progress)/i;
const PRESENT_STATUS_RE = /^(?:否|不在|已离场|离场|false|no|0)$/i;
const ACTIVE_PERSON_STATUS_RE = /(?:未离场|未退出|未死亡|仍在|在场|存活|活跃|active|present|alive)/i;

export const isMemoryRowArchiveCandidate = (row = null) => {
  if (!row || typeof row !== 'object') return false;
  if (row.is_active === false) return true;
  const tableId = String(row?.table_id || row?.tableId || '').trim();
  const rowData = row?.row_data && typeof row.row_data === 'object'
    ? row.row_data
    : (row?.rowData && typeof row.rowData === 'object' ? row.rowData : {});
  if (tableId === 'important_people' || tableId === 'rp_important_people') {
    const present = String(rowData?.present ?? rowData?.is_present ?? '').trim();
    const status = String(rowData?.status || '').trim();
    if (PRESENT_STATUS_RE.test(present)) return true;
    if (!ACTIVE_PERSON_STATUS_RE.test(status) && ARCHIVE_STATUS_RE.test(status)) return true;
  }
  if (tableId === 'rp_tasks') {
    const status = String(rowData?.status || '').trim();
    return !ACTIVE_TASK_STATUS_RE.test(status) && ARCHIVE_STATUS_RE.test(status);
  }
  return false;
};

export const classifyMemoryRowSegment = (row = null) => {
  if (isMemoryRowArchiveCandidate(row)) return 'recall';
  return classifyMemoryTableSegment(row?.table_id || row?.tableId || '');
};

const SYSTEM_ARCHIVE_MARKERS = new Set(['compaction', 'outline_migration']);

// 召回准入：inactive 行只有带系统停用标记（压缩/迁移归档）才可被召回。
// 用户手动禁用（含存量已禁用行）没有标记——禁用最常见的原因就是内容判错，
// 召回把它端回模型等于把用户否决过的内容当权威事实。
export const isMemoryRowRecallEligible = (row = null) => {
  if (!row || typeof row !== 'object') return false;
  if (row.is_active !== false) return true;
  const rowData = row?.row_data && typeof row.row_data === 'object'
    ? row.row_data
    : (row?.rowData && typeof row.rowData === 'object' ? row.rowData : {});
  return SYSTEM_ARCHIVE_MARKERS.has(String(rowData?._archived_by || '').trim());
};

export const partitionMemoryRowsForPrompt = (
  rows = [],
  {
    archiveRetentionByTable = { events: 3 },
  } = {},
) => {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const archiveRefs = new Set(
    list.filter(row => isMemoryRowArchiveCandidate(row)),
  );
  const retention = archiveRetentionByTable && typeof archiveRetentionByTable === 'object'
    ? archiveRetentionByTable
    : {};
  Object.entries(retention).forEach(([tableId, rawLimit]) => {
    const limit = Math.max(0, Math.trunc(Number(rawLimit)) || 0);
    const candidates = list
      .map((row, index) => ({ row, index }))
      .filter(item => (
        !archiveRefs.has(item.row)
        && String(item.row?.table_id || item.row?.tableId || '').trim() === tableId
      ))
      .sort((left, right) => {
        const leftKey = resolveMemoryRowOrderKey(left.row, tableId, left.index);
        const rightKey = resolveMemoryRowOrderKey(right.row, tableId, right.index);
        return leftKey - rightKey || left.index - right.index;
      });
    const keepRefs = new Set(
      (limit > 0 ? candidates.slice(-limit) : []).map(item => item.row),
    );
    candidates.forEach(({ row }) => {
      if (!keepRefs.has(row)) archiveRefs.add(row);
    });
  });
  return {
    workingRows: list.filter(row => !archiveRefs.has(row)),
    archiveRows: list.filter(row => archiveRefs.has(row)),
  };
};

// 常驻/召回分层的唯一实现：bridge 注入链与离线评测器共用，防两侧口径漂移
// （尤其召回准入 isMemoryRowRecallEligible 必须一致，否则评测结果不代表生产）。
export const buildMemoryPromptRowLayers = (
  rows = [],
  {
    summaryRowLimit = 10,
    archiveRetentionByTable = { events: 3 },
  } = {},
) => {
  const list = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const layers = partitionMemoryRowsForPrompt(list, { archiveRetentionByTable });
  const workingRows = layers.workingRows.filter(row => row?.is_active !== false);
  const limitedRows = limitSummaryRowsForPrompt(workingRows, summaryRowLimit);
  const limitedRefs = new Set(limitedRows);
  const archiveRefs = new Set(layers.archiveRows);
  const recallCandidateRows = list.filter((row) => {
    if (archiveRefs.has(row)) return isMemoryRowRecallEligible(row);
    const tableId = String(row?.table_id || '').trim();
    return row?.is_active !== false
      && isSummaryLimitTableId(tableId)
      && !limitedRefs.has(row);
  });
  return {
    workingRows,
    archiveRows: layers.archiveRows,
    limitedRows,
    recallCandidateRows,
  };
};

const combineRowIndexMaps = (target, source) => {
  Object.entries(source || {}).forEach(([tableId, rowIds]) => {
    target[tableId] = Array.isArray(rowIds) ? [...rowIds] : [];
  });
};

export const estimateMemorySegmentDemands = ({
  rows = [],
  tableById = null,
  tableOrder = [],
  autoExtract = false,
  tokenMode = 'rough',
} = {}) => {
  const demands = { state: 0, mid: 0, far: 0 };
  Object.keys(demands).forEach((segment) => {
    const segmentRows = (Array.isArray(rows) ? rows : [])
      .filter(row => classifyMemoryRowSegment(row) === segment);
    const plan = buildMemoryTablePlan({
      rows: segmentRows,
      tableById,
      tableOrder,
      autoExtract,
      maxRows: Number.POSITIVE_INFINITY,
      tokenBudgetData: Number.POSITIVE_INFINITY,
      tokenMode,
    });
    demands[segment] = estimateTokens(plan.tableData, tokenMode);
  });
  return demands;
};

export const buildSegmentedMemoryTablePlan = ({
  rows = [],
  tableById = null,
  tableOrder = [],
  autoExtract = false,
  maxRows = Number.POSITIVE_INFINITY,
  tokenQuotas = null,
  tokenMode = 'rough',
  preserveState = true,
} = {}) => {
  const segments = {};
  const items = [];
  const truncated = [];
  const tableParts = [];
  const rowIndexMap = {};
  let rowsRemaining = maxRows;

  ['state', 'mid', 'far'].forEach((segment) => {
    const segmentRows = (Array.isArray(rows) ? rows : [])
      .filter(row => classifyMemoryRowSegment(row) === segment);
    const demandPlan = buildMemoryTablePlan({
      rows: segmentRows,
      tableById,
      tableOrder,
      autoExtract,
      maxRows: Number.POSITIVE_INFINITY,
      tokenBudgetData: Number.POSITIVE_INFINITY,
      tokenMode,
    });
    const demandTokens = estimateTokens(demandPlan.tableData, tokenMode);
    const rawQuota = Number(tokenQuotas?.[segment]);
    const quota = Number.isFinite(rawQuota) && rawQuota >= 0
      ? rawQuota
      : Number.POSITIVE_INFINITY;
    const effectiveQuota = segment === 'state' && preserveState
      ? Number.POSITIVE_INFINITY
      : quota;
    const plan = buildMemoryTablePlan({
      rows: segmentRows,
      tableById,
      tableOrder,
      autoExtract,
      maxRows: rowsRemaining,
      tokenBudgetData: effectiveQuota,
      tokenMode,
    });
    const usedTokens = estimateTokens(plan.tableData, tokenMode);
    segments[segment] = {
      ...plan,
      demandTokens,
      quotaTokens: Number.isFinite(quota) ? quota : null,
      usedTokens,
      overflowed: Number.isFinite(quota) && demandTokens > quota,
    };
    items.push(...(plan.items || []));
    truncated.push(...(plan.truncated || []).map(item => ({ ...item, segment })));
    if (plan.tableData) tableParts.push(plan.tableData);
    combineRowIndexMaps(rowIndexMap, plan.rowIndexMap);
    if (Number.isFinite(rowsRemaining)) {
      rowsRemaining = Math.max(0, rowsRemaining - (plan.items || []).length);
    }
  });

  return {
    items,
    truncated,
    tableData: tableParts.join('\n').trim(),
    rowIndexMap,
    tableOrder: Array.isArray(tableOrder) ? [...tableOrder] : [],
    tableById,
    segments,
  };
};
