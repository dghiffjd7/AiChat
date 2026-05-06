import { sortMemoryRowsForSnapshot } from '../../memory/memory-row-order.js';

const normalizeNumber = (value) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : 0;
};

export const buildSwipeMemorySnapshotRows = ({
  rows = [],
  templateId = '',
  scopeFields = {},
  cloneValue = value => value,
} = {}) => (
  sortMemoryRowsForSnapshot(Array.isArray(rows) ? rows : [])
    .map((row) => {
      const tableId = String(row?.table_id || '').trim();
      if (!tableId) return null;
      return {
        id: String(row?.id || '').trim(),
        template_id: String(row?.template_id || templateId).trim() || templateId,
        table_id: tableId,
        contact_id: scopeFields.contact_id ?? null,
        group_id: scopeFields.group_id ?? null,
        row_data: cloneValue(row?.row_data || {}),
        is_active: row?.is_active !== false,
        is_pinned: Boolean(row?.is_pinned),
        priority: normalizeNumber(row?.priority),
        sort_order: normalizeNumber(row?.sort_order),
      };
    })
    .filter(Boolean)
);

export const buildSwipeMemorySnapshot = ({
  rows = [],
  templateId = '',
  scope = 'contact',
  scopeFields = {},
  cloneValue = value => value,
  capturedAt = Date.now(),
} = {}) => ({
  templateId,
  scope,
  rows: buildSwipeMemorySnapshotRows({
    rows,
    templateId,
    scopeFields,
    cloneValue,
  }),
  capturedAt,
});

export const buildSwipeMemorySnapshotInputs = ({
  rows = [],
  templateId = '',
  scopeFields = {},
  cloneValue = value => value,
} = {}) => (
  sortMemoryRowsForSnapshot(Array.isArray(rows) ? rows : [])
    .map((row) => {
      const tableId = String(row?.table_id || '').trim();
      if (!tableId) return null;
      return {
        id: row?.id ? String(row.id) : undefined,
        template_id: templateId,
        table_id: tableId,
        contact_id: scopeFields.contact_id ?? null,
        group_id: scopeFields.group_id ?? null,
        row_data: cloneValue(row?.row_data || {}),
        is_active: row?.is_active !== false,
        is_pinned: Boolean(row?.is_pinned),
        priority: normalizeNumber(row?.priority),
        sort_order: normalizeNumber(row?.sort_order),
      };
    })
    .filter(Boolean)
);

export const replaceScopedMemoriesWithSnapshot = async ({
  memoryTableStore = null,
  existingRows = [],
  snapshotRows = [],
  templateId = '',
  scopeFields = {},
  cloneValue = value => value,
} = {}) => {
  const ids = (Array.isArray(existingRows) ? existingRows : [])
    .map(row => String(row?.id || '').trim())
    .filter(Boolean);
  if (ids.length) {
    try {
      await memoryTableStore?.batchDeleteMemories?.(ids);
    } catch {
      for (const id of ids) {
        try {
          await memoryTableStore?.deleteMemory?.(id);
        } catch {}
      }
    }
  }

  const inputs = buildSwipeMemorySnapshotInputs({
    rows: snapshotRows,
    templateId,
    scopeFields,
    cloneValue,
  });
  if (inputs.length) {
    try {
      await memoryTableStore?.batchCreateMemories?.(inputs);
    } catch {
      for (const input of inputs) {
        try {
          await memoryTableStore?.createMemory?.(input);
        } catch {}
      }
    }
  }

  return { deletedIds: ids, inputs };
};
