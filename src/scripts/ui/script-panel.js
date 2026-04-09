import { appSettings } from '../storage/app-settings.js';
import { appConfirm } from './app-confirm.js';
import { getCharacterCardDisplayName } from '../utils/character-card-display.js';

const SOURCE_LABELS = {
  user: '手动创建',
  card: '角色卡导入',
  preset: '预设导入',
  import: '导入',
};

const normalizeScope = (scope) => (scope === 'preset' || scope === 'character') ? scope : 'global';

const createOption = (value, label) => {
  const opt = document.createElement('option');
  opt.value = value;
  opt.textContent = label;
  return opt;
};

const openScriptEditor = ({ script, title = '编辑脚本' } = {}) => new Promise((resolve) => {
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:22000;display:flex;align-items:center;justify-content:center;padding:16px;';
  const panel = document.createElement('div');
  panel.style.cssText = 'width:min(92vw,520px);max-height:86vh;background:#fff;border-radius:14px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 18px 50px rgba(15,23,42,0.2);';
  panel.innerHTML = `
    <div style="padding:14px 16px;border-bottom:1px solid rgba(0,0,0,0.06);background:#f8fafc;display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <div style="font-weight:800;color:#0f172a;">${title}</div>
      <button id="script-editor-close" style="border:none;background:rgba(15,23,42,0.08);width:28px;height:28px;border-radius:10px;cursor:pointer;font-size:16px;">×</button>
    </div>
    <div style="padding:14px 16px;overflow:auto;display:flex;flex-direction:column;gap:12px;">
      <div>
        <div style="font-weight:700;color:#0f172a;margin-bottom:6px;">脚本名称</div>
        <input id="script-editor-name" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:10px;font-size:14px;">
      </div>
      <div>
        <div style="font-weight:700;color:#0f172a;margin-bottom:6px;">脚本内容</div>
        <textarea id="script-editor-content" rows="8" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;font-family:monospace;"></textarea>
      </div>
      <div>
        <div style="font-weight:700;color:#0f172a;margin-bottom:6px;">作者备注</div>
        <textarea id="script-editor-info" rows="3" style="width:100%;padding:10px;border:1px solid #e2e8f0;border-radius:10px;font-size:13px;"></textarea>
      </div>
    </div>
    <div style="padding:12px 16px;border-top:1px solid rgba(0,0,0,0.06);display:flex;justify-content:flex-end;gap:8px;">
      <button id="script-editor-cancel" style="padding:8px 14px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;">取消</button>
      <button id="script-editor-save" style="padding:8px 14px;border-radius:10px;border:none;background:#0f172a;color:#fff;">保存</button>
    </div>
  `;
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  const close = (result) => {
    overlay.remove();
    resolve(result);
  };
  panel.querySelector('#script-editor-close')?.addEventListener('click', () => close(null));
  panel.querySelector('#script-editor-cancel')?.addEventListener('click', () => close(null));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close(null);
  });

  const nameInput = panel.querySelector('#script-editor-name');
  const contentInput = panel.querySelector('#script-editor-content');
  const infoInput = panel.querySelector('#script-editor-info');
  if (nameInput) nameInput.value = String(script?.name || '');
  if (contentInput) contentInput.value = String(script?.content || '');
  if (infoInput) infoInput.value = String(script?.info || '');

  panel.querySelector('#script-editor-save')?.addEventListener('click', () => {
    const result = {
      name: String(nameInput?.value || '').trim(),
      content: String(contentInput?.value || ''),
      info: String(infoInput?.value || ''),
    };
    close(result);
  });
});

export class ScriptPanel {
  constructor({ store, personaStore, presetStore } = {}) {
    this.store = store || null;
    this.personaStore = personaStore || null;
    this.presetStore = presetStore || null;
    this.overlay = null;
    this.panel = null;
    this.body = null;
    this.tab = 'global';
    this.personaSelect = null;
    this.presetSelect = null;
    this.scriptList = null;
    this.statusEl = null;
    this.importInput = null;
  }

  async show() {
    if (!this.store) return;
    await this.store.ready;
    if (!this.panel) this.createUI();
    await this.refresh();
    this.overlay.style.display = 'block';
    this.panel.style.display = 'flex';
  }

