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
const STYLE_ID = 'image-generation-params-panel-style';

const iconSvg = (path) => `
  <svg class="igp-icon" viewBox="0 0 24 24" aria-hidden="true">
    ${path}
  </svg>
`;

const ICONS = Object.freeze({
  back: iconSvg('<path d="M15 18l-6-6 6-6"/><path d="M20 12H9"/>'),
  close: iconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  image: iconSvg('<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-4.2-4.2a2 2 0 0 0-2.8 0L6 18"/>'),
  plus: iconSvg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
  rename: iconSvg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
  reset: iconSvg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v6h6"/>'),
  save: iconSvg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>'),
  trash: iconSvg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>'),
});

const ensureStyles = () => {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    #image-generation-params-overlay {
      display:none;
      position:fixed;
      inset:0;
      z-index:23120;
      background: rgba(15, 23, 42, 0.46);
    }
    .igp-panel {
      color: var(--app-text-primary);
      flex-direction: column;
      min-height: 0;
      box-sizing: border-box;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    }
    .igp-panel *,
    .igp-panel *::before,
    .igp-panel *::after {
      box-sizing: border-box;
    }
    .igp-panel-modal {
      display:none;
      position:fixed;
      top:calc(18px + env(safe-area-inset-top, 0px));
      bottom:calc(18px + env(safe-area-inset-bottom, 0px));
      left:50%;
      transform:translateX(-50%);
      width:min(760px, calc(100vw - 24px));
      z-index:23130;
      overflow:hidden;
      border:1px solid color-mix(in srgb, var(--app-border-default) 78%, transparent);
      border-radius:16px;
      background: var(--app-surface-card);
      box-shadow: 0 24px 64px rgba(15, 23, 42, 0.28);
    }
    .igp-panel-embedded {
      display:none;
      width:100%;
    }
    .igp-header,
    .igp-footer {
      display:flex;
      align-items:center;
      justify-content:space-between;
      gap:12px;
      flex-shrink:0;
      border-color: var(--app-border-default);
    }
    .igp-header {
      padding:16px 18px;
      border-bottom:1px solid var(--app-border-default);
      background: color-mix(in srgb, var(--app-surface-card) 92%, var(--app-surface-subtle));
    }
    .igp-panel-embedded .igp-header {
      padding: 0 0 14px;
      background: transparent;
    }
    .igp-title-wrap {
      display:flex;
      align-items:center;
      gap:12px;
      min-width:0;
    }
    .igp-title-icon {
      width:36px;
      height:36px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      flex:0 0 auto;
      border:1px solid rgba(37, 99, 235, 0.18);
      border-radius:12px;
      background: rgba(37, 99, 235, 0.10);
      color:#1d4ed8;
    }
    .igp-title {
      font-size:18px;
      font-weight:900;
      line-height:1.2;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .igp-subtitle {
      margin-top:3px;
      color:var(--app-text-muted);
      font-size:12px;
      line-height:1.35;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .igp-body {
      flex:1;
      min-height:0;
      overflow:auto;
      padding:16px 18px;
      -webkit-overflow-scrolling: touch;
    }
    .igp-panel-embedded .igp-body {
      flex:0 1 auto;
      padding:16px 0 0;
      overflow:visible;
    }
    .igp-footer {
      justify-content:flex-end;
      padding:14px 18px;
      border-top:1px solid var(--app-border-default);
      background: color-mix(in srgb, var(--app-surface-card) 92%, var(--app-surface-subtle));
    }
    .igp-panel-embedded .igp-footer {
      margin-top:14px;
      padding:14px 0 0;
      background: transparent;
    }
    .igp-button {
      min-height:36px;
      display:inline-flex;
      align-items:center;
      justify-content:center;
      gap:7px;
      border:1px solid var(--app-border-default);
      border-radius:10px;
      background:var(--app-surface-card);
      color:var(--app-text-primary);
      padding:8px 12px;
      font:inherit;
      font-size:13px;
      font-weight:800;
      cursor:pointer;
      transition: transform 120ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease, color 160ms ease;
    }
    .igp-button:hover {
      border-color: rgba(37, 99, 235, 0.32);
      background: var(--app-surface-hover);
      box-shadow: 0 6px 16px rgba(15, 23, 42, 0.08);
    }
    .igp-button:active {
      transform: translateY(1px);
      box-shadow: none;
    }
    .igp-button:focus-visible,
    .igp-input:focus-visible,
    .igp-select:focus-visible,
    .igp-textarea:focus-visible {
      outline:2px solid rgba(37, 99, 235, 0.34);
      outline-offset:2px;
    }
    .igp-button.is-icon {
      width:36px;
      padding:0;
    }
    .igp-button.is-primary {
      border-color: rgba(37, 99, 235, 0.46);
      background:#2563eb;
      color:var(--app-text-inverse);
      box-shadow: 0 10px 24px rgba(37, 99, 235, 0.22);
    }
    .igp-button.is-danger {
      border-color: rgba(239, 68, 68, 0.28);
      background: rgba(239, 68, 68, 0.10);
      color:#dc2626;
    }
    .igp-button.is-muted {
      background:var(--app-surface-subtle);
      color:var(--app-text-secondary);
    }
    .igp-button:disabled {
      cursor:not-allowed;
      opacity:.55;
      transform:none;
      box-shadow:none;
    }
    .igp-icon {
      width:16px;
      height:16px;
      fill:none;
      stroke:currentColor;
      stroke-width:2;
      stroke-linecap:round;
      stroke-linejoin:round;
      flex:0 0 auto;
    }
    .igp-preset-bar {
      display:grid;
      grid-template-columns:minmax(0, 1fr) auto;
      gap:12px;
      align-items:end;
      margin-bottom:14px;
    }
    .igp-preset-actions {
      display:flex;
      gap:6px;
      flex-wrap:wrap;
      justify-content:flex-end;
    }
    .igp-label {
      display:block;
      margin-bottom:6px;
      color:var(--app-text-primary);
      font-size:13px;
      font-weight:850;
      line-height:1.25;
    }
    .igp-input,
    .igp-select,
    .igp-textarea {
      width:100%;
      border:1px solid var(--app-border-default);
      border-radius:10px;
      background:var(--app-surface-card);
      color:var(--app-text-primary);
      padding:10px 12px;
      font:inherit;
      font-size:13px;
      line-height:1.35;
      transition:border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
    }
    .igp-select {
      min-height:40px;
      background:var(--app-surface-subtle);
      cursor:pointer;
    }
    .igp-input:focus,
    .igp-select:focus,
    .igp-textarea:focus {
      border-color: rgba(37, 99, 235, 0.42);
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.10);
      outline:none;
    }
    .igp-textarea {
      min-height:140px;
      resize:vertical;
      font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      line-height:1.5;
    }
    .igp-model-card {
      display:grid;
      grid-template-columns:auto minmax(0, 1fr);
      gap:10px;
      align-items:center;
      margin-bottom:14px;
      padding:12px 14px;
      border:1px solid rgba(37, 99, 235, 0.18);
      border-radius:14px;
      background: color-mix(in srgb, var(--app-surface-subtle) 86%, rgba(37, 99, 235, 0.12));
    }
    .igp-model-title {
      font-weight:900;
      line-height:1.3;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .igp-model-sub {
      margin-top:4px;
      color:var(--app-text-muted);
      font-size:12px;
      line-height:1.35;
      overflow:hidden;
      text-overflow:ellipsis;
      white-space:nowrap;
    }
    .igp-fields-grid {
      display:grid;
      grid-template-columns:repeat(auto-fit, minmax(220px, 1fr));
      gap:12px;
    }
    .igp-field {
      display:block;
      min-width:0;
      padding:10px;
      border:1px solid var(--app-border-subtle);
      border-radius:12px;
      background: color-mix(in srgb, var(--app-surface-card) 88%, var(--app-surface-subtle));
    }
    .igp-field-help {
      margin-top:6px;
      color:var(--app-text-muted);
      font-size:11px;
      line-height:1.45;
    }
    .igp-reset-row {
      display:flex;
      justify-content:flex-end;
      margin-top:14px;
    }
    .igp-status {
      display:none;
      flex-shrink:0;
      margin:0;
      padding:10px 18px;
      border-top:1px solid var(--app-border-default);
      font-size:13px;
      line-height:1.45;
    }
    .igp-panel-embedded .igp-status {
      margin-top:12px;
      padding:10px 12px;
      border:1px solid transparent;
      border-radius:10px;
    }
    .igp-status.is-success {
      border-color:rgba(34, 197, 94, 0.20);
      background:rgba(34,197,94,0.12);
      color:#047857;
    }
    .igp-status.is-error {
      border-color:rgba(239,68,68,0.20);
      background:rgba(239,68,68,0.12);
      color:#dc2626;
    }
    @media (max-width: 640px) {
      .igp-panel-modal {
        top:calc(8px + env(safe-area-inset-top, 0px));
        bottom:calc(8px + env(safe-area-inset-bottom, 0px));
        width:calc(100vw - 16px);
        border-radius:12px;
      }
      .igp-header,
      .igp-body,
      .igp-footer {
        padding-left:12px;
        padding-right:12px;
      }
      .igp-title-icon {
        width:32px;
        height:32px;
        border-radius:10px;
      }
      .igp-title {
        font-size:16px;
      }
      .igp-preset-bar {
        grid-template-columns:1fr;
        align-items:stretch;
      }
      .igp-preset-actions {
        display:grid;
        grid-template-columns:repeat(3, minmax(0, 1fr));
      }
      .igp-preset-actions .igp-button,
      .igp-footer .igp-button {
        width:100%;
      }
      .igp-fields-grid {
        grid-template-columns:1fr;
        gap:10px;
      }
      .igp-footer {
        display:grid;
        grid-template-columns:1fr 1fr;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .igp-button,
      .igp-input,
      .igp-select,
      .igp-textarea {
        transition:none !important;
      }
    }
    body[data-theme-mode='dark'] .igp-title-icon {
      color:#8ecbff;
      border-color:rgba(121, 192, 255, 0.26);
      background:rgba(121, 192, 255, 0.12);
    }
    body[data-theme-mode='dark'] .igp-button.is-primary {
      background:rgba(121, 192, 255, 0.18);
      border-color:rgba(121, 192, 255, 0.34);
      color:var(--app-text-primary);
      box-shadow:none;
    }
    body[data-theme-mode='dark'] .igp-model-card {
      border-color:rgba(121, 192, 255, 0.22);
      background:rgba(121, 192, 255, 0.08);
    }
  `;
  document.head.appendChild(style);
};

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
    this.mode = 'modal';
    this.embeddedContainer = null;
    this.onBack = null;
  }

  async show() {
    if (!this.panel || this.mode !== 'modal') this.createUI();
    await this.render();
    this.overlay.style.display = 'block';
    this.panel.style.display = 'flex';
  }

  async showEmbedded({ container = null, onBack = null } = {}) {
    if (!container) return;
    if (!this.panel || this.mode !== 'embedded' || this.embeddedContainer !== container) {
      this.createEmbeddedUI(container);
    }
    this.onBack = typeof onBack === 'function' ? onBack : null;
    await this.render();
    this.panel.style.display = 'flex';
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
    if (this.panel) this.panel.style.display = 'none';
  }

  goBack() {
    if (typeof this.onBack === 'function') {
      this.onBack();
      return;
    }
    this.hide();
  }

  createUI() {
    ensureStyles();
    if (this.panel?.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    this.mode = 'modal';
    this.embeddedContainer = null;
    this.overlay = document.createElement('div');
    this.overlay.id = 'image-generation-params-overlay';
    this.overlay.style.display = 'none';
    this.overlay.addEventListener('click', () => this.hide());

    this.panel = document.createElement('div');
    this.panel.id = 'image-generation-params-panel';
    this.panel.className = 'igp-panel igp-panel-modal';
    this.panel.style.display = 'none';
    this.panel.addEventListener('click', (event) => event.stopPropagation());
    this.panel.innerHTML = `
      <div class="igp-header">
        <div class="igp-title-wrap">
          <span class="igp-title-icon">${ICONS.image}</span>
          <div style="min-width:0;">
            <div class="igp-title">图片生成参数</div>
            <div class="igp-subtitle">独立于 API Key 和连线设置档</div>
          </div>
        </div>
        <button type="button" class="igp-button is-icon" data-action="close" aria-label="关闭图片生成参数">${ICONS.close}</button>
      </div>
      <div class="igp-body" data-role="body"></div>
      <div class="igp-status" data-role="status"></div>
      <div class="igp-footer">
        <button type="button" class="igp-button is-muted" data-action="cancel">取消</button>
        <button type="button" class="igp-button is-primary" data-action="save">${ICONS.save}<span>保存参数</span></button>
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

  createEmbeddedUI(container) {
    ensureStyles();
    if (this.panel?.parentNode) {
      this.panel.parentNode.removeChild(this.panel);
    }
    this.mode = 'embedded';
    this.overlay = null;
    this.embeddedContainer = container;

    this.panel = document.createElement('div');
    this.panel.id = 'image-generation-params-panel';
    this.panel.className = 'igp-panel igp-panel-embedded';
    this.panel.style.display = 'none';
    this.panel.innerHTML = `
      <div class="igp-header">
        <div class="igp-title-wrap">
          <button type="button" class="igp-button is-muted" data-action="back">${ICONS.back}<span>返回</span></button>
          <span class="igp-title-icon">${ICONS.image}</span>
          <div style="min-width:0;">
            <div class="igp-title">图片生成参数</div>
            <div class="igp-subtitle">质量、尺寸、输出格式等共享参数</div>
          </div>
        </div>
      </div>
      <div class="igp-body" data-role="body"></div>
      <div class="igp-status" data-role="status"></div>
      <div class="igp-footer">
        <button type="button" class="igp-button is-muted" data-action="cancel">返回</button>
        <button type="button" class="igp-button is-primary" data-action="save">${ICONS.save}<span>保存参数</span></button>
      </div>
    `;
    this.body = this.panel.querySelector('[data-role="body"]');
    this.statusEl = this.panel.querySelector('[data-role="status"]');
    this.panel.querySelector('[data-action="back"]')?.addEventListener('click', () => this.goBack());
    this.panel.querySelector('[data-action="cancel"]')?.addEventListener('click', () => this.goBack());
    this.panel.querySelector('[data-action="save"]')?.addEventListener('click', () => this.saveCurrent());
    container.innerHTML = '';
    container.appendChild(this.panel);
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
        <div class="igp-preset-bar">
          <div>
            <label class="igp-label">参数预设</label>
            <select class="igp-select" data-role="preset-select">
              ${presets.map(p => `<option value="${escapeHtml(p.id)}" ${p.id === active.id ? 'selected' : ''}>${escapeHtml(p.name || p.id)}</option>`).join('')}
            </select>
          </div>
          <div class="igp-preset-actions">
            <button type="button" class="igp-button" data-action="new">${ICONS.plus}<span>新建</span></button>
            <button type="button" class="igp-button" data-action="rename">${ICONS.rename}<span>重命名</span></button>
            <button type="button" class="igp-button is-danger" data-action="delete">${ICONS.trash}<span>删除</span></button>
          </div>
        </div>
        <div class="igp-model-card">
          <span class="igp-title-icon">${ICONS.image}</span>
          <div style="min-width:0;">
            <div class="igp-model-title">${escapeHtml(this.currentSchema.title)}</div>
            <div class="igp-model-sub">当前图片模型：${escapeHtml(modelLabel)}</div>
          </div>
        </div>
        <div class="igp-fields-grid">
          ${this.currentSchema.fields.map(field => this.renderField(field, params[field.key])).join('')}
        </div>
        <div class="igp-reset-row">
          <button type="button" class="igp-button is-muted" data-action="reset-provider">${ICONS.reset}<span>重置当前模型参数</span></button>
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
      this.bindFieldInteractions();
    } finally {
      this.isRendering = false;
    }
  }

  renderField(field, value) {
    const safeValue = value ?? field.defaultValue ?? '';
    const help = field.help ? `<div class="igp-field-help">${escapeHtml(field.help)}</div>` : '';
    const common = `data-param-key="${escapeHtml(field.key)}"`;
    let control = '';
    if (field.type === 'select') {
      control = `<select ${common} class="${FIELD_CLASS} igp-select">
        ${(field.options || []).map(opt => `<option value="${escapeHtml(opt.value)}" ${String(opt.value) === String(safeValue) ? 'selected' : ''}>${escapeHtml(opt.label || opt.value)}</option>`).join('')}
      </select>`;
    } else if (field.type === 'number') {
      control = `<input ${common} class="${FIELD_CLASS} igp-input" type="number" min="${escapeHtml(field.min ?? '')}" max="${escapeHtml(field.max ?? '')}" step="${escapeHtml(field.step ?? 1)}" value="${escapeHtml(safeValue)}">`;
    } else if (field.type === 'textarea') {
      control = `<textarea ${common} class="${FIELD_CLASS} igp-textarea">${escapeHtml(safeValue)}</textarea>`;
    } else {
      control = `<input ${common} class="${FIELD_CLASS} igp-input" type="text" value="${escapeHtml(safeValue)}">`;
    }
    return `
      <label class="igp-field">
        <div class="igp-label">${escapeHtml(field.label)}</div>
        ${control}
        ${help}
      </label>
    `;
  }

  bindFieldInteractions() {
    const samplerEl = this.body?.querySelector('[data-param-key="sampler"]');
    const smEl = this.body?.querySelector('[data-param-key="sm"]');
    const smDynEl = this.body?.querySelector('[data-param-key="sm_dyn"]');
    if (!samplerEl || !smEl || !smDynEl || this.currentSchema?.provider !== 'novelai') return;
    const syncNovelAiSmea = () => {
      const isDdim = String(samplerEl.value || '') === 'ddim';
      const hasSmea = !isDdim && String(smEl.value || '') === 'true';
      smEl.disabled = isDdim;
      smDynEl.disabled = !hasSmea;
      if (isDdim) smEl.value = '';
      if (!hasSmea) smDynEl.value = '';
      smEl.style.opacity = smEl.disabled ? '0.55' : '';
      smDynEl.style.opacity = smDynEl.disabled ? '0.55' : '';
    };
    samplerEl.addEventListener('change', syncNovelAiSmea);
    smEl.addEventListener('change', syncNovelAiSmea);
    syncNovelAiSmea();
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
    this.statusEl.className = `igp-status ${type === 'error' ? 'is-error' : 'is-success'}`;
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
