import { extractMemoryTimelineRound, resolveMemoryRowOrderKey } from './memory-row-order.js';

const MEMORY_PROMPT_POSITIONS = new Set(['after_persona', 'system_end', 'before_chat', 'history_depth']);
const SUMMARY_TABLE_IDS = new Set(['chat_summary', 'group_summary', 'chat_outline', 'group_outline', 'rp_summary', 'rp_outline']);
const SUMMARY_LIMIT_TABLE_IDS = new Set(['chat_summary', 'group_summary', 'rp_summary']);

export const isSummaryTableId = (tableId) => {
  const id = String(tableId || '').trim();
  return SUMMARY_TABLE_IDS.has(id);
};

export const isSummaryLimitTableId = (tableId) => {
  const id = String(tableId || '').trim();
  return SUMMARY_LIMIT_TABLE_IDS.has(id);
};

export const normalizeMemoryUpdateMode = (raw, defaultMode = 'full') => {
  const mode = String(raw || '').trim().toLowerCase();
  if (!mode) return defaultMode;
  if (mode === 'summary' || mode === 'summary-only' || mode === 'summary_only') return 'summary';
  if (mode === 'standard' || mode === 'standard-only' || mode === 'standard_only') return 'standard';
  if (mode === 'full' || mode === 'all' || mode === 'unified') return 'full';
  if (mode.includes('summary')) return 'summary';
  if (mode.includes('standard')) return 'standard';
  if (mode.includes('full') || mode.includes('unified') || mode.includes('all')) return 'full';
  return defaultMode;
};

export const parseMemoryPromptPositions = (raw) => {
  if (Array.isArray(raw)) {
    return raw
      .map(item => String(item || '').trim().toLowerCase())
      .filter(pos => MEMORY_PROMPT_POSITIONS.has(pos));
  }
  const text = String(raw || '').trim().toLowerCase();
  if (!text) return [];
  const parts = text.split(/[+,]/).map(part => part.trim()).filter(Boolean);
  const out = [];
  parts.forEach((part) => {
    if (!MEMORY_PROMPT_POSITIONS.has(part)) return;
    if (!out.includes(part)) out.push(part);
  });
  return out;
};

export const normalizeTokenMode = (raw) => {
  const mode = String(raw || '').trim().toLowerCase();
  return mode === 'strict' ? 'strict' : 'rough';
};

export const estimateTokens = (text, mode = 'rough') => {
  const raw = String(text || '');
  if (!raw.trim()) return 0;
  if (mode === 'strict') {
    return Math.max(1, raw.length);
  }
  let ascii = 0;
  let nonAscii = 0;
  for (const ch of raw) {
    if (ch.charCodeAt(0) <= 0x7f) ascii += 1;
    else nonAscii += 1;
  }
  return Math.max(1, Math.ceil(nonAscii + ascii / 4));
};

