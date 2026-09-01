import {
  clampText,
  estimateTokens,
  formatMemoryRowText,
  normalizeMemoryCell,
} from './memory-prompt-utils.js';
import {
  formatMemoryPromptText,
  getMemoryPromptListSeparator,
  getMemoryPromptSourceSeparator,
} from './memory-prompt-locale.js';
import { buildWorldEntryMatchReport } from '../utils/world-entry-activation.js';

const SPLIT_RE = /[\s\r\n\t,，.。!！?？;；:：、|()[\]{}<>《》"'“”‘’`~@#%^&*+=]+/g;
const EXPLICIT_SPLIT_RE = /[\r\n,，;；、|]+/g;
const CJK_RUN_RE = /[\u3400-\u9fff]+/g;
const LATIN_TERM_RE = /[a-z0-9][a-z0-9_-]{2,}/gi;
const ENTITY_FIELD_IDS = new Set([
  'name',
  'title',
  'nickname',
  'names',
  'identity',
  'owner',
  'participants',
  'characters',
  'people',
  'person',
  'location',
  'place',
  'target',
  'relation',
]);
const STOP_TERMS = new Set([
  '这个',
  '那个',
  '这些',
  '那些',
  '现在',
  '今天',
  '昨天',
  '明天',
  '时候',
  '事情',
  '东西',
  '一个',
  '一些',
  '已经',
  '还是',
  '然后',
  '但是',
  '因为',
  '所以',
  '可以',
  '没有',
  '不是',
  '什么',
  '怎么',
  '我们',
  '你们',
  '他们',
  '她们',
  '自己',
  '当前',
  '记录',
  '摘要',
  '内容',
  '状态',
  '重要',
  '其他',
  '相关',
]);

const normalizeTermKey = value => String(value ?? '').trim().toLocaleLowerCase();
const ASCII_WORD_CHAR_RE = /[a-z0-9_-]/i;

const uniqueTerms = (values = [], max = 160) => {
  const seen = new Set();
  const output = [];
  (Array.isArray(values) ? values : []).forEach((value) => {
    const term = String(value ?? '').trim().replace(/^#+/, '');
    const key = normalizeTermKey(term);
    if (!key || STOP_TERMS.has(key) || seen.has(key)) return;
    if (key.length < 2 || key.length > 64) return;
    seen.add(key);
    output.push(term);
  });
  return output.slice(0, Math.max(0, Math.trunc(Number(max)) || 0));
};

export const parseMemoryKeywordList = (value) => {
  const source = Array.isArray(value) ? value : [value];
  const parts = source.flatMap(item => (
    typeof item === 'string'
      ? item.split(EXPLICIT_SPLIT_RE)
      : [normalizeMemoryCell(item)]
  ));
  return uniqueTerms(parts, 80);
};

export const extractMemoryRecallTerms = (text = '', { maxTerms = 160 } = {}) => {
  const source = String(text || '').toLocaleLowerCase();
  if (!source.trim()) return [];
  const terms = [];
  const chunks = source.split(SPLIT_RE).map(item => item.trim()).filter(Boolean);
  chunks.forEach((chunk) => {
    const latin = chunk.match(LATIN_TERM_RE) || [];
    terms.push(...latin);
    const cjkRuns = chunk.match(CJK_RUN_RE) || [];
    cjkRuns.forEach((run) => {
      const chars = Array.from(run);
      if (chars.length >= 2 && chars.length <= 8) terms.push(run);
      for (let size = 2; size <= 4; size += 1) {
        if (chars.length < size) continue;
        for (let index = 0; index <= chars.length - size; index += 1) {
          terms.push(chars.slice(index, index + size).join(''));
        }
      }
    });
  });
  return uniqueTerms(terms, maxTerms);
};

const resolveRowData = row => (
  row?.row_data && typeof row.row_data === 'object'
    ? row.row_data
    : (row?.rowData && typeof row.rowData === 'object' ? row.rowData : {})
);

const collectEntityTerms = (rowData = {}) => {
  const values = [];
  Object.entries(rowData || {}).forEach(([fieldId, value]) => {
    if (!ENTITY_FIELD_IDS.has(String(fieldId || '').trim().toLocaleLowerCase())) return;
    values.push(normalizeMemoryCell(value));
  });
  return uniqueTerms(values.flatMap(value => [
    ...String(value || '').split(EXPLICIT_SPLIT_RE),
    ...extractMemoryRecallTerms(value, { maxTerms: 40 }),
  ]), 80);
};

const hasSpecificTermMatch = (text = '', term = '') => {
  const source = String(text || '').toLocaleLowerCase();
  const needle = normalizeTermKey(term);
  if (!source || !needle) return false;
  let cursor = 0;
  while (cursor < source.length) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) return false;
    const before = index > 0 ? source[index - 1] : '';
    const afterIndex = index + needle.length;
    const after = afterIndex < source.length ? source[afterIndex] : '';
    const first = needle[0] || '';
    const last = needle[needle.length - 1] || '';
    const leftBoundaryPassed = !ASCII_WORD_CHAR_RE.test(first) || !ASCII_WORD_CHAR_RE.test(before);
    const rightBoundaryPassed = !ASCII_WORD_CHAR_RE.test(last) || !ASCII_WORD_CHAR_RE.test(after);
    if (leftBoundaryPassed && rightBoundaryPassed) return true;
    cursor = index + 1;
  }
  return false;
};

