import { appSettings } from '../storage/app-settings.js';
import {
  isRpSessionId,
  tableMatchesMemoryContext,
} from '../memory/memory-context-utils.js';
import { logger } from '../utils/logger.js';
import { appConfirm } from './app-confirm.js';

const scopeLabelMap = {
  global: '全局',
  contact: '私聊',
  group: '群聊',
  rp: 'RP',
};

const getRuntimeScopeLabel = (table, ctx = null) => {
  const scope = String(table?.scope || '').trim().toLowerCase();
  if (scope === 'contact' && ctx?.type === 'rp') return scopeLabelMap.rp;
  return scopeLabelMap[scope] || scope || '未知';
};

const clampText = (value, max = 120) => {
  const text = String(value || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}…`;
};

const escapeHtml = (value) => (
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
);

const formatRowSummary = (rowData, columns) => {
  const parts = [];
  for (const col of columns || []) {
    const value = rowData?.[col.id];
    const text = String(value ?? '').trim();
    if (!text) continue;
    parts.push(`${col.name}: ${text}`);
  }
  if (!parts.length) return '（未填写）';
  return clampText(parts.join(' · '), 160);
};

const formatRowDetail = (rowData, columns) => {
  const parts = [];
  for (const col of columns || []) {
    const label = String(col?.name || col?.id || '').trim();
    const raw = rowData?.[col.id];
    const text = String(raw ?? '').trim().replace(/\s*\r?\n\s*/g, ' / ');
    if (!text) continue;
    parts.push(label ? `${label}: ${text}` : text);
  }
  if (!parts.length) return '（未填写）';
  return parts.join('；');
};

const buildTableDataText = (table, rows) => {
  const header = `【${String(table?.name || table?.id || '记忆表格')}${table?.id ? `｜${table.id}` : ''}】`;
  const lines = rows.map((row, idx) => `- [${idx}] ${formatRowDetail(row?.row_data || {}, table?.columns || [])}`);
  return [header, ...lines].join('\n').trim();
};

const normalizeKeywords = (raw) => {
  if (Array.isArray(raw)) return raw.map(v => String(v).trim()).filter(Boolean);
  if (typeof raw === 'string') {
    return raw.split(/[,，\n\r]/).map(v => v.trim()).filter(Boolean);
  }
  return [];
};

const renderExportTemplate = (template, vars) => {
  const raw = String(template || '{{tableData}}');
  return raw.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (match, key) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) return match;
    return String(vars[key] ?? '');
  });
};

const filterRowsByScope = (rows, table, ctx = null) => {
  const scope = String(table?.scope || '').trim().toLowerCase();
  if (!scope) return rows;
  if (scope === 'global') return rows.filter(row => !row?.contact_id && !row?.group_id);
  if (scope === 'contact') {
    return rows.filter(row => row?.contact_id);
  }
  if (scope === 'group') return rows.filter(row => row?.group_id);
  return rows;
};

const buildWorldbookEntriesForTable = (table, rows) => {
  const exportConfig = table?.exportConfig || {};
  const tableName = String(table?.name || table?.id || '记忆表格');
  const tableId = String(table?.id || '');
  const entryBase = String(exportConfig.entryName || tableName || tableId).trim() || tableName;
  const keywords = normalizeKeywords(exportConfig.keywords);
  const splitByRow = exportConfig.splitByRow === true;
  const templateText = String(exportConfig.injectionTemplate || (splitByRow ? '{{rowText}}' : '{{tableData}}'));
  const tableData = buildTableDataText(table, rows);
  const now = Date.now();
  if (!splitByRow) {
    const content = renderExportTemplate(templateText, {
      tableName,
      tableId,
      tableData,
      rowText: '',
      rowIndex: '',
      rowData: '',
    });
    return [{
      id: `memtable-${tableId || 'table'}-${now}`,
      comment: entryBase,
      content,
      key: keywords,
      order: 100,
      depth: 4,
      position: 0,
      constant: keywords.length === 0,
      selective: keywords.length > 0,
      preventRecursion: true,
      disable: false,
    }];
  }
  return rows.map((row, idx) => {
    const rowText = formatRowDetail(row?.row_data || {}, table?.columns || []);
    const rowData = (() => {
      try {
        return JSON.stringify(row?.row_data || {});
      } catch {
        return '';
      }
    })();
    const content = renderExportTemplate(templateText, {
      tableName,
      tableId,
      tableData,
      rowText,
      rowIndex: idx,
      rowData,
    });
    return {
      id: `memtable-${tableId || 'table'}-${now}-${idx}`,
      comment: `${entryBase} #${idx + 1}`,
      content,
      key: keywords,
      order: 100,
      depth: 4,
      position: 0,
      constant: keywords.length === 0,
      selective: keywords.length > 0,
      preventRecursion: true,
      disable: false,
    };
  });
};

export class MemoryTableEditor {
  constructor({ container, getContext, memoryStore, templateStore, includeGlobal = true } = {}) {
    this.container = container || null;
    this.getContext = typeof getContext === 'function' ? getContext : () => null;
    this.memoryStore = memoryStore || null;
    this.templateStore = templateStore || null;
    this.includeGlobal = includeGlobal !== false;
    this.template = null;
    this.memories = [];
    this.batchMode = false;
    this.selectedIds = new Set();
    this.searchTerm = '';
    this.visibleIds = new Set();
    this.currentContext = null;
    this.toolbarWrap = null;
    this.listWrap = null;
    this.searchInput = null;
    this.batchBtn = null;
    this.batchBar = null;
    this.batchCount = null;
    this.batchEnableBtn = null;
    this.batchDisableBtn = null;
    this.batchDeleteBtn = null;
    this.batchSelectAllBtn = null;
    this.batchClearBtn = null;
    this.modalOverlay = null;
    this.modalPanel = null;
    this.modalSave = null;
    this.modalCancel = null;
    this.modalFields = [];
    this.modalMeta = null;
    this.modalHeader = null;
    this.modalForm = null;
    this.promptWrap = null;
    this.promptTemplateInput = null;
    this.promptWrapperInput = null;
    this.promptPositionSelect = null;
    this.promptPreviewInput = null;
    this.promptSaveBtn = null;
    this.promptRefreshBtn = null;
    this.promptLastRawBtn = null;
    this.promptLastPromptBtn = null;
    this.lastUpdateOverlay = null;
    this.lastUpdatePanel = null;
    this.lastUpdateTitle = null;
    this.lastUpdateMeta = null;
    this.lastUpdateContent = null;
    this.lastUpdateCopyBtn = null;
    this.__onSave = null;
    this.__lastContextKey = '';

    this.onTemplatesUpdated = () => {
      if (!this.container) return;
      if (this.container.style.display === 'none') return;
      this.render().catch(() => {});
    };
    window.addEventListener('memory-templates-updated', this.onTemplatesUpdated);

    this.onMemoriesUpdated = () => {
      if (!this.container) return;
      if (this.container.style.display === 'none') return;
      this.render().catch(() => {});
    };
    window.addEventListener('memory-rows-updated', this.onMemoriesUpdated);
  }

