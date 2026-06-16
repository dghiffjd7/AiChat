const panelPresets = {
  regex: {
    rootSelector: '#regex-panel',
    overlaySelector: '#regex-overlay',
    closeSelector: '#regex-close',
    height: 'min(70vh, 760px)',
  },
  scripts: {
    rootSelector: '#script-panel',
    overlaySelector: '',
    closeSelector: '#script-panel-close',
    height: 'min(70vh, 760px)',
  },
  plugins: {
    rootSelector: '#plugin-panel',
    overlaySelector: '#plugin-panel-overlay',
    closeSelector: '#plugin-panel-close',
    height: 'min(70vh, 760px)',
  },
};

const iconSvg = (body) => `
  <svg class="extensions-icon" viewBox="0 0 24 24" aria-hidden="true">
    ${body}
  </svg>
`;

const icons = Object.freeze({
  close: iconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
  puzzle: iconSvg('<path d="M12 2a3 3 0 0 1 3 3v1h2a3 3 0 0 1 3 3v2h-1a3 3 0 0 0 0 6h1v2a3 3 0 0 1-3 3h-2v-1a3 3 0 0 0-6 0v1H7a3 3 0 0 1-3-3v-2h1a3 3 0 0 0 0-6H4V9a3 3 0 0 1 3-3h2V5a3 3 0 0 1 3-3Z"/>'),
  regex: iconSvg('<path d="M7 8v8"/><path d="M5 10h4"/><path d="M5 14h4"/><path d="M14 8l5 8"/><path d="M19 8l-5 8"/>'),
  script: iconSvg('<path d="M8 7 4 12l4 5"/><path d="m16 7 4 5-4 5"/><path d="m14 4-4 16"/>'),
  plugin: iconSvg('<path d="M9 7V3"/><path d="M15 7V3"/><path d="M7 13H3"/><path d="M21 13h-4"/><rect x="7" y="7" width="10" height="12" rx="3"/><path d="M10 19v2"/><path d="M14 19v2"/>'),
});

export class ExtensionsPanel {
  constructor({ regexPanel, scriptPanel, pluginPanel } = {}) {
    this.overlay = null;
    this.element = null;
    this.panels = {
      regex: regexPanel || null,
      scripts: scriptPanel || null,
      plugins: pluginPanel || null,
    };
    this.mounted = {
      regex: false,
      scripts: false,
      plugins: false,
    };
  }

  show() {
    if (!this.element) this.createUI();
    this.overlay.style.display = 'block';
    this.element.style.display = 'block';
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
    if (this.element) this.element.style.display = 'none';
  }

