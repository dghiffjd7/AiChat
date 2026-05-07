import { appSettings } from '../storage/app-settings.js';
import {
  getMemoryContextType,
  resolveMemorySessionMode,
  tableMatchesMemoryContext,
} from '../memory/memory-context-utils.js';
import { sortMemoryRowsForSnapshot } from '../memory/memory-row-order.js';
import {
  buildMemoryRowsIndex,
  createMemoryActionResolvers,
} from './chat/memory-table-action-utils.js';
import {
  buildScopedMemoryRowFields,
  loadScopedMemories,
  resolveSessionMemoryScopeKey,
} from './chat/memory-table-scope-utils.js';
import { batchCreateMemoriesWithFallback } from './session-memory-write-utils.js';

export const getMemoryStorageMode = () => {
  if (appSettings.get().memoryEnabled === false) return 'off';
  const mode = String(appSettings.get().memoryStorageMode || 'table').toLowerCase();
  return mode === 'table' ? 'table' : 'summary';
};

const resolveDefaultMemoryTemplateRecord = async ({
  memoryTemplateStore = null,
} = {}) => {
  const store = memoryTemplateStore;
  if (!store?.getTemplates) return null;
  try {
    const list = await store.getTemplates({ is_default: true });
    if (Array.isArray(list) && list.length) {
      return list[0] || null;
    }
  } catch {}
  try {
    const fallback = await store.getTemplates({ id: 'default-v1' });
    if (Array.isArray(fallback) && fallback.length) {
      return fallback[0] || null;
    }
  } catch {}
  return null;
};

export const resolveDefaultMemoryTemplateId = async ({
  memoryTemplateStore = null,
} = {}) => {
  const record = await resolveDefaultMemoryTemplateRecord({ memoryTemplateStore });
  return String(record?.id || '').trim();
};

export const resolveDefaultMemoryTemplateRecordAndDefinition = async ({
  memoryTemplateStore = null,
} = {}) => {
  const store = memoryTemplateStore;
  const record = await resolveDefaultMemoryTemplateRecord({ memoryTemplateStore: store });
  if (!record) return null;
  return {
    record,
    template: store?.toTemplateDefinition?.(record) || record?.schema || null,
  };
};

export const resolveDefaultMemoryTemplateDefinition = async ({
  memoryTemplateStore = null,
} = {}) => {
  const resolved = await resolveDefaultMemoryTemplateRecordAndDefinition({ memoryTemplateStore });
  return resolved?.template || null;
};

export const buildMemoryTemplateTableMaps = (template, filterOptions = null) => {
  const tableById = new Map();
  const tableNameMap = new Map();
  const tableOrder = [];
  (template?.tables || []).forEach(table => {
    const id = String(table?.id || '').trim();
    if (!id) return;
    if (filterOptions && !tableMatchesMemoryContext(table, filterOptions)) return;
    tableById.set(id, table);
    tableOrder.push(id);
    const name = String(table?.name || '').trim();
    if (name) tableNameMap.set(name.toLowerCase(), id);
  });
  return { tableById, tableNameMap, tableOrder };
};

export const resolveSessionMemoryTemplateContext = async ({
  memoryTemplateStore = null,
  sessionId = '',
  isGroup = false,
  uiMode = '',
  filterTables = true,
} = {}) => {
  const templateInfo = await resolveDefaultMemoryTemplateRecordAndDefinition({ memoryTemplateStore });
  if (!templateInfo?.record) return null;
  const templateId = String(templateInfo.record?.id || '').trim();
  if (!templateId) return null;
  const contextType = getMemoryContextType({ sessionId, isGroup });
  const sessionMode = resolveMemorySessionMode({ uiMode, sessionId, contextType });
  const filterOptions = filterTables
    ? {
      sessionId,
      isGroup,
      contextType,
      uiMode: sessionMode === 'rp' ? 'rp' : uiMode,
    }
    : null;
  const { tableById, tableNameMap, tableOrder } = buildMemoryTemplateTableMaps(
    templateInfo.template || {},
    filterOptions,
  );
  return {
    ...templateInfo,
    templateId,
    contextType,
    sessionMode,
    tableById,
    tableNameMap,
    tableOrder,
  };
};

export const resolveSessionMemoryTemplateContextSafe = async (options = {}) => {
  try {
    return await resolveSessionMemoryTemplateContext(options);
  } catch {
    return null;
  }
};