  destroy() {
    window.removeEventListener('memory-templates-updated', this.onTemplatesUpdated);
    window.removeEventListener('memory-rows-updated', this.onMemoriesUpdated);
  }

  async render() {
    if (!this.container) return;
    const ctx = this.getContext();
    if (!ctx) {
      this.ensureLayout();
      if (this.listWrap) {
        this.listWrap.innerHTML = '<div style="color:#94a3b8; font-size:12px;">未获取到会话信息。</div>';
      }
      return;
    }
    this.currentContext = ctx;
    const contextKey = `${ctx.type || ''}:${ctx.contactId || ''}:${ctx.groupId || ''}`;
    if (contextKey !== this.__lastContextKey) {
      this.__lastContextKey = contextKey;
      this.batchMode = false;
      this.selectedIds.clear();
      this.searchTerm = '';
    }
    this.ensureLayout();
    this.renderToolbar();
    if (this.listWrap) {
      this.listWrap.innerHTML = '<div style="color:#64748b; font-size:12px;">加载记忆表格…</div>';
    }
    try {
      await this.loadData(ctx);
      await this.updatePromptSection(ctx);
      this.renderTableList(ctx);
    } catch (err) {
      logger.warn('render memory tables failed', err);
      if (this.listWrap) {
        this.listWrap.innerHTML = '<div style="color:#ef4444; font-size:12px;">加载记忆表格失败</div>';
      }
    }
  }

  async loadData(ctx) {
    const template = await this.loadTemplate();
    this.template = template;
    this.memories = await this.loadMemories(ctx, template);
  }

  async loadTemplate() {
    if (!this.templateStore || typeof this.templateStore.getTemplates !== 'function') return null;
    const list = await this.templateStore.getTemplates({ is_default: true });
    if (Array.isArray(list) && list.length) {
      return this.templateStore.toTemplateDefinition?.(list[0]) || null;
    }
    const fallback = await this.templateStore.getTemplates({ id: 'default-v1' });
    if (Array.isArray(fallback) && fallback.length) {
      return this.templateStore.toTemplateDefinition?.(fallback[0]) || null;
    }
    return null;
  }

  async loadMemories(ctx, template) {
    if (!this.memoryStore || typeof this.memoryStore.getMemories !== 'function') return [];
    const templateId = String(template?.meta?.id || '').trim();
    if (!templateId) return [];
    const out = [];
    if (ctx.type === 'contact' || ctx.type === 'rp') {
      const contactId = String(ctx.contactId || '').trim();
      if (contactId) {
        const rows = await this.memoryStore.getMemories({ scope: 'contact', contact_id: contactId, template_id: templateId });
        out.push(...(Array.isArray(rows) ? rows : []));
      }
      if (this.includeGlobal) {
        const globals = await this.memoryStore.getMemories({ scope: 'global', template_id: templateId });
        out.push(...(Array.isArray(globals) ? globals : []));
      }
    } else if (ctx.type === 'group') {
      const groupId = String(ctx.groupId || '').trim();
      if (groupId) {
        const rows = await this.memoryStore.getMemories({ scope: 'group', group_id: groupId, template_id: templateId });
        out.push(...(Array.isArray(rows) ? rows : []));
      }
      if (this.includeGlobal) {
        const globals = await this.memoryStore.getMemories({ scope: 'global', template_id: templateId });
        out.push(...(Array.isArray(globals) ? globals : []));
      }
    } else if (ctx.type === 'global') {
      const globals = await this.memoryStore.getMemories({ scope: 'global', template_id: templateId });
      out.push(...(Array.isArray(globals) ? globals : []));
    }
    return out;
  }

  renderTableList(ctx) {
    if (!this.container || !this.listWrap) return;
    const template = this.template;
    if (!template || !Array.isArray(template.tables)) {
      this.listWrap.innerHTML = '<div style="color:#94a3b8; font-size:12px;">未找到可用模板。</div>';
      return;
    }
    this.listWrap.innerHTML = '';
    this.visibleIds = new Set();
    const includeGlobal = this.includeGlobal;
    const tables = template.tables.filter(table => {
      if (ctx.type === 'contact' || ctx.type === 'rp') return table.scope === 'global' || table.scope === 'contact';
      if (ctx.type === 'group') return table.scope === 'global' || table.scope === 'group';
      if (ctx.type === 'global') return table.scope === 'global';
      return false;
    }).filter(table => {
      const sessionId = ctx?.type === 'group' ? ctx?.groupId : ctx?.contactId;
      return tableMatchesMemoryContext(table, {
        sessionId,
        contextType: ctx?.type,
        isGroup: ctx?.type === 'group',
        uiMode: ctx?.type === 'rp' || isRpSessionId(sessionId) ? 'rp' : 'social',
      });
    }).filter(table => {
      if (!includeGlobal && table.scope === 'global') return false;
      return true;
    });
    if (!tables.length) {
      this.listWrap.innerHTML = '<div style="color:#94a3b8; font-size:12px;">当前模板没有匹配的表格。</div>';
      return;
    }
    for (const table of tables) {
      this.listWrap.appendChild(this.renderTableBlock(table, ctx));
    }
    this.renderToolbar();
  }