  hide() {
    if (this.panel) this.panel.style.display = 'none';
    if (this.overlay) this.overlay.style.display = 'none';
  }

  createUI() {
    this.overlay = document.createElement('div');
    this.overlay.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:20000;';
    this.overlay.addEventListener('click', () => this.hide());

    this.panel = document.createElement('div');
    this.panel.id = 'script-panel';
    this.panel.style.cssText = `
      display:none; position:fixed;
      inset: 6vh 6vw;
      background:#fff; border-radius:16px; box-shadow:0 18px 50px rgba(15,23,42,0.2);
      z-index:20001; overflow:hidden; flex-direction:column;
    `;
    this.panel.addEventListener('click', (e) => e.stopPropagation());

    this.panel.innerHTML = `
      <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:#f8fafc; display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div>
          <div style="font-weight:800;color:#0f172a;">脚本管理</div>
          <div style="font-size:12px;color:#64748b;margin-top:2px;">管理全局 / 角色 / 预设脚本（默认关闭）</div>
        </div>
        <button id="script-panel-close" style="border:none;background:rgba(15,23,42,0.08);width:28px;height:28px;border-radius:10px;cursor:pointer;font-size:16px;">×</button>
      </div>
      <div style="padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.06);display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <button class="script-tab" data-tab="global" style="border:none;background:transparent;padding:8px 12px;border-radius:10px;cursor:pointer;font-size:14px;color:#334155;">全局</button>
          <button class="script-tab" data-tab="character" style="border:none;background:transparent;padding:8px 12px;border-radius:10px;cursor:pointer;font-size:14px;color:#334155;">角色</button>
          <button class="script-tab" data-tab="preset" style="border:none;background:transparent;padding:8px 12px;border-radius:10px;cursor:pointer;font-size:14px;color:#334155;">预设</button>
        </div>
        <label style="margin-left:auto;display:flex;align-items:center;gap:8px;font-size:12px;color:#475569;">
          <input type="checkbox" id="script-global-toggle" style="width:18px;height:18px;">
          <span>脚本总开关</span>
        </label>
      </div>
      <div style="padding:10px 16px;border-bottom:1px solid rgba(0,0,0,0.06);display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <div id="script-scope-selects" style="display:flex;gap:8px;flex-wrap:wrap;"></div>
        <div style="margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="script-import-btn" style="padding:8px 12px;border-radius:10px;border:1px solid #e2e8f0;background:#fff;font-size:13px;cursor:pointer;">导入脚本</button>
          <button id="script-add-btn" style="padding:8px 12px;border-radius:10px;border:none;background:#0f172a;color:#fff;font-size:13px;cursor:pointer;">新增脚本</button>
        </div>
      </div>
      <div style="padding:12px 16px;overflow:auto;flex:1;min-height:0;">
        <div id="script-list" style="display:flex;flex-direction:column;gap:10px;"></div>
        <div id="script-status" style="display:none;margin-top:10px;padding:10px;border-radius:10px;font-size:12px;"></div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);

    this.body = this.panel.querySelector('#script-scope-selects');
    this.scriptList = this.panel.querySelector('#script-list');
    this.statusEl = this.panel.querySelector('#script-status');
    this.importInput = document.createElement('input');
    this.importInput.type = 'file';
    this.importInput.accept = 'application/json,.json';
    this.importInput.style.display = 'none';
    this.panel.appendChild(this.importInput);

    this.panel.querySelector('#script-panel-close')?.addEventListener('click', () => this.hide());
    this.panel.querySelectorAll('.script-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.tab = normalizeScope(btn.dataset.tab);
        this.refresh();
      });
    });
    this.panel.querySelector('#script-import-btn')?.addEventListener('click', () => {
      this.importInput?.click();
    });
    this.panel.querySelector('#script-add-btn')?.addEventListener('click', () => this.handleAdd());
    this.panel.querySelector('#script-global-toggle')?.addEventListener('change', (e) => {
      const checked = Boolean(e.target?.checked);
      appSettings.update({ scriptEnabled: checked });
      this.refresh();
    });
    this.importInput?.addEventListener('change', (e) => this.handleImport(e));
    window.addEventListener('scripts-changed', () => {
      if (this.panel?.style.display === 'flex') this.refresh();
    });
  }

  getScopeId() {
    if (this.tab === 'character') {
      return String(this.personaSelect?.value || this.personaStore?.getActive?.()?.id || '');
    }
    if (this.tab === 'preset') {
      return String(this.presetSelect?.value || this.getActivePresetId());
    }
    return 'global';
  }

  getActivePresetId() {
    const state = this.presetStore?.getState?.() || {};
    return String(state?.active?.sysprompt || '');
  }

  buildScopeSelectors() {
    if (!this.body) return;
    this.body.innerHTML = '';
    if (this.tab === 'character') {
      const select = document.createElement('select');
      select.style.cssText = 'min-width:160px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;';
      const list = Array.isArray(this.personaStore?.getAll?.()) ? this.personaStore.getAll() : [];
      list.forEach(p => {
        select.appendChild(createOption(p.id, getCharacterCardDisplayName(p, p.id)));
      });
      select.value = String(this.personaStore?.getActive?.()?.id || '');
      select.addEventListener('change', () => this.refresh());
      this.body.appendChild(select);
      this.personaSelect = select;
      return;
    }
    if (this.tab === 'preset') {
      const select = document.createElement('select');
      select.style.cssText = 'min-width:160px;padding:6px 10px;border:1px solid #e2e8f0;border-radius:10px;font-size:12px;';
      const presets = this.presetStore?.getState?.()?.presets?.sysprompt || {};
      Object.entries(presets).forEach(([id, preset]) => {
        const name = preset?.name || id;
        select.appendChild(createOption(id, name));
      });
      select.value = this.getActivePresetId();
      select.addEventListener('change', () => this.refresh());
      this.body.appendChild(select);
      this.presetSelect = select;
      return;
    }
    this.personaSelect = null;
    this.presetSelect = null;
  }

  async refresh() {
    if (!this.panel || !this.store) return;
    const settings = appSettings.get();
    const toggle = this.panel.querySelector('#script-global-toggle');
    if (toggle) toggle.checked = settings.scriptEnabled === true;
    this.panel.querySelectorAll('.script-tab').forEach(btn => {
      const active = normalizeScope(btn.dataset.tab) === this.tab;
      btn.style.background = active ? 'rgba(15,23,42,0.08)' : 'transparent';
      btn.style.color = active ? '#0f172a' : '#334155';
    });
    this.buildScopeSelectors();
    const scopeId = this.getScopeId();
    const scripts = this.store.getScripts(this.tab, scopeId);
    this.renderList(scripts, scopeId);
  }

  showStatus(message, type = 'info') {
    if (!this.statusEl) return;
    const text = String(message || '').trim();
    if (!text) {
      this.statusEl.style.display = 'none';
      this.statusEl.textContent = '';
      return;
    }
    let background = 'rgba(15,23,42,0.08)';
    let color = '#334155';
    if (type === 'error') {
      background = 'rgba(254,226,226,0.9)';
      color = '#b91c1c';
    } else if (type === 'success') {
      background = 'rgba(220,252,231,0.9)';
      color = '#166534';
    }
    this.statusEl.style.display = 'block';
    this.statusEl.style.background = background;
    this.statusEl.style.color = color;
    this.statusEl.textContent = text;
  }

  extractScripts(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    if (Array.isArray(payload.scripts)) return payload.scripts;
    if (payload.tavern_helper && Array.isArray(payload.tavern_helper.scripts)) return payload.tavern_helper.scripts;
    if (payload.extensions?.tavern_helper?.scripts) return payload.extensions.tavern_helper.scripts;
    if (payload.type === 'script' || payload.type === 'folder' || payload.content) return [payload];
    return [];
  }

  async handleImport(event) {
    const file = event?.target?.files?.[0];
    if (!file) return;
    event.target.value = '';
    let text = '';
    try {
      text = await file.text();
    } catch (err) {
      this.showStatus('脚本文件读取失败', 'error');
      return;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (err) {
      this.showStatus('脚本文件解析失败（JSON 结构不正确）', 'error');
      return;
    }
    const scripts = this.extractScripts(parsed);
    if (!scripts.length) {
      this.showStatus('未在文件中找到脚本内容', 'error');
      return;
    }
    const scopeId = this.getScopeId();
    const { count, ids } = await this.store.importTavernHelperScripts({
      scripts,
      scope: this.tab,
      scopeId,
      source: 'import',
    });
    if (!count) {
      this.showStatus('没有可导入的脚本', 'error');
      return;
    }
    this.showStatus(`已导入 ${count} 个脚本`, 'success');
    const ok = await appConfirm({
      title: '导入脚本',
      message: `已导入 ${count} 个脚本，是否立即启用？`,
    });
    if (ok) {
      for (const id of ids) {
        await this.store.toggleScript(this.tab, scopeId, id, true);
      }
    }
    this.refresh();
  }

  renderList(scripts, scopeId) {
    if (!this.scriptList) return;
    this.scriptList.innerHTML = '';
    if (!Array.isArray(scripts) || scripts.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = '暂无脚本';
      empty.style.cssText = 'padding:16px;text-align:center;color:#94a3b8;font-size:12px;';
      this.scriptList.appendChild(empty);
      return;
    }
    scripts.forEach(script => {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #e2e8f0;border-radius:12px;padding:12px;display:flex;gap:10px;align-items:center;justify-content:space-between;';
      const left = document.createElement('div');
      left.style.cssText = 'min-width:0;flex:1;';
      const title = document.createElement('div');
      title.textContent = script.name || '未命名脚本';
      title.style.cssText = 'font-weight:700;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
      const meta = document.createElement('div');
      const sourceLabel = SOURCE_LABELS[script.source] || script.source || '脚本';
      meta.textContent = `${sourceLabel}${script.authorized ? '' : ' · 未授权'}`;
      meta.style.cssText = 'font-size:12px;color:#64748b;margin-top:4px;';
      left.appendChild(title);
      left.appendChild(meta);
      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;gap:8px;align-items:center;';
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = Boolean(script.enabled);
      toggle.style.cssText = 'width:18px;height:18px;';
      toggle.addEventListener('change', async () => {
        if (toggle.checked && !script.authorized) {
          const ok = await appConfirm({
            title: '启用脚本',
            message: '该脚本可能访问聊天内容或修改变量。确认启用吗？',
          });
          if (!ok) {
            toggle.checked = false;
            return;
          }
        }
        await this.store.toggleScript(this.tab, scopeId, script.id, toggle.checked);
        try {
          window.appBridge?.scriptRuntime?.restartWorker?.('脚本已重新加载');
        } catch {}
        this.refresh();
      });
      const editBtn = document.createElement('button');
      editBtn.textContent = '编辑';
      editBtn.style.cssText = 'padding:6px 10px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;font-size:12px;cursor:pointer;';
      editBtn.addEventListener('click', () => this.handleEdit(script, scopeId));
      const delBtn = document.createElement('button');
      delBtn.textContent = '删除';
      delBtn.style.cssText = 'padding:6px 10px;border-radius:8px;border:1px solid #fecaca;background:#fff;color:#b91c1c;font-size:12px;cursor:pointer;';
      delBtn.addEventListener('click', () => this.handleDelete(script, scopeId));
      actions.appendChild(toggle);
      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      card.appendChild(left);
      card.appendChild(actions);
      this.scriptList.appendChild(card);
    });
  }

  async handleAdd() {
    const scopeId = this.getScopeId();
    const result = await openScriptEditor({ script: {}, title: '创建脚本' });
    if (!result) return;
    await this.store.upsertScript(this.tab, scopeId, {
      name: result.name || '未命名脚本',
      content: result.content || '',
      info: result.info || '',
      enabled: false,
      authorized: true,
    }, { source: 'user', authorized: true });
    this.refresh();
  }

  async handleEdit(script, scopeId) {
    const result = await openScriptEditor({ script, title: '编辑脚本' });
    if (!result) return;
    await this.store.updateScript(this.tab, scopeId, script.id, {
      name: result.name || script.name,
      content: result.content || '',
      info: result.info || '',
    });
    this.refresh();
  }

  async handleDelete(script, scopeId) {
    const ok = await appConfirm({
      title: '删除脚本',
      message: `确定删除脚本「${script.name || '未命名'}」吗？`,
      danger: true,
    });
    if (!ok) return;
    await this.store.deleteScript(this.tab, scopeId, script.id);
    this.refresh();
  }
}
