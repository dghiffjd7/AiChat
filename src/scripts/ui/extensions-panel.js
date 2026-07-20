const panelPresets = {
  regex: {
    rootSelector: '#regex-panel',
    overlaySelector: '#regex-overlay',
    closeSelector: '#regex-close',
    height: 'min(64vh, 680px)',
  },
  scripts: {
    rootSelector: '#script-panel',
    overlaySelector: '',
    closeSelector: '#script-panel-close',
    height: 'min(64vh, 680px)',
  },
  plugins: {
    rootSelector: '#plugin-panel',
    overlaySelector: '#plugin-panel-overlay',
    closeSelector: '#plugin-panel-close',
    height: 'min(64vh, 680px)',
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
  regex: iconSvg('<path d="M12 6v12"/><path d="m17.2 9-10.4 6"/><path d="m6.8 9 10.4 6"/>'),
  script: iconSvg('<path d="m8 9-3 3 3 3"/><path d="m16 9 3 3-3 3"/><path d="m14 6-4 12"/>'),
  plugin: iconSvg('<path d="M19.4 7.3a2.9 2.9 0 1 0-2.7-2.7H14a2 2 0 0 0-2 2v2.7a2.9 2.9 0 1 0 0 5.4v2.7a2 2 0 0 0 2 2h2.7a2.9 2.9 0 1 1 2.7-2.7V14a2 2 0 0 0 2-2V9.3a2 2 0 0 0-2-2Z"/><path d="M12 9.3H9.3a2 2 0 0 0-2 2V14H4.6a2.9 2.9 0 1 0 2.7 2.7v2.7a2 2 0 0 0 2 2H12"/>'),
  chevron: iconSvg('<path d="m6 9 6 6 6-6"/>'),
});

const sectionMeta = Object.freeze([
  {
    key: 'regex',
    title: '正规表达式',
    description: '按作用域管理与替换聊天文本',
  },
  {
    key: 'scripts',
    title: '脚本',
    description: '注入自定义 JavaScript 逻辑',
  },
  {
    key: 'plugins',
    title: '插件',
    description: '安装与更新第三方扩展包',
  },
]);

const createSectionMarkup = ({ key, title, description }) => `
  <section class="extensions-item" data-section="${key}">
    <button
      class="extensions-toggle"
      type="button"
      data-target="${key}"
      data-expanded="0"
      aria-expanded="false"
      aria-controls="extensions-body-${key}"
    >
      <span class="extensions-section-icon extensions-section-icon--${key}">${icons[key === 'scripts' ? 'script' : key === 'plugins' ? 'plugin' : 'regex']}</span>
      <span class="extensions-section-copy">
        <span class="extensions-section-heading">
          <span class="extensions-section-title">${title}</span>
          <span class="extensions-section-chip" data-count="${key}">—</span>
        </span>
        <span class="extensions-section-description">${description}</span>
      </span>
      <span class="extensions-chevron">${icons.chevron}</span>
    </button>
    <div
      id="extensions-body-${key}"
      class="extensions-body"
      data-body="${key}"
      role="region"
      aria-hidden="true"
    >
      <div class="extensions-body-clip">
        <div class="extensions-body-surface">
          <div class="extensions-host" data-host="${key}"></div>
        </div>
      </div>
    </div>
  </section>
`;

export class ExtensionsPanel {
  constructor({ regexPanel, scriptPanel, pluginPanel } = {}) {
    this.overlay = null;
    this.element = null;
    this.activeSection = 'regex';
    this.hideTimer = null;
    this.visibilityFrame = null;
    this.sectionTransitionToken = 0;
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

  async show() {
    if (!this.element) this.createUI();
    clearTimeout(this.hideTimer);
    if (this.visibilityFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.visibilityFrame);
    }
    this.overlay.style.display = 'block';
    this.element.style.display = 'block';
    const reveal = () => {
      this.overlay?.classList.add('is-visible');
      this.element?.classList.add('is-visible');
    };
    if (typeof requestAnimationFrame === 'function') {
      this.visibilityFrame = requestAnimationFrame(() => {
        this.visibilityFrame = requestAnimationFrame(reveal);
      });
    } else {
      reveal();
    }
    this.updateSectionCounts();
    if (this.activeSection) {
      await this.setExpandedSection(this.activeSection, { forceOpen: true });
    }
  }