export const loadSessionMemoryActionContext = async ({
  memoryTemplateStore = null,
  memoryTableStore = null,
  sessionId = '',
  isGroup = false,
  uiMode = '',
  filterTables = true,
  useSharedGlobalScope = false,
  tableOrderOverride = null,
  rowIndexMap = null,
} = {}) => {
  const templateContext = await resolveSessionMemoryTemplateContextSafe({
    memoryTemplateStore,
    sessionId,
    isGroup,
    uiMode,
    filterTables,
  });
  if (!templateContext?.record) return null;
  const templateId = String(templateContext.templateId || '').trim();
  if (!templateId) return null;

  const overrideOrder = Array.isArray(tableOrderOverride) ? tableOrderOverride : [];
  const tableOrder = overrideOrder.length
    ? overrideOrder
    : (Array.isArray(templateContext.tableOrder) ? templateContext.tableOrder : []);
  const normalizedRowIndexMap = rowIndexMap && typeof rowIndexMap === 'object' ? rowIndexMap : {};

  const sessionScopeKey = resolveSessionMemoryScopeKey({ isGroup, useSharedGlobalScope });
  const scopedRows = useSharedGlobalScope
    ? []
    : await loadScopedMemories({
      memoryTableStore,
      scopeKey: sessionScopeKey,
      sessionId,
      templateId,
    });
  const globalRows = await loadScopedMemories({
    memoryTableStore,
    scopeKey: 'global',
    sessionId,
    templateId,
  });
  const allRows = [
    ...(Array.isArray(globalRows) ? globalRows : []),
    ...(Array.isArray(scopedRows) ? scopedRows : []),
  ];
  const { rowsById, rowsByTableScope } = buildMemoryRowsIndex(allRows);
  const resolvers = createMemoryActionResolvers({
    tableById: templateContext.tableById,
    tableNameMap: templateContext.tableNameMap,
    tableOrder,
    rowIndexMap: normalizedRowIndexMap,
    rowsByTableScope,
    useSharedGlobalScope,
    sessionId,
    isGroup,
  });
  return {
    ...templateContext,
    templateId,
    tableOrder,
    rowIndexMap: normalizedRowIndexMap,
    sessionScopeKey,
    scopedRows,
    globalRows,
    allRows,
    rowsById,
    rowsByTableScope,
    ...resolvers,
  };
};

export const loadSessionMemoryRollbackSnapshotContext = async ({
  memoryTemplateStore = null,
  memoryTableStore = null,
  sessionId = '',
  isGroup = false,
  uiMode = '',
  rollback = null,
} = {}) => {
  const tables = Array.isArray(rollback?.tables) ? rollback.tables : [];
  if (!tables.length) return null;
  const templateContext = await resolveSessionMemoryTemplateContextSafe({
    memoryTemplateStore,
    sessionId,
    isGroup,
    uiMode,
    filterTables: false,
  });
  if (!templateContext?.record) return null;
  const templateId = String(templateContext.templateId || '').trim();
  if (!templateId) return null;

  const scopedTables = [];
  for (const tableSnap of tables) {
    const tableId = String(tableSnap?.table_id || '').trim();
    const scopeKey = String(tableSnap?.scope || '').trim();
    if (!tableId || !scopeKey) continue;
    const scopeFields = buildScopedMemoryRowFields({ scopeKey, sessionId });
    const currentRows = await loadScopedMemories({
      memoryTableStore,
      scopeKey,
      sessionId,
      templateId,
    });
    scopedTables.push({
      tableId,
      scopeKey,
      scopeFields,
      currentRows: (Array.isArray(currentRows) ? currentRows : []).filter(
        row => String(row?.table_id || '').trim() === tableId,
      ),
      snapshotRows: Array.isArray(tableSnap?.rows) ? tableSnap.rows : [],
    });
  }

  return {
    templateId,
    tables: scopedTables,
  };
};