  ensureLayout() {
    if (!this.container || this.toolbarWrap) return;
    this.container.innerHTML = '';
    const promptWrap = document.createElement('details');
    promptWrap.style.cssText = 'border:1px solid #e2e8f0; border-radius:12px; padding:10px; margin-bottom:10px; background:#f8fafc;';
    const promptSummary = document.createElement('summary');
    promptSummary.style.cssText = 'cursor:pointer; font-weight:800; color:#0f172a;';
    promptSummary.textContent = '记忆表格提示词（可编辑）';
    const promptBody = document.createElement('div');
    promptBody.style.cssText = 'margin-top:10px; display:flex; flex-direction:column; gap:10px;';
    const templateLabel = document.createElement('div');
    templateLabel.style.cssText = 'font-size:12px; font-weight:700; color:#0f172a;';
    templateLabel.textContent = '模板（使用 {{tableData}} 插入表格内容）';
    const templateInput = document.createElement('textarea');
    templateInput.rows = 6;
    templateInput.placeholder = '{{tableData}}';
    templateInput.style.cssText = 'width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:10px; font-size:12px; font-family: monospace; resize: vertical;';
    const wrapperLabel = document.createElement('div');
    wrapperLabel.style.cssText = 'font-size:12px; font-weight:700; color:#0f172a;';
    wrapperLabel.textContent = '包裹模板（可选）';
    const wrapperInput = document.createElement('textarea');
    wrapperInput.rows = 3;
    wrapperInput.placeholder = '<memories>\n{{tableData}}\n</memories>';
    wrapperInput.style.cssText = 'width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:10px; font-size:12px; font-family: monospace; resize: vertical;';
    const positionRow = document.createElement('div');
    positionRow.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';
    const positionLabel = document.createElement('div');
    positionLabel.style.cssText = 'font-size:12px; font-weight:700; color:#0f172a;';
    positionLabel.textContent = '注入位置';
    const positionSelect = document.createElement('select');
    positionSelect.style.cssText = 'padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;';
    [
      { value: 'after_persona', label: '角色设定后' },
      { value: 'system_end', label: '系统末尾' },
      { value: 'before_chat', label: '对话前' },
    ].forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt.value;
      option.textContent = opt.label;
      positionSelect.appendChild(option);
    });
    positionRow.appendChild(positionLabel);
    positionRow.appendChild(positionSelect);
    const promptActions = document.createElement('div');
    promptActions.style.cssText = 'display:flex; gap:8px; justify-content:flex-end;';
    const promptRefresh = document.createElement('button');
    promptRefresh.textContent = '刷新预览';
    promptRefresh.style.cssText = 'padding:6px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
    const promptLastRaw = document.createElement('button');
    promptLastRaw.textContent = '查看最近写表原始输出';
    promptLastRaw.style.cssText = 'padding:6px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
    const promptLastPrompt = document.createElement('button');
    promptLastPrompt.textContent = '查看最近写表请求提示词';
    promptLastPrompt.style.cssText = 'padding:6px 10px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
    const promptSave = document.createElement('button');
    promptSave.textContent = '保存模板';
    promptSave.style.cssText = 'padding:6px 10px; border:none; border-radius:8px; background:#019aff; color:#fff; cursor:pointer; font-size:12px; font-weight:700;';
    promptActions.appendChild(promptRefresh);
    promptActions.appendChild(promptLastRaw);
    promptActions.appendChild(promptLastPrompt);
    promptActions.appendChild(promptSave);
    const previewLabel = document.createElement('div');
    previewLabel.style.cssText = 'font-size:12px; font-weight:700; color:#0f172a;';
    previewLabel.textContent = '当前会发送的提示词（预览）';
    const previewInput = document.createElement('textarea');
    previewInput.rows = 6;
    previewInput.readOnly = true;
    previewInput.style.cssText = 'width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:10px; font-size:12px; font-family: monospace; background:#fff; resize: vertical;';

    promptBody.appendChild(templateLabel);
    promptBody.appendChild(templateInput);
    promptBody.appendChild(wrapperLabel);
    promptBody.appendChild(wrapperInput);
    promptBody.appendChild(positionRow);
    promptBody.appendChild(promptActions);
    promptBody.appendChild(previewLabel);
    promptBody.appendChild(previewInput);

    promptWrap.appendChild(promptSummary);
    promptWrap.appendChild(promptBody);
    this.container.appendChild(promptWrap);
    this.promptWrap = promptWrap;
    this.promptTemplateInput = templateInput;
    this.promptWrapperInput = wrapperInput;
    this.promptPositionSelect = positionSelect;
    this.promptPreviewInput = previewInput;
    this.promptSaveBtn = promptSave;
    this.promptRefreshBtn = promptRefresh;
    this.promptLastRawBtn = promptLastRaw;
    this.promptLastPromptBtn = promptLastPrompt;

    const toolbarWrap = document.createElement('div');
    toolbarWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px; margin-bottom:10px;';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex; align-items:center; gap:8px;';
    const search = document.createElement('input');
    search.type = 'text';
    search.placeholder = '搜索记忆…';
    search.style.cssText = 'flex:1; padding:8px; border:1px solid #e2e8f0; border-radius:10px; font-size:12px;';
    search.oninput = () => {
      this.searchTerm = String(search.value || '');
      this.renderTableList(this.currentContext);
    };
    const batchBtn = document.createElement('button');
    batchBtn.style.cssText = 'padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; font-size:12px;';
    batchBtn.onclick = () => {
      this.setBatchMode(!this.batchMode);
      this.renderTableList(this.currentContext);
    };
    row.appendChild(search);
    row.appendChild(batchBtn);
    toolbarWrap.appendChild(row);

    const bar = document.createElement('div');
    bar.style.cssText = 'display:none; align-items:center; gap:8px; flex-wrap:wrap; font-size:12px;';
    const count = document.createElement('div');
    count.style.cssText = 'color:#64748b;';
    const selectAll = document.createElement('button');
    selectAll.textContent = '全选';
    selectAll.style.cssText = 'padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
    selectAll.onclick = () => {
      this.visibleIds.forEach(id => this.selectedIds.add(id));
      this.renderTableList(this.currentContext);
    };
    const clearBtn = document.createElement('button');
    clearBtn.textContent = '清空';
    clearBtn.style.cssText = 'padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
    clearBtn.onclick = () => {
      this.selectedIds.clear();
      this.renderTableList(this.currentContext);
    };
    const enableBtn = document.createElement('button');
    enableBtn.textContent = '启用';
    enableBtn.style.cssText = 'padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
    enableBtn.onclick = () => this.applyBatchUpdate({ is_active: true });
    const disableBtn = document.createElement('button');
    disableBtn.textContent = '禁用';
    disableBtn.style.cssText = 'padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
    disableBtn.onclick = () => this.applyBatchUpdate({ is_active: false });
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '删除';
    deleteBtn.style.cssText = 'padding:6px 8px; border:1px solid #fecaca; border-radius:8px; background:#fff; cursor:pointer; font-size:12px; color:#b91c1c;';
    deleteBtn.onclick = () => this.applyBatchDelete();
    bar.appendChild(count);
    bar.appendChild(selectAll);
    bar.appendChild(clearBtn);
    bar.appendChild(enableBtn);
    bar.appendChild(disableBtn);
    bar.appendChild(deleteBtn);
    toolbarWrap.appendChild(bar);

    const listWrap = document.createElement('div');
    listWrap.style.cssText = 'display:flex; flex-direction:column;';
    this.container.appendChild(toolbarWrap);
    this.container.appendChild(listWrap);
    this.toolbarWrap = toolbarWrap;
    this.listWrap = listWrap;
    this.searchInput = search;
    this.batchBtn = batchBtn;
    this.batchBar = bar;
    this.batchCount = count;
    this.batchSelectAllBtn = selectAll;
    this.batchClearBtn = clearBtn;
    this.batchEnableBtn = enableBtn;
    this.batchDisableBtn = disableBtn;
    this.batchDeleteBtn = deleteBtn;
  }

  renderToolbar() {
    if (!this.searchInput || !this.batchBtn || !this.batchBar || !this.batchCount) return;
    this.searchInput.value = this.searchTerm;
    this.batchBtn.textContent = this.batchMode ? '退出批量' : '批量操作';
    this.batchBar.style.display = this.batchMode ? 'flex' : 'none';
    this.batchCount.textContent = `已选 ${this.selectedIds.size} 条`;
    const hasSelected = this.selectedIds.size > 0;
    if (this.batchEnableBtn) this.batchEnableBtn.disabled = !hasSelected;
    if (this.batchDisableBtn) this.batchDisableBtn.disabled = !hasSelected;
    if (this.batchDeleteBtn) this.batchDeleteBtn.disabled = !hasSelected;
  }

  async updatePromptSection(ctx) {
    if (!this.promptTemplateInput || !this.promptWrapperInput || !this.promptPositionSelect) return;
    const template = this.template;
    if (!template || !template.meta) {
      this.promptTemplateInput.value = '';
      this.promptWrapperInput.value = '';
      this.promptPositionSelect.value = 'after_persona';
      if (this.promptPreviewInput) this.promptPreviewInput.value = '未找到可用模板。';
      return;
    }
    const injection = template.injection || {};
    const templateText = typeof injection.template === 'string' ? injection.template : '{{tableData}}';
    const wrapperText = typeof injection.wrapper === 'string' ? injection.wrapper : '<memories>\n{{tableData}}\n</memories>';
    const position = typeof injection.position === 'string' ? injection.position : 'after_persona';
    this.promptTemplateInput.value = templateText;
    this.promptWrapperInput.value = wrapperText;
    this.promptPositionSelect.value = position;
    if (this.promptSaveBtn) {
      this.promptSaveBtn.onclick = () => this.savePromptTemplate(ctx);
    }
    if (this.promptRefreshBtn) {
      this.promptRefreshBtn.onclick = () => this.refreshPromptPreview(ctx);
    }
    if (this.promptLastRawBtn) {
      this.promptLastRawBtn.onclick = () => this.showLastUpdateModal(ctx, 'raw');
    }
    if (this.promptLastPromptBtn) {
      this.promptLastPromptBtn.onclick = () => this.showLastUpdateModal(ctx, 'prompt');
    }
    await this.refreshPromptPreview(ctx);
  }

  getPromptPreviewContext(ctx) {
    const baseSessionId = ctx?.type === 'group' ? ctx?.groupId : ctx?.contactId;
    const sessionId = String(baseSessionId || window.appBridge?.activeSessionId || '').trim();
    const isGroup = ctx?.type === 'group' || String(sessionId).startsWith('group:');
    const isRp = ctx?.type === 'rp' || isRpSessionId(sessionId);
    const contact = sessionId ? window.appBridge?.contactsStore?.getContact?.(sessionId) : null;
    const characterName = String(contact?.name || (isGroup ? sessionId.replace(/^group:/, '') : sessionId) || '助手');
    const settings = appSettings.get();
    const memoryInjectPosition = String(settings.memoryInjectPosition || 'template').toLowerCase();
    const memoryInjectDepthRaw = Math.trunc(Number(settings.memoryInjectDepth));
    const memoryInjectDepth = Number.isFinite(memoryInjectDepthRaw) ? Math.max(0, memoryInjectDepthRaw) : 4;
    const memoryAutoMode = String(settings.memoryAutoExtractMode || 'inline').toLowerCase();
    const memoryAutoExtract = settings.memoryAutoExtract === true && memoryAutoMode !== 'separate';
    return {
      user: { name: '用户' },
      character: { name: characterName },
      session: { id: sessionId, isGroup },
      meta: {
        memoryStorageMode: 'table',
        memoryAutoExtract,
        memoryInjectPosition,
        memoryInjectDepth,
        sharedMemory: false,
        uiMode: isRp ? 'rp' : 'social',
        defaultRpBridgeSessionId: !isRp ? String(window.appBridge?.getRpSessionIdForActivePersona?.() || '').trim() : '',
        defaultChatBridgeSessionId: isRp ? String(window.appBridge?.getLastSocialSessionId?.() || '').trim() : '',
      },
      group: isGroup ? { id: sessionId, name: characterName, members: [], memberNames: [] } : null,
      history: [],
    };
  }

  resolveSessionId(ctx) {
    if (!ctx) return '';
    if (ctx.type === 'group') return String(ctx.groupId || '').trim();
    if (ctx.type === 'rp') return String(ctx.contactId || '').trim();
    if (ctx.type === 'contact') return String(ctx.contactId || '').trim();
    return String(window.appBridge?.activeSessionId || '').trim();
  }

  pushTableToChat(table, rows, ctx) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      window.toastr?.info?.('当前表格暂无可推送的数据');
      return;
    }
    const sessionId = this.resolveSessionId(ctx);
    if (!sessionId) {
      window.toastr?.error?.('未找到会话，无法推送');
      return;
    }
    const tableData = buildTableDataText(table, list);
    const summary = `记忆表格推送：${String(table?.name || table?.id || '记忆表格')}`;
    const html = [
      '<details>',
      `<summary>${escapeHtml(summary)}</summary>`,
      `<pre>${escapeHtml(tableData)}</pre>`,
      '</details>',
    ].join('');
    window.dispatchEvent(new CustomEvent('memory-table-push', { detail: { sessionId, content: html } }));
    window.toastr?.success?.('已推送到聊天');
  }

  async exportTableToWorldbook(table, rows, ctx) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) {
      window.toastr?.info?.('当前表格暂无可导出的数据');
      return;
    }
    const exportConfig = table?.exportConfig || {};
    if (exportConfig.enabled !== true) {
      const ok = await appConfirm({
        title: '导出确认',
        message: '该表未开启世界书导出，仍要继续导出吗？',
      });
      if (!ok) return;
    }
    const worldId = await this.resolveWorldbookIdForTable(table, ctx);
    if (!worldId) return;
    const appBridge = window.appBridge;
    if (!appBridge?.getWorldInfo || !appBridge?.saveWorldInfo) {
      window.toastr?.error?.('世界书不可用，无法导出');
      return;
    }
    try {
      const current = await appBridge.getWorldInfo(worldId);
      const payload = current && typeof current === 'object' ? current : { name: worldId, entries: [] };
      if (!Array.isArray(payload.entries)) payload.entries = [];
      const entries = buildWorldbookEntriesForTable(table, list);
      payload.entries.push(...entries);
      await appBridge.saveWorldInfo(worldId, payload);
      window.toastr?.success?.(`已导出 ${entries.length} 条到世界书`);
    } catch (err) {
      logger.warn('export worldbook failed', err);
      window.toastr?.error?.('导出世界书失败');
    }
  }

  async resolveWorldbookIdForTable(table, ctx) {
    const appBridge = window.appBridge;
    if (!appBridge) return '';
    const scope = String(table?.scope || '').trim().toLowerCase();
    const effectiveScope = scope;
    const sessionId = this.resolveSessionId(ctx);
    if (effectiveScope === 'global') {
      let worldId = String(appBridge.globalWorldId || '').trim();
      if (!worldId) {
        const ok = await appConfirm({
          title: '创建世界书',
          message: '未设置全局世界书，是否创建并设为全局世界书？',
        });
        if (!ok) return '';
        worldId = 'memory-table-global';
        appBridge.setGlobalWorld?.(worldId);
        try {
          await appBridge.saveWorldInfo(worldId, { name: worldId, entries: [] });
        } catch {}
      }
      return worldId;
    }
    let worldId = String(appBridge.currentWorldId || '').trim();
    if (!worldId) {
      const ok = await appConfirm({
        title: '创建世界书',
        message: '未设置当前会话世界书，是否创建并设为当前世界书？',
      });
      if (!ok) return '';
      const rawId = sessionId || 'default';
      const safeId = rawId.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'default';
      worldId = `memory-table-${safeId}`;
      appBridge.setCurrentWorld?.(worldId, sessionId);
      try {
        await appBridge.saveWorldInfo(worldId, { name: worldId, entries: [] });
      } catch {}
    }
    return worldId;
  }

  async refreshPromptPreview(ctx) {
    if (!this.promptPreviewInput) return;
    if (!window.appBridge?.buildMemoryPromptPlan) {
      this.promptPreviewInput.value = '记忆提示词预览不可用。';
      return;
    }
    this.promptPreviewInput.value = '加载中...';
    try {
      const context = this.getPromptPreviewContext(ctx);
      const plan = await window.appBridge.buildMemoryPromptPlan(context);
      if (!plan?.enabled) {
        const reason = String(plan?.reason || '');
        const msg = reason === 'memory_mode'
          ? '当前记忆模式为摘要，请切换到记忆表格'
          : reason === 'missing_template'
            ? '未找到默认模板'
            : reason === 'missing_session'
              ? '未找到会话'
              : '记忆提示词暂不可用';
        this.promptPreviewInput.value = msg;
        return;
      }
      this.promptPreviewInput.value = plan.promptText || '暂无可发送的提示词。';
    } catch (err) {
      logger.warn('memory prompt preview failed', err);
      this.promptPreviewInput.value = '提示词预览失败';
    }
  }

  async savePromptTemplate(ctx) {
    if (!this.templateStore || !this.template) return;
    const templateId = String(this.template?.meta?.id || '').trim();
    if (!templateId) return;
    const templateText = String(this.promptTemplateInput?.value || '').trim() || '{{tableData}}';
    const wrapperText = String(this.promptWrapperInput?.value || '').trim();
    const position = String(this.promptPositionSelect?.value || 'after_persona');
    const injection = {
      template: templateText,
      wrapper: wrapperText,
      position,
    };
    try {
      await this.templateStore.updateTemplateInjection(templateId, injection);
      this.template.injection = injection;
      window.dispatchEvent(new CustomEvent('memory-templates-updated', { detail: { templateId } }));
      window.toastr?.success?.('记忆提示词模板已保存');
      await this.refreshPromptPreview(ctx);
    } catch (err) {
      logger.warn('save memory prompt failed', err);
      window.toastr?.error?.('保存提示词失败');
    }
  }

  ensureLastUpdateModal() {
    if (this.lastUpdatePanel) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
    overlay.addEventListener('click', () => this.hideLastUpdateModal());
    const panel = document.createElement('div');
    panel.style.cssText = `
      display:none; position:fixed;
      left: calc(12px + env(safe-area-inset-left, 0px));
      right: calc(12px + env(safe-area-inset-right, 0px));
      bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
      background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
      z-index:23000;
      overflow:hidden;
      display:flex; flex-direction:column;
    `;
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.innerHTML = `
      <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; gap:10px;">
        <div data-role="title" style="font-weight:900; color:#0f172a;">最近写表原始输出</div>
        <div data-role="meta" style="margin-left:auto; font-size:12px; color:#64748b;"></div>
        <button data-role="copy" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
        <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
      </div>
      <textarea data-role="content" readonly style="flex:1; min-height:0; padding:12px 14px; border:none; resize:none; font-family: monospace; font-size:12px;"></textarea>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    this.lastUpdateOverlay = overlay;
    this.lastUpdatePanel = panel;
    this.lastUpdateTitle = panel.querySelector('[data-role="title"]');
    this.lastUpdateMeta = panel.querySelector('[data-role="meta"]');
    this.lastUpdateContent = panel.querySelector('[data-role="content"]');
    this.lastUpdateCopyBtn = panel.querySelector('[data-role="copy"]');
    panel.querySelector('[data-role="close"]')?.addEventListener('click', () => this.hideLastUpdateModal());
    this.lastUpdateCopyBtn?.addEventListener('click', async () => {
      const text = String(this.lastUpdateContent?.value || '');
      if (!text) return;
      try {
        await navigator.clipboard.writeText(text);
        window.toastr?.success?.('已复制');
        return;
      } catch {}
      try {
        this.lastUpdateContent?.select?.();
        document.execCommand('copy');
        window.toastr?.success?.('已复制');
      } catch {
        window.toastr?.warning?.('复制失败');
      }
    });
  }

  hideLastUpdateModal() {
    if (this.lastUpdateOverlay) this.lastUpdateOverlay.style.display = 'none';
    if (this.lastUpdatePanel) this.lastUpdatePanel.style.display = 'none';
  }

  showLastUpdateModal(ctx, view = 'raw') {
    this.ensureLastUpdateModal();
    const sessionId = this.resolveSessionId(ctx);
    if (!this.lastUpdateOverlay || !this.lastUpdatePanel || !this.lastUpdateContent || !this.lastUpdateMeta) return;
    const viewType = view === 'prompt' ? 'prompt' : 'raw';
    if (this.lastUpdateTitle) {
      this.lastUpdateTitle.textContent = viewType === 'prompt' ? '最近写表请求提示词' : '最近写表原始输出';
    }
    if (!sessionId) {
      this.lastUpdateMeta.textContent = '未找到会话';
      this.lastUpdateContent.value = '当前页面不是聊天会话。';
      this.lastUpdateOverlay.style.display = 'block';
      this.lastUpdatePanel.style.display = 'flex';
      return;
    }
    const entry = window.appBridge?.getLastMemoryUpdate?.(sessionId);
    if (!entry) {
      this.lastUpdateMeta.textContent = '暂无记录';
      this.lastUpdateContent.value = viewType === 'prompt' ? '尚未记录任何写表请求提示词。' : '尚未记录任何写表输出。';
      this.lastUpdateOverlay.style.display = 'block';
      this.lastUpdatePanel.style.display = 'flex';
      return;
    }
    const when = entry?.at ? new Date(entry.at).toLocaleString() : '';
    const mode = entry?.mode === 'separate' ? '独立请求' : '同请求';
    this.lastUpdateMeta.textContent = [mode, when].filter(Boolean).join(' · ');
    if (viewType === 'prompt') {
      const promptText = String(entry?.requestPrompt || '').trim();
      this.lastUpdateContent.value = promptText || '尚未记录任何写表请求提示词。';
    } else {
      const tableEditRaw = String(entry?.tableEditRaw || '').trim();
      const raw = String(entry?.raw || '').trim();
      const display = tableEditRaw ? `<tableEdit>\n${tableEditRaw}\n</tableEdit>` : raw || '（空）';
      this.lastUpdateContent.value = display;
    }
    this.lastUpdateOverlay.style.display = 'block';
    this.lastUpdatePanel.style.display = 'flex';
  }

  renderTableBlock(table, ctx) {
    const block = document.createElement('div');
    block.style.cssText = 'border:1px solid #e2e8f0; border-radius:12px; padding:10px; margin-bottom:12px; background:#fff;';
    const header = document.createElement('div');
    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:800; color:#0f172a;';
    title.textContent = table.name || table.id || '记忆表格';
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:11px; color:#64748b;';
    const allRows = this.memories.filter(row => String(row.table_id || '') === String(table.id || ''));
    const scopedRows = filterRowsByScope(allRows, table, ctx);
    const maxLabel = table.maxRows ? ` / ${table.maxRows}` : '';
    meta.textContent = `${getRuntimeScopeLabel(table, ctx)} · ${scopedRows.length}${maxLabel} · ${table.columns?.length || 0} 列`;
    const titleWrap = document.createElement('div');
    titleWrap.appendChild(title);
    titleWrap.appendChild(meta);
    const addBtn = document.createElement('button');
    addBtn.textContent = '新增';
    addBtn.style.cssText = 'padding:6px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer; font-size:12px;';
    if (table.maxRows && scopedRows.length >= table.maxRows) {
      addBtn.disabled = true;
      addBtn.style.cursor = 'not-allowed';
      addBtn.style.opacity = '0.6';
    }
    addBtn.onclick = () => this.openEditor({ table, ctx, row: null });
    const pushBtn = document.createElement('button');
    pushBtn.textContent = '推送';
    pushBtn.style.cssText = 'padding:6px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; font-size:12px;';
    pushBtn.onclick = () => this.pushTableToChat(table, scopedRows, ctx);
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '导出世界书';
    exportBtn.style.cssText = 'padding:6px 10px; border:1px solid #bae6fd; border-radius:10px; background:#e0f2fe; cursor:pointer; font-size:12px;';
    exportBtn.onclick = () => this.exportTableToWorldbook(table, scopedRows, ctx);
    const actionWrap = document.createElement('div');
    actionWrap.style.cssText = 'display:flex; align-items:center; gap:6px; flex-wrap:wrap;';
    actionWrap.appendChild(addBtn);
    actionWrap.appendChild(pushBtn);
    actionWrap.appendChild(exportBtn);
    header.appendChild(titleWrap);
    header.appendChild(actionWrap);
    block.appendChild(header);

    const list = document.createElement('div');
    list.style.cssText = 'display:flex; flex-direction:column; gap:8px; max-height:220px; overflow-y:auto; padding-right:4px;';
    const rows = this.filterRows(scopedRows);
    if (!rows.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px; color:#94a3b8; padding:6px 4px;';
      empty.textContent = this.searchTerm ? '无匹配内容' : '暂无记忆条目';
      list.appendChild(empty);
    } else {
      for (const row of rows) {
        if (row?.id) this.visibleIds.add(row.id);
        list.appendChild(this.renderRowItem(row, table, ctx));
      }
    }
    block.appendChild(list);
    return block;
  }

  filterRows(rows) {
    const term = String(this.searchTerm || '').trim().toLowerCase();
    if (!term) return rows;
    return rows.filter(row => {
      const data = row?.row_data || {};
      const blob = Object.values(data)
        .map(v => String(v ?? '').toLowerCase())
        .join(' ');
      return blob.includes(term);
    });
  }

  renderRowItem(row, table, ctx) {
    const item = document.createElement('div');
    item.style.cssText =
      'border:1px solid #e2e8f0; border-radius:10px; padding:8px; background:#f8fafc; display:flex; gap:8px; align-items:flex-start; justify-content:space-between;';
    const summary = document.createElement('div');
    summary.style.cssText = 'font-size:12px; color:#0f172a; line-height:1.4; flex:1; min-width:0;';
    const summaryText = formatRowSummary(row.row_data || {}, table.columns || []);
    const summaryMain = document.createElement('div');
    summaryMain.textContent = summaryText;
    summary.appendChild(summaryMain);
    const metaParts = [];
    if (!row.is_active) metaParts.push('已停用');
    if (row.is_pinned) metaParts.push('置顶');
    if (typeof row.priority === 'number' && row.priority !== 0) metaParts.push(`优先级 ${row.priority}`);
    if (metaParts.length) {
      const metaLine = document.createElement('div');
      metaLine.style.cssText = 'color:#64748b; font-size:11px; margin-top:4px;';
      metaLine.textContent = metaParts.join(' · ');
      summary.appendChild(metaLine);
    }

    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex; align-items:center; gap:6px;';

    if (this.batchMode) {
      const select = document.createElement('input');
      select.type = 'checkbox';
      select.checked = this.selectedIds.has(row.id);
      select.onchange = () => {
        if (select.checked) this.selectedIds.add(row.id);
        else this.selectedIds.delete(row.id);
        this.renderTableList(this.currentContext);
      };
      controls.appendChild(select);
    }

    const activeToggle = document.createElement('input');
    activeToggle.type = 'checkbox';
    activeToggle.checked = Boolean(row.is_active);
    activeToggle.title = '启用';
    activeToggle.onchange = async () => {
      try {
        await this.memoryStore.updateMemory({ id: row.id, is_active: Boolean(activeToggle.checked) });
      } catch (err) {
        logger.warn('update memory active failed', err);
      }
      this.render().catch(() => {});
    };
    const pinToggle = document.createElement('input');
    pinToggle.type = 'checkbox';
    pinToggle.checked = Boolean(row.is_pinned);
    pinToggle.title = '置顶';
    pinToggle.onchange = async () => {
      try {
        await this.memoryStore.updateMemory({ id: row.id, is_pinned: Boolean(pinToggle.checked) });
      } catch (err) {
        logger.warn('update memory pinned failed', err);
      }
      this.render().catch(() => {});
    };
    const editBtn = document.createElement('button');
    editBtn.textContent = '编辑';
    editBtn.style.cssText = 'padding:4px 8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
    editBtn.onclick = () => this.openEditor({ table, ctx, row });
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '删除';
    deleteBtn.style.cssText = 'padding:4px 8px; border:1px solid #fecaca; border-radius:8px; background:#fff; cursor:pointer; font-size:12px; color:#b91c1c;';
    deleteBtn.onclick = async () => {
      const ok = await appConfirm({ title: '删除记忆', message: '确定要删除该记忆条目吗？', danger: true });
      if (!ok) return;
      try {
        await this.memoryStore.deleteMemory(row.id);
      } catch (err) {
        logger.warn('delete memory failed', err);
      }
      this.render().catch(() => {});
    };

    if (this.batchMode) {
      activeToggle.disabled = true;
      pinToggle.disabled = true;
      editBtn.disabled = true;
      deleteBtn.disabled = true;
      editBtn.style.opacity = '0.6';
      deleteBtn.style.opacity = '0.6';
    }

    controls.appendChild(activeToggle);
    controls.appendChild(pinToggle);
    controls.appendChild(editBtn);
    controls.appendChild(deleteBtn);
    item.appendChild(summary);
    item.appendChild(controls);
    return item;
  }

  setBatchMode(enabled) {
    const next = Boolean(enabled);
    this.batchMode = next;
    if (!next) this.selectedIds.clear();
  }

  async applyBatchUpdate(patch) {
    const ids = [...this.selectedIds];
    if (!ids.length) {
      window.toastr?.info?.('未选择任何记忆');
      return;
    }
    try {
      for (const id of ids) {
        await this.memoryStore.updateMemory({ id, ...patch });
      }
      this.selectedIds.clear();
      this.render().catch(() => {});
    } catch (err) {
      logger.warn('batch update failed', err);
      window.toastr?.error?.('批量操作失败');
    }
  }

  async applyBatchDelete() {
    const ids = [...this.selectedIds];
    if (!ids.length) {
      window.toastr?.info?.('未选择任何记忆');
      return;
    }
    const ok = await appConfirm({
      title: '删除记忆',
      message: `确定要删除所选记忆（${ids.length}条）吗？`,
      danger: true,
    });
    if (!ok) return;
    try {
      await this.memoryStore.batchDeleteMemories(ids);
      this.selectedIds.clear();
      this.render().catch(() => {});
    } catch (err) {
      logger.warn('batch delete failed', err);
      window.toastr?.error?.('批量删除失败');
    }
  }

  ensureEditorModal() {
    if (this.modalPanel) return;
    this.modalOverlay = document.createElement('div');
    this.modalOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
    this.modalOverlay.addEventListener('click', () => this.closeEditor());
    this.modalPanel = document.createElement('div');
    this.modalPanel.style.cssText = `
      display:none; position:fixed;
      left: calc(12px + env(safe-area-inset-left, 0px));
      right: calc(12px + env(safe-area-inset-right, 0px));
      bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
      background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
      z-index:23000;
      overflow:hidden;
      display:flex; flex-direction:column;
    `;
    this.modalPanel.addEventListener('click', (e) => e.stopPropagation());
    this.modalPanel.innerHTML = `
      <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div data-role="header" style="font-weight:900; color:#0f172a;">编辑记忆</div>
        <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
      </div>
      <div data-role="form" style="padding:12px 14px; flex:1; min-height:0; overflow:auto;"></div>
      <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
        <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; cursor:pointer;">取消</button>
        <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:#fff; cursor:pointer; font-weight:900;">保存</button>
      </div>
    `;
    document.body.appendChild(this.modalOverlay);
    document.body.appendChild(this.modalPanel);
    this.modalHeader = this.modalPanel.querySelector('[data-role="header"]');
    this.modalForm = this.modalPanel.querySelector('[data-role="form"]');
    this.modalSave = this.modalPanel.querySelector('[data-role="save"]');
    this.modalCancel = this.modalPanel.querySelector('[data-role="cancel"]');
    this.modalPanel.querySelector('[data-role="close"]').onclick = () => this.closeEditor();
    this.modalCancel.onclick = () => this.closeEditor();
  }

  openEditor({ table, ctx, row }) {
    this.ensureEditorModal();
    if (!this.modalForm || !this.modalHeader) return;
    const isNew = !row;
    this.modalHeader.textContent = `${isNew ? '新增' : '编辑'} · ${table.name || table.id || ''}`;
    this.modalForm.innerHTML = '';
    this.modalFields = [];

    for (const col of table.columns || []) {
      const field = this.createField(col, row?.row_data?.[col.id]);
      this.modalForm.appendChild(field.wrapper);
      this.modalFields.push(field);
    }

    const metaWrap = document.createElement('div');
    metaWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:12px; margin-top:10px; align-items:center;';
    const activeBox = document.createElement('label');
    activeBox.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#0f172a;';
    const activeInput = document.createElement('input');
    activeInput.type = 'checkbox';
    activeInput.checked = row ? Boolean(row.is_active) : true;
    activeBox.appendChild(activeInput);
    activeBox.appendChild(document.createTextNode('启用'));

    const pinBox = document.createElement('label');
    pinBox.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#0f172a;';
    const pinInput = document.createElement('input');
    pinInput.type = 'checkbox';
    pinInput.checked = row ? Boolean(row.is_pinned) : false;
    pinBox.appendChild(pinInput);
    pinBox.appendChild(document.createTextNode('置顶'));

    const priorityWrap = document.createElement('label');
    priorityWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#0f172a;';
    const priorityInput = document.createElement('input');
    priorityInput.type = 'number';
    priorityInput.min = '-9';
    priorityInput.max = '9';
    priorityInput.step = '1';
    priorityInput.value = row ? String(row.priority ?? 0) : '0';
    priorityInput.style.cssText = 'width:64px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;';
    priorityWrap.appendChild(document.createTextNode('优先级'));
    priorityWrap.appendChild(priorityInput);

    metaWrap.appendChild(activeBox);
    metaWrap.appendChild(pinBox);
    metaWrap.appendChild(priorityWrap);
    this.modalForm.appendChild(metaWrap);

    this.modalMeta = { activeInput, pinInput, priorityInput };
    this.__onSave = async () => {
      const rowData = {};
      for (const field of this.modalFields) {
        rowData[field.id] = field.getValue();
      }
      const contactId = table.scope === 'contact' ? String(ctx.contactId || '') : null;
      const groupId = table.scope === 'group' ? String(ctx.groupId || '') : null;
      const payload = {
        template_id: this.template?.meta?.id,
        table_id: table.id,
        contact_id: contactId,
        group_id: groupId,
        row_data: rowData,
        is_active: Boolean(activeInput.checked),
        is_pinned: Boolean(pinInput.checked),
        priority: Number(priorityInput.value || 0) || 0,
      };
      try {
        if (row) {
          await this.memoryStore.updateMemory({
            id: row.id,
            row_data: rowData,
            is_active: Boolean(activeInput.checked),
            is_pinned: Boolean(pinInput.checked),
            priority: Number(priorityInput.value || 0) || 0,
          });
        } else {
          await this.memoryStore.createMemory(payload);
        }
        this.closeEditor();
        this.render().catch(() => {});
      } catch (err) {
        logger.warn('save memory failed', err);
        window.toastr?.error?.('保存失败');
      }
    };
    if (this.modalSave) {
      this.modalSave.disabled = false;
      this.modalSave.onclick = () => {
        try {
          this.__onSave?.();
        } catch {}
      };
    }
    if (this.modalOverlay) this.modalOverlay.style.display = 'block';
    if (this.modalPanel) this.modalPanel.style.display = 'flex';
  }

  createField(column, value) {
    const wrapper = document.createElement('div');
    wrapper.style.cssText = 'margin-bottom:10px;';
    const label = document.createElement('div');
    label.style.cssText = 'font-weight:700; color:#0f172a; margin-bottom:6px; font-size:12px;';
    label.textContent = column.name || column.id || '字段';
    wrapper.appendChild(label);

    let input;
    if (column.type === 'multiline') {
      input = document.createElement('textarea');
      input.style.cssText = 'width:100%; min-height:80px; resize:vertical; padding:8px; border:1px solid #e2e8f0; border-radius:10px; font-size:12px;';
    } else if (column.type === 'select') {
      input = document.createElement('select');
      input.style.cssText = 'width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:10px; font-size:12px; background:#fff;';
      const opts = Array.isArray(column.options) ? column.options : [];
      if (!opts.length) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '（无选项）';
        input.appendChild(opt);
      } else {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = '请选择';
        input.appendChild(empty);
        for (const optText of opts) {
          const opt = document.createElement('option');
          opt.value = String(optText);
          opt.textContent = String(optText);
          input.appendChild(opt);
        }
      }
    } else {
      input = document.createElement('input');
      input.type = column.type === 'number' ? 'number' : 'text';
      input.style.cssText = 'width:100%; padding:8px; border:1px solid #e2e8f0; border-radius:10px; font-size:12px;';
    }
    input.value = value !== undefined && value !== null ? String(value) : '';
    wrapper.appendChild(input);

    return {
      wrapper,
      id: column.id,
      getValue: () => String(input.value || '').trim(),
    };
  }

  closeEditor() {
    if (this.modalOverlay) this.modalOverlay.style.display = 'none';
    if (this.modalPanel) this.modalPanel.style.display = 'none';
    this.__onSave = null;
  }
}
