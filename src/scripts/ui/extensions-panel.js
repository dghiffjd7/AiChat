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
        background: rgba(15, 23, 42, 0.44);
        z-index: 20050;
      }
      #extensions-panel {
        display: none;
        position: fixed;
        left: 50%;
        top: calc(env(safe-area-inset-top, 0px) + 12px);
        transform: translateX(-50%);
        z-index: 20060;
        width: min(96vw, 980px);
      }
      #extensions-panel .extensions-modal {
        padding: 16px;
        border-radius: 16px;
        border: 1px solid var(--app-border-default);
        background: linear-gradient(180deg, var(--app-surface-card) 0%, var(--app-surface-subtle) 100%);
        box-shadow: 0 12px 34px rgba(15, 23, 42, 0.24);
        max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 24px);
        overflow-y: auto;
      }
      #extensions-panel .extensions-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 6px;
      }
      #extensions-panel .extensions-title {
        margin: 0;
        color: var(--app-text-primary);
        font-size: 18px;
        font-weight: 800;
      }
      #extensions-panel .extensions-close {
        width: 30px;
        height: 30px;
        border: 1px solid var(--app-border-default);
        border-radius: 10px;
        background: var(--app-surface-card);
        color: var(--app-text-primary);
        font-size: 18px;
        cursor: pointer;
      }
      #extensions-panel .extensions-subtitle {
        color: var(--app-text-muted);
        font-size: 12px;
        margin-bottom: 12px;
      }
      #extensions-panel .extensions-item {
        margin-bottom: 10px;
        border: 1px solid var(--app-border-default);
        border-radius: 12px;
        background: var(--app-surface-card);
        overflow: hidden;
      }
      #extensions-panel .extensions-toggle {
        width: 100%;
        border: none;
        background: var(--app-surface-subtle);
        color: var(--app-text-primary);
        font-size: 14px;
        font-weight: 700;
        padding: 11px 12px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
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
        border-top: 1px dashed var(--app-border-default);
      }
      #extensions-panel .extensions-host {
        min-height: 92px;
      }
      #extensions-panel .extensions-loading {
        color: var(--app-text-muted);
        font-size: 12px;
      }
      #extensions-panel .extensions-footer {
        display: flex;
        justify-content: flex-end;
      }
      #extensions-panel #extensions-done {
        border: 1px solid #0ea5e9;
        border-radius: 10px;
        background: #0ea5e9;
        color: var(--app-text-inverse);
        font-weight: 700;
        font-size: 14px;
        padding: 8px 14px;
        cursor: pointer;
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
          <h2 class="extensions-title">扩展</h2>
          <button id="extensions-close" class="extensions-close">×</button>
        </div>
        <div class="extensions-subtitle">正规表达式、脚本、插件统一管理。</div>

        <div class="extensions-item">
          <button class="extensions-toggle" data-target="regex" data-expanded="0">
            <span>🧩 正规表达式</span>
            <span class="chevron">▾</span>
          </button>
          <div class="extensions-body" data-body="regex">
            <div class="extensions-host" data-host="regex"></div>
          </div>
        </div>

        <div class="extensions-item">
          <button class="extensions-toggle" data-target="scripts" data-expanded="0">
            <span>📜 脚本</span>
            <span class="chevron">▾</span>
          </button>
          <div class="extensions-body" data-body="scripts">
            <div class="extensions-host" data-host="scripts"></div>
          </div>
        </div>

        <div class="extensions-item">
          <button class="extensions-toggle" data-target="plugins" data-expanded="0">
            <span>🧰 插件</span>
            <span class="chevron">▾</span>
          </button>
          <div class="extensions-body" data-body="plugins">
            <div class="extensions-host" data-host="plugins"></div>
          </div>
        </div>

        <div class="extensions-footer">
          <button id="extensions-done">完成</button>
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
    this.element.querySelector('#extensions-done')?.addEventListener('click', () => this.hide());
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
