import { extractMemoryRecallTerms } from './memory-keyword-recall-utils.js';

const GENERIC_TERMS = new Set([
  '设定',
  '背景',
  '说明',
  '资料',
  '世界',
  '角色',
  '人物',
  '世界书',
  '条目',
  '信息',
  '规则',
  '格式',
  '内容',
  '未命名',
]);

const normalizeKey = value => String(value ?? '').trim().toLocaleLowerCase();

const uniqueTerms = (values = []) => {
  const seen = new Set();
  const output = [];
  values.forEach((value) => {
    const term = String(value ?? '').trim();
    const key = normalizeKey(term);
    if (!key || key.length < 2 || key.length > 48 || GENERIC_TERMS.has(key) || seen.has(key)) return;
    if (term.startsWith('/') && term.endsWith('/')) return;
    seen.add(key);
    output.push(term);
  });
  return output;
};

const resolveEntryTerms = (entry = {}) => {
  const keys = Array.isArray(entry?.keys)
    ? entry.keys
    : (Array.isArray(entry?.key) ? entry.key : []);
  const title = String(entry?.title || entry?.comment || entry?.name || '').trim();
  const explicit = uniqueTerms(keys);
  if (explicit.length) return explicit;
  return uniqueTerms(extractMemoryRecallTerms(title, { maxTerms: 40 }));
};

const countTerm = (text = '', term = '') => {
  const source = String(text || '').toLocaleLowerCase();
  const needle = normalizeKey(term);
  if (!source || !needle) return 0;
  if (/^[a-z0-9_-]+$/i.test(needle)) {
    const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    try {
      return (source.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || []).length;
    } catch {
      return 0;
    }
  }
  let count = 0;
  let cursor = 0;
  while (cursor < source.length) {
    const index = source.indexOf(needle, cursor);
    if (index < 0) break;
    count += 1;
    cursor = index + Math.max(1, needle.length);
  }
  return count;
};

export const buildWorldbookDowngradeSuggestion = ({
  entry = null,
  memoryItems = [],
} = {}) => {
  if (!entry || typeof entry !== 'object' || entry.constant !== true || entry.disabled === true || entry.disable === true) {
    return null;
  }
  const terms = resolveEntryTerms(entry);
  if (!terms.length) return null;
  const coveredRows = [];
  const termCounts = new Map();
  (Array.isArray(memoryItems) ? memoryItems : []).forEach((item) => {
    const rowText = String(item?.rowText || item?.rowSummary || '').trim();
    if (!rowText) return;
    const rowHits = [];
    terms.forEach((term) => {
      const count = countTerm(rowText, term);
      if (!count) return;
      rowHits.push(term);
      termCounts.set(term, (termCounts.get(term) || 0) + count);
    });
    if (!rowHits.length) return;
    coveredRows.push({
      id: String(item?.id || '').trim(),
      tableId: String(item?.tableId || item?.table_id || '').trim(),
      tableName: String(item?.tableName || item?.tableId || item?.table_id || '记忆表格').trim(),
      rowSummary: String(item?.rowSummary || rowText).trim().slice(0, 160),
      matchedTerms: uniqueTerms(rowHits),
    });
  });
  if (!coveredRows.length) return null;
  const matchedTerms = Array.from(termCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([term]) => term);
  const occurrences = Array.from(termCounts.values()).reduce((sum, value) => sum + value, 0);
  const title = String(entry?.title || entry?.comment || entry?.entryId || '未命名条目').trim() || '未命名条目';
  return {
    worldId: String(entry?.worldId || entry?._sourceWorldId || '').trim(),
    entryId: String(entry?.entryId || entry?._entryId || entry?.id || '').trim(),
    title,
    matchedTerms,
    coveredRowCount: coveredRows.length,
    occurrences,
    coveredRows,
    reason: `常驻条目的实体“${matchedTerms.slice(0, 3).join('、')}”已被 ${coveredRows.length} 条记忆表格覆盖。`,
    recommendation: '可考虑将蓝灯切换为绿灯，保留作者原文并改为关键词触发；不会自动修改。',
  };
};

export const buildWorldbookDowngradeSuggestions = ({
  entries = [],
  memoryItems = [],
} = {}) => (
  (Array.isArray(entries) ? entries : [])
    .map(entry => buildWorldbookDowngradeSuggestion({ entry, memoryItems }))
    .filter(Boolean)
);
