const DEFAULT_CARD_HEIGHT = 80;
const RESIZE_MESSAGE = 'plugin_ui_resize';
const MAX_SIDEBARS_TOTAL = 8;
const MAX_SIDEBARS_PER_PLUGIN = 3;
const MAX_CARDS_TOTAL = 12;
const MAX_CARDS_PER_PLUGIN = 4;
const MAX_HTML_LENGTH = 200000;

const normalizeId = (value) => String(value || '').trim();
const countByPlugin = (map, pluginId) => {
  let count = 0;
  for (const item of map.values()) {
    if (item.pluginId === pluginId) count += 1;
  }
  return count;
};

const wrapShadowContent = (content) => `
  <style>
    :host { display: block; font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif; color: var(--app-text-primary); }
    .plugin-root { box-sizing: border-box; font-size: 13px; line-height: 1.5; }
    .plugin-root * { box-sizing: border-box; }
  </style>
  <div class="plugin-root">${content || ''}</div>
`;

const wrapIframeContent = (content, frameId) => `
  <!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width,initial-scale=1" />
      <style>
        html, body { margin: 0; padding: 0; }
        body { font-family: "PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif; font-size: 13px; line-height: 1.5; color: var(--app-text-primary); }
        * { box-sizing: border-box; }
      </style>
    </head>
    <body>
      ${content || ''}
      <script>
        (function() {
          const frameId = ${JSON.stringify(frameId)};
          if (!frameId) return;
          const postSize = () => {
            const body = document.body;
            const html = document.documentElement;
            const height = Math.max(
              body ? body.scrollHeight : 0,
              html ? html.scrollHeight : 0,
              body ? body.offsetHeight : 0,
              html ? html.offsetHeight : 0
            );
            parent.postMessage({ type: '${RESIZE_MESSAGE}', id: frameId, height: height }, '*');
          };
          const schedule = () => {
            if (window.requestAnimationFrame) {
              window.requestAnimationFrame(postSize);
            } else {
              setTimeout(postSize, 16);
            }
          };
          window.addEventListener('load', schedule);
          if (window.ResizeObserver) {
            const ro = new ResizeObserver(schedule);
            ro.observe(document.body);
          } else {
            setInterval(schedule, 500);
          }
          schedule();
        })();
      </script>
    </body>
  </html>
`;

const supportsShadow = () => typeof HTMLElement !== 'undefined' && typeof HTMLElement.prototype.attachShadow === 'function';

export class PluginUiManager {
  constructor() {
    this.isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
    this.forceIframe = this.isAndroid;
    this.frameMap = new Map();
    this._resizeListenerAttached = false;
    this.sidebars = new Map();
    this.cards = new Map();
    this.chatRoom = null;
    this.chatInputContainer = null;
    this.dock = null;
    this.sidebarOverlay = null;
    this.sidebarPanel = null;
    this.sidebarTitle = null;
    this.sidebarBody = null;
    this.modalOverlay = null;
    this.modalPanel = null;
    this.modalTitle = null;
    this.modalBody = null;
    this.activeModalKey = '';
    this.activeModalPluginId = '';
    this.activeModalId = '';
    this.cardSlots = {};
  }

  mount({ chatRoom, chatInputContainer } = {}) {
    if (chatRoom) this.chatRoom = chatRoom;
    if (chatInputContainer) this.chatInputContainer = chatInputContainer;
    this.ensureSidebarUI();
    this.ensureModalUI();
    this.ensureCardSlots();
    this.renderDock();
    this.renderCards();
  }

  ensureSidebarUI() {
    if (!this.chatRoom || this.dock) return;
    const dock = document.createElement('div');
    dock.id = 'plugin-sidebar-dock';
    dock.style.cssText = `
      position: absolute;
      right: 10px;
      top: 56px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      z-index: 120;
    `;

    const overlay = document.createElement('div');
    overlay.id = 'plugin-sidebar-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.4);
      z-index: 20000;
      display: none;
    `;
    overlay.addEventListener('click', () => this.hideSidebar());

    const panel = document.createElement('div');
    panel.id = 'plugin-sidebar-panel';
    panel.style.cssText = `
      position: fixed;
      right: 12px;
      top: 12px;
      bottom: 12px;
      width: min(86vw, 360px);
      background: var(--app-surface-card);
      border-radius: 16px;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.2);
      z-index: 20001;
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(15,23,42,0.08);">
        <div id="plugin-sidebar-title" style="font-size:14px;font-weight:700;color:var(--app-text-primary);">插件面板</div>
        <button id="plugin-sidebar-close" style="border:none;background:rgba(15,23,42,0.08);width:28px;height:28px;border-radius:10px;cursor:pointer;font-size:16px;">×</button>
      </div>
      <div id="plugin-sidebar-body" style="flex:1;overflow:auto;"></div>
    `;

    panel.querySelector('#plugin-sidebar-close')?.addEventListener('click', () => this.hideSidebar());
    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    this.chatRoom.appendChild(dock);

    this.dock = dock;
    this.sidebarOverlay = overlay;
    this.sidebarPanel = panel;
    this.sidebarTitle = panel.querySelector('#plugin-sidebar-title');
    this.sidebarBody = panel.querySelector('#plugin-sidebar-body');
  }

  ensureModalUI() {
    if (this.modalOverlay) return;
    const overlay = document.createElement('div');
    overlay.id = 'plugin-modal-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.55);
      z-index: 22000;
      display: none;
    `;
    overlay.addEventListener('click', () => this.closeModal());

