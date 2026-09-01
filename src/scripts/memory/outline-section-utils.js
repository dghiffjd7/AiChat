import { translateUiText } from '../i18n/index.js';

const OUTLINE_TABLE_IDS = new Set([
  'chat_outline',
  'group_outline',
  'rp_outline',
  'moment_outline',
]);

const SECTION_ALIASES = new Map([
  ['current', 'current'],
  ['当前', 'current'],
  ['当前局面', 'current'],
  ['plot', 'plot'],
  ['剧情', 'plot'],
  ['主线', 'plot'],
  ['relationships', 'relationships'],
  ['relationship', 'relationships'],
  ['关系', 'relationships'],
  ['open_threads', 'open_threads'],
  ['threads', 'open_threads'],
  ['伏笔', 'open_threads'],
  ['待办', 'open_threads'],
  ['history', 'history'],
  ['archive', 'history'],
  ['历史', 'history'],
  ['归档', 'history'],
]);

export const OUTLINE_SECTION_LABELS = Object.freeze({
  current: '当前局面',
  plot: '主线进展',
  relationships: '关系变化',
  open_threads: '未决线索',
  history: '迁移前历史',
});

export const EDITABLE_OUTLINE_SECTION_IDS = Object.freeze([
  'current',
  'plot',
  'relationships',
  'open_threads',
]);

export const isOutlineTableId = tableId =>
  OUTLINE_TABLE_IDS.has(String(tableId || '').trim());

export const normalizeOutlineSection = (value, fallback = 'current') => {
  const raw = String(value || '').trim().toLowerCase();
  if (SECTION_ALIASES.has(raw)) return SECTION_ALIASES.get(raw);
  const safeFallback = SECTION_ALIASES.get(String(fallback || '').trim().toLowerCase()) || 'current';
  return safeFallback;
};

export const getOutlineSectionLabel = section => translateUiText(
  OUTLINE_SECTION_LABELS[normalizeOutlineSection(section)] || OUTLINE_SECTION_LABELS.current,
);

export const normalizeOutlinePatchData = (data = {}, { outlineField = 'outline' } = {}) => {
  const source = data && typeof data === 'object' ? data : {};
  const section = normalizeOutlineSection(
    source.section ?? source.section_id ?? source['分节'] ?? source['章节'],
    'current',
  );
  const outline = String(
    source[outlineField]
    ?? source.outline
    ?? source.content
    ?? source['总体大纲']
    ?? source['大纲']
    ?? '',
  ).trim();
  return {
    section,
    [outlineField]: outline,
  };
};

export const findOutlineSectionRow = (rows = [], section = 'current') => {
  const target = normalizeOutlineSection(section);
  return (Array.isArray(rows) ? rows : []).find((row) => (
    row?.is_active !== false
    && String(row?.row_data?.section || '').trim()
    && normalizeOutlineSection(row.row_data.section) === target
  )) || null;
};

const getLegacyOutlineText = (row = {}) => {
  const data = row?.row_data && typeof row.row_data === 'object' ? row.row_data : {};
  const content = String(data.outline ?? data.content ?? data.summary ?? '').trim();
  const time = String(data.time || '').trim();
  return [time, content].filter(Boolean).join('：');
};

export const buildLegacyOutlineMigrationPlan = ({
  rows = [],
  maxArchiveChars = 6000,
} = {}) => {
  const legacyRows = (Array.isArray(rows) ? rows : [])
    .filter(row => row?.is_active !== false)
    .filter(row => !String(row?.row_data?.section || '').trim());
  if (!legacyRows.length) {
    return {
      needed: false,
      legacyRows: [],
      archiveData: null,
    };
  }
  const limit = Math.max(500, Math.trunc(Number(maxArchiveChars)) || 6000);
  const excerpts = [];
  let chars = 0;
  for (let index = legacyRows.length - 1; index >= 0; index -= 1) {
    const text = getLegacyOutlineText(legacyRows[index]);
    if (!text) continue;
    if (chars + text.length > limit) break;
    excerpts.unshift(`- ${text}`);
    chars += text.length;
  }
  const omitted = Math.max(0, legacyRows.length - excerpts.length);
  const prefix = [
    `已归档 ${legacyRows.length} 条旧版逐轮大纲；完整原行保留为停用状态。`,
    omitted > 0 ? `以下仅保留最近 ${excerpts.length} 条摘录，另有 ${omitted} 条未注入。` : '',
  ].filter(Boolean);
  return {
    needed: true,
    legacyRows,
    archiveData: {
      section: 'history',
      outline: [...prefix, ...excerpts].join('\n').trim(),
      _outline_archive: {
        migrated: true,
        legacy_row_ids: legacyRows.map(row => String(row?.id || '').trim()).filter(Boolean),
        legacy_count: legacyRows.length,
      },
    },
  };
};
