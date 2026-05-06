import { appSettings } from '../storage/app-settings.js';
import { sortMemoryRowsForSnapshot } from '../memory/memory-row-order.js';

export const getMemoryStorageMode = () => {
  if (appSettings.get().memoryEnabled === false) return 'off';
  const mode = String(appSettings.get().memoryStorageMode || 'table').toLowerCase();
  return mode === 'table' ? 'table' : 'summary';
};

export const resolveDefaultMemoryTemplateId = async ({
  memoryTemplateStore = null,
} = {}) => {
  const store = memoryTemplateStore;
  if (!store?.getTemplates) return '';
  try {
    const list = await store.getTemplates({ is_default: true });
    if (Array.isArray(list) && list.length) {
      return String(list[0]?.id || '').trim();
    }
  } catch {}
  try {
    const fallback = await store.getTemplates({ id: 'default-v1' });
    if (Array.isArray(fallback) && fallback.length) {
      return String(fallback[0]?.id || '').trim();
    }
  } catch {}
  return '';
};

export const resolveDefaultMemoryTemplateDefinition = async ({
  memoryTemplateStore = null,
} = {}) => {
  const store = memoryTemplateStore;
  if (!store?.getTemplates) return null;
  try {
    const list = await store.getTemplates({ is_default: true });
    if (Array.isArray(list) && list.length) {
      return store.toTemplateDefinition?.(list[0]) || list[0]?.schema || null;
    }
  } catch {}
  try {
    const fallback = await store.getTemplates({ id: 'default-v1' });
    if (Array.isArray(fallback) && fallback.length) {
      return store.toTemplateDefinition?.(fallback[0]) || fallback[0]?.schema || null;
    }
  } catch {}
  return null;
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
    try {
      await memoryTableStore.batchCreateMemories?.(inputs);
    } catch {
      for (const input of inputs) {
        try {
          await memoryTableStore.createMemory?.(input);
        } catch {}
      }
    }
  }
  try {
    notifyRowsUpdated?.({ sessionId: sid, templateId });
  } catch {}
  return true;
};