export const buildMemoryRecallCandidate = ({
  row = null,
  table = null,
  queryText = '',
  index = 0,
} = {}) => {
  if (!row || typeof row !== 'object') return null;
  const tableId = String(row?.table_id || row?.tableId || table?.id || '').trim();
  if (!tableId) return null;
  const rowData = resolveRowData(row);
  const rowText = formatMemoryRowText(rowData, table?.columns || [], tableId);
  const explicitKeywords = parseMemoryKeywordList(rowData?.keywords);
  const entityKeywords = collectEntityTerms(rowData);
  const lazyKeywords = extractMemoryRecallTerms(rowText);
  const keywords = explicitKeywords.length
    ? uniqueTerms([...explicitKeywords, ...entityKeywords])
    : uniqueTerms([...entityKeywords, ...lazyKeywords]);
  if (!keywords.length || !String(queryText || '').trim()) return null;
  const report = buildWorldEntryMatchReport(
    {
      key: keywords,
      content: rowText || formatMemoryPromptText('memory.value.empty', '（未填写）'),
      constant: false,
      disable: false,
      matchWholeWords: false,
    },
    { matchText: queryText },
  );
  if (!report.passed || !report.matchedPrimaryKeys.length) return null;
  const matchedPrimaryKeys = report.matchedPrimaryKeys.filter(
    term => hasSpecificTermMatch(queryText, term),
  );
  if (!matchedPrimaryKeys.length) return null;
  const explicitSet = new Set(explicitKeywords.map(normalizeTermKey));
  const entitySet = new Set(entityKeywords.map(normalizeTermKey));
  const explicitHits = matchedPrimaryKeys.filter(term => explicitSet.has(normalizeTermKey(term)));
  const entityHits = matchedPrimaryKeys.filter(term => (
    !explicitSet.has(normalizeTermKey(term))
    && entitySet.has(normalizeTermKey(term))
  ));
  const lazyHits = matchedPrimaryKeys.filter(term => (
    !explicitSet.has(normalizeTermKey(term))
    && !entitySet.has(normalizeTermKey(term))
  ));
  const updatedAt = Number.isFinite(Number(row?.updated_at ?? row?.updatedAt))
    ? Number(row?.updated_at ?? row?.updatedAt)
    : 0;
  const priority = Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0;
  const score =
    explicitHits.reduce((sum, term) => sum + 100 + Math.min(30, Array.from(term).length * 3), 0)
    + entityHits.reduce((sum, term) => sum + 20 + Math.min(20, Array.from(term).length * 2), 0)
    + lazyHits.reduce((sum, term) => sum + 5 + Math.min(12, Array.from(term).length), 0)
    + (row?.is_pinned ? 4 : 0)
    + Math.max(-3, Math.min(3, priority));
  const sourceKinds = [];
  if (explicitHits.length) sourceKinds.push(formatMemoryPromptText(
    'memory.recall.source.explicit',
    '显式关键词',
  ));
  if (entityHits.length) sourceKinds.push(formatMemoryPromptText(
    'memory.recall.source.entity',
    '实体字段',
  ));
  if (lazyHits.length) sourceKinds.push(formatMemoryPromptText(
    'memory.recall.source.lazy',
    '旧行懒索引',
  ));
  return {
    id: String(row?.id || `${tableId}:${index}`),
    row,
    tableId,
    tableName: String(table?.name || tableId).trim() || tableId,
    rowText,
    rowSummary: clampText(rowText, 160),
    explicitKeywords,
    matchedTerms: uniqueTerms(matchedPrimaryKeys, 20),
    explicitHits,
    entityHits,
    lazyHits,
    sourceKinds,
    score,
    updatedAt,
    index,
  };
};