export const askMemoryTableNewChatMode = () => new Promise((resolve) => {
  const overlay = document.createElement('div');
  overlay.className = 'app-themed-overlay memory-table-dialog-overlay';
  overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(15,23,42,0.45);
        display:flex; align-items:center; justify-content:center;
        padding:16px; z-index:22000;
    `;
  const panel = document.createElement('div');
  panel.className = 'app-themed-panel memory-table-dialog-panel';
  panel.style.cssText = `
        width:min(360px, 92vw);
        background:var(--app-surface-card); border-radius:14px;
        padding:16px; box-shadow:0 20px 60px rgba(0,0,0,0.3);
        display:flex; flex-direction:column; gap:10px;
    `;
  panel.innerHTML = `
        <div style="font-weight:800; color:var(--app-text-primary);">记忆表格：开启新聊天</div>
        <div style="font-size:12px; color:var(--app-text-muted);">请选择新聊天处理方式</div>
    `;
  const btnWrap = document.createElement('div');
  btnWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px;';
  const buildBtn = (text, style) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'memory-table-dialog-btn';
    btn.textContent = text;
    btn.style.cssText = `
            padding:10px 12px; border-radius:10px; border:1px solid var(--app-border-default);
            background:var(--app-surface-card); font-weight:700; cursor:pointer; text-align:left;
            ${style || ''}
        `;
    return btn;
  };
  const keepBtn = buildBtn('保留其他表格（仅清空摘要/大纲）', 'color:var(--app-text-primary);');
  const clearBtn = buildBtn('清空全部记忆表格', 'color:#ef4444; border-color:#fecaca; background:var(--app-surface-subtle);');
  const cancelBtn = buildBtn('取消', 'color:var(--app-text-secondary); background:var(--app-surface-subtle);');
  const done = (value) => {
    overlay.remove();
    resolve(value);
  };
  keepBtn.onclick = () => done('keep');
  clearBtn.onclick = () => done('clear');
  cancelBtn.onclick = () => done('cancel');
  btnWrap.appendChild(keepBtn);
  btnWrap.appendChild(clearBtn);
  btnWrap.appendChild(cancelBtn);
  panel.appendChild(btnWrap);
  overlay.appendChild(panel);
  overlay.addEventListener('click', () => done('cancel'));
  panel.addEventListener('click', (e) => e.stopPropagation());
  document.body.appendChild(overlay);
});

export const buildMemoryTableSnapshot = async ({
  sessionId = '',
  isGroup = false,
  memoryTableStore = null,
  resolveDefaultMemoryTemplateId: resolveTemplateId = async () => '',
} = {}) => {
  if (!memoryTableStore?.getMemories) return null;
  const templateId = await resolveTemplateId();
  if (!templateId) return null;
  const sid = String(sessionId || '').trim();
  if (!sid) return null;
  let rows = [];
  try {
    rows = await memoryTableStore.getMemories({
      scope: isGroup ? 'group' : 'contact',
      group_id: isGroup ? sid : undefined,
      contact_id: isGroup ? undefined : sid,
      template_id: templateId,
    });
  } catch {
    return null;
  }
  const picked = sortMemoryRowsForSnapshot(Array.isArray(rows) ? rows : [])
    .map((row) => {
      const tableId = String(row?.table_id || '').trim();
      if (!tableId) return null;
      return {
        id: String(row?.id || '').trim(),
        table_id: tableId,
        row_data: row?.row_data ?? {},
        is_active: row?.is_active !== false,
        is_pinned: Boolean(row?.is_pinned),
        priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
        sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
      };
    })
    .filter(Boolean);
  return { templateId, rows: picked };
};

export const applyMemoryTableSnapshot = async ({
  sessionId = '',
  isGroup = false,
  snapshot = null,
  memoryTableStore = null,
  resolveDefaultMemoryTemplateId: resolveTemplateId = async () => '',
  notifyRowsUpdated = null,
} = {}) => {
  if (!snapshot || !memoryTableStore?.getMemories) return false;
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  const templateId = String(snapshot?.templateId || '').trim() || (await resolveTemplateId());
  if (!templateId) return false;
  let existing = [];
  try {
    existing = await memoryTableStore.getMemories({
      scope: isGroup ? 'group' : 'contact',
      group_id: isGroup ? sid : undefined,
      contact_id: isGroup ? undefined : sid,
      template_id: templateId,
    });
  } catch {}
  const ids = Array.isArray(existing)
    ? existing.map((row) => String(row?.id || '').trim()).filter(Boolean)
    : [];
  if (ids.length) {
    try {
      await memoryTableStore.batchDeleteMemories?.(ids);
    } catch {
      for (const id of ids) {
        try {
          await memoryTableStore.deleteMemory?.(id);
        } catch {}
      }
    }
  }
  const rows = sortMemoryRowsForSnapshot(Array.isArray(snapshot?.rows) ? snapshot.rows : []);
  const inputs = rows
    .map((row) => {
      const tableId = String(row?.table_id || '').trim();
      if (!tableId) return null;
      return {
        id: row?.id ? String(row.id) : undefined,
        template_id: templateId,
        table_id: tableId,
        contact_id: isGroup ? null : sid,
        group_id: isGroup ? sid : null,
        row_data: row?.row_data ?? {},
        is_active: row?.is_active !== false,
        is_pinned: Boolean(row?.is_pinned),
        priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
        sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
      };
    })
    .filter(Boolean);
  if (inputs.length) {
    await batchCreateMemoriesWithFallback({ memoryTableStore, inputs });
  }
  try {
    notifyRowsUpdated?.({ sessionId: sid, templateId });
  } catch {}
  return true;
};