  hide() {
    if (!this.overlay || !this.element) return;
    if (this.visibilityFrame && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.visibilityFrame);
      this.visibilityFrame = null;
    }
    this.overlay.classList.remove('is-visible');
    this.element.classList.remove('is-visible');
    clearTimeout(this.hideTimer);
    const reducedMotion = document.body?.dataset?.reducedMotion === 'on' ||
      globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    this.hideTimer = setTimeout(() => {
      if (this.overlay && !this.overlay.classList.contains('is-visible')) {
        this.overlay.style.display = 'none';
      }
      if (this.element && !this.element.classList.contains('is-visible')) {
        this.element.style.display = 'none';
      }
    }, reducedMotion ? 0 : 240);
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
        z-index: 20050;
        opacity: 0;
        background: rgba(15, 23, 42, 0.42);
        backdrop-filter: blur(2px);
        -webkit-backdrop-filter: blur(2px);
        transition: opacity 220ms ease;
      }
      #extensions-panel-overlay.is-visible {
        opacity: 1;
      }
      #extensions-panel {
        display: none;
        position: fixed;
        left: 50%;
        top: 50%;
        z-index: 20060;
        width: min(1240px, 94vw);
        height: min(880px, 92vh);
        height: min(880px, 92dvh);
        opacity: 0;
        pointer-events: none;
        transform: translate(-50%, calc(-50% + 24px)) scale(0.96);
        transform-origin: 50% 50%;
        transition: opacity 220ms ease, transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
        font-family: "Inter", "Noto Sans SC", ui-sans-serif, system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
        -webkit-font-smoothing: antialiased;
        text-rendering: optimizeLegibility;
      }
      #extensions-panel.is-visible {
        opacity: 1;
        pointer-events: auto;
        transform: translate(-50%, -50%) scale(1);
      }
      #extensions-panel .extensions-modal {
        position: relative;
        display: flex;
        height: 100%;
        min-height: 0;
        flex-direction: column;
        overflow: hidden;
        border: 1px solid color-mix(in srgb, var(--app-border-default) 88%, transparent);
        border-radius: 22px;
        background: color-mix(in srgb, var(--app-surface-subtle) 82%, var(--app-surface-card));
        box-shadow: 0 24px 80px -16px rgba(15, 23, 42, 0.25), 0 4px 16px -4px rgba(15, 23, 42, 0.08);
      }
      #extensions-panel .extensions-header {
        position: relative;
        display: flex;
        flex: 0 0 auto;
        align-items: center;
        gap: 14px;
        padding: 16px 20px;
        border-bottom: 1px solid color-mix(in srgb, var(--app-border-default) 72%, transparent);
        background: var(--app-surface-card);
      }
      #extensions-panel .extensions-header::before {
        content: '';
        position: absolute;
        top: 0;
        right: 16%;
        left: 16%;
        height: 1px;
        background: linear-gradient(90deg, transparent, rgba(129, 140, 248, 0.62), transparent);
        pointer-events: none;
      }
      #extensions-panel .extensions-heading {
        display: flex;
        align-items: center;
        gap: 14px;
        min-width: 0;
      }
      #extensions-panel .extensions-title-icon {
        display: inline-flex;
        width: 44px;
        height: 44px;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        border-radius: 14px;
        color: #fff;
        background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 52%, #d946ef 100%);
        box-shadow: 0 9px 20px rgba(99, 102, 241, 0.30), 0 0 0 4px rgba(238, 242, 255, 0.92);
      }
      #extensions-panel .extensions-title-icon .extensions-icon {
        width: 22px;
        height: 22px;
      }
      #extensions-panel .extensions-title {
        margin: 0;
        color: var(--app-text-primary);
        font-size: 17px;
        font-weight: 800;
        letter-spacing: -0.025em;
        line-height: 1.2;
      }
      #extensions-panel .extensions-subtitle {
        margin-top: 3px;
        color: var(--app-text-muted);
        font-size: 11.5px;
        font-weight: 600;
        letter-spacing: 0.055em;
        line-height: 1.35;
      }
      #extensions-panel .extensions-header-actions {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
      }
      #extensions-panel .extensions-runtime-status {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 10px;
        border: 1px solid rgba(16, 185, 129, 0.20);
        border-radius: 999px;
        background: rgba(16, 185, 129, 0.08);
        color: #059669;
        font-size: 11px;
        font-weight: 700;
      }
      #extensions-panel .extensions-runtime-dot {
        width: 6px;
        height: 6px;
        border-radius: 999px;
        background: #10b981;
        box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.11);
      }
      #extensions-panel .extensions-close {
        display: inline-flex;
        width: 36px;
        height: 36px;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        border: 1px solid var(--app-border-default);
        border-radius: 12px;
        background: var(--app-surface-card);
        color: var(--app-text-muted);
        cursor: pointer;
        transition: transform 120ms ease, color 160ms ease, border-color 160ms ease, background 160ms ease;
      }
      #extensions-panel .extensions-close:hover {
        border-color: var(--app-border-strong, var(--app-border-default));
        background: var(--app-surface-hover);
        color: var(--app-text-primary);
      }
      #extensions-panel .extensions-close:active {
        transform: scale(0.9);
      }
      #extensions-panel .extensions-list {
        min-height: 0;
        flex: 1;
        overflow-y: auto;
        overscroll-behavior: contain;
        padding: 16px 20px 18px;
        scrollbar-width: thin;
        scrollbar-color: rgba(148, 163, 184, 0.45) transparent;
      }
      #extensions-panel .extensions-list::-webkit-scrollbar,
      #extensions-panel .extensions-embedded-root *::-webkit-scrollbar {
        width: 6px;
        height: 6px;
      }
      #extensions-panel .extensions-list::-webkit-scrollbar-thumb,
      #extensions-panel .extensions-embedded-root *::-webkit-scrollbar-thumb {
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.45);
      }
      #extensions-panel .extensions-item {
        --extensions-item-radius: 16px;
        position: relative;
        isolation: isolate;
        margin-bottom: 14px;
        overflow: visible;
        border: 1px solid color-mix(in srgb, var(--app-border-default) 82%, transparent);
        border-radius: var(--extensions-item-radius);
        background: var(--app-surface-card);
        transition: border-color 260ms ease;
      }
      #extensions-panel .extensions-item::before,
      #extensions-panel .extensions-item::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: -1;
        border-radius: inherit;
        pointer-events: none;
        transition: opacity 300ms ease;
        will-change: opacity;
      }
      #extensions-panel .extensions-item::before {
        opacity: 1;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05), 0 1px 3px rgba(15, 23, 42, 0.04);
      }
      #extensions-panel .extensions-item::after {
        opacity: 0;
        box-shadow: 0 8px 24px -12px rgba(15, 23, 42, 0.18), 0 1px 3px rgba(15, 23, 42, 0.05);
      }
      #extensions-panel .extensions-item:has(.extensions-toggle[data-expanded='1']) {
        border-color: var(--app-border-default);
      }
      #extensions-panel .extensions-item:has(.extensions-toggle[data-expanded='1'])::before {
        opacity: 0;
      }
      #extensions-panel .extensions-item:has(.extensions-toggle[data-expanded='1'])::after {
        opacity: 1;
      }
      #extensions-panel .extensions-toggle {
        display: flex;
        width: 100%;
        min-height: 68px;
        align-items: center;
        gap: 14px;
        padding: 14px 20px;
        border: 0;
        border-radius: var(--extensions-item-radius);
        background: transparent;
        color: var(--app-text-primary);
        text-align: left;
        cursor: pointer;
        transition: background 180ms ease;
      }
      #extensions-panel .extensions-toggle:hover {
        background: color-mix(in srgb, var(--app-surface-hover) 72%, transparent);
      }
      #extensions-panel .extensions-toggle:active .extensions-section-icon {
        transform: scale(0.94);
      }
      #extensions-panel .extensions-toggle:focus-visible,
      #extensions-panel .extensions-close:focus-visible {
        outline: 2px solid rgba(99, 102, 241, 0.52);
        outline-offset: -2px;
      }
      #extensions-panel .extensions-section-icon {
        display: inline-flex;
        width: 40px;
        height: 40px;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        border-radius: 12px;
        color: #fff;
        transition: transform 260ms ease;
      }
      #extensions-panel .extensions-toggle:hover .extensions-section-icon {
        transform: scale(1.05);
      }
      #extensions-panel .extensions-section-icon--regex {
        background: linear-gradient(135deg, #6366f1, #8b5cf6);
        box-shadow: 0 7px 15px rgba(99, 102, 241, 0.28);
      }
      #extensions-panel .extensions-section-icon--scripts {
        background: linear-gradient(135deg, #14b8a6, #10b981);
        box-shadow: 0 7px 15px rgba(20, 184, 166, 0.27);
      }
      #extensions-panel .extensions-section-icon--plugins {
        background: linear-gradient(135deg, #fbbf24, #f97316);
        box-shadow: 0 7px 15px rgba(245, 158, 11, 0.27);
      }
      #extensions-panel .extensions-section-copy {
        min-width: 0;
        flex: 1;
      }
      #extensions-panel .extensions-section-heading {
        display: flex;
        min-width: 0;
        align-items: center;
        gap: 8px;
      }
      #extensions-panel .extensions-section-title {
        overflow: hidden;
        color: var(--app-text-primary);
        font-size: 15px;
        font-weight: 750;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #extensions-panel .extensions-section-chip {
        display: inline-flex;
        flex: 0 0 auto;
        align-items: center;
        min-height: 20px;
        padding: 1px 8px;
        border: 1px solid color-mix(in srgb, var(--app-border-default) 70%, transparent);
        border-radius: 999px;
        background: var(--app-surface-subtle);
        color: var(--app-text-muted);
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        line-height: 1;
      }
      #extensions-panel .extensions-section-description {
        display: block;
        overflow: hidden;
        margin-top: 2px;
        color: var(--app-text-muted);
        font-size: 12px;
        font-weight: 450;
        line-height: 1.35;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      #extensions-panel .extensions-chevron {
        display: inline-flex;
        width: 32px;
        height: 32px;
        flex: 0 0 auto;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        background: var(--app-surface-subtle);
        color: var(--app-text-muted);
        transition: transform 250ms ease, color 180ms ease, background 180ms ease;
      }
      #extensions-panel .extensions-chevron .extensions-icon {
        width: 16px;
        height: 16px;
        stroke-width: 2.5;
      }
      #extensions-panel .extensions-toggle[data-expanded='1'] .extensions-chevron {
        transform: rotate(180deg);
        background: var(--app-text-primary);
        color: var(--app-text-inverse);
      }
      #extensions-panel .extensions-body {
        display: grid;
        grid-template-rows: 0fr;
        overflow: hidden;
        border-top: 1px solid transparent;
        opacity: 0;
        background: color-mix(in srgb, var(--app-surface-subtle) 64%, var(--app-surface-card));
        border-radius: 0 0 var(--extensions-item-radius) var(--extensions-item-radius);
        transition: grid-template-rows 380ms cubic-bezier(0.32, 0.72, 0, 1), opacity 220ms ease, border-color 220ms ease;
      }
      #extensions-panel .extensions-toggle[data-expanded='1'] {
        border-radius: var(--extensions-item-radius) var(--extensions-item-radius) 0 0;
      }
      #extensions-panel .extensions-body.is-expanded {
        grid-template-rows: 1fr;
        border-top-color: var(--app-border-subtle);
        opacity: 1;
      }
      #extensions-panel .extensions-body-clip {
        min-height: 0;
        overflow: hidden;
        contain: layout paint;
      }
      #extensions-panel .extensions-body:not(.is-expanded) .plugin-empty-icon {
        animation-play-state: paused;
      }
      #extensions-panel .extensions-body-surface {
        padding: 14px 16px 16px;
      }
      #extensions-panel .extensions-host {
        min-height: 92px;
      }
      #extensions-panel .extensions-loading {
        display: grid;
        min-height: 120px;
        place-items: center;
        border: 1px dashed var(--app-border-default);
        border-radius: 14px;
        color: var(--app-text-muted);
        font-size: 12px;
      }
      #extensions-panel .extensions-footer {
        padding: 4px 4px 1px;
        color: var(--app-text-muted);
        font-size: 11px;
        font-weight: 600;
        text-align: center;
      }
      #extensions-panel .extensions-embedded-root {
        position: static !important;
        inset: auto !important;
        left: auto !important;
        right: auto !important;
        top: auto !important;
        z-index: 1 !important;
        display: flex !important;
        width: 100% !important;
        height: var(--extensions-embedded-height, min(64vh, 680px)) !important;
        min-height: var(--extensions-embedded-height, min(64vh, 680px)) !important;
        max-height: var(--extensions-embedded-height, min(64vh, 680px)) !important;
        overflow: hidden !important;
        transform: none !important;
        border: 1px solid color-mix(in srgb, var(--app-border-default) 84%, transparent) !important;
        border-radius: 16px !important;
        background: var(--app-surface-card) !important;
        box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04) !important;
      }
      #extensions-panel .extensions-embedded-root .extensions-inner-close,
      #extensions-panel .extensions-embedded-root > div:first-child {
        display: none !important;
      }
      #extensions-panel .extensions-icon {
        width: 18px;
        height: 18px;
        flex: 0 0 auto;
        fill: none;
        stroke: currentColor;
        stroke-width: 2;
        stroke-linecap: round;
        stroke-linejoin: round;
      }

      /* Reference-style treatment for the real regex editor embedded in this shell. */
      #extensions-panel #regex-panel > div:nth-child(2) {
        padding: 12px 16px !important;
        background: transparent !important;
      }
      #extensions-panel #regex-panel .regex-tabs {
        padding: 3px !important;
        gap: 2px !important;
        border: 1px solid var(--app-border-default);
        border-radius: 12px;
        background: var(--app-surface-subtle);
      }
      #extensions-panel #regex-panel .regex-tab {
        min-width: 64px;
        padding: 7px 12px !important;
        border-radius: 9px !important;
        font-size: 12.5px !important;
        font-weight: 650 !important;
        transition: color 160ms ease, background 180ms ease, box-shadow 180ms ease !important;
      }
      #extensions-panel #regex-panel .regex-tab.is-active {
        background: transparent !important;
        color: var(--app-text-primary) !important;
        box-shadow: none !important;
      }
      #extensions-panel #regex-panel #regex-scroll {
        padding: 14px 16px 16px !important;
        background: color-mix(in srgb, var(--app-surface-subtle) 62%, transparent);
      }
      #extensions-panel #regex-panel .regex-workbench {
        grid-template-columns: minmax(270px, 320px) minmax(0, 1fr) !important;
        gap: 16px !important;
      }
      #extensions-panel #regex-panel .regex-btn {
        min-height: 34px;
        border-radius: 10px !important;
        font-size: 12px !important;
        transition: transform 120ms ease, border-color 160ms ease, box-shadow 160ms ease !important;
      }
      #extensions-panel #regex-panel .regex-btn:hover {
        border-color: var(--app-border-strong, var(--app-border-default));
        box-shadow: 0 4px 12px rgba(15, 23, 42, 0.07);
      }
      #extensions-panel #regex-panel .regex-btn:active {
        transform: scale(0.96);
      }
      #extensions-panel #regex-panel .regex-btn-primary {
        background: var(--app-accent-primary) !important;
        box-shadow: 0 5px 12px rgba(var(--app-accent-rgb), 0.20);
      }
      #extensions-panel #regex-panel :is(.regex-set-list, .regex-editor-head, .regex-rule, .regex-batch-bar) {
        border-radius: 14px !important;
      }
      #extensions-panel #regex-panel .regex-set-row {
        min-height: 58px !important;
        padding: 11px 13px !important;
      }
      #extensions-panel #regex-panel .regex-set-title {
        font-size: 13px;
        font-weight: 700 !important;
      }
      #extensions-panel #regex-panel .regex-editor-title {
        font-size: 15px !important;
        font-weight: 750 !important;
      }
      #extensions-panel #regex-panel input:not([type='checkbox']),
      #extensions-panel #regex-panel textarea,
      #extensions-panel #regex-panel select {
        background: var(--app-surface-card);
        color: var(--app-text-primary);
      }

      @media (max-width: 900px) {
        #extensions-panel #regex-panel .regex-workbench {
          grid-template-columns: minmax(240px, 290px) minmax(0, 1fr) !important;
        }
      }
      @media (max-width: 720px) {
        #extensions-panel {
          top: calc(8px + env(safe-area-inset-top, 0px));
          right: calc(8px + env(safe-area-inset-right, 0px));
          bottom: calc(8px + env(safe-area-inset-bottom, 0px));
          left: calc(8px + env(safe-area-inset-left, 0px));
          width: auto;
          height: calc(var(--app-visual-height, 100dvh) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 16px);
          opacity: 0;
          transform: translateY(16px) scale(0.98);
        }
        #extensions-panel.is-visible {
          transform: none;
        }
        #extensions-panel .extensions-modal {
          border-radius: 16px;
        }
        #extensions-panel .extensions-header {
          gap: 11px;
          padding: 12px;
        }
        #extensions-panel .extensions-title-icon {
          width: 40px;
          height: 40px;
          border-radius: 13px;
          box-shadow: 0 7px 16px rgba(99, 102, 241, 0.27), 0 0 0 3px rgba(238, 242, 255, 0.86);
        }
        #extensions-panel .extensions-title {
          font-size: 16px;
        }
        #extensions-panel .extensions-subtitle {
          overflow: hidden;
          max-width: min(56vw, 280px);
          font-size: 10.5px;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #extensions-panel .extensions-close {
          width: 44px;
          height: 44px;
          min-height: 44px;
        }
        #extensions-panel .extensions-list {
          padding: 10px 10px 12px;
        }
        #extensions-panel .extensions-item {
          --extensions-item-radius: 14px;
          margin-bottom: 10px;
        }
        #extensions-panel .extensions-toggle {
          min-height: 64px;
          gap: 11px;
          padding: 11px 12px;
        }
        #extensions-panel .extensions-section-icon {
          width: 36px;
          height: 36px;
          border-radius: 11px;
        }
        #extensions-panel .extensions-section-title {
          font-size: 14px;
        }
        #extensions-panel .extensions-section-description {
          font-size: 11.5px;
        }
        #extensions-panel .extensions-chevron {
          width: 30px;
          height: 30px;
        }
        #extensions-panel .extensions-body-surface {
          padding: 10px;
        }
        #extensions-panel .extensions-embedded-root {
          --extensions-embedded-height: min(58dvh, 540px);
          border-radius: 13px !important;
        }
        #extensions-panel #regex-panel > div:nth-child(2) {
          align-items: stretch !important;
          padding: 10px !important;
        }
        #extensions-panel #regex-panel .regex-tabs {
          display: grid !important;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          width: 100%;
        }
        #extensions-panel #regex-panel .regex-tab {
          min-width: 0;
          min-height: 36px;
          padding: 7px 8px !important;
        }
        #extensions-panel #regex-panel #regex-scroll {
          padding: 10px !important;
        }
        #extensions-panel #regex-panel .regex-workbench {
          grid-template-columns: 1fr !important;
        }
        #extensions-panel #regex-panel .regex-editor-title-row {
          flex-direction: column;
          align-items: stretch;
        }
        #extensions-panel #regex-panel .regex-editor-actions {
          width: 100%;
        }
        #extensions-panel #regex-panel .regex-action-row {
          grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
        }
      }
      @media (max-width: 480px) {
        #extensions-panel .extensions-runtime-status {
          display: none;
        }
        #extensions-panel .extensions-section-chip {
          max-width: 100px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        #extensions-panel #regex-panel .regex-action-row {
          grid-template-columns: 1fr !important;
        }
      }
      @media (max-height: 640px) and (min-width: 721px) {
        #extensions-panel {
          height: calc(100dvh - 24px);
        }
        #extensions-panel .extensions-embedded-root {
          --extensions-embedded-height: min(58vh, 500px);
        }
      }
      body[data-reduced-motion='on'] #extensions-panel-overlay,
      body[data-reduced-motion='on'] #extensions-panel,
      body[data-reduced-motion='on'] #extensions-panel *,
      body[data-reduced-motion='on'] #extensions-panel *::before,
      body[data-reduced-motion='on'] #extensions-panel *::after {
        scroll-behavior: auto !important;
        animation: none !important;
        transition: none !important;
      }
      @media (prefers-reduced-motion: reduce) {
        #extensions-panel-overlay,
        #extensions-panel,
        #extensions-panel *,
        #extensions-panel *::before,
        #extensions-panel *::after {
          scroll-behavior: auto !important;
          animation: none !important;
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
    this.element.setAttribute('role', 'dialog');
    this.element.setAttribute('aria-modal', 'true');
    this.element.setAttribute('aria-labelledby', 'extensions-title');
    this.element.innerHTML = `
      <div class="extensions-modal">
        <header class="extensions-header">
          <div class="extensions-heading">
            <span class="extensions-title-icon">${icons.puzzle}</span>
            <div style="min-width:0;">
              <h2 id="extensions-title" class="extensions-title has-help" data-help="正规表达式、脚本、插件统一管理。">扩展</h2>
              <div class="extensions-subtitle">EXTENSIONS · 正则 / 脚本 / 插件</div>
            </div>
          </div>
          <div class="extensions-header-actions">
            <span class="extensions-runtime-status"><span class="extensions-runtime-dot"></span>运行中</span>
            <button id="extensions-close" class="extensions-close" type="button" aria-label="关闭扩展">${icons.close}</button>
          </div>
        </header>
        <div class="extensions-list">
          ${sectionMeta.map(createSectionMarkup).join('')}
          <div class="extensions-footer">扩展面板 · 更改会在保存后即时生效</div>
        </div>
      </div>
    `;
    this.element.addEventListener('click', (event) => event.stopPropagation());

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.element);

    this.element.querySelectorAll('.extensions-toggle').forEach((button) => {
      button.addEventListener('click', () => this.toggleBody(button));
    });
    this.element.querySelector('#extensions-close')?.addEventListener('click', () => this.hide());
  }

  async toggleBody(toggleButton) {
    const target = String(toggleButton?.dataset?.target || '').trim();
    if (!target) return;
    await this.setExpandedSection(target);
  }

  async setExpandedSection(target, { forceOpen = false } = {}) {
    const key = sectionMeta.some(section => section.key === target) ? target : '';
    if (!key || !this.element) return;
    const requested = this.element.querySelector(`.extensions-toggle[data-target="${key}"]`);
    const shouldOpen = forceOpen || requested?.dataset?.expanded !== '1';
    const transitionToken = ++this.sectionTransitionToken;

    // Framer Motion measures the mounted content before animating height:auto.
    // Do the equivalent here so the first open does not animate a loading stub
    // and then jump when the real panel replaces it.
    if (shouldOpen) {
      await this.ensureEmbedded(key);
      if (transitionToken !== this.sectionTransitionToken) return;
    }

    this.element.querySelectorAll('.extensions-toggle').forEach((button) => {
      const isExpanded = shouldOpen && button.dataset.target === key;
      button.dataset.expanded = isExpanded ? '1' : '0';
      button.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    });
    this.element.querySelectorAll('.extensions-body').forEach((body) => {
      const isExpanded = shouldOpen && body.dataset.body === key;
      body.classList.toggle('is-expanded', isExpanded);
      body.setAttribute('aria-hidden', isExpanded ? 'false' : 'true');
      body.toggleAttribute('inert', !isExpanded);
    });

    this.activeSection = shouldOpen ? key : '';
  }

  updateSectionCounts() {
    if (!this.element) return;
    const counts = {
      regex: '正则集合',
      scripts: '脚本',
      plugins: '已安装',
    };
    try {
      const localSets = this.panels.regex?.store?.listLocalSets?.();
      if (Array.isArray(localSets)) counts.regex = `${localSets.length + 1} 个集合`;
    } catch {}
    try {
      const store = this.panels.scripts?.store;
      if (store?.getScripts) {
        let total = store.getScripts('global', 'global').length;
        const scopes = store.listScopes?.() || {};
        for (const id of scopes.character || []) total += store.getScripts('character', id).length;
        for (const id of scopes.preset || []) total += store.getScripts('preset', id).length;
        counts.scripts = `${total} 个脚本`;
      }
    } catch {}
    try {
      const plugins = this.panels.plugins?.store?.list?.();
      if (Array.isArray(plugins)) counts.plugins = `${plugins.length} 已安装`;
    } catch {}
    Object.entries(counts).forEach(([key, label]) => {
      const chip = this.element?.querySelector(`.extensions-section-chip[data-count="${key}"]`);
      if (chip) chip.textContent = label;
    });
  }

  async ensureEmbedded(type) {
    const host = this.element?.querySelector(`.extensions-host[data-host="${type}"]`);
    if (!host) return;
    const panel = this.panels[type];
    if (!panel) {
      host.innerHTML = '<div class="extensions-loading">当前环境不支持该扩展面板。</div>';
      return;
    }
    const preset = panelPresets[type];
    if (!preset) return;
    let root =
      panel.panel ||
      panel.element ||
      (preset.rootSelector && typeof document !== 'undefined' ? document.querySelector(preset.rootSelector) : null);
    // Keep unsaved editors intact, but refresh clean mounted panels so changes
    // from other entry points and the active chat context are not stale.
    if (this.mounted[type]) {
      if (root?.style?.display === 'none') root.style.display = 'flex';
      try {
        if (panel.hasUnsavedChanges?.() !== true) {
          const refresh = panel.refreshAll || panel.refresh || panel.renderList;
          if (typeof refresh === 'function') await refresh.call(panel);
        }
      } catch (err) {
        console.warn('extensions refresh failed', type, err);
      }
      this.updateSectionCounts();
      return;
    }
    host.innerHTML = '<div class="extensions-loading">加载中...</div>';
    try {
      if (typeof panel.show === 'function') {
        await panel.show();
      }
      root = root || panel.panel || panel.element ||
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
      const closeButton = root.querySelector(preset.closeSelector);
      if (closeButton) closeButton.classList.add('extensions-inner-close');

      host.innerHTML = '';
      host.appendChild(root);
      this.mounted[type] = true;
      this.updateSectionCounts();
    } catch (err) {
      console.warn('extensions embed failed', type, err);
      host.innerHTML = '<div class="extensions-loading">加载失败，请稍后重试。</div>';
    }
  }
}