const formatRecallLine = (candidate) => {
  const terms = candidate.matchedTerms.join(getMemoryPromptListSeparator());
  const source = candidate.sourceKinds.join(getMemoryPromptSourceSeparator()) || formatMemoryPromptText(
    'memory.recall.source.fallback',
    '关键词',
  );
  return formatMemoryPromptText(
    'memory.recall.line',
    '- {table}｜命中 {terms}（{source}）：{row}',
    { table: candidate.tableName, terms, source, row: candidate.rowText },
  );
};

export const buildMemoryKeywordRecallPlan = ({
  rows = [],
  tableById = null,
  queryText = '',
  tokenBudget = Number.POSITIVE_INFINITY,
  maxRows = 20,
  tokenMode = 'rough',
} = {}) => {
  const list = Array.isArray(rows) ? rows : [];
  const candidates = list
    .map((row, index) => buildMemoryRecallCandidate({
      row,
      table: tableById?.get?.(String(row?.table_id || row?.tableId || '').trim()) || null,
      queryText,
      index,
    }))
    .filter(Boolean)
    .sort((left, right) => (
      right.score - left.score
      || right.updatedAt - left.updatedAt
      || left.index - right.index
      || left.id.localeCompare(right.id)
    ));
  const quota = Number(tokenBudget);
  const safeBudget = Number.isFinite(quota) ? Math.max(0, Math.trunc(quota)) : Number.POSITIVE_INFINITY;
  const safeMaxRows = Number.isFinite(Number(maxRows))
    ? Math.max(0, Math.trunc(Number(maxRows)))
    : Number.POSITIVE_INFINITY;
  const header = formatMemoryPromptText('memory.recall.header', '【按需召回｜只读历史】');
  const headerTokens = estimateTokens(header, tokenMode);
  const selected = [];
  const truncated = [];
  let usedTokens = 0;
  candidates.forEach((candidate) => {
    const line = formatRecallLine(candidate);
    const lineTokens = estimateTokens(line, tokenMode);
    const nextTokens = usedTokens + lineTokens + (selected.length ? 0 : headerTokens);
    if (selected.length >= safeMaxRows) {
      truncated.push({ ...candidate, reason: 'max_rows' });
      return;
    }
    if (nextTokens > safeBudget) {
      truncated.push({ ...candidate, reason: 'max_tokens' });
      return;
    }
    selected.push({ ...candidate, line, tokens: lineTokens });
    usedTokens = nextTokens;
  });
  const text = selected.length
    ? [header, ...selected.map(item => item.line)].join('\n')
    : '';
  const detail = selected.length
    ? selected
        .map(item => `${item.tableName}：${item.matchedTerms.join('、')}（${item.sourceKinds.join('＋')}）`)
        .join('；')
    : '';
  const demandText = candidates.length
    ? [header, ...candidates.map(formatRecallLine)].join('\n')
    : '';
  return {
    text,
    tokens: usedTokens,
    quotaTokens: Number.isFinite(safeBudget) ? safeBudget : null,
    demandTokens: estimateTokens(demandText, tokenMode),
    queryTerms: extractMemoryRecallTerms(queryText, { maxTerms: 80 }),
    candidates,
    items: selected,
    truncated,
    overflowed: truncated.length > 0,
    detail,
  };
};