    const panel = document.createElement('div');
    panel.id = 'plugin-modal-panel';
    panel.style.cssText = `
      position: fixed;
      left: 50%;
      top: 50%;
      transform: translate(-50%, -50%);
      width: min(90vw, 420px);
      max-height: 78vh;
      background: var(--app-surface-card);
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, 0.28);
      z-index: 22001;
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid rgba(15,23,42,0.08);">
        <div id="plugin-modal-title" style="font-size:14px;font-weight:700;color:var(--app-text-primary);">插件弹窗</div>
        <button id="plugin-modal-close" style="border:none;background:rgba(15,23,42,0.08);width:28px;height:28px;border-radius:10px;cursor:pointer;font-size:16px;">×</button>
      </div>
      <div id="plugin-modal-body" style="flex:1;overflow:auto;padding:12px;"></div>
    `;
    panel.querySelector('#plugin-modal-close')?.addEventListener('click', () => this.closeModal());

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    this.modalOverlay = overlay;
    this.modalPanel = panel;
    this.modalTitle = panel.querySelector('#plugin-modal-title');
    this.modalBody = panel.querySelector('#plugin-modal-body');
  }

  ensureCardSlots() {
    if (!this.chatInputContainer || this.cardSlots.before || this.cardSlots.after) return;
    const row = this.chatInputContainer.querySelector('.chat-input-row');
    if (!row) return;

    const before = document.createElement('div');
    before.id = 'plugin-chatcard-before';
    before.style.cssText = 'display:none;flex-direction:column;gap:8px;margin:6px 0;';

    const after = document.createElement('div');
    after.id = 'plugin-chatcard-after';
    after.style.cssText = 'display:none;flex-direction:column;gap:8px;margin:6px 0;';

    const above = document.createElement('div');
    above.id = 'plugin-chatcard-above';
    above.style.cssText = 'display:none;flex-direction:column;gap:8px;margin:8px 0;';

    this.chatInputContainer.insertBefore(before, row);
    this.chatInputContainer.appendChild(after);
    this.cardSlots.before = before;
    this.cardSlots.after = after;

    if (this.chatRoom) {
      const chatScroll = this.chatRoom.querySelector('#chat-scroll');
      if (chatScroll) {
        this.chatRoom.insertBefore(above, chatScroll);
        this.cardSlots.above = above;
      }
    }
  }

  registerSidebar(pluginId, data = {}) {
    const pid = normalizeId(pluginId);
    const id = normalizeId(data.id);
    if (!pid || !id) return false;
    const key = `${pid}:${id}`;
    const content = String(data.content || '');
    if (content.length > MAX_HTML_LENGTH) return false;
    const isUpdate = this.sidebars.has(key);
    if (!isUpdate) {
      if (this.sidebars.size >= MAX_SIDEBARS_TOTAL) return false;
      if (countByPlugin(this.sidebars, pid) >= MAX_SIDEBARS_PER_PLUGIN) return false;
    }
    this.sidebars.set(key, {
      key,
      pluginId: pid,
      id,
      title: String(data.title || id),
      icon: String(data.icon || '◆'),
      content,
      width: data.width,
    });
    this.renderDock();
    return true;
  }

  openModal(pluginId, data = {}) {
    const pid = normalizeId(pluginId);
    const id = normalizeId(data.id || 'modal');
    if (!pid || !id || !this.modalPanel || !this.modalOverlay || !this.modalBody) return false;
    if (this.activeModalPluginId && this.activeModalPluginId !== pid) return false;
    const content = String(data.content || '');
    if (content.length > MAX_HTML_LENGTH) return false;
    const key = `${pid}:${id}`;
    this.activeModalKey = key;
    this.activeModalPluginId = pid;
    this.activeModalId = id;
    if (this.modalTitle) this.modalTitle.textContent = String(data.title || id);
    this.modalBody.innerHTML = '';
    const host = document.createElement('div');
    host.style.cssText = 'width: 100%;';
    this.modalBody.appendChild(host);
    this.renderSandbox(host, content, data.height);
    const width = data.width ? String(data.width) : '';
    const maxWidth = data.maxWidth ? String(data.maxWidth) : '';
    if (width) this.modalPanel.style.width = width;
    else this.modalPanel.style.width = 'min(90vw, 420px)';
    if (maxWidth) this.modalPanel.style.maxWidth = maxWidth;
    this.modalOverlay.style.display = 'block';
    this.modalPanel.style.display = 'flex';
    return true;
  }

  closeModal(pluginId, id) {
    if (!this.modalPanel || !this.modalOverlay) return false;
    if (pluginId) {
      const pid = normalizeId(pluginId);
      const mid = normalizeId(id || 'modal');
      const key = pid && mid ? `${pid}:${mid}` : '';
      if (key && this.activeModalKey && key !== this.activeModalKey) return false;
    }
    this.modalOverlay.style.display = 'none';
    this.modalPanel.style.display = 'none';
    this.activeModalKey = '';
    this.activeModalPluginId = '';
    this.activeModalId = '';
    if (this.modalBody) this.modalBody.innerHTML = '';
    this.pruneFrames();
    return true;
  }

  unregisterSidebar(pluginId, id) {
    const pid = normalizeId(pluginId);
    const sid = normalizeId(id);
    if (!pid || !sid) return false;
    const key = `${pid}:${sid}`;
    this.sidebars.delete(key);
    this.renderDock();
    return true;
  }

  registerChatCard(pluginId, data = {}) {
    const pid = normalizeId(pluginId);
    const id = normalizeId(data.id);
    if (!pid || !id) return false;
    const key = `${pid}:${id}`;
    const content = String(data.content || '');
    if (content.length > MAX_HTML_LENGTH) return false;
    const isUpdate = this.cards.has(key);
    if (!isUpdate) {
      if (this.cards.size >= MAX_CARDS_TOTAL) return false;
      if (countByPlugin(this.cards, pid) >= MAX_CARDS_PER_PLUGIN) return false;
    }
    this.cards.set(key, {
      key,
      pluginId: pid,
      id,
      position: String(data.position || 'after_input'),
      content,
      height: data.height,
    });
    this.renderCards();
    return true;
  }

  unregisterChatCard(pluginId, id) {
    const pid = normalizeId(pluginId);
    const cid = normalizeId(id);
    if (!pid || !cid) return false;
    const key = `${pid}:${cid}`;
    const existing = this.cards.get(key);
    this.cards.delete(key);
    if (existing?.host && existing.host.parentNode) {
      existing.host.parentNode.removeChild(existing.host);
    }
    return true;
  }

  removePluginUi(pluginId) {
    const pid = normalizeId(pluginId);
    if (!pid) return;
    Array.from(this.sidebars.keys()).forEach((key) => {
      if (key.startsWith(`${pid}:`)) this.sidebars.delete(key);
    });
    Array.from(this.cards.keys()).forEach((key) => {
      const card = this.cards.get(key);
      if (!key.startsWith(`${pid}:`)) return;
      if (card?.host && card.host.parentNode) {
        card.host.parentNode.removeChild(card.host);
      }
      this.cards.delete(key);
    });
    if (this.activeModalPluginId === pid) {
      this.closeModal();
    }
    this.renderDock();
  }

  listSidebars() {
    return Array.from(this.sidebars.values()).map(item => ({
      pluginId: item.pluginId,
      id: item.id,
      title: item.title,
      icon: item.icon,
    }));
  }

  listCards() {
    return Array.from(this.cards.values()).map(item => ({
      pluginId: item.pluginId,
      id: item.id,
      position: item.position,
    }));
  }

  getActiveModal() {
    if (!this.activeModalKey) return null;
    return {
      pluginId: this.activeModalPluginId,
      id: this.activeModalId,
      title: this.modalTitle ? String(this.modalTitle.textContent || '') : '',
    };
  }

  renderDock() {
    if (!this.dock) return;
    this.dock.innerHTML = '';
    const items = Array.from(this.sidebars.values());
    if (!items.length) {
      this.dock.style.display = 'none';
      return;
    }
    this.dock.style.display = 'flex';
    items.forEach(item => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.title = item.title;
      btn.textContent = item.icon;
      btn.style.cssText = `
        width: 36px;
        height: 36px;
        border-radius: 12px;
        border: 1px solid rgba(15,23,42,0.12);
        background: var(--app-surface-card);
        cursor: pointer;
        font-size: 16px;
        box-shadow: 0 6px 14px rgba(15,23,42,0.12);
      `;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showSidebar(item.key);
      });
      this.dock.appendChild(btn);
    });
  }

  showSidebar(key) {
    const item = this.sidebars.get(key);
    if (!item || !this.sidebarPanel || !this.sidebarOverlay || !this.sidebarBody) return;
    if (this.sidebarTitle) this.sidebarTitle.textContent = item.title || item.id;
    this.sidebarBody.innerHTML = '';
    const host = document.createElement('div');
    host.style.cssText = 'width: 100%; height: 100%;';
    this.sidebarBody.appendChild(host);
    this.renderSandbox(host, item.content, item.width);
    this.sidebarOverlay.style.display = 'block';
    this.sidebarPanel.style.display = 'flex';
  }

  hideSidebar() {
    if (this.sidebarOverlay) this.sidebarOverlay.style.display = 'none';
    if (this.sidebarPanel) this.sidebarPanel.style.display = 'none';
    if (this.sidebarBody) this.sidebarBody.innerHTML = '';
    this.pruneFrames();
  }

  renderCards() {
    if (!this.cardSlots.before || !this.cardSlots.after) return;
    this.cardSlots.before.innerHTML = '';
    this.cardSlots.after.innerHTML = '';
    if (this.cardSlots.above) this.cardSlots.above.innerHTML = '';
    let countBefore = 0;
    let countAfter = 0;
    let countAbove = 0;
    Array.from(this.cards.values()).forEach(card => {
      const pos = card.position === 'before_input' ? 'before' : card.position === 'above_messages' ? 'above' : 'after';
      const slot = this.cardSlots[pos];
      if (!slot) return;
      const host = document.createElement('div');
      host.style.cssText = `
        width: 100%;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid rgba(148,163,184,0.2);
        background: var(--app-surface-card);
      `;
      slot.appendChild(host);
      card.host = host;
      this.renderSandbox(host, card.content, card.height);
      if (pos === 'before') countBefore += 1;
      else if (pos === 'above') countAbove += 1;
      else countAfter += 1;
    });
    this.cardSlots.before.style.display = countBefore ? 'flex' : 'none';
    this.cardSlots.after.style.display = countAfter ? 'flex' : 'none';
    if (this.cardSlots.above) {
      this.cardSlots.above.style.display = countAbove ? 'flex' : 'none';
    }
    this.pruneFrames();
  }

  renderSandbox(host, content, height) {
    if (!host) return;
    const html = String(content || '');
    const shouldShadow = !this.forceIframe && supportsShadow() && !/<script\b/i.test(html);
    if (shouldShadow) {
      let root = host.shadowRoot;
      if (!root) root = host.attachShadow({ mode: 'open' });
      root.innerHTML = wrapShadowContent(html);
      host.style.height = 'auto';
      return;
    }
    host.innerHTML = '';
    const iframe = document.createElement('iframe');
    const frameId = `plugin-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms');
    iframe.style.cssText = `
      width: 100%;
      height: ${height ? String(height) : `${DEFAULT_CARD_HEIGHT}px`};
      border: none;
      display: block;
    `;
    iframe.dataset.frameId = frameId;
    iframe.dataset.fixedHeight = height ? '1' : '0';
    iframe.srcdoc = wrapIframeContent(html, frameId);
    host.appendChild(iframe);
    this.frameMap.set(frameId, iframe);
    this.ensureResizeListener();
  }

  ensureResizeListener() {
    if (this._resizeListenerAttached) return;
    this._resizeListenerAttached = true;
    window.addEventListener('message', (event) => {
      const data = event?.data;
      if (!data || data.type !== RESIZE_MESSAGE) return;
      const id = String(data.id || '');
      const iframe = this.frameMap.get(id);
      if (!iframe) return;
      if (iframe.dataset.fixedHeight === '1') return;
      const height = Number(data.height);
      if (!Number.isFinite(height) || height <= 0) return;
      iframe.style.height = `${Math.max(40, Math.min(height, 720))}px`;
    });
  }

  pruneFrames() {
    for (const [key, iframe] of this.frameMap.entries()) {
      if (!iframe || !iframe.isConnected) {
        this.frameMap.delete(key);
      }
    }
  }
}