export const clampText = (value, max = 140) => {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

export const normalizeMemoryCell = (value) => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const normalizePromptCellText = (value) => normalizeMemoryCell(value).replace(/\s*\r?\n\s*/g, ' / ').trim();

const extractTimelineRound = (value) => extractMemoryTimelineRound(normalizePromptCellText(value));

const extractTimelineRoundLabel = (value) => {
  const round = extractTimelineRound(value);
  if (Number.isFinite(round)) return `第${round}轮`;
  return normalizePromptCellText(value);
};

const extractTimelineContentText = (rowData, columns) => {
  const summary = normalizePromptCellText(rowData?.summary);
  if (summary) return summary;
  const outline = normalizePromptCellText(rowData?.outline);
  if (outline) return outline;
  for (const col of Array.isArray(columns) ? columns : []) {
    const colId = String(col?.id || '').trim();
    if (!colId || colId === 'time') continue;
    const text = normalizePromptCellText(rowData?.[colId]);
    if (text) return text;
  }
  return '';
};

const resolveSummaryTablePromptOrderKey = (row, fallback = 0) => {
  return resolveMemoryRowOrderKey(row, row?.table_id || row?.tableId || '', fallback);
};

export const formatMemoryRowText = (rowData, columns, tableId = '') => {
  const id = String(tableId || '').trim();
  if (SUMMARY_TABLE_IDS.has(id)) {
    const roundLabel = extractTimelineRoundLabel(rowData?.time);
    const content = extractTimelineContentText(rowData, columns);
    if (roundLabel && content) return `${roundLabel}：${content}`;
    if (content) return content;
    if (roundLabel) return roundLabel;
    return '（未填写）';
  }
  const parts = [];
  for (const col of Array.isArray(columns) ? columns : []) {
    const colId = String(col?.id || '').trim();
    if (!colId) continue;
    const label = String(col?.name || colId).trim();
    const text = normalizePromptCellText(rowData?.[colId]);
    if (!text) continue;
    parts.push(label ? `${label}: ${text}` : text);
  }
  if (!parts.length) return '（未填写）';
  return parts.join('；');
};

export const buildMemoryTablePlan = ({
  rows,
  tableById,
  tableOrder,
  autoExtract,
  maxRows,
  tokenBudgetData,
  tokenMode,
} = {}) => {
  const nextTableById = new Map(tableById || []);
  const nextTableOrder = Array.isArray(tableOrder) ? [...tableOrder] : [];
  const list = Array.isArray(rows) ? rows : [];
  const items = [];

  for (const row of list) {
    const tableId = String(row?.table_id || '').trim();
    if (!tableId) continue;
    if (!nextTableById.has(tableId)) {
      nextTableById.set(tableId, { id: tableId, name: tableId, columns: [] });
      if (!nextTableOrder.includes(tableId)) nextTableOrder.push(tableId);
    }
    const table = nextTableById.get(tableId);
    const rowText = formatMemoryRowText(row?.row_data || {}, table?.columns || [], tableId);
    items.push({
      id: String(row?.id || ''),
      tableId,
      tableName: String(table?.name || tableId),
      rowText,
      rowSummary: clampText(rowText, 120),
      rowData: row?.row_data || {},
      isPinned: Boolean(row?.is_pinned),
      priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
      updatedAt: Number.isFinite(Number(row?.updated_at)) ? Number(row.updated_at) : 0,
      scope: row?.contact_id ? 'contact' : row?.group_id ? 'group' : 'global',
    });
  }

  const sortByPriority = (a, b) => {
    if (a.priority !== b.priority) return b.priority - a.priority;
    if (a.updatedAt !== b.updatedAt) return b.updatedAt - a.updatedAt;
    return String(b.id).localeCompare(String(a.id));
  };
  const pinned = items.filter(it => it.isPinned).sort(sortByPriority);
  const normal = items.filter(it => !it.isPinned).sort(sortByPriority);
  const ordered = [...pinned, ...normal];
  const rowPrefixTokens = autoExtract ? estimateTokens('- [0] ', tokenMode) : 0;

  const selected = [];
  const truncated = [];
  const rowsByTable = new Map();
  const includedTables = new Set();
  let tokenUsed = 0;

  for (const item of ordered) {
    if (selected.length >= maxRows) {
      truncated.push({ ...item, reason: 'max_rows' });
      continue;
    }
    const tableId = item.tableId;
    const table = nextTableById.get(tableId) || { id: tableId, name: tableId };
    const headerLabel = String(table?.name || tableId);
    const headerText = autoExtract ? `【${headerLabel}｜${tableId}】` : `【${headerLabel}】`;
    const headerTokens = includedTables.has(tableId) ? 0 : estimateTokens(headerText, tokenMode);
    const rowTokens = estimateTokens(item.rowText, tokenMode) + rowPrefixTokens;
    const nextTokens = tokenUsed + headerTokens + rowTokens;
    if (nextTokens > tokenBudgetData) {
      truncated.push({ ...item, reason: 'max_tokens' });
      continue;
    }
    if (!includedTables.has(tableId)) includedTables.add(tableId);
    tokenUsed = nextTokens;
    const withTokens = { ...item, tokens: rowTokens };
    selected.push(withTokens);
    if (!rowsByTable.has(tableId)) rowsByTable.set(tableId, []);
    rowsByTable.get(tableId).push(withTokens);
  }

  const tableParts = [];
  const rowIndexMap = {};
  for (const tableId of nextTableOrder) {
    const rowsForTable = rowsByTable.get(tableId) || [];
    if (!rowsForTable.length) continue;
    const table = nextTableById.get(tableId) || { id: tableId, name: tableId };
    const tableLabel = String(table?.name || tableId);
    tableParts.push(autoExtract ? `【${tableLabel}｜${tableId}】` : `【${tableLabel}】`);
    const orderedRows = rowsForTable.slice();
    if (SUMMARY_TABLE_IDS.has(tableId)) {
      orderedRows.sort((a, b) => {
        const ak = resolveSummaryTablePromptOrderKey(a, Number(a?.updatedAt) || 0);
        const bk = resolveSummaryTablePromptOrderKey(b, Number(b?.updatedAt) || 0);
        if (ak !== bk) return ak - bk;
        const au = Number(a?.updatedAt) || 0;
        const bu = Number(b?.updatedAt) || 0;
        if (au !== bu) return au - bu;
        return String(a?.id || '').localeCompare(String(b?.id || ''));
      });
    }
    orderedRows.forEach((row, index) => {
      const line = String(row?.rowText || '').trim();
      const prefix = autoExtract ? `- [${index}] ` : '- ';
      tableParts.push(`${prefix}${line || '（未填写）'}`);
      if (autoExtract) {
        if (!rowIndexMap[tableId]) rowIndexMap[tableId] = [];
        rowIndexMap[tableId][index] = row.id;
      }
    });
  }
  const tableData = tableParts.join('\n').trim();

  return {
    items: selected,
    truncated,
    tableData,
    rowIndexMap,
    tableOrder: nextTableOrder,
    tableById: nextTableById,
  };
};