  ensureStyles() {
    if (document.getElementById('extensions-panel-style')) return;
    const style = document.createElement('style');
    style.id = 'extensions-panel-style';
    style.textContent = `
      #extensions-panel-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(15, 23, 42, 0.46);
        z-index: 20050;
      }
      #extensions-panel {
        display: none;
        position: fixed;
        left: 50%;
        top: calc(env(safe-area-inset-top, 0px) + 12px);
        transform: translateX(-50%);
        z-index: 20060;
        width: min(96vw, 1020px);
      }
      #extensions-panel .extensions-modal {
        padding: 0;
        border-radius: 16px;
        border: 1px solid var(--app-border-default);
        background: var(--app-surface-card);
        box-shadow: 0 24px 60px rgba(15, 23, 42, 0.26);
        max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px);
        overflow-y: auto;
      }
      #extensions-panel .extensions-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 16px;
        border-bottom: 1px solid var(--app-border-default);
        background: color-mix(in srgb, var(--app-surface-card) 90%, var(--app-surface-subtle));
      }
      #extensions-panel .extensions-heading {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      #extensions-panel .extensions-title-icon {
        width: 38px;
        height: 38px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        border: 1px solid rgba(37, 99, 235, 0.18);
        border-radius: 13px;
        background: rgba(37, 99, 235, 0.10);
        color: #1d4ed8;
      }
      #extensions-panel .extensions-title {
        margin: 0;
        color: var(--app-text-primary);
        font-size: 18px;
        font-weight: 800;
        line-height: 1.2;
      }
      #extensions-panel .extensions-close {
        width: 34px;
        height: 34px;
        border: 1px solid var(--app-border-default);
        border-radius: 10px;
        background: var(--app-surface-card);
        color: var(--app-text-primary);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: transform 120ms ease, border-color 160ms ease, background 160ms ease;
      }
      #extensions-panel .extensions-subtitle {
        color: var(--app-text-muted);
        font-size: 12px;
        margin-top: 3px;
        line-height: 1.4;
      }
      #extensions-panel .extensions-list {
        padding: 14px 16px 16px;
      }
      #extensions-panel .extensions-item {
        margin-bottom: 10px;
        border: 1px solid var(--app-border-default);
        border-radius: 12px;
        background: color-mix(in srgb, var(--app-surface-card) 92%, var(--app-surface-subtle));
        overflow: hidden;
        box-shadow: 0 4px 16px rgba(15, 23, 42, 0.045);
      }
      #extensions-panel .extensions-toggle {
        width: 100%;
        border: none;
        background: transparent;
        color: var(--app-text-primary);
        font-size: 14px;
        font-weight: 800;
        padding: 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        cursor: pointer;
        transition: background 160ms ease, color 160ms ease;
      }
      #extensions-panel .extensions-toggle-main {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }
      #extensions-panel .extensions-toggle:hover,
      #extensions-panel .extensions-close:hover {
        background: var(--app-surface-hover);
      }
      #extensions-panel .extensions-toggle:focus-visible,
      #extensions-panel .extensions-close:focus-visible {
        outline: 2px solid rgba(37, 99, 235, 0.34);
        outline-offset: 2px;
      }
      #extensions-panel .extensions-toggle .chevron {
        color: var(--app-text-muted);
        transition: transform 180ms ease;
      }
      #extensions-panel .extensions-toggle[data-expanded='1'] .chevron {
        transform: rotate(180deg);
      }
      #extensions-panel .extensions-body {
        display: none;
        padding: 12px;
        border-top: 1px solid var(--app-border-subtle);
        background: var(--app-surface-card);
      }
      #extensions-panel .extensions-host {
        min-height: 92px;
      }
      #extensions-panel .extensions-loading {
        color: var(--app-text-muted);
        font-size: 12px;
      }
      #extensions-panel .extensions-embedded-root {
        position: static !important;
        inset: auto !important;
        left: auto !important;
        right: auto !important;
        top: auto !important;
        transform: none !important;
        z-index: 1 !important;
        width: 100% !important;
        height: auto !important;
        max-height: none !important;
        border-radius: 12px !important;
        border: 1px solid rgba(15, 23, 42, 0.1) !important;
        box-shadow: none !important;
      }
      #extensions-panel .extensions-embedded-root .extensions-inner-close {
        display: none !important;
      }
      #extensions-panel .extensions-embedded-root > div:first-child {
        display: none !important;
      }
      #extensions-panel .extensions-icon {
        width: 16px;
        height: 16px;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
        flex: 0 0 auto;
      }
      @media (max-width: 680px) {
        #extensions-panel {
          left: calc(8px + env(safe-area-inset-left, 0px));
          right: calc(8px + env(safe-area-inset-right, 0px));
          top: calc(env(safe-area-inset-top, 0px) + 8px);
          transform: none;
          width: auto;
        }
        #extensions-panel .extensions-modal {
          max-height: calc(var(--app-visual-height, 100dvh) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px);
          border-radius: 14px;
        }
        #extensions-panel .extensions-header {
          padding: 12px;
        }
        #extensions-panel .extensions-list {
          padding: 10px 12px 12px;
        }
      }
      body[data-theme-mode='dark'] #extensions-panel .extensions-title-icon {
        color: #8ecbff;
        border-color: rgba(121, 192, 255, 0.26);
        background: rgba(121, 192, 255, 0.12);
      }
      body[data-theme-mode='dark'] #extensions-panel .extensions-item {
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      }
      @media (prefers-reduced-motion: reduce) {
        #extensions-panel .extensions-close,
        #extensions-panel .extensions-toggle,
        #extensions-panel .extensions-toggle .chevron {
          transition: none !important;
        }
      }
    `;
    document.head.appendChild(style);
  }

