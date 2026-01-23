import { validateTemplate } from '../memory/template-schema.js';
import { MemoryTableEditor } from './memory-table-editor.js';
import { logger } from '../utils/logger.js';
import { appConfirm } from './app-confirm.js';

const sanitizeFileName = (name) => {
  const raw = String(name || '').trim();
  if (!raw) return 'memory-template';
  return raw.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 80) || 'memory-template';
};

const deepClone = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value || {}));
  }
};

const ensureTableConfigDefaults = (table) => {
  if (!table || typeof table !== 'object') return table;
  if (!Array.isArray(table.columns)) table.columns = [];
  if (!table.sourceData || typeof table.sourceData !== 'object') table.sourceData = {};
  if (!table.updateConfig || typeof table.updateConfig !== 'object') table.updateConfig = {};
  if (!table.exportConfig || typeof table.exportConfig !== 'object') table.exportConfig = {};
  return table;
};

export class MemoryTemplatePanel {
  constructor({ templateStore, memoryStore } = {}) {
    this.templateStore = templateStore || null;
    this.memoryStore = memoryStore || null;
    this.overlay = null;
    this.panel = null;
    this.fileInput = null;
    this.currentEl = null;
    this.listEl = null;
    this.importBtn = null;
    this.exportBtn = null;
    this.refreshBtn = null;
    this.dataExportBtn = null;
    this.dataImportBtn = null;
    this.dataStatusEl = null;
    this.dataDialogOverlay = null;
    this.dataDialogPanel = null;
    this.dataDialogTitle = null;
    this.dataDialogBody = null;
    this.dataDialogOptions = null;
    this.dataDialogConfirm = null;
    this.dataDialogCancel = null;
    this.dataDialogResolve = null;
    this.dataDialogInput = null;
    this.templates = [];
    this.currentTemplate = null;
    this.globalEditor = null;
    this.globalEditorContainer = null;
    this.dataFileInput = null;
    this.structureEditBtn = null;
    this.templateEditorOverlay = null;
    this.templateEditorPanel = null;
    this.templateEditorBody = null;
    this.templateEditorSaveBtn = null;
    this.templateEditorCloseBtn = null;
    this.templateEditorAddTableBtn = null;
    this.templateEditorRecord = null;
    this.templateEditorData = null;
    this.refreshSeq = 0;
  }

  async logDebug(message, type = 'info') {
    try {
      const { getDebugPanel } = await import('./debug-panel.js');
      const panel = getDebugPanel();
      panel.log(message, type);
    } catch {}
  }

