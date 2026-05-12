import { getImageGenerationParamsStore } from '../storage/image-generation-params-store.js';
import {
  createDefaultImageGenerationPreset,
  normalizeImageGenerationPreset,
  normalizeImageProviderKey,
  resolveImageGenerationParamSchema,
  sanitizeImageGenerationParams,
} from './image-generation-params-utils.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
}[ch]));

const clone = (value) => {
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
};

const FIELD_CLASS = 'image-gen-param-field';

export class ImageGenerationParamsPanel {
  constructor({ store = null, getImageConfig = null } = {}) {
    this.store = store || getImageGenerationParamsStore();
    this.getImageConfig = typeof getImageConfig === 'function' ? getImageConfig : async () => ({});
    this.overlay = null;
    this.panel = null;
    this.body = null;
    this.statusEl = null;
    this.currentConfig = {};
    this.currentSchema = resolveImageGenerationParamSchema({});
    this.isRendering = false;
  }

  async show() {
    if (!this.panel) this.createUI();
    await this.render();
    this.overlay.style.display = 'block';
    this.panel.style.display = 'flex';
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
    if (this.panel) this.panel.style.display = 'none';
  }

  createUI() {
    this.overlay = document.createElement('div');
    this.overlay.id = 'image-generation-params-overlay';
    this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:22000;';
    this.overlay.addEventListener('click', () => this.hide());

    this.panel = document.createElement('div');
    this.panel.id = 'image-generation-params-panel';
    this.panel.style.cssText = `
      display:none; position:fixed;
      top:calc(18px + env(safe-area-inset-top, 0px));
      bottom:calc(18px + env(safe-area-inset-bottom, 0px));
      left:50%; transform:translateX(-50%);
      width:min(720px, calc(100vw - 24px));
      background:var(--app-surface-card);
      color:var(--app-text-primary);
      border:1px solid var(--app-border-default);
      border-radius:16px;
      box-shadow:0 20px 60px rgba(0,0,0,0.36);
      z-index:23000;
      overflow:hidden;
      flex-direction:column;
    `;
    this.panel.addEventListener('click', (event) => event.stopPropagation());
    this.panel.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:16px 18px; border-bottom:1px solid var(--app-border-default);">
        <div style="min-width:0;">
          <div style="font-size:18px; font-weight:900;">图片生成参数</div>
          <div style="font-size:12px; color:var(--app-text-muted); margin-top:3px;">独立于 API Key 和连线设置档</div>
        </div>
        <button type="button" data-action="close" style="border:none; background:transparent; color:var(--app-text-primary); font-size:24px; cursor:pointer; line-height:1;">&times;</button>
      </div>
      <div data-role="body" style="flex:1; min-height:0; overflow:auto; padding:16px 18px;"></div>
      <div data-role="status" style="display:none; padding:10px 18px; border-top:1px solid var(--app-border-default); font-size:13px;"></div>
      <div style="display:flex; justify-content:flex-end; gap:10px; padding:14px 18px; border-top:1px solid var(--app-border-default);">
        <button type="button" data-action="cancel" style="padding:10px 16px; border-radius:10px; border:1px solid var(--app-border-default); background:var(--app-surface-subtle); color:var(--app-text-primary); cursor:pointer;">取消</button>
        <button type="button" data-action="save" style="padding:10px 18px; border-radius:10px; border:none; background:#2563eb; color:white; font-weight:800; cursor:pointer;">保存参数</button>
      </div>
    `;
    this.body = this.panel.querySelector('[data-role="body"]');
    this.statusEl = this.panel.querySelector('[data-role="status"]');
    this.panel.querySelector('[data-action="close"]')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('[data-action="save"]')?.addEventListener('click', () => this.saveCurrent());

    window.addEventListener('config-draft-changed', (event) => {
      if (event?.detail?.tab && event.detail.tab !== 'image') return;
      if (this.panel?.style.display !== 'none') this.render();
    });
    window.addEventListener('config-profile-changed', (event) => {
      if (event?.detail?.tab && event.detail.tab !== 'image') return;
      if (this.panel?.style.display !== 'none') this.render();
    });

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);
  }

  async resolveConfig() {
    try {
      const config = await this.getImageConfig();
      return config && typeof config === 'object' ? config : {};
    } catch {
      return {};
    }
  }

  getProviderParams(preset, config) {
    const provider = normalizeImageProviderKey(config?.provider);
    const normalized = normalizeImageGenerationPreset(preset);
    return normalized.paramsByProvider?.[provider] || {};
  }

  async render() {
    if (!this.body || this.isRendering) return;
    this.isRendering = true;
    try {
      await this.store.ready;
      this.currentConfig = await this.resolveConfig();
      this.currentSchema = resolveImageGenerationParamSchema(this.currentConfig);
      const presets = this.store.list();
      const active = this.store.getActive();
      const provider = normalizeImageProviderKey(this.currentConfig?.provider);
      const params = {
        ...this.getProviderParams(createDefaultImageGenerationPreset(), this.currentConfig),
        ...this.getProviderParams(active, this.currentConfig),
      };
      const modelLabel = [this.currentConfig?.provider, this.currentConfig?.model].filter(Boolean).join(' / ') || '未选择图片模型';

      this.body.innerHTML = `
        <div style="display:grid; grid-template-columns: minmax(0,1fr) auto; gap:12px; align-items:end; margin-bottom:14px;">
          <div>
            <label style="display:block; font-weight:800; margin-bottom:6px;">参数预设</label>
            <select data-role="preset-select" style="width:100%; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle); color:var(--app-text-primary);">
              ${presets.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === active.id ? 'selected' : ''}>${escapeHtml(p.name || p.id)}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex; gap:6px; flex-wrap:wrap; justify-content:flex-end;">
            <button type="button" data-action="new" style="padding:9px 11px; border-radius:10px; border:1px solid var(--app-border-default); background:var(--app-surface-card); color:var(--app-text-primary); cursor:pointer;">新建</button>
            <button type="button" data-action="rename" style="padding:9px 11px; border-radius:10px; border:1px solid var(--app-border-default); background:var(--app-surface-card); color:var(--app-text-primary); cursor:pointer;">重命名</button>
            <button type="button" data-action="delete" style="padding:9px 11px; border-radius:10px; border:1px solid #fecaca; background:rgba(239,68,68,0.10); color:#ef4444; cursor:pointer;">删除</button>
          </div>
        </div>
        <div style="padding:12px 14px; border:1px solid var(--app-border-default); border-radius:14px; background:var(--app-surface-subtle); margin-bottom:14px;">
          <div style="font-weight:900;">${escapeHtml(this.currentSchema.title)}</div>
          <div style="font-size:12px; color:var(--app-text-muted); margin-top:4px;">当前图片模型：${escapeHtml(modelLabel)}</div>
        </div>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:12px;">
          ${this.currentSchema.fields.map(field => this.renderField(field, params[field.key])).join('')}
        </div>
        <div style="margin-top:14px; display:flex; justify-content:flex-end;">
          <button type="button" data-action="reset-provider" style="padding:9px 12px; border-radius:10px; border:1px solid var(--app-border-default); background:var(--app-surface-card); color:var(--app-text-muted); cursor:pointer;">
            重置当前模型参数
          </button>
        </div>
      `;

      this.body.querySelector('[data-role="preset-select"]')?.addEventListener('change', async (event) => {
        await this.store.setActive(event.target.value);
        this.emitChanged();
        await this.render();
      });
      this.body.querySelector('[data-action="new"]')?.addEventListener('click', () => this.createPreset());
      this.body.querySelector('[data-action="rename"]')?.addEventListener('click', () => this.renamePreset());
      this.body.querySelector('[data-action="delete"]')?.addEventListener('click', () => this.deletePreset());
      this.body.querySelector('[data-action="reset-provider"]')?.addEventListener('click', () => this.resetProviderParams(provider));
    } finally {
      this.isRendering = false;
    }
  }

  renderField(field, value) {
    const safeValue = value ?? field.defaultValue ?? '';
    const help = field.help ? `<div style="font-size:11px; color:var(--app-text-muted); margin-top:5px; line-height:1.45;">${escapeHtml(field.help)}</div>` : '';
    const common = `data-param-key="${escapeHtml(field.key)}" class="${FIELD_CLASS}"`;
    const inputStyle = 'width:100%; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); color:var(--app-text-primary); box-sizing:border-box;';
    let control = '';
    if (field.type === 'select') {
      control = `<select ${common} style="${inputStyle}">
        ${(field.options || []).map(opt => `<option value="${escapeHtml(opt.value)}" ${String(opt.value) === String(safeValue) ? 'selected' : ''}>${escapeHtml(opt.label || opt.value)}</option>`).join('')}
      </select>`;
    } else if (field.type === 'number') {
      control = `<input ${common} type="number" min="${escapeHtml(field.min ?? '')}" max="${escapeHtml(field.max ?? '')}" step="${escapeHtml(field.step ?? 1)}" value="${escapeHtml(safeValue)}" style="${inputStyle}">`;
    } else {
      control = `<input ${common} type="text" value="${escapeHtml(safeValue)}" style="${inputStyle}">`;
    }
    return `
      <label style="display:block;">
        <div style="font-weight:800; margin-bottom:6px;">${escapeHtml(field.label)}</div>
        ${control}
        ${help}
      </label>
    `;
  }

  collectParams() {
    const params = {};
    this.currentSchema.fields.forEach((field) => {
      const el = this.body?.querySelector(`[data-param-key="${CSS.escape(field.key)}"]`);
      if (!el) return;
      if (field.type === 'number') params[field.key] = Number(el.value);
      else params[field.key] = String(el.value || '');
    });
    return sanitizeImageGenerationParams(params, this.currentConfig);
  }

  async saveCurrent() {
    await this.store.ready;
    const active = this.store.getActive();
    const provider = normalizeImageProviderKey(this.currentConfig?.provider);
    const next = normalizeImageGenerationPreset({
      ...active,
      paramsByProvider: {
        ...(active.paramsByProvider || {}),
        [provider]: this.collectParams(),
      },
      updatedAt: Date.now(),
    });
    await this.store.upsert(next);
    this.showStatus('图片生成参数已保存', 'success');
    this.emitChanged();
    await this.render();
  }

  async createPreset() {
    const active = this.store.getActive();
    const name = prompt('新图片参数预设名称', `${active.name || '图片参数'} 副本`);
    if (!name) return;
    const copy = {
      ...clone(active),
      id: '',
      name,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    await this.store.upsert(copy);
    this.emitChanged();
    await this.render();
  }

  async renamePreset() {
    const active = this.store.getActive();
    const name = prompt('重命名图片参数预设', active.name || '');
    if (!name) return;
    await this.store.rename(active.id, name);
    this.emitChanged();
    await this.render();
  }

  async deletePreset() {
    const active = this.store.getActive();
    if (active.id === 'default') {
      this.showStatus('默认参数预设不能删除', 'error');
      return;
    }
    if (!confirm(`删除图片参数预设「${active.name}」？`)) return;
    await this.store.delete(active.id);
    this.emitChanged();
    await this.render();
  }

  async resetProviderParams(provider) {
    const active = this.store.getActive();
    const fallback = createDefaultImageGenerationPreset();
    const next = normalizeImageGenerationPreset({
      ...active,
      paramsByProvider: {
        ...(active.paramsByProvider || {}),
        [provider]: fallback.paramsByProvider?.[provider] || {},
      },
      updatedAt: Date.now(),
    });
    await this.store.upsert(next);
    this.showStatus('已重置当前模型参数', 'success');
    this.emitChanged();
    await this.render();
  }

  showStatus(message, type = 'info') {
    if (!this.statusEl) return;
    this.statusEl.style.display = 'block';
    this.statusEl.style.background = type === 'error'
      ? 'rgba(239,68,68,0.12)'
      : 'rgba(34,197,94,0.12)';
    this.statusEl.style.color = type === 'error' ? '#ef4444' : '#16a34a';
    this.statusEl.textContent = message;
    setTimeout(() => {
      if (this.statusEl) this.statusEl.style.display = 'none';
    }, 2600);
  }

  emitChanged() {
    try {
      window.dispatchEvent(new CustomEvent('image-generation-params-changed'));
    } catch {}
  }
}
