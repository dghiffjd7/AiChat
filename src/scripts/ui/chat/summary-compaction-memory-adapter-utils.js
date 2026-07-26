import { resolveMemoryRowOrderKey } from '../../memory/memory-row-order.js';
import { readMemoryCoverageInterval } from '../../memory/memory-coverage-utils.js';

export const resolveMemorySummaryTableId = ({ place = 'chat', isGroup = false } = {}) => {
  const mode = String(place || '').trim().toLowerCase();
  if (mode === 'moments' || mode === 'moment') return 'moment_summary';
  if (mode === 'writing' || mode === 'rp' || mode === 'creative') return 'rp_summary';
  return isGroup ? 'group_summary' : 'chat_summary';
};

const getSummaryText = (row = {}) =>
  String(row?.row_data?.summary ?? row?.row_data?.text ?? '').trim();

// 覆盖区间走统一读取口（含 time 文本兜底）：存量会话的旧摘要行没有 _coverage，
// 压缩时若丢掉兜底区间，压缩产物会把已覆盖轮次变成空洞、触发覆盖线护栏强留原文。
const getCoverage = (row = {}) => {
  const interval = readMemoryCoverageInterval(row);
  return { from: interval?.from ?? null, to: interval?.to ?? null };
};

export const normalizeMemorySummaryRows = (rows = [], tableId = '') => (
  (Array.isArray(rows) ? rows : [])
    .filter(row => row?.is_active !== false)
    .filter(row => String(row?.table_id || '').trim() === String(tableId || '').trim())
    .filter(row => row?.row_data?._summary_compaction?.level !== 'rolling')
    .map((row, index) => {
      const text = getSummaryText(row);
      if (!text) return null;
      const coverage = getCoverage(row);
      return {
        id: String(row?.id || '').trim(),
        text,
        at: Number(row?.created_at || row?.updated_at || 0) || 0,
        from: coverage.from,
        to: coverage.to,
        order: resolveMemoryRowOrderKey(row, tableId, index),
        row,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.order - b.order || a.at - b.at || a.id.localeCompare(b.id))
);

const resolveScopeQuery = ({ sessionId, place, isGroup, templateId }) => {
  const base = { template_id: templateId };
  const mode = String(place || '').trim().toLowerCase();
  if (mode === 'moments' || mode === 'moment') return { ...base, scope: 'global' };
  if (isGroup) return { ...base, scope: 'group', group_id: sessionId };
  return { ...base, scope: 'contact', contact_id: sessionId };
};

const resolveScopeFields = ({ sessionId, place, isGroup }) => {
  const mode = String(place || '').trim().toLowerCase();
  if (mode === 'moments' || mode === 'moment') return { contact_id: null, group_id: null };
  if (isGroup) return { contact_id: null, group_id: sessionId };
  return { contact_id: sessionId, group_id: null };
};

export const createMemoryTableSummaryCompactionAdapter = ({
  memoryTableStore = null,
  memoryTemplateStore = null,
  sessionId = '',
  place = 'chat',
  isGroup = false,
  onPersisted = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const tableId = resolveMemorySummaryTableId({ place, isGroup });
  let templateId = '';
  let cachedRows = [];

  const ensureTemplateId = async () => {
    if (templateId) return templateId;
    const defaults = await memoryTemplateStore?.getTemplates?.({ is_default: true });
    const record = Array.isArray(defaults) ? defaults[0] : null;
    templateId = String(record?.id || '').trim();
    return templateId;
  };
  const loadRows = async () => {
    const tid = await ensureTemplateId();
    if (!tid || !memoryTableStore?.getMemories) return [];
    const rows = await memoryTableStore.getMemories(resolveScopeQuery({
      sessionId: sid,
      place,
      isGroup,
      templateId: tid,
    }));
    cachedRows = Array.isArray(rows) ? rows : [];
    return cachedRows;
  };
  const findCompactedRow = (rows = cachedRows) => (
    (Array.isArray(rows) ? rows : [])
      .filter(row => row?.is_active !== false)
      .filter(row => String(row?.table_id || '').trim() === tableId)
      .filter(row => row?.row_data?._summary_compaction?.level === 'rolling')
      .sort((a, b) => resolveMemoryRowOrderKey(b, tableId, 0) - resolveMemoryRowOrderKey(a, tableId, 0))[0]
    || null
  );

  return {
    kind: 'memory_table',
    tableId,
    normalizeItems: items => (Array.isArray(items) ? items : []),
    async getItems() {
      return normalizeMemorySummaryRows(await loadRows(), tableId);
    },
    async getCompactedText() {
      const row = findCompactedRow(await loadRows());
      return getSummaryText(row);
    },
    async persist({ text, raw, items = [], keepItems = [] } = {}) {
      const tid = await ensureTemplateId();
      if (!tid || !memoryTableStore?.createMemory || !memoryTableStore?.updateMemory) {
        throw new Error('memory summary compaction store unavailable');
      }
      const keepIds = new Set(
        (Array.isArray(keepItems) ? keepItems : []).map(item => String(item?.id || '')).filter(Boolean),
      );
      // 停用时打系统标记：召回准入只认带标记的 inactive 行（区分用户手动禁用）。
      // update_memory 对 row_data 是整体替换，必须携带原数据合并；拿不到原数据就只停用不打标。
      const deactivateAsCompactionArchive = async (rowId, rowData) => {
        const payload = { id: rowId, is_active: false };
        if (rowData && typeof rowData === 'object') {
          payload.row_data = { ...rowData, _archived_by: 'compaction' };
        }
        await memoryTableStore.updateMemory(payload);
      };
      const sourceItems = Array.isArray(items) ? items : [];
      for (const item of sourceItems) {
        const rowId = String(item?.id || '').trim();
        if (!rowId || keepIds.has(rowId)) continue;
        await deactivateAsCompactionArchive(rowId, item?.row?.row_data);
      }
      const previousCompacted = findCompactedRow(await loadRows());
      if (previousCompacted?.id) {
        await deactivateAsCompactionArchive(String(previousCompacted.id), previousCompacted?.row_data);
      }
      const coveredFrom = sourceItems
        .map(item => Number(item?.from))
        .filter(value => Number.isFinite(value) && value > 0);
      const coveredTo = sourceItems
        .map(item => Number(item?.to))
        .filter(value => Number.isFinite(value) && value > 0);
      const scopeFields = resolveScopeFields({ sessionId: sid, place, isGroup });
      const created = await memoryTableStore.createMemory({
        template_id: tid,
        table_id: tableId,
        ...scopeFields,
        row_data: {
          time: coveredFrom.length && coveredTo.length
            ? `第${Math.min(...coveredFrom)}-${Math.max(...coveredTo)}轮`
            : '滚动压缩',
          summary: String(text || '').trim(),
          _coverage: coveredFrom.length && coveredTo.length
            ? { from: Math.min(...coveredFrom), to: Math.max(...coveredTo), source: 'compaction' }
            : null,
          _summary_compaction: {
            level: 'rolling',
            source_row_ids: sourceItems.map(item => String(item?.id || '')).filter(Boolean),
            raw: String(raw || ''),
          },
        },
        is_active: true,
        sort_order: coveredTo.length ? Math.max(...coveredTo) : Date.now(),
      });
      await onPersisted?.({
        sessionId: sid,
        place,
        tableId,
        created,
        sourceItems,
        keepItems,
      });
      return created;
    },
  };
};