  async awaitWithTimeout(promise, { label, runId, timeoutMs = 1500 } = {}) {
    if (!promise || typeof promise.then !== 'function') {
      return { value: promise };
    }
    let timeoutId;
    let timedOut = false;
    const timeoutPromise = new Promise(resolve => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        resolve({ timeout: true });
      }, timeoutMs);
    });
    const wrapped = Promise.resolve(promise).then(
      value => ({ value }),
      error => ({ error })
    );
    const result = await Promise.race([wrapped, timeoutPromise]);
    if (timeoutId) clearTimeout(timeoutId);
    if (result && result.timeout) {
      this.logDebug(`[模板#${runId}] ${label} 超时(${timeoutMs}ms)`, 'warn');
      wrapped.then(outcome => {
        if (!outcome) return;
        if (outcome.error) {
          const msg = outcome.error?.message ? String(outcome.error.message) : String(outcome.error || '');
          this.logDebug(`[模板#${runId}] ${label} 之后失败: ${msg || 'unknown error'}`, 'warn');
        } else {
          this.logDebug(`[模板#${runId}] ${label} 之后完成`, 'info');
        }
      });
      return { timeout: true };
    }
    if (result?.error) {
      const msg = result.error?.message ? String(result.error.message) : String(result.error || '');
      this.logDebug(`[模板#${runId}] ${label} 失败: ${msg || 'unknown error'}`, 'warn');
      return { error: result.error };
    }
    return { value: result?.value };
  }

  show() {
    if (!this.panel) this.createUI();
    this.refresh().catch(() => {});
    this.globalEditor?.render?.();
    if (this.overlay) this.overlay.style.display = 'block';
    if (this.panel) this.panel.style.display = 'flex';
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
    if (this.panel) this.panel.style.display = 'none';
  }

  createUI() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:20000;';
    this.overlay.addEventListener('click', () => this.hide());

    this.panel = document.createElement('div');
    this.panel.style.cssText = `
      display:none; position:fixed;
      top: calc(10px + env(safe-area-inset-top, 0px));
      left: calc(10px + env(safe-area-inset-left, 0px));
      right: calc(10px + env(safe-area-inset-right, 0px));
      height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
      height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
      background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
      z-index:21000;
      overflow:hidden;
      display:flex; flex-direction:column;
    `;
    this.panel.addEventListener('click', (e) => e.stopPropagation());
    this.panel.innerHTML = `
      <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div>
          <div style="font-weight:800; color:#0f172a;">记忆表格管理</div>
          <div style="color:#64748b; font-size:12px;">模板导入 / 导出与默认模板切换</div>
        </div>
        <button id="memory-template-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
      </div>
      <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
        <div style="border:1px solid #e2e8f0; border-radius:12px; padding:12px; background:#fff;">
          <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">全局记忆</div>
          <div style="font-size:12px; color:#64748b; margin-bottom:8px;">全局表格仅在此处编辑</div>
          <div id="memory-template-global-editor"></div>
        </div>
        <div style="border:1px solid #e2e8f0; border-radius:12px; padding:12px; background:#f8fafc;">
          <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">当前默认模板</div>
          <div id="memory-template-current" style="font-size:12px; color:#64748b;"></div>
          <div style="display:flex; gap:8px; flex-wrap:wrap; margin-top:10px;">
            <button id="memory-template-export" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">导出当前模板</button>
            <button id="memory-template-import" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">导入模板</button>
            <button id="memory-template-refresh" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">刷新列表</button>
            <button id="memory-template-edit-structure" style="padding:8px 12px; border:1px solid #bae6fd; border-radius:10px; background:#e0f2fe; cursor:pointer;">编辑模板结构</button>
          </div>
        </div>
        <div style="border:1px solid #e2e8f0; border-radius:12px; padding:12px; background:#fff; margin-top:12px;">
          <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">数据导入导出</div>
          <div id="memory-data-status" style="font-size:12px; color:#64748b; margin-bottom:8px;">未开始操作</div>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button id="memory-data-export" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">导出记忆数据</button>
            <button id="memory-data-import" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">导入记忆数据</button>
          </div>
        </div>
        <div style="margin-top:14px;">
          <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">模板列表</div>
          <div id="memory-template-list" style="display:flex; flex-direction:column; gap:10px;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);

    this.globalEditorContainer = this.panel.querySelector('#memory-template-global-editor');
    this.currentEl = this.panel.querySelector('#memory-template-current');
    this.listEl = this.panel.querySelector('#memory-template-list');
    this.importBtn = this.panel.querySelector('#memory-template-import');
    this.exportBtn = this.panel.querySelector('#memory-template-export');
    this.refreshBtn = this.panel.querySelector('#memory-template-refresh');
    this.structureEditBtn = this.panel.querySelector('#memory-template-edit-structure');
    this.dataExportBtn = this.panel.querySelector('#memory-data-export');
    this.dataImportBtn = this.panel.querySelector('#memory-data-import');
    this.dataStatusEl = this.panel.querySelector('#memory-data-status');
    this.panel.querySelector('#memory-template-close').onclick = () => this.hide();

    if (this.globalEditorContainer && this.templateStore && this.memoryStore) {
      this.globalEditor = new MemoryTableEditor({
        container: this.globalEditorContainer,
        getContext: () => ({ type: 'global' }),
        memoryStore: this.memoryStore,
        templateStore: this.templateStore,
        includeGlobal: true,
      });
    }

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.accept = '.json,application/json';
    this.fileInput.style.display = 'none';
    this.fileInput.onchange = () => {
      const file = this.fileInput?.files?.[0];
      if (!file) return;
      this.importTemplateFile(file);
    };
    document.body.appendChild(this.fileInput);

    this.dataFileInput = document.createElement('input');
    this.dataFileInput.type = 'file';
    this.dataFileInput.accept = '.json,application/json';
    this.dataFileInput.style.display = 'none';
    this.dataFileInput.onchange = () => {
      const file = this.dataFileInput?.files?.[0];
      if (!file) return;
      this.importDataFile(file);
    };
    document.body.appendChild(this.dataFileInput);

    this.importBtn.onclick = () => {
      if (this.fileInput) {
        this.fileInput.value = '';
        this.fileInput.click();
      }
    };
    this.exportBtn.onclick = () => this.exportCurrentTemplate();
    this.refreshBtn.onclick = () => this.refresh();
    this.structureEditBtn.onclick = () => this.openTemplateEditor(this.currentTemplate);
    this.dataExportBtn.onclick = () => this.exportMemoryData();
    this.dataImportBtn.onclick = () => {
      if (this.dataFileInput) {
        this.dataFileInput.value = '';
        this.dataFileInput.click();
      }
    };
  }

  async refresh() {
    if (!this.templateStore) {
      if (this.currentEl) this.currentEl.textContent = '模板存储未初始化。';
      this.logDebug('[模板#?] 刷新失败：templateStore 未初始化', 'warn');
      return;
    }
    const runId = ++this.refreshSeq;
    const debugInfo = this.templateStore.getDebugInfo?.() || {};
    const scopeLabel = debugInfo.scopeId ? `scope=${debugInfo.scopeId}` : 'scope=default';
    const readyLabel = debugInfo.readyOk === null ? 'ready=unknown' : `ready=${debugInfo.readyOk ? 'ok' : 'fail'}`;
    const defaultMeta = debugInfo.defaultTemplateId
      ? `${debugInfo.defaultTemplateId}@v${debugInfo.defaultTemplateVersion || 'unknown'}`
      : 'default=missing';
    const queueLabel = `pending=${debugInfo.writePending ?? 0}`;
    const lastCmd = debugInfo.lastCommand
      ? `last=${debugInfo.lastCommand}${debugInfo.lastCommandPending ? `(${Math.round((debugInfo.lastCommandAgeMs || 0) / 1000)}s)` : ''}`
      : 'last=none';
    const resetLabel = debugInfo.queueResetCount ? `reset=${debugInfo.queueResetCount}` : 'reset=0';
    this.logDebug(`[模板#${runId}] 刷新开始: ${scopeLabel}, ${readyLabel}, ${defaultMeta}, ${queueLabel}, ${lastCmd}, ${resetLabel}`);
    if (debugInfo.queueResetReason) {
      this.logDebug(`[模板#${runId}] writeChain 已重置: ${debugInfo.queueResetReason}`, 'warn');
    }
    let ensureOk = null;
    const ensureResult = await this.awaitWithTimeout(
      this.templateStore.ensureDefaultTemplate?.(),
      { label: 'ensureDefaultTemplate', runId, timeoutMs: 2000 }
    );
    if (ensureResult.timeout) {
      ensureOk = null;
    } else if (ensureResult.error) {
      ensureOk = false;
    } else {
      ensureOk = ensureResult.value;
    }
    const ensureLabel = ensureOk === null ? 'unknown' : ensureOk ? 'ok' : 'fail';
    this.logDebug(`[模板#${runId}] ensureDefaultTemplate=${ensureLabel}`);
    let templates = [];
    const listResult = await this.awaitWithTimeout(
      this.templateStore.getTemplates({}),
      { label: 'getTemplates', runId, timeoutMs: 3000 }
    );
    if (listResult.timeout) {
      if (this.currentEl) this.currentEl.textContent = '读取模板超时。';
      return;
    }
    if (listResult.error) {
      logger.warn('load templates failed', listResult.error);
      if (this.currentEl) this.currentEl.textContent = '读取模板失败。';
      return;
    }
    templates = listResult.value;
    this.logDebug(`[模板#${runId}] getTemplates 返回 ${Array.isArray(templates) ? templates.length : 'invalid'} 条`);
    let forceOk = null;
    if (!Array.isArray(templates) || templates.length === 0) {
      const forceResult = await this.awaitWithTimeout(
        this.templateStore.forceDefaultTemplate?.(),
        { label: 'forceDefaultTemplate', runId, timeoutMs: 2000 }
      );
      if (forceResult.timeout) {
        forceOk = null;
      } else if (forceResult.error) {
        forceOk = false;
      } else {
        forceOk = forceResult.value;
      }
      const forceLabel = forceOk === null ? 'unknown' : forceOk ? 'ok' : 'fail';
      this.logDebug(`[模板#${runId}] forceDefaultTemplate=${forceLabel}`);
      const reloadResult = await this.awaitWithTimeout(
        this.templateStore.getTemplates({}),
        { label: 'getTemplates(reload)', runId, timeoutMs: 3000 }
      );
      if (reloadResult.timeout) {
        if (this.currentEl) this.currentEl.textContent = '读取模板超时。';
        return;
      }
      if (reloadResult.error) {
        logger.warn('reload templates failed', reloadResult.error);
        if (this.currentEl) this.currentEl.textContent = '读取模板失败。';
        return;
      }
      templates = reloadResult.value;
      this.logDebug(`[模板#${runId}] 重载 getTemplates 返回 ${Array.isArray(templates) ? templates.length : 'invalid'} 条`);
    }
    this.templates = Array.isArray(templates) ? templates : [];
    if (this.templates.length === 0) {
      const scopeId = String(this.templateStore?.scopeId || '');
      if (this.currentEl) {
        this.currentEl.textContent = scopeId
          ? `当前 scope 无模板（scope=${scopeId}）`
          : '当前 scope 无模板';
      }
      const info = this.templateStore.getDebugInfo?.() || {};
      const lastError = info.lastError || 'none';
      const ensureLabel = ensureOk === null ? 'unknown' : ensureOk ? 'ok' : 'fail';
      const forceLabel = forceOk === null ? 'unknown' : forceOk ? 'ok' : 'fail';
      this.logDebug(`[模板#${runId}] 列表仍为空: ensure=${ensureLabel}, force=${forceLabel}, lastError=${lastError}`, 'warn');
    }
    this.currentTemplate = (this.templates || []).find(t => t.is_default) || null;
    const currentId = this.currentTemplate?.id || 'none';
    const total = this.templates.length;
    this.logDebug(`[模板#${runId}] 刷新结束: total=${total}, current=${currentId}`);
    this.renderCurrent();
    this.renderList();
    this.globalEditor?.render?.();
  }

  renderCurrent() {
    if (!this.currentEl) return;
    if (!this.currentTemplate) {
      this.currentEl.textContent = '暂无默认模板';
      if (this.structureEditBtn) this.structureEditBtn.disabled = true;
      return;
    }
    const meta = this.currentTemplate;
    const name = meta.name || meta.id;
    const version = meta.version ? `v${meta.version}` : '未标注版本';
    this.currentEl.textContent = `${name} (${version}) · ${meta.id}`;
    if (this.structureEditBtn) this.structureEditBtn.disabled = false;
  }

  renderList() {
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    const templates = Array.isArray(this.templates) ? this.templates : [];
    if (!templates.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px; color:#94a3b8;';
      empty.textContent = '暂无模板';
      this.listEl.appendChild(empty);
      return;
    }
    const builtin = templates.filter(t => t && t.is_builtin);
    const custom = templates.filter(t => t && !t.is_builtin);
    this.listEl.appendChild(this.renderTemplateSection('内置模板', builtin, '暂无内置模板'));
    this.listEl.appendChild(this.renderTemplateSection('导入模板', custom, '暂无导入模板'));
  }

  renderTemplateSection(titleText, records, emptyText) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'border:1px dashed #e2e8f0; border-radius:12px; padding:10px; background:#fff;';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700; color:#0f172a; margin-bottom:8px;';
    title.textContent = titleText;
    wrap.appendChild(title);
    if (!records.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px; color:#94a3b8;';
      empty.textContent = emptyText;
      wrap.appendChild(empty);
      return wrap;
    }
    const list = document.createElement('div');
    list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
    records.forEach(record => list.appendChild(this.renderTemplateItem(record)));
    wrap.appendChild(list);
    return wrap;
  }

  renderTemplateItem(record) {
    const item = document.createElement('div');
    item.style.cssText = 'border:1px solid #e2e8f0; border-radius:12px; padding:10px; background:#fff; display:flex; align-items:flex-start; justify-content:space-between; gap:12px;';
    const info = document.createElement('div');
    info.style.cssText = 'flex:1; min-width:0;';
    const title = document.createElement('div');
    title.style.cssText = 'font-weight:700; color:#0f172a; margin-bottom:4px;';
    title.textContent = record.name || record.id;
    const meta = document.createElement('div');
    meta.style.cssText = 'font-size:12px; color:#64748b;';
    const tags = [];
    if (record.version) tags.push(`v${record.version}`);
    if (record.is_builtin) tags.push('内置');
    if (record.is_default) tags.push('默认');
    meta.textContent = `${record.id}${tags.length ? ` · ${tags.join(' / ')}` : ''}`;
    info.appendChild(title);
    info.appendChild(meta);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex; flex-direction:column; gap:6px;';
    const exportBtn = document.createElement('button');
    exportBtn.textContent = '导出';
    exportBtn.style.cssText = 'padding:6px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; font-size:12px;';
    exportBtn.onclick = () => this.exportTemplate(record);
    actions.appendChild(exportBtn);

    if (!record.is_default) {
      const setBtn = document.createElement('button');
      setBtn.textContent = '设为默认';
      setBtn.style.cssText = 'padding:6px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; font-size:12px;';
      setBtn.onclick = async () => {
        await this.handleDefaultTemplateSwitch(record);
      };
      actions.appendChild(setBtn);
    }

    if (!record.is_builtin) {
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '删除';
      deleteBtn.style.cssText = 'padding:6px 10px; border:1px solid #fecaca; border-radius:10px; background:#fff; cursor:pointer; font-size:12px; color:#b91c1c;';
      deleteBtn.onclick = async () => {
        const ok = await appConfirm({ title: '删除模板', message: '确定删除该模板吗？', danger: true });
        if (!ok) return;
        try {
          await this.templateStore.deleteTemplate(record.id);
          this.refresh();
          window.dispatchEvent(new CustomEvent('memory-templates-updated'));
        } catch (err) {
          logger.warn('delete template failed', err);
          window.toastr?.error?.('删除模板失败');
        }
      };
      actions.appendChild(deleteBtn);
    }

    item.appendChild(info);
    item.appendChild(actions);
    return item;
  }

  exportCurrentTemplate() {
    if (!this.currentTemplate) {
      window.toastr?.info?.('暂无默认模板可导出');
      return;
    }
    this.exportTemplate(this.currentTemplate);
  }

  exportTemplate(record) {
    if (!record) return;
    const template = this.templateStore.toTemplateDefinition(record);
    if (!template) {
      window.toastr?.error?.('模板数据为空，无法导出');
      return;
    }
    const name = sanitizeFileName(record.name || record.id);
    const version = record.version ? `_v${sanitizeFileName(record.version)}` : '';
    const json = JSON.stringify(template, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}${version}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    window.toastr?.success?.('模板已导出');
  }

  async importTemplateFile(file) {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const check = validateTemplate(parsed);
      if (!check.ok) {
        window.toastr?.error?.(`模板格式无效：${check.errors.join(', ')}`);
        return;
      }
      const templateId = String(parsed?.meta?.id || '').trim();
      if (!templateId) {
        window.toastr?.error?.('模板缺少 meta.id');
        return;
      }
      const meta = parsed.meta || {};
      const version = meta.version ? `v${meta.version}` : '未标注版本';
      const author = meta.author ? String(meta.author) : '未知';
      const tables = Array.isArray(parsed.tables) ? parsed.tables : [];
      const scopes = new Set();
      tables.forEach(t => {
        const scope = String(t?.scope || '').trim();
        if (scope) scopes.add(scope);
      });
      const scopeLabel = (s) => {
        if (s === 'global') return '全局';
        if (s === 'contact') return '私聊';
        if (s === 'group') return '群聊';
        return s;
      };
      const scopeText = scopes.size ? Array.from(scopes).map(scopeLabel).join(' / ') : '未标注';
      const injectionPos = String(parsed?.injection?.position || '').trim() || 'after_persona';
      const info = [
        `名称: ${String(meta.name || '').trim() || templateId}`,
        `ID: ${templateId}`,
        `版本: ${version}`,
        `作者: ${author}`,
        `表格数: ${tables.length}`,
        `范围: ${scopeText}`,
        `注入位置: ${injectionPos}`,
      ].join('\n');
      const existing = await this.templateStore.getTemplateById(templateId);
      if (existing) {
        const warn = existing.is_builtin ? '（当前为内置模板）' : '';
        const ok = await this.showDataDialog({
          title: '导入模板',
          body: `已存在同 ID 模板${warn}，是否覆盖？\n\n${info}`,
          confirmText: '覆盖导入',
          cancelText: '取消',
        });
        if (!ok) return;
      } else {
        const ok = await this.showDataDialog({
          title: '导入模板',
          body: `确认导入该模板？\n\n${info}`,
          confirmText: '导入',
          cancelText: '取消',
        });
        if (!ok) return;
      }
      await this.templateStore.saveTemplateDefinition(parsed, { isDefault: false, isBuiltin: false });
      this.refresh();
      window.dispatchEvent(new CustomEvent('memory-templates-updated'));
      window.toastr?.success?.('模板导入成功');
    } catch (err) {
      logger.warn('import template failed', err);
      window.toastr?.error?.('模板导入失败');
    }
  }

  setDataStatus(text, { tone = 'muted' } = {}) {
    if (!this.dataStatusEl) return;
    const color = tone === 'error' ? '#ef4444' : tone === 'success' ? '#16a34a' : '#64748b';
    this.dataStatusEl.style.color = color;
    this.dataStatusEl.textContent = text || '';
  }

  ensureDataDialog() {
    if (this.dataDialogOverlay) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:24000;';
    const panel = document.createElement('div');
    panel.style.cssText = `
      display:none; position:fixed;
      left: calc(16px + env(safe-area-inset-left, 0px));
      right: calc(16px + env(safe-area-inset-right, 0px));
      top: calc(14px + env(safe-area-inset-top, 0px));
      background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
      z-index:25000;
      max-height: calc(100vh - 28px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
      max-height: calc(100dvh - 28px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
      overflow:hidden;
      display:flex; flex-direction:column;
    `;
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.innerHTML = `
      <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); background:#f8fafc; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div id="memory-data-dialog-title" style="font-weight:800; color:#0f172a;">导入确认</div>
        <button id="memory-data-dialog-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
      </div>
      <div style="padding:14px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch; display:flex; flex-direction:column; gap:12px;">
        <div id="memory-data-dialog-body" style="font-size:13px; color:#0f172a; white-space:pre-wrap;"></div>
        <div id="memory-data-dialog-options" style="display:flex; flex-direction:column; gap:8px;"></div>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button id="memory-data-dialog-cancel" style="padding:8px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer;">取消</button>
          <button id="memory-data-dialog-confirm" style="padding:8px 12px; border:1px solid #0ea5e9; border-radius:10px; background:#0ea5e9; color:#fff; cursor:pointer;">确定</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    overlay.addEventListener('click', () => this.closeDataDialog(null));
    panel.querySelector('#memory-data-dialog-close')?.addEventListener('click', () => this.closeDataDialog(null));

    this.dataDialogOverlay = overlay;
    this.dataDialogPanel = panel;
    this.dataDialogTitle = panel.querySelector('#memory-data-dialog-title');
    this.dataDialogBody = panel.querySelector('#memory-data-dialog-body');
    this.dataDialogOptions = panel.querySelector('#memory-data-dialog-options');
    this.dataDialogConfirm = panel.querySelector('#memory-data-dialog-confirm');
    this.dataDialogCancel = panel.querySelector('#memory-data-dialog-cancel');
    this.dataDialogConfirm?.addEventListener('click', () => this.confirmDataDialog());
    this.dataDialogCancel?.addEventListener('click', () => this.closeDataDialog(null));
  }

  closeDataDialog(value) {
    if (this.dataDialogOverlay) this.dataDialogOverlay.style.display = 'none';
    if (this.dataDialogPanel) this.dataDialogPanel.style.display = 'none';
    const resolve = this.dataDialogResolve;
    this.dataDialogResolve = null;
    if (resolve) resolve(value);
  }

  confirmDataDialog() {
    if (this.dataDialogInput) {
      const value = String(this.dataDialogInput.value || '').trim();
      this.closeDataDialog(value);
      return;
    }
    if (!this.dataDialogOptions) {
      this.closeDataDialog(true);
      return;
    }
    const checked = this.dataDialogOptions.querySelector('input[type="radio"]:checked');
    const value = checked ? String(checked.value || '') : 'ok';
    this.closeDataDialog(value || true);
  }

  async showDataDialog({
    title,
    body,
    options,
    defaultValue,
    confirmText = '确定',
    cancelText = '取消',
    searchable = false,
    searchPlaceholder = '搜索...',
  } = {}) {
    this.ensureDataDialog();
    if (!this.dataDialogOverlay || !this.dataDialogPanel) return null;
    if (this.dataDialogTitle) this.dataDialogTitle.textContent = title || '请确认';
    if (this.dataDialogBody) this.dataDialogBody.textContent = String(body || '');
    if (this.dataDialogOptions) {
      this.dataDialogOptions.innerHTML = '';
      this.dataDialogInput = null;
      if (Array.isArray(options) && options.length) {
        const groupName = `memory-data-dialog-${Date.now()}`;
        const listWrap = document.createElement('div');
        listWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px;';
        const renderList = (filterText = '') => {
          listWrap.innerHTML = '';
          const needle = String(filterText || '').trim().toLowerCase();
          const filtered = needle
            ? options.filter(opt => String(opt?.label || opt?.value || '').toLowerCase().includes(needle))
            : options.slice();
          filtered.forEach((opt, idx) => {
            const label = document.createElement('label');
            label.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px; color:#0f172a;';
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = groupName;
            input.value = String(opt.value || '');
            if ((defaultValue && String(opt.value) === String(defaultValue)) || (!defaultValue && idx === 0)) {
              input.checked = true;
            }
            const text = document.createElement('span');
            text.textContent = String(opt.label || opt.value || '');
            label.appendChild(input);
            label.appendChild(text);
            listWrap.appendChild(label);
          });
          if (!filtered.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'font-size:12px; color:#94a3b8;';
            empty.textContent = '未找到匹配项';
            listWrap.appendChild(empty);
          }
        };
        if (searchable) {
          const search = document.createElement('input');
          search.type = 'text';
          search.placeholder = searchPlaceholder;
          search.style.cssText = 'width:100%; padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;';
          search.addEventListener('input', () => renderList(search.value));
          this.dataDialogOptions.appendChild(search);
        }
        renderList('');
        this.dataDialogOptions.appendChild(listWrap);
        this.dataDialogOptions.style.display = 'flex';
      } else {
        this.dataDialogOptions.style.display = 'none';
      }
    }
    if (this.dataDialogConfirm) this.dataDialogConfirm.textContent = confirmText;
    if (this.dataDialogCancel) this.dataDialogCancel.textContent = cancelText;
    this.dataDialogOverlay.style.display = 'block';
    this.dataDialogPanel.style.display = 'flex';
    return new Promise(resolve => {
      this.dataDialogResolve = resolve;
    });
  }

  async showDataInputDialog({ title, body, placeholder = '', defaultValue = '', confirmText = '确定', cancelText = '取消' } = {}) {
    this.ensureDataDialog();
    if (!this.dataDialogOverlay || !this.dataDialogPanel) return null;
    if (this.dataDialogTitle) this.dataDialogTitle.textContent = title || '请输入';
    if (this.dataDialogBody) this.dataDialogBody.textContent = String(body || '');
    if (this.dataDialogOptions) {
      this.dataDialogOptions.innerHTML = '';
      this.dataDialogOptions.style.display = 'none';
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = placeholder;
    input.value = String(defaultValue || '');
    input.style.cssText = 'width:100%; padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;';
    if (this.dataDialogBody) {
      const wrap = document.createElement('div');
      wrap.style.cssText = 'margin-top:8px;';
      wrap.appendChild(input);
      this.dataDialogBody.appendChild(wrap);
    }
    this.dataDialogInput = input;
    if (this.dataDialogConfirm) this.dataDialogConfirm.textContent = confirmText;
    if (this.dataDialogCancel) this.dataDialogCancel.textContent = cancelText;
    this.dataDialogOverlay.style.display = 'block';
    this.dataDialogPanel.style.display = 'flex';
    return new Promise(resolve => {
      this.dataDialogResolve = resolve;
    });
  }

  getContactsStore() {
    return window.appBridge?.contactsStore || null;
  }

  getFriendOptions() {
    try {
      const store = this.getContactsStore();
      const list = store?.listFriends?.() || store?.listContacts?.() || [];
      return Array.isArray(list) ? list.filter(c => c && !c.isGroup) : [];
    } catch {
      return [];
    }
  }

  getGroupOptions() {
    try {
      const store = this.getContactsStore();
      const list = store?.listGroups?.() || [];
      return Array.isArray(list) ? list.filter(c => c && c.isGroup) : [];
    } catch {
      return [];
    }
  }

  resolveContactId(input, list) {
    const raw = String(input || '').trim();
    if (!raw) return '';
    const norm = raw.toLowerCase().replace(/\s+/g, '');
    const exact = (list || []).find(c => String(c?.id || '').toLowerCase() === raw.toLowerCase());
    if (exact?.id) return exact.id;
    const byName = (list || []).find(c => String(c?.name || '').toLowerCase().replace(/\s+/g, '') === norm);
    if (byName?.id) return byName.id;
    return raw;
  }

  normalizeRowDataForCompare(rowData) {
    const data = rowData && typeof rowData === 'object' ? rowData : {};
    const entries = Object.entries(data)
      .map(([key, value]) => {
        const k = String(key || '').trim();
        if (!k) return null;
        const v = String(value ?? '')
          .replace(/\s+/g, ' ')
          .trim();
        return [k, v];
      })
      .filter(Boolean)
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return entries.map(([k, v]) => `${k}=${v}`).join('|');
  }

  normalizeRowDataText(rowData) {
    const data = rowData && typeof rowData === 'object' ? rowData : {};
    return Object.values(data)
      .map(v => String(v ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .trim();
  }

  buildCharSet(text) {
    const raw = String(text || '');
    const set = new Set();
    for (const ch of raw) {
      if (!ch.trim()) continue;
      set.add(ch);
    }
    return set;
  }

  calcJaccard(a, b) {
    if (!a || !b) return 0;
    const setA = a instanceof Set ? a : this.buildCharSet(a);
    const setB = b instanceof Set ? b : this.buildCharSet(b);
    if (!setA.size || !setB.size) return 0;
    let inter = 0;
    for (const ch of setA) {
      if (setB.has(ch)) inter += 1;
    }
    const union = setA.size + setB.size - inter;
    if (!union) return 0;
    return inter / union;
  }

  formatRowPreview(rowData, max = 60) {
    const text = this.normalizeRowDataText(rowData);
    if (!text) return '（空）';
    if (text.length <= max) return text;
    return `${text.slice(0, max)}…`;
  }

  buildSimilarityIndex(rows) {
    const byTable = new Map();
    (Array.isArray(rows) ? rows : []).forEach(row => {
      const tableId = String(row?.table_id || '').trim();
      if (!tableId) return;
      const text = this.normalizeRowDataText(row?.row_data || {});
      if (!text) return;
      const entry = {
        tableId,
        text,
        set: this.buildCharSet(text),
        preview: this.formatRowPreview(row?.row_data || {}),
      };
      if (!byTable.has(tableId)) byTable.set(tableId, []);
      byTable.get(tableId).push(entry);
    });
    return byTable;
  }

  async getDefaultTemplateRecord() {
    if (this.currentTemplate) return this.currentTemplate;
    if (!this.templateStore) return null;
    const list = await this.templateStore.getTemplates({ is_default: true });
    if (Array.isArray(list) && list.length) return list[0];
    const fallback = await this.templateStore.getTemplates({ id: 'default-v1' });
    if (Array.isArray(fallback) && fallback.length) return fallback[0];
    return null;
  }

  async exportMemoryData() {
    if (!this.templateStore || !this.memoryStore) {
      window.toastr?.error?.('记忆存储未就绪');
      return;
    }
    const record = await this.getDefaultTemplateRecord();
    if (!record) {
      window.toastr?.error?.('未找到默认模板');
      return;
    }
    const pick = await this.showDataDialog({
      title: '导出范围',
      body: '请选择导出范围：',
      options: [
        { value: 'all', label: '全部' },
        { value: 'contact', label: '指定联系人' },
        { value: 'group', label: '指定群聊' },
      ],
      defaultValue: 'all',
      confirmText: '下一步',
      cancelText: '取消',
    });
    if (!pick) {
      this.setDataStatus('已取消导出', { tone: 'muted' });
      return;
    }
    const range = String(pick);

    let targetId = '';
    let includeGlobal = true;
    if (range === 'contact') {
      const friends = this.getFriendOptions();
      const options = friends.map(c => ({ value: c.id, label: `${c.name || c.id} (${c.id})` }));
      options.push({ value: '__manual__', label: '手动输入 ID/名称' });
      const selected = await this.showDataDialog({
        title: '选择联系人',
        body: '请选择要导出的联系人：',
        options,
        defaultValue: friends[0]?.id || '',
        confirmText: '选择',
        cancelText: '取消',
        searchable: true,
        searchPlaceholder: '搜索联系人...',
      });
      if (!selected) {
        this.setDataStatus('已取消导出', { tone: 'muted' });
        return;
      }
      if (selected === '__manual__') {
        const raw = await this.showDataInputDialog({
          title: '输入联系人',
          body: '请输入联系人 ID 或名称：',
          placeholder: '联系人 ID 或名称',
        });
        targetId = this.resolveContactId(raw, friends);
      } else {
        targetId = String(selected || '');
      }
      if (!targetId) {
        window.toastr?.warning?.('未选择联系人');
        return;
      }
      const globalPick = await this.showDataDialog({
        title: '包含全局记忆',
        body: '是否同时导出全局记忆？',
        options: [
          { value: 'yes', label: '包含全局记忆' },
          { value: 'no', label: '仅导出联系人记忆' },
        ],
        defaultValue: 'yes',
        confirmText: '继续',
        cancelText: '取消',
      });
      if (!globalPick) {
        this.setDataStatus('已取消导出', { tone: 'muted' });
        return;
      }
      includeGlobal = globalPick === 'yes';
    }
    if (range === 'group') {
      const groups = this.getGroupOptions();
      const options = groups.map(c => ({ value: c.id, label: `${c.name || c.id} (${c.id})` }));
      options.push({ value: '__manual__', label: '手动输入 ID/名称' });
      const selected = await this.showDataDialog({
        title: '选择群聊',
        body: '请选择要导出的群聊：',
        options,
        defaultValue: groups[0]?.id || '',
        confirmText: '选择',
        cancelText: '取消',
        searchable: true,
        searchPlaceholder: '搜索群聊...',
      });
      if (!selected) {
        this.setDataStatus('已取消导出', { tone: 'muted' });
        return;
      }
      if (selected === '__manual__') {
        const raw = await this.showDataInputDialog({
          title: '输入群聊',
          body: '请输入群聊 ID 或名称：',
          placeholder: '群聊 ID 或名称',
        });
        targetId = this.resolveContactId(raw, groups);
      } else {
        targetId = String(selected || '');
      }
      if (!targetId) {
        window.toastr?.warning?.('未选择群聊');
        return;
      }
      const globalPick = await this.showDataDialog({
        title: '包含全局记忆',
        body: '是否同时导出全局记忆？',
        options: [
          { value: 'yes', label: '包含全局记忆' },
          { value: 'no', label: '仅导出群聊记忆' },
        ],
        defaultValue: 'yes',
        confirmText: '继续',
        cancelText: '取消',
      });
      if (!globalPick) {
        this.setDataStatus('已取消导出', { tone: 'muted' });
        return;
      }
      includeGlobal = globalPick === 'yes';
    }

    this.setDataStatus('正在导出...', { tone: 'muted' });
    try {
      const payload = await this.buildExportPayload({ record, range, targetId, includeGlobal });
      if (!payload) {
        this.setDataStatus('导出失败：未生成数据', { tone: 'error' });
        return;
      }
      this.downloadJson(payload, this.buildExportFileName(record, range, targetId));
      const count = Array.isArray(payload.memories) ? payload.memories.length : 0;
      this.setDataStatus(`导出完成：${count} 条`, { tone: 'success' });
    } catch (err) {
      logger.warn('export memory data failed', err);
      this.setDataStatus('导出失败', { tone: 'error' });
      window.toastr?.error?.('导出失败');
    }
  }

  buildExportFileName(record, range, targetId) {
    const name = sanitizeFileName(record?.name || record?.id || 'memory-data');
    const suffix = range === 'contact' ? '_contact' : range === 'group' ? '_group' : '_all';
    const target = targetId ? `_${sanitizeFileName(targetId)}` : '';
    return `${name}${suffix}${target}.json`;
  }

  downloadJson(payload, filename) {
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || 'memory-data.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async buildExportPayload({ record, range = 'all', targetId = '', includeGlobal = true } = {}) {
    const template = this.templateStore.toTemplateDefinition(record);
    if (!template) return null;
    const templateId = String(record?.id || template?.meta?.id || '').trim();
    if (!templateId) return null;
    let memories = [];
    if (range === 'all') {
      memories = await this.memoryStore.getMemories({ template_id: templateId });
    } else if (range === 'contact') {
      const rows = await this.memoryStore.getMemories({ scope: 'contact', contact_id: targetId, template_id: templateId });
      memories = Array.isArray(rows) ? rows : [];
      if (includeGlobal) {
        const globals = await this.memoryStore.getMemories({ scope: 'global', template_id: templateId });
        memories = memories.concat(Array.isArray(globals) ? globals : []);
      }
    } else if (range === 'group') {
      const rows = await this.memoryStore.getMemories({ scope: 'group', group_id: targetId, template_id: templateId });
      memories = Array.isArray(rows) ? rows : [];
      if (includeGlobal) {
        const globals = await this.memoryStore.getMemories({ scope: 'global', template_id: templateId });
        memories = memories.concat(Array.isArray(globals) ? globals : []);
      }
    }
    return {
      template,
      memories: Array.isArray(memories) ? memories : [],
    };
  }

  async importDataFile(file) {
    if (!this.templateStore || !this.memoryStore) {
      window.toastr?.error?.('记忆存储未就绪');
      return;
    }
    this.setDataStatus('解析中...', { tone: 'muted' });
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        window.toastr?.error?.('数据格式无效');
        this.setDataStatus('导入失败：格式无效', { tone: 'error' });
        return;
      }
      const template = parsed.template;
      const memoriesRaw = Array.isArray(parsed.memories) ? parsed.memories : [];
      const check = validateTemplate(template);
      if (!check.ok) {
        window.toastr?.error?.(`模板格式无效：${check.errors.join(', ')}`);
        this.setDataStatus('导入失败：模板格式无效', { tone: 'error' });
        return;
      }
      const templateId = String(template?.meta?.id || '').trim();
      if (!templateId) {
        window.toastr?.error?.('模板缺少 meta.id');
        this.setDataStatus('导入失败：模板缺少 ID', { tone: 'error' });
        return;
      }
      const existingTemplate = await this.templateStore.getTemplateById(templateId);
      if (existingTemplate) {
        const warn = existingTemplate.is_builtin ? '（当前为内置模板）' : '';
        const ok = await this.showDataDialog({
          title: '模板覆盖',
          body: `已存在同 ID 模板${warn}，是否覆盖模板定义？`,
          confirmText: '覆盖',
          cancelText: '跳过',
        });
        if (ok) {
          await this.templateStore.saveTemplateDefinition(template, {
            isDefault: existingTemplate.is_default,
            isBuiltin: existingTemplate.is_builtin,
          });
        }
      } else {
        await this.templateStore.saveTemplateDefinition(template, { isDefault: false, isBuiltin: false });
      }

      const setDefault = await this.showDataDialog({
        title: '设为默认模板',
        body: '是否将导入模板设为默认模板？',
        confirmText: '设为默认',
        cancelText: '保持不变',
      });
      if (setDefault) {
        const record = await this.templateStore.getTemplateById(templateId);
        if (record) {
          await this.handleDefaultTemplateSwitch(record, { silentConfirm: true });
        }
      }

      const normalized = [];
      let invalidCount = 0;
      for (const row of memoriesRaw) {
        if (!row || typeof row !== 'object') {
          invalidCount += 1;
          continue;
        }
        const tableId = String(row.table_id || '').trim();
        if (!tableId) {
          invalidCount += 1;
          continue;
        }
        const rowData = row.row_data && typeof row.row_data === 'object' ? row.row_data : null;
        if (!rowData) {
          invalidCount += 1;
          continue;
        }
        const contentKey = `${tableId}::${this.normalizeRowDataForCompare(rowData)}`;
        normalized.push({
          id: String(row.id || '').trim(),
          template_id: templateId,
          table_id: tableId,
          contact_id: row.contact_id ? String(row.contact_id) : null,
          group_id: row.group_id ? String(row.group_id) : null,
          row_data: rowData,
          is_active: row.is_active !== false,
          is_pinned: Boolean(row.is_pinned),
          priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 0,
          sort_order: Number.isFinite(Number(row.sort_order)) ? Number(row.sort_order) : 0,
          _contentKey: contentKey,
        });
      }

      if (!normalized.length) {
        this.setDataStatus('无可导入数据', { tone: 'error' });
        return;
      }

      const existing = await this.memoryStore.getMemories({ template_id: templateId });
      const existingMap = new Map();
      let existingContent = new Set();
      let existingRowsForSimilarity = Array.isArray(existing) ? existing : [];
      const rebuildExistingContent = (rows) => {
        const next = new Set();
        (Array.isArray(rows) ? rows : []).forEach(row => {
          const tableId = String(row?.table_id || '').trim();
          if (!tableId) return;
          const rowData = row?.row_data && typeof row.row_data === 'object' ? row.row_data : {};
          const contentKey = `${tableId}::${this.normalizeRowDataForCompare(rowData)}`;
          if (contentKey) next.add(contentKey);
        });
        existingContent = next;
      };
      existingMap.clear();
      (Array.isArray(existing) ? existing : []).forEach(row => {
        if (row?.id) existingMap.set(String(row.id), row);
        const tableId = String(row?.table_id || '').trim();
        if (!tableId) return;
        const rowData = row?.row_data && typeof row.row_data === 'object' ? row.row_data : {};
        const contentKey = `${tableId}::${this.normalizeRowDataForCompare(rowData)}`;
        if (contentKey) existingContent.add(contentKey);
      });
      const conflicts = normalized.filter(row => row.id && existingMap.has(String(row.id)));
      const contentDuplicates = normalized.filter(row => row._contentKey && existingContent.has(row._contentKey));
      const totalCount = normalized.length;
      const infoLines = [
        `待导入: ${totalCount} 条`,
        invalidCount ? `无效: ${invalidCount} 条` : '',
        conflicts.length ? `ID 冲突: ${conflicts.length} 条` : '',
        contentDuplicates.length ? `内容重复: ${contentDuplicates.length} 条` : '',
        '内容相似将于冲突处理后提示',
      ].filter(Boolean);
      const proceed = await this.showDataDialog({
        title: '导入确认',
        body: infoLines.join('\n'),
        confirmText: '开始导入',
        cancelText: '取消',
      });
      if (!proceed) {
        this.setDataStatus('已取消导入', { tone: 'muted' });
        return;
      }
      let conflictMode = 'overwrite';
      if (conflicts.length) {
        const pick = await this.showDataDialog({
          title: 'ID 冲突处理',
          body: `发现 ${conflicts.length} 条与现有 ID 冲突的记录，请选择处理方式：`,
          options: [
            { value: 'overwrite', label: '全部覆盖（删除旧记录后导入）' },
            { value: 'skip', label: '全部跳过' },
            { value: 'rename', label: '全部重命名（保留两条，新 ID）' },
          ],
          defaultValue: 'overwrite',
          confirmText: '继续',
          cancelText: '取消',
        });
        if (!pick) {
          this.setDataStatus('已取消导入', { tone: 'muted' });
          return;
        }
        conflictMode = String(pick);
      }

      let duplicateMode = 'keep';
      if (contentDuplicates.length) {
        const pick = await this.showDataDialog({
          title: '内容重复处理',
          body: `检测到 ${contentDuplicates.length} 条与现有内容重复的记录，请选择处理方式：`,
          options: [
            { value: 'keep', label: '全部导入（保留重复）' },
            { value: 'skip', label: '跳过重复内容' },
          ],
          defaultValue: 'skip',
          confirmText: '继续',
          cancelText: '取消',
        });
        if (!pick) {
          this.setDataStatus('已取消导入', { tone: 'muted' });
          return;
        }
        duplicateMode = String(pick);
      }

      const idsToDelete = conflictMode === 'overwrite'
        ? conflicts.map(row => String(row.id))
        : [];
      if (idsToDelete.length) {
        await this.memoryStore.batchDeleteMemories(idsToDelete);
        try {
          const refreshed = await this.memoryStore.getMemories({ template_id: templateId });
          existingRowsForSimilarity = Array.isArray(refreshed) ? refreshed : [];
          rebuildExistingContent(existingRowsForSimilarity);
        } catch {}
      }

      const toInsert = normalized.filter(row => {
        if (!row.id) return true;
        if (!existingMap.has(String(row.id))) return true;
        if (conflictMode === 'skip') return false;
        return true;
      });
      if (conflictMode === 'rename') {
        toInsert.forEach(row => {
          if (row.id && existingMap.has(String(row.id))) {
            row.id = '';
          }
        });
      }
      const deduped = [];
      if (duplicateMode === 'skip') {
        for (const row of toInsert) {
          const key = row._contentKey || '';
          if (key && existingContent.has(key)) continue;
          deduped.push(row);
          if (key) existingContent.add(key);
        }
      } else {
        deduped.push(...toInsert);
      }

      let similarMode = 'keep';
      const similarityIndex = this.buildSimilarityIndex(existingRowsForSimilarity);
      const similarityThreshold = 0.9;
      const similarSamples = [];
      for (const row of deduped) {
        const tableId = String(row.table_id || '').trim();
        if (!tableId) continue;
        const candidates = similarityIndex.get(tableId) || [];
        if (!candidates.length) continue;
        const text = this.normalizeRowDataText(row.row_data || {});
        if (!text) continue;
        const set = this.buildCharSet(text);
        let matched = null;
        for (const cand of candidates) {
          const score = this.calcJaccard(set, cand.set);
          if (score >= similarityThreshold) {
            matched = { cand, score };
            break;
          }
        }
        if (matched) {
          row._similar = true;
          if (similarSamples.length < 5) {
            similarSamples.push({
              tableId,
              score: matched.score,
              incoming: this.formatRowPreview(row.row_data || {}),
              existing: matched.cand.preview,
            });
          }
        }
      }

      const similarCount = deduped.filter(row => row._similar).length;
      if (similarCount) {
        const sampleLines = similarSamples.map((s, idx) =>
          `${idx + 1}. [${s.tableId}] 新: ${s.incoming} | 旧: ${s.existing}`
        );
        const pick = await this.showDataDialog({
          title: '内容相似提醒',
          body: `检测到 ${similarCount} 条内容相似的记录（阈值 ${similarityThreshold}）。\n可参考样例：\n${sampleLines.join('\n')}`,
          options: [
            { value: 'keep', label: '全部导入（保留相似内容）' },
            { value: 'skip', label: '跳过相似内容' },
          ],
          defaultValue: 'keep',
          confirmText: '继续',
          cancelText: '取消',
        });
        if (!pick) {
          this.setDataStatus('已取消导入', { tone: 'muted' });
          return;
        }
        similarMode = String(pick);
      }

      const finalRows = similarMode === 'skip'
        ? deduped.filter(row => !row._similar)
        : deduped;

      let imported = 0;
      const chunkSize = 100;
      for (let i = 0; i < finalRows.length; i += chunkSize) {
        const slice = finalRows.slice(i, i + chunkSize);
        const payload = slice.map(row => {
          const { _contentKey, _similar, ...rest } = row;
          return rest;
        });
        await this.memoryStore.batchCreateMemories(payload);
        imported += slice.length;
        this.setDataStatus(`导入中：${imported}/${finalRows.length}`, { tone: 'muted' });
      }

      this.setDataStatus(
        `导入完成：${imported} 条${invalidCount ? `（无效 ${invalidCount} 条）` : ''}`,
        { tone: 'success' },
      );
      this.refresh();
      window.dispatchEvent(new CustomEvent('memory-templates-updated'));
      window.toastr?.success?.('记忆数据导入完成');
    } catch (err) {
      logger.warn('import memory data failed', err);
      this.setDataStatus('导入失败', { tone: 'error' });
      window.toastr?.error?.('导入失败');
    }
  }

  isTemplateCompatible(oldTemplate, newTemplate) {
    const oldTables = Array.isArray(oldTemplate?.tables) ? oldTemplate.tables : [];
    const newTables = Array.isArray(newTemplate?.tables) ? newTemplate.tables : [];
    const newMap = new Map();
    newTables.forEach(t => {
      const id = String(t?.id || '').trim();
      if (!id) return;
      const cols = new Set((Array.isArray(t?.columns) ? t.columns : []).map(c => String(c?.id || '').trim()).filter(Boolean));
      newMap.set(id, cols);
    });
    for (const t of oldTables) {
      const tid = String(t?.id || '').trim();
      if (!tid) continue;
      const newCols = newMap.get(tid);
      if (!newCols) return false;
      const cols = Array.isArray(t?.columns) ? t.columns : [];
      for (const col of cols) {
        const cid = String(col?.id || '').trim();
        if (!cid) continue;
        if (!newCols.has(cid)) return false;
      }
    }
    return true;
  }

  buildTemplateColumnMap(template) {
    const map = new Map();
    const tables = Array.isArray(template?.tables) ? template.tables : [];
    tables.forEach(t => {
      const tid = String(t?.id || '').trim();
      if (!tid) return;
      const cols = new Set((Array.isArray(t?.columns) ? t.columns : []).map(c => String(c?.id || '').trim()).filter(Boolean));
      map.set(tid, cols);
    });
    return map;
  }

  async migrateTemplateData(oldTemplate, newTemplate) {
    const oldId = String(oldTemplate?.meta?.id || '').trim();
    const newId = String(newTemplate?.meta?.id || '').trim();
    if (!oldId || !newId || !this.memoryStore) return 0;
    const rows = await this.memoryStore.getMemories({ template_id: oldId });
    const columnMap = this.buildTemplateColumnMap(newTemplate);
    const list = Array.isArray(rows) ? rows : [];
    const toInsert = [];
    for (const row of list) {
      const tableId = String(row?.table_id || '').trim();
      if (!tableId || !columnMap.has(tableId)) continue;
      const allowedCols = columnMap.get(tableId);
      const rowData = {};
      Object.entries(row?.row_data || {}).forEach(([key, value]) => {
        const cid = String(key || '').trim();
        if (!cid || !allowedCols.has(cid)) return;
        rowData[cid] = value;
      });
      if (!Object.keys(rowData).length) continue;
      toInsert.push({
        template_id: newId,
        table_id: tableId,
        contact_id: row?.contact_id ? String(row.contact_id) : null,
        group_id: row?.group_id ? String(row.group_id) : null,
        row_data: rowData,
        is_active: row?.is_active !== false,
        is_pinned: Boolean(row?.is_pinned),
        priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
        sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
      });
    }
    if (!toInsert.length) return 0;
    const chunkSize = 100;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const slice = toInsert.slice(i, i + chunkSize);
      await this.memoryStore.batchCreateMemories(slice);
      inserted += slice.length;
    }
    return inserted;
  }

  async clearTemplateData(templateId) {
    if (!templateId || !this.memoryStore) return 0;
    const list = await this.memoryStore.getMemories({ template_id: templateId });
    const ids = Array.isArray(list) ? list.map(row => String(row?.id || '')).filter(Boolean) : [];
    if (!ids.length) return 0;
    await this.memoryStore.batchDeleteMemories(ids);
    return ids.length;
  }

  async exportTemplateDataWithRecord(record, memories) {
    const template = this.templateStore.toTemplateDefinition(record);
    if (!template) return;
    const payload = { template, memories: Array.isArray(memories) ? memories : [] };
    const name = sanitizeFileName(record?.name || record?.id || 'memory-data');
    this.downloadJson(payload, `${name}_backup.json`);
  }

  async handleDefaultTemplateSwitch(record, { silentConfirm = false } = {}) {
    if (!record || !this.templateStore) return;
    const current = this.currentTemplate;
    if (current && String(current.id) === String(record.id)) return;
    if (!silentConfirm) {
      const ok = await this.showDataDialog({
        title: '切换默认模板',
        body: '确定切换为默认模板吗？',
        confirmText: '切换',
        cancelText: '取消',
      });
      if (!ok) return;
    }
    const oldRecord = current;
    if (oldRecord && this.memoryStore) {
      const oldTemplate = this.templateStore.toTemplateDefinition(oldRecord);
      const newTemplate = this.templateStore.toTemplateDefinition(record);
      const compatible = this.isTemplateCompatible(oldTemplate, newTemplate);
      if (compatible) {
        const pick = await this.showDataDialog({
          title: '模板兼容',
          body: '检测到模板兼容，是否迁移旧模板数据到新模板？',
          options: [
            { value: 'migrate', label: '迁移旧数据到新模板' },
            { value: 'skip', label: '不迁移，保留旧数据' },
          ],
          defaultValue: 'migrate',
          confirmText: '继续',
          cancelText: '取消',
        });
        if (!pick) return;
        if (pick === 'migrate') {
          this.setDataStatus('正在迁移旧数据...', { tone: 'muted' });
          try {
            const count = await this.migrateTemplateData(oldTemplate, newTemplate);
            this.setDataStatus(`迁移完成：${count} 条`, { tone: 'success' });
          } catch (err) {
            logger.warn('migrate template data failed', err);
            this.setDataStatus('迁移失败', { tone: 'error' });
          }
        }
      } else {
        const pick = await this.showDataDialog({
          title: '模板不兼容',
          body: '新模板与旧模板不兼容，请选择处理方式：',
          options: [
            { value: 'keep', label: '保留旧数据（不注入）' },
            { value: 'clear', label: '清空旧数据' },
            { value: 'export_clear', label: '导出旧数据后清空' },
          ],
          defaultValue: 'keep',
          confirmText: '继续',
          cancelText: '取消',
        });
        if (!pick) return;
        if (pick === 'clear' || pick === 'export_clear') {
          if (pick === 'export_clear') {
            const list = await this.memoryStore.getMemories({ template_id: oldRecord.id });
            await this.exportTemplateDataWithRecord(oldRecord, list);
          }
          await this.clearTemplateData(oldRecord.id);
        }
      }
    }
    try {
      await this.templateStore.setDefaultTemplate(record.id);
      this.refresh();
      window.dispatchEvent(new CustomEvent('memory-templates-updated'));
    } catch (err) {
      logger.warn('set default template failed', err);
      window.toastr?.error?.('切换默认模板失败');
    }
  }

  ensureTemplateEditor() {
    if (this.templateEditorOverlay) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:24000;';
    const panel = document.createElement('div');
    panel.style.cssText = `
      display:none; position:fixed;
      left: calc(12px + env(safe-area-inset-left, 0px));
      right: calc(12px + env(safe-area-inset-right, 0px));
      top: calc(12px + env(safe-area-inset-top, 0px));
      bottom: calc(12px + env(safe-area-inset-bottom, 0px));
      background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
      z-index:25000;
      overflow:hidden;
      display:flex; flex-direction:column;
    `;
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.innerHTML = `
      <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); background:#f8fafc; display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <div style="font-weight:800; color:#0f172a;">模板结构编辑</div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button id="memory-template-add-table" style="padding:6px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; font-size:12px;">新增表</button>
          <button id="memory-template-save-structure" style="padding:6px 10px; border:1px solid #0ea5e9; border-radius:10px; background:#0ea5e9; color:#fff; cursor:pointer; font-size:12px;">保存</button>
          <button id="memory-template-close-structure" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
        </div>
      </div>
      <div id="memory-template-structure-body" style="padding:14px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;"></div>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    overlay.addEventListener('click', () => this.closeTemplateEditor());
    panel.querySelector('#memory-template-close-structure')?.addEventListener('click', () => this.closeTemplateEditor());

    this.templateEditorOverlay = overlay;
    this.templateEditorPanel = panel;
    this.templateEditorBody = panel.querySelector('#memory-template-structure-body');
    this.templateEditorSaveBtn = panel.querySelector('#memory-template-save-structure');
    this.templateEditorCloseBtn = panel.querySelector('#memory-template-close-structure');
    this.templateEditorAddTableBtn = panel.querySelector('#memory-template-add-table');
    this.templateEditorSaveBtn?.addEventListener('click', () => this.saveTemplateEditor());
    this.templateEditorAddTableBtn?.addEventListener('click', () => this.addTemplateTable());
  }

  openTemplateEditor(record) {
    if (!record || !this.templateStore) {
      window.toastr?.info?.('未找到可编辑的模板');
      this.logDebug('[模板#?] 结构编辑失败：无可用模板或 store 未就绪', 'warn');
      return;
    }
    const template = this.templateStore.toTemplateDefinition(record);
    if (!template) {
      window.toastr?.error?.('模板数据为空，无法编辑');
      this.logDebug(`[模板#?] 结构编辑失败：模板为空 (${record?.id || 'unknown'})`, 'warn');
      return;
    }
    const draft = deepClone(template);
    if (!draft.meta || typeof draft.meta !== 'object') {
      draft.meta = { id: record.id, name: record.name || record.id };
    }
    if (!Array.isArray(draft.tables)) draft.tables = [];
    draft.tables.forEach(ensureTableConfigDefaults);
    this.templateEditorRecord = record;
    this.templateEditorData = draft;
    this.ensureTemplateEditor();
    this.renderTemplateEditor();
    if (this.templateEditorOverlay) this.templateEditorOverlay.style.display = 'block';
    if (this.templateEditorPanel) this.templateEditorPanel.style.display = 'flex';
  }

  closeTemplateEditor() {
    if (this.templateEditorOverlay) this.templateEditorOverlay.style.display = 'none';
    if (this.templateEditorPanel) this.templateEditorPanel.style.display = 'none';
    this.templateEditorRecord = null;
    this.templateEditorData = null;
  }

  addTemplateTable() {
    if (!this.templateEditorData) return;
    const stamp = Date.now().toString(36);
    const table = ensureTableConfigDefaults({
      id: `table_${stamp}`,
      name: '新表格',
      scope: 'contact',
      maxRows: null,
      columns: [{ id: 'col1', name: '字段1', type: 'text' }],
      sourceData: {},
      updateConfig: {},
      exportConfig: {},
    });
    this.templateEditorData.tables.push(table);
    this.renderTemplateEditor();
  }

  renderTemplateEditor() {
    if (!this.templateEditorBody || !this.templateEditorData) return;
    this.templateEditorBody.innerHTML = '';
    const template = this.templateEditorData;
    const meta = template.meta || {};
    const metaBlock = document.createElement('div');
    metaBlock.style.cssText = 'border:1px solid #e2e8f0; border-radius:12px; padding:12px; margin-bottom:12px; background:#fff;';
    metaBlock.innerHTML = `
      <div style="font-weight:700; color:#0f172a; margin-bottom:8px;">模板信息</div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center;">
        <label style="font-size:12px; color:#64748b;">ID</label>
        <input id="memory-template-meta-id" type="text" disabled style="flex:1; min-width:200px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
      </div>
      <div style="display:flex; flex-wrap:wrap; gap:8px; align-items:center; margin-top:8px;">
        <label style="font-size:12px; color:#64748b;">名称</label>
        <input id="memory-template-meta-name" type="text" style="flex:1; min-width:200px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
      </div>
      <div style="margin-top:8px;">
        <label style="font-size:12px; color:#64748b;">描述</label>
        <textarea id="memory-template-meta-desc" rows="2" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;"></textarea>
      </div>
    `;
    this.templateEditorBody.appendChild(metaBlock);
    const metaIdInput = metaBlock.querySelector('#memory-template-meta-id');
    const metaNameInput = metaBlock.querySelector('#memory-template-meta-name');
    const metaDescInput = metaBlock.querySelector('#memory-template-meta-desc');
    if (metaIdInput) metaIdInput.value = String(meta.id || '');
    if (metaNameInput) metaNameInput.value = String(meta.name || '');
    if (metaDescInput) metaDescInput.value = String(meta.description || '');
    metaNameInput?.addEventListener('input', () => {
      meta.name = String(metaNameInput.value || '').trim();
    });
    metaDescInput?.addEventListener('input', () => {
      meta.description = String(metaDescInput.value || '').trim();
    });

    const tables = Array.isArray(template.tables) ? template.tables : [];
    if (!tables.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size:12px; color:#94a3b8; padding:8px;';
      empty.textContent = '暂无表格，请点击“新增表”。';
      this.templateEditorBody.appendChild(empty);
      return;
    }

    tables.forEach((table, idx) => {
      ensureTableConfigDefaults(table);
      const details = document.createElement('details');
      details.open = true;
      details.style.cssText = 'border:1px solid #e2e8f0; border-radius:12px; padding:10px; margin-bottom:12px; background:#fff;';
      const summary = document.createElement('summary');
      summary.style.cssText = 'cursor:pointer; font-weight:700; color:#0f172a;';
      summary.textContent = `${table.name || table.id || '未命名表格'} · ${table.scope || 'contact'}`;
      details.appendChild(summary);

      const body = document.createElement('div');
      body.style.cssText = 'margin-top:10px; display:flex; flex-direction:column; gap:10px;';

      const baseRow = document.createElement('div');
      baseRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; align-items:center;';
      baseRow.innerHTML = `
        <label style="font-size:12px; color:#64748b;">表 ID</label>
        <input type="text" class="memory-table-id" style="min-width:120px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
        <label style="font-size:12px; color:#64748b;">名称</label>
        <input type="text" class="memory-table-name" style="min-width:120px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
        <label style="font-size:12px; color:#64748b;">范围</label>
        <select class="memory-table-scope" style="padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
          <option value="global">全局</option>
          <option value="contact">私聊</option>
          <option value="group">群聊</option>
        </select>
        <label style="font-size:12px; color:#64748b;">最大行数</label>
        <input type="number" class="memory-table-max-rows" min="0" step="1" style="width:90px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
      `;
      const idInput = baseRow.querySelector('.memory-table-id');
      const nameInput = baseRow.querySelector('.memory-table-name');
      const scopeSelect = baseRow.querySelector('.memory-table-scope');
      const maxRowsInput = baseRow.querySelector('.memory-table-max-rows');
      if (idInput) idInput.value = String(table.id || '');
      if (nameInput) nameInput.value = String(table.name || '');
      if (scopeSelect) scopeSelect.value = String(table.scope || 'contact');
      if (maxRowsInput) maxRowsInput.value = table.maxRows != null ? String(table.maxRows) : '';

      idInput?.addEventListener('input', () => {
        table.id = String(idInput.value || '').trim();
        summary.textContent = `${table.name || table.id || '未命名表格'} · ${table.scope || 'contact'}`;
      });
      nameInput?.addEventListener('input', () => {
        table.name = String(nameInput.value || '').trim();
        summary.textContent = `${table.name || table.id || '未命名表格'} · ${table.scope || 'contact'}`;
      });
      scopeSelect?.addEventListener('change', () => {
        table.scope = String(scopeSelect.value || 'contact');
        summary.textContent = `${table.name || table.id || '未命名表格'} · ${table.scope || 'contact'}`;
      });
      maxRowsInput?.addEventListener('input', () => {
        const raw = Math.trunc(Number(maxRowsInput.value));
        table.maxRows = Number.isFinite(raw) && raw > 0 ? raw : null;
      });

      const actionsRow = document.createElement('div');
      actionsRow.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';
      const moveUp = document.createElement('button');
      moveUp.textContent = '上移';
      moveUp.style.cssText = 'padding:4px 8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
      moveUp.disabled = idx === 0;
      moveUp.onclick = () => {
        if (idx <= 0) return;
        const list = template.tables;
        [list[idx - 1], list[idx]] = [list[idx], list[idx - 1]];
        this.renderTemplateEditor();
      };
      const moveDown = document.createElement('button');
      moveDown.textContent = '下移';
      moveDown.style.cssText = 'padding:4px 8px; border:1px solid #e2e8f0; border-radius:8px; background:#fff; cursor:pointer; font-size:12px;';
      moveDown.disabled = idx >= tables.length - 1;
      moveDown.onclick = () => {
        if (idx >= tables.length - 1) return;
        const list = template.tables;
        [list[idx], list[idx + 1]] = [list[idx + 1], list[idx]];
        this.renderTemplateEditor();
      };
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '删除表';
      deleteBtn.style.cssText = 'padding:4px 8px; border:1px solid #fecaca; border-radius:8px; background:#fff; cursor:pointer; font-size:12px; color:#b91c1c;';
      deleteBtn.onclick = async () => {
        const ok = await appConfirm({ title: '删除表格', message: '确定删除该表格吗？', danger: true });
        if (!ok) return;
        template.tables.splice(idx, 1);
        this.renderTemplateEditor();
      };
      actionsRow.appendChild(moveUp);
      actionsRow.appendChild(moveDown);
      actionsRow.appendChild(deleteBtn);

      const columnsBlock = document.createElement('div');
      columnsBlock.style.cssText = 'border-top:1px dashed #e2e8f0; padding-top:10px;';
      const columnsTitle = document.createElement('div');
      columnsTitle.style.cssText = 'font-size:12px; font-weight:700; color:#0f172a; margin-bottom:6px;';
      columnsTitle.textContent = '列定义';
      columnsBlock.appendChild(columnsTitle);
      (table.columns || []).forEach((col, cidx) => {
        const colRow = document.createElement('div');
        colRow.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; align-items:center; margin-bottom:6px;';
        colRow.innerHTML = `
          <input type="text" class="memory-col-id" placeholder="列ID" style="min-width:100px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px;">
          <input type="text" class="memory-col-name" placeholder="列名" style="min-width:120px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px;">
          <select class="memory-col-type" style="padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px;">
            <option value="text">text</option>
            <option value="multiline">multiline</option>
            <option value="select">select</option>
            <option value="number">number</option>
          </select>
          <button class="memory-col-delete" style="padding:4px 6px; border:1px solid #fecaca; border-radius:6px; background:#fff; cursor:pointer; font-size:12px; color:#b91c1c;">删除</button>
        `;
        const colId = colRow.querySelector('.memory-col-id');
        const colName = colRow.querySelector('.memory-col-name');
        const colType = colRow.querySelector('.memory-col-type');
        const colDelete = colRow.querySelector('.memory-col-delete');
        if (colId) colId.value = String(col?.id || '');
        if (colName) colName.value = String(col?.name || '');
        if (colType) colType.value = String(col?.type || 'text');
        colId?.addEventListener('input', () => {
          col.id = String(colId.value || '').trim();
        });
        colName?.addEventListener('input', () => {
          col.name = String(colName.value || '').trim();
        });
        colType?.addEventListener('change', () => {
          col.type = String(colType.value || 'text');
        });
        colDelete?.addEventListener('click', () => {
          table.columns.splice(cidx, 1);
          this.renderTemplateEditor();
        });
        columnsBlock.appendChild(colRow);
      });
      const addColBtn = document.createElement('button');
      addColBtn.textContent = '新增列';
      addColBtn.style.cssText = 'padding:4px 8px; border:1px solid #e2e8f0; border-radius:6px; background:#fff; cursor:pointer; font-size:12px;';
      addColBtn.onclick = () => {
        table.columns.push({ id: `col${table.columns.length + 1}`, name: `字段${table.columns.length + 1}`, type: 'text' });
        this.renderTemplateEditor();
      };
      columnsBlock.appendChild(addColBtn);

      const rulesDetails = document.createElement('details');
      rulesDetails.style.cssText = 'border-top:1px dashed #e2e8f0; padding-top:10px;';
      rulesDetails.open = false;
      const rulesSummary = document.createElement('summary');
      rulesSummary.style.cssText = 'cursor:pointer; font-size:12px; font-weight:700; color:#0f172a;';
      rulesSummary.textContent = '规则字段';
      rulesDetails.appendChild(rulesSummary);
      const rulesBody = document.createElement('div');
      rulesBody.style.cssText = 'margin-top:8px; display:flex; flex-direction:column; gap:8px;';
      const ruleFields = [
        { key: 'note', label: 'note' },
        { key: 'initNode', label: 'initNode' },
        { key: 'insertNode', label: 'insertNode' },
        { key: 'updateNode', label: 'updateNode' },
        { key: 'deleteNode', label: 'deleteNode' },
      ];
      ruleFields.forEach((rule) => {
        const wrap = document.createElement('div');
        wrap.innerHTML = `
          <div style="font-size:12px; color:#64748b; margin-bottom:4px;">${rule.label}</div>
          <textarea rows="2" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;"></textarea>
        `;
        const input = wrap.querySelector('textarea');
        if (input) input.value = String(table.sourceData?.[rule.key] || '');
        input?.addEventListener('input', () => {
          table.sourceData[rule.key] = String(input.value || '').trim();
        });
        rulesBody.appendChild(wrap);
      });
      rulesDetails.appendChild(rulesBody);

      const updateDetails = document.createElement('details');
      updateDetails.style.cssText = 'border-top:1px dashed #e2e8f0; padding-top:10px;';
      updateDetails.open = false;
      const updateSummary = document.createElement('summary');
      updateSummary.style.cssText = 'cursor:pointer; font-size:12px; font-weight:700; color:#0f172a;';
      updateSummary.textContent = '更新配置';
      updateDetails.appendChild(updateSummary);
      const updateBody = document.createElement('div');
      updateBody.style.cssText = 'margin-top:8px; display:flex; flex-wrap:wrap; gap:8px;';
      const updateFields = [
        { key: 'contextDepth', label: 'contextDepth' },
        { key: 'updateFrequency', label: 'updateFrequency' },
        { key: 'batchSize', label: 'batchSize' },
        { key: 'skipFloors', label: 'skipFloors' },
      ];
      updateFields.forEach((field) => {
        const wrap = document.createElement('label');
        wrap.style.cssText = 'display:flex; flex-direction:column; gap:4px; font-size:12px; color:#64748b;';
        wrap.textContent = field.label;
        const input = document.createElement('input');
        input.type = 'number';
        input.step = '1';
        input.style.cssText = 'width:110px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px;';
        const raw = table.updateConfig?.[field.key];
        input.value = raw == null ? '' : String(raw);
        input.addEventListener('input', () => {
          const value = Math.trunc(Number(input.value));
          if (Number.isFinite(value)) table.updateConfig[field.key] = value;
          else delete table.updateConfig[field.key];
        });
        wrap.appendChild(input);
        updateBody.appendChild(wrap);
      });
      updateDetails.appendChild(updateBody);

      const exportDetails = document.createElement('details');
      exportDetails.style.cssText = 'border-top:1px dashed #e2e8f0; padding-top:10px;';
      exportDetails.open = false;
      const exportSummary = document.createElement('summary');
      exportSummary.style.cssText = 'cursor:pointer; font-size:12px; font-weight:700; color:#0f172a;';
      exportSummary.textContent = '导出配置';
      exportDetails.appendChild(exportSummary);
      const exportBody = document.createElement('div');
      exportBody.style.cssText = 'margin-top:8px; display:flex; flex-direction:column; gap:8px;';
      const enabledRow = document.createElement('label');
      enabledRow.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:12px; color:#0f172a;';
      const enabledInput = document.createElement('input');
      enabledInput.type = 'checkbox';
      enabledInput.checked = table.exportConfig?.enabled === true;
      enabledInput.addEventListener('change', () => {
        table.exportConfig.enabled = Boolean(enabledInput.checked);
      });
      enabledRow.appendChild(enabledInput);
      enabledRow.appendChild(document.createTextNode('启用世界书导出'));
      exportBody.appendChild(enabledRow);

      const splitRow = document.createElement('label');
      splitRow.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:12px; color:#0f172a;';
      const splitInput = document.createElement('input');
      splitInput.type = 'checkbox';
      splitInput.checked = table.exportConfig?.splitByRow === true;
      splitInput.addEventListener('change', () => {
        table.exportConfig.splitByRow = Boolean(splitInput.checked);
      });
      splitRow.appendChild(splitInput);
      splitRow.appendChild(document.createTextNode('按行拆分条目'));
      exportBody.appendChild(splitRow);

      const entryWrap = document.createElement('div');
      entryWrap.innerHTML = `
        <div style="font-size:12px; color:#64748b; margin-bottom:4px;">条目名称</div>
        <input type="text" class="export-entry-name" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
      `;
      const entryInput = entryWrap.querySelector('.export-entry-name');
      if (entryInput) entryInput.value = String(table.exportConfig?.entryName || '');
      entryInput?.addEventListener('input', () => {
        table.exportConfig.entryName = String(entryInput.value || '').trim();
      });
      exportBody.appendChild(entryWrap);

      const keywordWrap = document.createElement('div');
      keywordWrap.innerHTML = `
        <div style="font-size:12px; color:#64748b; margin-bottom:4px;">触发关键词（逗号分隔）</div>
        <input type="text" class="export-keywords" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
      `;
      const keywordInput = keywordWrap.querySelector('.export-keywords');
      if (keywordInput) keywordInput.value = String(table.exportConfig?.keywords || '');
      keywordInput?.addEventListener('input', () => {
        table.exportConfig.keywords = String(keywordInput.value || '').trim();
      });
      exportBody.appendChild(keywordWrap);

      const tplWrap = document.createElement('div');
      tplWrap.innerHTML = `
        <div style="font-size:12px; color:#64748b; margin-bottom:4px;">导出模板</div>
        <textarea rows="3" class="export-template" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;"></textarea>
        <small style="color:#94a3b8;">支持 {{tableName}} / {{tableId}} / {{tableData}} / {{rowText}} / {{rowIndex}}</small>
      `;
      const tplInput = tplWrap.querySelector('.export-template');
      if (tplInput) tplInput.value = String(table.exportConfig?.injectionTemplate || '');
      tplInput?.addEventListener('input', () => {
        table.exportConfig.injectionTemplate = String(tplInput.value || '').trim();
      });
      exportBody.appendChild(tplWrap);

      exportDetails.appendChild(exportBody);

      body.appendChild(baseRow);
      body.appendChild(actionsRow);
      body.appendChild(columnsBlock);
      body.appendChild(rulesDetails);
      body.appendChild(updateDetails);
      body.appendChild(exportDetails);
      details.appendChild(body);
      this.templateEditorBody.appendChild(details);
    });
  }

  async saveTemplateEditor() {
    if (!this.templateEditorData || !this.templateStore || !this.templateEditorRecord) return;
    const check = validateTemplate(this.templateEditorData);
    if (!check.ok) {
      window.toastr?.error?.(`模板格式无效：${check.errors.join(', ')}`);
      return;
    }
    try {
      await this.templateStore.saveTemplateDefinition(this.templateEditorData, {
        isDefault: Boolean(this.templateEditorRecord.is_default),
        isBuiltin: Boolean(this.templateEditorRecord.is_builtin),
      });
      window.dispatchEvent(new CustomEvent('memory-templates-updated'));
      this.refresh();
      window.toastr?.success?.('模板已保存');
      this.closeTemplateEditor();
    } catch (err) {
      logger.warn('save template structure failed', err);
      window.toastr?.error?.('保存模板失败');
    }
  }
}