  createUI() {
    this.ensureStyles();
    this.overlay = document.createElement('div');
    this.overlay.id = 'extensions-panel-overlay';
    this.overlay.addEventListener('click', () => this.hide());

    this.element = document.createElement('div');
    this.element.id = 'extensions-panel';
    this.element.innerHTML = `
      <div class="extensions-modal">
        <div class="extensions-header">
          <div class="extensions-heading">
            <span class="extensions-title-icon">${icons.puzzle}</span>
            <div style="min-width:0;">
              <h2 class="extensions-title">扩展</h2>
              <div class="extensions-subtitle">正规表达式、脚本、插件统一管理。</div>
            </div>
          </div>
          <button id="extensions-close" class="extensions-close" type="button" aria-label="关闭扩展">${icons.close}</button>
        </div>
        <div class="extensions-list">

          <div class="extensions-item">
          <button class="extensions-toggle" type="button" data-target="regex" data-expanded="0">
            <span class="extensions-toggle-main">${icons.regex}<span>正规表达式</span></span>
            <span class="chevron">▾</span>
          </button>
          <div class="extensions-body" data-body="regex">
            <div class="extensions-host" data-host="regex"></div>
          </div>
        </div>

          <div class="extensions-item">
          <button class="extensions-toggle" type="button" data-target="scripts" data-expanded="0">
            <span class="extensions-toggle-main">${icons.script}<span>脚本</span></span>
            <span class="chevron">▾</span>
          </button>
          <div class="extensions-body" data-body="scripts">
            <div class="extensions-host" data-host="scripts"></div>
          </div>
        </div>

          <div class="extensions-item">
          <button class="extensions-toggle" type="button" data-target="plugins" data-expanded="0">
            <span class="extensions-toggle-main">${icons.plugin}<span>插件</span></span>
            <span class="chevron">▾</span>
          </button>
          <div class="extensions-body" data-body="plugins">
            <div class="extensions-host" data-host="plugins"></div>
          </div>
          </div>
        </div>

      </div>
    `;
    this.element.addEventListener('click', (e) => e.stopPropagation());

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.element);

    this.element.querySelectorAll('.extensions-toggle').forEach((btn) => {
      btn.addEventListener('click', () => this.toggleBody(btn));
    });
    this.element.querySelector('#extensions-close')?.addEventListener('click', () => this.hide());
  }

  async toggleBody(toggleBtn) {
    const target = String(toggleBtn?.dataset?.target || '').trim();
    if (!target) return;
    const body = this.element?.querySelector(`.extensions-body[data-body="${target}"]`);
    if (!body) return;
    const expanded = String(toggleBtn.dataset.expanded || '0') === '1';
    if (expanded) {
      toggleBtn.dataset.expanded = '0';
      body.style.display = 'none';
      return;
    }
    toggleBtn.dataset.expanded = '1';
    body.style.display = 'block';
    await this.ensureEmbedded(target);
  }

  async ensureEmbedded(type) {
    const host = this.element?.querySelector(`.extensions-host[data-host="${type}"]`);
    if (!host) return;
    const panel = this.panels[type];
    if (!panel) {
      host.innerHTML = '<div class="extensions-loading">当前环境不支持该扩展面板。</div>';
      return;
    }
    if (!this.mounted[type]) {
      host.innerHTML = '<div class="extensions-loading">加载中...</div>';
    }
    try {
      if (typeof panel.show === 'function') {
        await panel.show();
      }
      const preset = panelPresets[type];
      if (!preset) return;
      const root =
        panel.panel ||
        panel.element ||
        (preset.rootSelector ? document.querySelector(preset.rootSelector) : null);
      if (!root) {
        host.innerHTML = '<div class="extensions-loading">面板加载失败。</div>';
        return;
      }
      if (preset.overlaySelector) {
        const overlay = document.querySelector(preset.overlaySelector);
        if (overlay) overlay.style.display = 'none';
      } else if (panel.overlay) {
        panel.overlay.style.display = 'none';
      }
      if (panel.overlayElement) {
        panel.overlayElement.style.display = 'none';
      }
      root.classList.add('extensions-embedded-root');
      root.style.minHeight = preset.height;
      root.style.maxHeight = preset.height;
      root.style.overflow = 'hidden';
      const closeBtn = root.querySelector(preset.closeSelector);
      if (closeBtn) closeBtn.classList.add('extensions-inner-close');

      host.innerHTML = '';
      host.appendChild(root);
      if (type === 'regex' && typeof panel.refreshAll === 'function') {
        await panel.refreshAll();
      }
      if (type === 'scripts' && typeof panel.refresh === 'function') {
        await panel.refresh();
      }
      if (type === 'plugins' && typeof panel.renderList === 'function') {
        await panel.renderList();
      }
      this.mounted[type] = true;
    } catch (err) {
      console.warn('extensions embed failed', type, err);
      host.innerHTML = '<div class="extensions-loading">加载失败，请稍后重试。</div>';
    }
  }
}
