import { appConfirm } from './app-confirm.js';
import { validateManifest } from '../storage/plugin-store.js';
import { safeInvoke } from '../utils/tauri.js';
import { RISKY_PERMISSIONS, RISKY_PERMISSION_SET } from '../plugins/plugin-permissions.js';

const readFileText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('读取失败'));
  reader.readAsText(file);
});

const normalizePath = (value) => String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');

const pickManifestPath = (paths) => {
  const candidates = paths.filter(p => p.toLowerCase().endsWith('/manifest.json') || p.toLowerCase() === 'manifest.json');
  if (!candidates.length) return '';
  candidates.sort((a, b) => a.length - b.length);
  return candidates[0];
};

const getRiskyPermissions = (manifest) => {
  const perms = Array.isArray(manifest?.permissions) ? manifest.permissions : [];
  return perms.filter(p => RISKY_PERMISSIONS.has(p));
};

export class PluginPanel {
  constructor({ store, runtime }) {
    this.store = store;
    this.runtime = runtime;
    this.element = null;
    this.overlayElement = null;
    this.listEl = null;
    this.statusEl = null;
    this.fileInput = null;
    this.zipInput = null;
    this.isAndroid = typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent || '');
    this.statusTimer = null;
    this.uiManageOverlay = null;
    this.uiManagePanel = null;
    this.uiManageList = null;
    this.importMenuCloseHandler = null;
    this.moreMenuCloseHandler = null;
  }

  async show() {
    await this.store?.ready;
    if (!this.element) this.createUI();
    await this.renderList();
    this.element.style.display = 'flex';
    this.overlayElement.style.display = 'block';
  }

  hide() {
    this.closeMenus();
    if (this.element) this.element.style.display = 'none';
    if (this.overlayElement) this.overlayElement.style.display = 'none';
  }

  createUI() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'plugin-panel-overlay';
    this.overlayElement.style.cssText = `
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 20000;
    `;
    this.overlayElement.onclick = () => this.hide();

    this.element = document.createElement('div');
    this.element.id = 'plugin-panel';
    this.element.style.cssText = `
      display: none;
      position: fixed;
      inset: 5vh 6vw;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.2);
      z-index: 20001;
      overflow: hidden;
      flex-direction: column;
    `;
    this.element.onclick = (e) => e.stopPropagation();

    this.element.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(15,23,42,0.08);">
        <div>
          <div style="font-size:16px;font-weight:700;color:#0f172a;">插件管理</div>
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">管理已安装的插件</div>
        </div>
        <button id="plugin-panel-close" style="border:none;background:rgba(15,23,42,0.08);width:28px;height:28px;border-radius:10px;cursor:pointer;font-size:16px;">×</button>
      </div>
      <div id="plugin-android-tip" style="display:none;background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:8px 12px;margin:12px 16px 0;font-size:12px;color:#92400e;">
        <span style="margin-right:6px;">⚠️</span>安卓端仅支持 ZIP 导入
      </div>
      <div style="padding:12px 16px;border-bottom:1px solid rgba(148,163,184,0.15);background:#f8fafc;">
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
          <button id="plugin-import-btn" style="padding:8px 14px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;">
            <span style="font-size:14px;">📁</span>导入插件
          </button>
          <button id="plugin-install-url-btn" style="padding:8px 14px;border-radius:10px;border:1px solid rgba(15,23,42,0.12);background:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;gap:6px;">
            <span style="font-size:14px;">🔗</span>链接安装
          </button>
          <button id="plugin-refresh-btn" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(15,23,42,0.12);background:#fff;font-size:13px;cursor:pointer;" title="刷新列表">↻</button>
          <button id="plugin-ui-manage-btn" style="padding:8px 12px;border-radius:10px;border:1px solid rgba(15,23,42,0.12);background:#fff;font-size:13px;cursor:pointer;" title="UI 注入管理">⚙️</button>
          <div id="plugin-status" style="margin-left:auto;font-size:12px;color:#64748b;"></div>
        </div>
        <div style="margin-top:8px;font-size:11px;color:#64748b;">
          <span id="plugin-import-hint">桌面端可导入文件夹或 ZIP，安卓端使用 ZIP</span>
        </div>
      </div>
      <div id="plugin-list" style="flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;"></div>
    `;
    // hidden zip input trigger
    this.element.insertAdjacentHTML('beforeend', '<input type="file" id="plugin-zip-input-hidden" accept=".zip" style="display:none;">');

    this.element.querySelector('#plugin-panel-close')?.addEventListener('click', () => this.hide());
    this.statusEl = this.element.querySelector('#plugin-status');
    this.listEl = this.element.querySelector('#plugin-list');
    const importBtn = this.element.querySelector('#plugin-import-btn');
    const installUrlBtn = this.element.querySelector('#plugin-install-url-btn');
    const manageUiBtn = this.element.querySelector('#plugin-ui-manage-btn');
    const refreshBtn = this.element.querySelector('#plugin-refresh-btn');
    const androidTip = this.element.querySelector('#plugin-android-tip');
    const importHint = this.element.querySelector('#plugin-import-hint');

    this.fileInput = document.createElement('input');
    this.fileInput.type = 'file';
    this.fileInput.multiple = true;
    this.fileInput.style.display = 'none';
    this.fileInput.setAttribute('webkitdirectory', '');
    this.fileInput.setAttribute('directory', '');
    this.fileInput.onchange = () => this.handleImport();
    document.body.appendChild(this.fileInput);

    this.zipInput = document.createElement('input');
    this.zipInput.type = 'file';
    this.zipInput.accept = '.zip,application/zip,application/x-zip-compressed,application/octet-stream';
    this.zipInput.style.display = 'none';
    this.zipInput.onchange = () => this.handleZipImport();
    document.body.appendChild(this.zipInput);

    // 安卓端显示提示条，并修改导入按钮行为
    if (this.isAndroid) {
      if (androidTip) androidTip.style.display = 'block';
      if (importHint) importHint.textContent = '点击"导入插件"选择 ZIP 文件';
      importBtn?.addEventListener('click', () => {
        if (this.zipInput) {
          this.zipInput.value = '';
          this.zipInput.click();
        }
      });
    } else {
      // 桌面端：显示选择菜单（文件夹或 ZIP）
      importBtn?.addEventListener('click', (e) => {
        this.showImportMenu(e.currentTarget);
      });
    }
    installUrlBtn?.addEventListener('click', () => this.handleUrlInstall());
    manageUiBtn?.addEventListener('click', () => this.showUiManager());
    refreshBtn?.addEventListener('click', () => this.renderList());

    document.body.appendChild(this.overlayElement);
    document.body.appendChild(this.element);
  }

  createUiManagerUI() {
    if (this.uiManagePanel || this.uiManageOverlay) return;
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.45);
      z-index: 21000;
      display: none;
    `;
    overlay.addEventListener('click', () => this.hideUiManager());

    const panel = document.createElement('div');
    panel.style.cssText = `
      position: fixed;
      inset: 10vh 8vw;
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 18px 50px rgba(15, 23, 42, 0.2);
      z-index: 21001;
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;
    panel.addEventListener('click', (e) => e.stopPropagation());
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid rgba(15,23,42,0.08);">
        <div style="font-size:16px;font-weight:700;color:#0f172a;">UI 注入管理</div>
        <button id="plugin-ui-close" style="border:none;background:rgba(15,23,42,0.08);width:28px;height:28px;border-radius:10px;cursor:pointer;font-size:16px;">×</button>
      </div>
      <div id="plugin-ui-list" style="flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;"></div>
    `;
    panel.querySelector('#plugin-ui-close')?.addEventListener('click', () => this.hideUiManager());

    document.body.appendChild(overlay);
    document.body.appendChild(panel);
    this.uiManageOverlay = overlay;
    this.uiManagePanel = panel;
    this.uiManageList = panel.querySelector('#plugin-ui-list');
  }

  showUiManager() {
    this.closeMenus();
    this.createUiManagerUI();
    if (!this.uiManageOverlay || !this.uiManagePanel) return;
    this.renderUiManager();
    this.uiManageOverlay.style.display = 'block';
    this.uiManagePanel.style.display = 'flex';
  }

  closeImportMenu() {
    const existing = document.querySelector('.plugin-import-menu');
    if (existing) existing.remove();
    if (this.importMenuCloseHandler) {
      document.removeEventListener('pointerdown', this.importMenuCloseHandler, true);
      this.importMenuCloseHandler = null;
    }
  }

  closeMoreMenu() {
    const existing = document.querySelector('.plugin-more-menu');
    if (existing) existing.remove();
    if (this.moreMenuCloseHandler) {
      document.removeEventListener('pointerdown', this.moreMenuCloseHandler, true);
      this.moreMenuCloseHandler = null;
    }
  }

  closeMenus() {
    this.closeImportMenu();
    this.closeMoreMenu();
  }

  hideUiManager() {
    if (this.uiManageOverlay) this.uiManageOverlay.style.display = 'none';
    if (this.uiManagePanel) this.uiManagePanel.style.display = 'none';
  }

  renderUiManager() {
    if (!this.uiManageList) return;
    const uiManager = this.runtime?.uiManager || window.appBridge?.pluginUiManager;
    this.uiManageList.innerHTML = '';
    if (!uiManager) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px;text-align:center;color:#94a3b8;font-size:13px;';
      empty.textContent = '当前环境不支持 UI 管理';
      this.uiManageList.appendChild(empty);
      return;
    }
    const sidebars = uiManager.listSidebars ? uiManager.listSidebars() : [];
    const cards = uiManager.listCards ? uiManager.listCards() : [];
    const modal = uiManager.getActiveModal ? uiManager.getActiveModal() : null;

    const addSection = (title) => {
      const header = document.createElement('div');
      header.textContent = title;
      header.style.cssText = 'font-size:13px;font-weight:700;color:#0f172a;margin-top:4px;';
      this.uiManageList.appendChild(header);
    };

    const addItem = (label, actionText, onAction) => {
      const row = document.createElement('div');
      row.style.cssText = `
        display:flex;
        align-items:center;
        justify-content:space-between;
        gap:12px;
        padding:10px 12px;
        border:1px solid rgba(148,163,184,0.2);
        border-radius:12px;
        background:#fff;
      `;
      const text = document.createElement('div');
      text.textContent = label;
      text.style.cssText = 'font-size:12px;color:#334155;line-height:1.4;';
      const btn = document.createElement('button');
      btn.textContent = actionText;
      btn.style.cssText = `
        border: 1px solid rgba(15,23,42,0.12);
        border-radius: 10px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        background: #fff;
      `;
      btn.addEventListener('click', onAction);
      row.appendChild(text);
      row.appendChild(btn);
      this.uiManageList.appendChild(row);
    };

    if (!sidebars.length && !cards.length && !modal) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px;text-align:center;color:#94a3b8;font-size:13px;';
      empty.textContent = '暂无插件 UI 注入';
      this.uiManageList.appendChild(empty);
      return;
    }

    if (modal) {
      addSection('弹窗');
      addItem(`Modal · ${modal.pluginId}/${modal.id}`, '关闭', () => {
        uiManager.closeModal?.(modal.pluginId, modal.id);
        this.renderUiManager();
      });
    }

    if (sidebars.length) {
      addSection('侧边栏');
      sidebars.forEach(item => {
        addItem(`Sidebar · ${item.pluginId}/${item.id} · ${item.title || ''}`, '移除', () => {
          uiManager.unregisterSidebar?.(item.pluginId, item.id);
          this.renderUiManager();
        });
      });
    }

    if (cards.length) {
      addSection('聊天卡片');
      cards.forEach(item => {
        addItem(`Card · ${item.pluginId}/${item.id} · ${item.position || ''}`, '移除', () => {
          uiManager.unregisterChatCard?.(item.pluginId, item.id);
          this.renderUiManager();
        });
      });
    }
  }

  showImportMenu(anchor) {
    // 如果菜单已存在，则关闭并返回
    const existing = document.querySelector('.plugin-import-menu');
    if (existing) {
      this.closeImportMenu();
      return;
    }
    // 同时关闭其他菜单
    this.closeMoreMenu();
    const menu = document.createElement('div');
    menu.className = 'plugin-import-menu';
    menu.style.cssText = `
      position: absolute;
      background: #fff;
      border: 1px solid rgba(15,23,42,0.1);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(15,23,42,0.15);
      padding: 6px;
      z-index: 25000;
      min-width: 160px;
    `;
    menu.innerHTML = `
      <button class="import-menu-item" data-type="folder" style="
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 10px 12px; border: none; background: transparent;
        border-radius: 8px; cursor: pointer; font-size: 13px; text-align: left;
      ">
        <span style="font-size:16px;">📁</span>
        <span>导入文件夹</span>
      </button>
      <button class="import-menu-item" data-type="zip" style="
        display: flex; align-items: center; gap: 10px; width: 100%;
        padding: 10px 12px; border: none; background: transparent;
        border-radius: 8px; cursor: pointer; font-size: 13px; text-align: left;
      ">
        <span style="font-size:16px;">📦</span>
        <span>导入 ZIP</span>
      </button>
    `;
    // 定位到按钮下方
    const rect = anchor.getBoundingClientRect();
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;
    document.body.appendChild(menu);
    // hover 样式
    menu.querySelectorAll('.import-menu-item').forEach(btn => {
      btn.addEventListener('mouseenter', () => btn.style.background = '#f1f5f9');
      btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
      btn.addEventListener('click', () => {
        const nextType = btn.dataset.type;
        this.closeImportMenu();
        if (nextType === 'folder') {
          if (this.fileInput) {
            this.fileInput.value = '';
            this.fileInput.click();
          }
        } else {
          if (this.zipInput) {
            this.zipInput.value = '';
            this.zipInput.click();
          }
        }
      });
    });
    // 点击外部关闭
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        this.closeImportMenu();
      }
    };
    this.importMenuCloseHandler = closeMenu;
    setTimeout(() => {
      if (this.importMenuCloseHandler !== closeMenu) return;
      if (!document.body.contains(menu)) return;
      document.addEventListener('pointerdown', closeMenu, true);
    }, 0);
  }

  async handleImport() {
    if (this.isAndroid) {
      window.toastr?.warning?.('安卓端不支持文件夹选择，请使用 ZIP 导入');
      return;
    }
    const files = Array.from(this.fileInput?.files || []);
    if (!files.length) return;
    try {
      const fileMap = new Map();
      files.forEach(file => {
        const path = normalizePath(file.webkitRelativePath || file.name);
        if (path) fileMap.set(path, file);
      });
      const manifestPath = pickManifestPath(Array.from(fileMap.keys()));
      if (!manifestPath) {
        window.toastr?.error?.('未找到 manifest.json');
        return;
      }
      const manifestFile = fileMap.get(manifestPath);
      const manifestText = await readFileText(manifestFile);
      const manifest = JSON.parse(manifestText);
      const { manifest: normalized, ok, errors } = validateManifest(manifest);
      if (!ok) {
        window.toastr?.error?.(`manifest 校验失败：${errors.join('；')}`);
        return;
      }
      const confirmed = await this.confirmInstall(normalized, {
        type: 'folder',
        path: manifestPath,
      });
      if (!confirmed) return;
      const baseDir = manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/') + 1) : '';
      const mainRelRaw = normalizePath(String(normalized.main || ''));
      const mainRel = mainRelRaw.startsWith('./') ? mainRelRaw.slice(2) : mainRelRaw;
      const mainPath = normalizePath(`${baseDir}${mainRel}`);
      const mainFile = fileMap.get(mainPath);
      if (!mainFile) {
        window.toastr?.error?.(`未找到入口脚本：${mainRel}`);
        return;
      }
      const code = await readFileText(mainFile);
      await this.installFromParts({
        manifest: normalized,
        code,
        source: { type: 'folder', path: baseDir || null },
      });
    } catch (err) {
      window.toastr?.error?.(`导入失败：${err?.message || err}`);
    }
  }

  async handleZipImport() {
    const file = this.zipInput?.files?.[0];
    if (!file) return;
    if (!String(file.name || '').toLowerCase().endsWith('.zip')) {
      window.toastr?.warning?.('请选择 .zip 插件文件');
      return;
    }
    try {
      this.setStatus('正在解析 ZIP…');
      const buffer = await file.arrayBuffer();
      const bytes = Array.from(new Uint8Array(buffer));
      const installed = await this.installFromZipBytes(bytes, { name: file.name || '' });
      if (installed) {
        this.setStatus('ZIP 导入成功', 2000);
      } else {
        this.setStatus('已取消', 1500);
      }
    } catch (err) {
      this.setStatus('');
      window.toastr?.error?.(`ZIP 导入失败：${err?.message || err}`);
    }
  }

  async handleUrlInstall() {
    const input = window.prompt('请输入插件 ZIP 链接', '') ?? '';
    const url = String(input || '').trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      window.toastr?.warning?.('仅支持 http/https 链接');
      return;
    }
    const normalizedUrl = await this.resolveInstallUrl(url);
    if (normalizedUrl && normalizedUrl !== url) {
      window.toastr?.info?.('已自动转换为直链');
    }
    try {
      this.setStatus('正在下载插件…');
      const res = await fetch(normalizedUrl);
      if (!res.ok) {
        if (this.shouldRetryGithubMain(normalizedUrl, res.status)) {
          const fallback = this.replaceGithubBranch(normalizedUrl, 'master');
          this.setStatus('尝试主分支…');
          const retry = await fetch(fallback);
          if (!retry.ok) throw new Error(`下载失败 (${retry.status})`);
          const buffer = await retry.arrayBuffer();
          const name = fallback.split('/').pop() || 'plugin.zip';
          this.setStatus('正在解析 ZIP…');
          const installed = await this.installFromZipBytes(Array.from(new Uint8Array(buffer)), { name, url: fallback });
          if (installed) {
            this.setStatus('安装完成', 2000);
          } else {
            this.setStatus('已取消', 1500);
          }
          return;
        }
        throw new Error(`下载失败 (${res.status})`);
      }
      const buffer = await res.arrayBuffer();
      const name = normalizedUrl.split('/').pop() || 'plugin.zip';
      this.setStatus('正在解析 ZIP…');
      const installed = await this.installFromZipBytes(Array.from(new Uint8Array(buffer)), { name, url: normalizedUrl });
      if (installed) {
        this.setStatus('安装完成', 2000);
      } else {
        this.setStatus('已取消', 1500);
      }
    } catch (err) {
      this.setStatus('');
      window.toastr?.error?.(`安装失败：${err?.message || err}`);
    }
  }

  async installFromZipBytes(bytes, { name, url } = {}) {
    const result = await safeInvoke('read_plugin_zip', { bytes });
    const manifestText = String(result?.manifestText || '');
    const mainText = String(result?.mainText || '');
    if (!manifestText || !mainText) {
      throw new Error('ZIP 解析失败');
    }
    const manifest = JSON.parse(manifestText);
    const { manifest: normalized, ok, errors } = validateManifest(manifest);
    if (!ok) {
      throw new Error(`manifest 校验失败：${errors.join('；')}`);
    }
    const confirmed = await this.confirmInstall(normalized, {
      type: 'zip',
      name: name || '',
      url: url || '',
    });
    if (!confirmed) return false;
    await this.installFromParts({
      manifest: normalized,
      code: mainText,
      source: { type: 'zip', name: name || '' },
    });
    return true;
  }

  setStatus(text, timeoutMs = 0) {
    if (!this.statusEl) return;
    this.statusEl.textContent = String(text || '');
    if (this.statusTimer) {
      clearTimeout(this.statusTimer);
      this.statusTimer = null;
    }
    if (timeoutMs > 0) {
      this.statusTimer = setTimeout(() => {
        if (this.statusEl) this.statusEl.textContent = '';
        this.statusTimer = null;
      }, timeoutMs);
    }
  }

  normalizeInstallUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname === 'github.com') {
        const parts = parsed.pathname.split('/').filter(Boolean);
        if (parts.length >= 4 && parts[2] === 'blob') {
          const user = parts[0];
          const repo = parts[1];
          const rest = parts.slice(3).join('/');
          if (user && repo && rest) {
            return `https://raw.githubusercontent.com/${user}/${repo}/${rest}`;
          }
        }
      }
    } catch {
      return rawUrl;
    }
    return rawUrl;
  }

  parseGithubRepoUrl(rawUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname !== 'github.com') return null;
      const parts = parsed.pathname.split('/').filter(Boolean);
      if (parts.length < 2) return null;
      const owner = parts[0];
      const repo = String(parts[1] || '').replace(/\.git$/i, '');
      if (!owner || !repo) return null;
      const kind = parts[2] || '';
      if (kind === 'tree' && parts[3]) {
        return { owner, repo, branch: parts.slice(3).join('/') };
      }
      if (kind === 'releases' && parts[3] === 'tag' && parts[4]) {
        return { owner, repo, tag: parts.slice(4).join('/') };
      }
      if (kind === 'releases' && parts[3] === 'latest') {
        return { owner, repo, latest: true };
      }
      if (kind === 'archive') {
        return { owner, repo, archive: true, url: rawUrl };
      }
      return { owner, repo };
    } catch {
      return null;
    }
  }

  buildGithubZipUrl(owner, repo, refType, ref) {
    const safeOwner = encodeURIComponent(owner);
    const safeRepo = encodeURIComponent(repo);
    const safeRef = encodeURIComponent(ref);
    if (refType === 'tags') {
      return `https://codeload.github.com/${safeOwner}/${safeRepo}/zip/refs/tags/${safeRef}`;
    }
    return `https://codeload.github.com/${safeOwner}/${safeRepo}/zip/refs/heads/${safeRef}`;
  }

  async resolveInstallUrl(rawUrl) {
    const normalized = this.normalizeInstallUrl(rawUrl);
    const github = this.parseGithubRepoUrl(normalized);
    if (!github) return normalized;
    if (github.archive && github.url) return github.url;
    if (github.tag) {
      return this.buildGithubZipUrl(github.owner, github.repo, 'tags', github.tag);
    }
    if (github.branch) {
      return this.buildGithubZipUrl(github.owner, github.repo, 'heads', github.branch);
    }
    if (github.latest) {
      try {
        const api = `https://api.github.com/repos/${github.owner}/${github.repo}/releases/latest`;
        const res = await fetch(api);
        if (res.ok) {
          const data = await res.json();
          const tag = String(data?.tag_name || '').trim();
          if (tag) return this.buildGithubZipUrl(github.owner, github.repo, 'tags', tag);
        }
      } catch {}
    }
    try {
      const api = `https://api.github.com/repos/${github.owner}/${github.repo}`;
      const res = await fetch(api);
      if (res.ok) {
        const data = await res.json();
        const branch = String(data?.default_branch || '').trim();
        if (branch) return this.buildGithubZipUrl(github.owner, github.repo, 'heads', branch);
      }
    } catch {}
    return this.buildGithubZipUrl(github.owner, github.repo, 'heads', 'main');
  }

  shouldRetryGithubMain(url, status) {
    if (status !== 404 && status !== 403) return false;
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith('github.com')) return false;
      if (!parsed.pathname.includes('/zip/refs/heads/main')) return false;
      return true;
    } catch {
      return false;
    }
  }

  replaceGithubBranch(url, branch) {
    try {
      const parsed = new URL(url);
      parsed.pathname = parsed.pathname.replace(/\/zip\/refs\/heads\/[^/]+/i, `/zip/refs/heads/${branch}`);
      return parsed.toString();
    } catch {
      return url;
    }
  }

  async installFromParts({ manifest, code, source }) {
    const exists = this.store?.has(manifest.id);
    if (exists) {
      const ok = await appConfirm({
        title: '覆盖插件',
        message: `插件 ${manifest.name || manifest.id} 已存在，是否覆盖？`,
        danger: true,
      });
      if (!ok) return;
    }
    await this.store.installPlugin({
      manifest,
      code,
      source,
    });
    window.toastr?.success?.('插件导入成功');
    await this.renderList();
    if (this.runtime) {
      const enable = await appConfirm({
        title: '启用插件',
        message: '是否立即启用该插件？',
      });
      if (enable) {
        await this.enablePluginWithChecks(manifest.id, manifest);
        await this.renderList();
      }
    } else {
      window.toastr?.warning?.('当前环境不支持插件运行');
    }
  }

  async enablePluginWithChecks(id, manifest) {
    if (!this.runtime) {
      window.toastr?.warning?.('当前环境不支持插件运行');
      return false;
    }
    const pluginId = String(id || '').trim();
    if (!pluginId) return false;
    const isPower = String(manifest?.mode || '').toLowerCase() === 'power';
    if (isPower && !this.store.isPowerApproved(pluginId)) {
      const ok = await appConfirm({
        title: '高权限插件授权',
        message: `插件 ${manifest?.name || pluginId} 需要高权限授权。\n可能包含：网络访问 / 修改提示词 / 写入世界书 等操作。\n确认授权并启用？`,
        confirmText: '授权并启用',
        cancelText: '取消',
        danger: true,
      });
      if (!ok) return false;
      await this.store.setPowerApproved(pluginId, true);
    }
    if (!this.store.isPermissionsApproved(pluginId)) {
      const risky = getRiskyPermissions(manifest);
      if (risky.length) {
        const details = risky.map(p => `${p}（${RISKY_PERMISSIONS.get(p)}）`).join('\n');
        const ok = await appConfirm({
          title: '权限授权确认',
          message: `插件 ${manifest?.name || pluginId} 需要以下权限：\n${details}\n确认授权并启用？`,
          confirmText: '授权并启用',
          cancelText: '取消',
          danger: true,
        });
        if (!ok) return false;
        await this.store.approvePermissions(pluginId);
      }
    }
    await this.store.setEnabled(pluginId, true);
    await this.runtime.enablePlugin(pluginId);
    const status = this.runtime.getStatus(pluginId);
    if (status?.status === 'error') {
      await this.store.setEnabled(pluginId, false);
      await this.runtime.disablePlugin(pluginId);
      window.toastr?.error?.(`启用失败：${status.error || '未知错误'}`);
      return false;
    }
    return true;
  }

  async confirmInstall(manifest, source) {
    const perms = Array.isArray(manifest.permissions) ? manifest.permissions : [];
    const permText = perms.length ? perms.join(', ') : '无';
    const desc = String(manifest.description || '').trim();
    const authorName = manifest.author?.name ? String(manifest.author.name) : '';
    const authorUrl = manifest.author?.url ? String(manifest.author.url) : '';
    let sourceLabel = 'ZIP';
    if (source?.type === 'folder') {
      sourceLabel = `文件夹: ${source.path || ''}`.trim();
    } else if (source?.url) {
      sourceLabel = `链接: ${source.url}`;
    } else if (source?.name) {
      sourceLabel = `ZIP: ${source.name}`;
    }
    const lines = [
      `名称: ${manifest.name || manifest.id || '未知'}`,
      `ID: ${manifest.id || '未知'}`,
      `版本: ${manifest.version || '未知'}`,
      `API: ${manifest.apiVersion || '未知'}`,
      `模式: ${manifest.mode || 'safe'}`,
      `入口: ${manifest.main || 'index.js'}`,
      `作者: ${authorName || '未知'}${authorUrl ? ` (${authorUrl})` : ''}`,
      `来源: ${sourceLabel}`,
      `权限: ${permText}`,
    ];
    if (desc) {
      lines.push('');
      lines.push(`描述: ${desc.slice(0, 200)}${desc.length > 200 ? '…' : ''}`);
    }
    const hasDanger = perms.some(p => RISKY_PERMISSION_SET.has(p));
    const ok = await appConfirm({
      title: '确认安装插件',
      message: lines.join('\n'),
      confirmText: '安装',
      cancelText: '取消',
      danger: hasDanger,
    });
    return ok;
  }

  async renderList() {
    if (!this.listEl) return;
    const items = this.store?.list?.() || [];
    this.listEl.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:24px;text-align:center;color:#94a3b8;font-size:13px;';
      empty.textContent = this.isAndroid
        ? '暂无插件，点击上方“导入插件 ZIP”开始。'
        : '暂无插件，点击上方“导入插件文件夹”开始。';
      this.listEl.appendChild(empty);
      return;
    }

    items.forEach(item => {
      const card = document.createElement('div');
      card.style.cssText = `
        border: 1px solid rgba(148,163,184,0.2);
        border-radius: 12px;
        padding: 12px;
        background: #fff;
        box-shadow: 0 4px 12px rgba(15,23,42,0.05);
        display: flex;
        flex-direction: column;
        gap: 10px;
      `;
      const manifest = item.manifest || {};
      const enabled = Boolean(item.enabled);
      const isPower = String(manifest.mode || '').toLowerCase() === 'power';
      const isApproved = Boolean(item.powerApproved);
      const isBlocked = Boolean(item.blocked);
      const riskyPerms = getRiskyPermissions(manifest);
      const hasRisky = riskyPerms.length > 0;
      const permApproved = this.store?.isPermissionsApproved ? this.store.isPermissionsApproved(item.id) : Boolean(item.permissionApproved);
      const failureCount = Number(item.failureCount || 0) || 0;
      const disabledReason = String(item.disabledReason || '');
      const backupCount = Number(item.backupCount || 0) || 0;

      // 头部：名称 + 版本
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:flex-start;justify-content:space-between;gap:10px;';
      const title = document.createElement('div');
      title.style.cssText = 'flex:1;min-width:0;';
      const name = document.createElement('div');
      name.textContent = `${manifest.name || item.id}`;
      name.style.cssText = 'font-weight:700;color:#0f172a;font-size:14px;';
      const idLine = document.createElement('div');
      idLine.style.cssText = 'font-size:11px;color:#64748b;margin-top:2px;';
      idLine.innerHTML = `${item.id}${manifest.version ? ` <span style="color:#94a3b8;">v${manifest.version}</span>` : ''}`;
      title.appendChild(name);
      title.appendChild(idLine);

      // 更多菜单按钮
      const moreBtn = document.createElement('button');
      moreBtn.textContent = '⋮';
      moreBtn.title = '更多操作';
      moreBtn.style.cssText = `
        border: 1px solid rgba(15,23,42,0.1);
        border-radius: 8px;
        padding: 4px 10px;
        font-size: 16px;
        cursor: pointer;
        background: #fff;
        color: #64748b;
      `;
      moreBtn.onclick = (e) => {
        e.stopPropagation();
        this.showPluginMoreMenu(e.currentTarget, item, manifest, { isPower, isApproved, isBlocked, hasRisky, permApproved, backupCount });
      };

      header.appendChild(title);
      header.appendChild(moreBtn);
      card.appendChild(header);

      // 描述
      if (manifest.description) {
        const desc = document.createElement('div');
        desc.textContent = String(manifest.description || '');
        desc.style.cssText = 'font-size:12px;color:#475569;line-height:1.4;';
        card.appendChild(desc);
      }

      // 状态标签行
      const metaRow = document.createElement('div');
      metaRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;align-items:center;font-size:11px;';
      // 模式标签
      const modeTag = document.createElement('span');
      modeTag.textContent = manifest.mode || 'safe';
      modeTag.style.cssText = `
        padding: 2px 8px;
        border-radius: 999px;
        background: ${isPower ? 'rgba(249,115,22,0.1)' : 'rgba(34,197,94,0.1)'};
        color: ${isPower ? '#ea580c' : '#16a34a'};
        font-size: 10px;
      `;
      metaRow.appendChild(modeTag);
      // 拉黑状态
      if (isBlocked) {
        const blockedTag = document.createElement('span');
        blockedTag.textContent = '已拉黑';
        blockedTag.style.cssText = 'padding:2px 8px;border-radius:999px;background:rgba(239,68,68,0.1);color:#ef4444;font-size:10px;';
        metaRow.appendChild(blockedTag);
      }
      // 授权状态（仅 power 模式）
      if (isPower && !isBlocked) {
        const authTag = document.createElement('span');
        authTag.textContent = isApproved ? '已授权' : '未授权';
        authTag.style.cssText = `padding:2px 8px;border-radius:999px;background:${isApproved ? 'rgba(34,197,94,0.1)' : 'rgba(249,115,22,0.1)'};color:${isApproved ? '#16a34a' : '#f97316'};font-size:10px;`;
        metaRow.appendChild(authTag);
      }
      if (hasRisky && !isBlocked) {
        const permTag = document.createElement('span');
        permTag.textContent = permApproved ? '权限已授权' : '权限未授权';
        permTag.style.cssText = `padding:2px 8px;border-radius:999px;background:${permApproved ? 'rgba(59,130,246,0.1)' : 'rgba(249,115,22,0.12)'};color:${permApproved ? '#2563eb' : '#f97316'};font-size:10px;`;
        metaRow.appendChild(permTag);
      }
      if (failureCount > 0) {
        const failTag = document.createElement('span');
        failTag.textContent = `错误 ${failureCount}`;
        failTag.style.cssText = 'padding:2px 8px;border-radius:999px;background:rgba(239,68,68,0.12);color:#dc2626;font-size:10px;';
        metaRow.appendChild(failTag);
      }
      if (backupCount > 0) {
        const backupTag = document.createElement('span');
        backupTag.textContent = `可回滚 ${backupCount}`;
        backupTag.style.cssText = 'padding:2px 8px;border-radius:999px;background:rgba(15,23,42,0.08);color:#475569;font-size:10px;';
        metaRow.appendChild(backupTag);
      }
      card.appendChild(metaRow);

      // 权限标签
      const permList = Array.isArray(manifest.permissions) ? manifest.permissions : [];
      if (permList.length) {
        const perms = document.createElement('div');
        perms.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
        permList.forEach(p => {
          const badge = document.createElement('span');
          badge.textContent = p;
          badge.style.cssText = `
            font-size: 10px;
            padding: 2px 6px;
            border-radius: 999px;
            background: rgba(59,130,246,0.1);
            color: #2563eb;
          `;
          perms.appendChild(badge);
        });
        card.appendChild(perms);
      }

      // 底部：Toggle 开关
      const footer = document.createElement('div');
      footer.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding-top:8px;border-top:1px solid rgba(15,23,42,0.06);';

      // 运行状态文字
      const statusInfo = this.runtime?.getStatus?.(item.id);
      const statusText = document.createElement('div');
      statusText.style.cssText = 'font-size:11px;color:#64748b;';
      if (isBlocked) {
        statusText.textContent = disabledReason || '已禁用（拉黑）';
        statusText.style.color = '#ef4444';
      } else if (statusInfo?.status === 'error') {
        statusText.textContent = `错误: ${(statusInfo.error || '').slice(0, 30)}`;
        statusText.style.color = '#ef4444';
      } else if (enabled && statusInfo?.status === 'running') {
        statusText.textContent = '运行中';
        statusText.style.color = '#16a34a';
      } else if (enabled) {
        statusText.textContent = '已启用';
      } else {
        statusText.textContent = '已停用';
      }
      footer.appendChild(statusText);

      // Toggle 开关
      const toggleWrap = document.createElement('label');
      toggleWrap.style.cssText = `
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: ${isBlocked ? 'not-allowed' : 'pointer'};
        opacity: ${isBlocked ? '0.5' : '1'};
      `;
      const toggleInput = document.createElement('input');
      toggleInput.type = 'checkbox';
      toggleInput.checked = enabled;
      toggleInput.disabled = isBlocked;
      toggleInput.style.cssText = 'display:none;';
      const toggleTrack = document.createElement('div');
      toggleTrack.style.cssText = `
        width: 40px;
        height: 22px;
        border-radius: 11px;
        background: ${enabled ? '#16a34a' : '#e2e8f0'};
        position: relative;
        transition: background 0.2s;
      `;
      const toggleThumb = document.createElement('div');
      toggleThumb.style.cssText = `
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: #fff;
        position: absolute;
        top: 2px;
        left: ${enabled ? '20px' : '2px'};
        transition: left 0.2s;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
      `;
      toggleTrack.appendChild(toggleThumb);
      toggleWrap.appendChild(toggleInput);
      toggleWrap.appendChild(toggleTrack);

      toggleInput.onchange = async () => {
        if (!this.runtime) {
          window.toastr?.warning?.('当前环境不支持插件运行');
          toggleInput.checked = !toggleInput.checked;
          return;
        }
        if (isBlocked) {
          window.toastr?.warning?.('插件已拉黑，请先解除');
          toggleInput.checked = false;
          return;
        }
        const next = toggleInput.checked;
        if (next) {
          const ok = await this.enablePluginWithChecks(item.id, manifest);
          if (!ok) {
            toggleInput.checked = false;
          }
        } else {
          await this.store.setEnabled(item.id, false);
          await this.runtime.disablePlugin(item.id);
        }
        await this.renderList();
      };
      footer.appendChild(toggleWrap);
      card.appendChild(footer);

      this.listEl.appendChild(card);
    });
  }

  showPluginMoreMenu(anchor, item, manifest, { isPower, isApproved, isBlocked, hasRisky, permApproved, backupCount }) {
    // 如果当前按钮的菜单已存在，则关闭并返回
    const existing = document.querySelector('.plugin-more-menu');
    if (existing && existing._anchorId === item.id) {
      this.closeMoreMenu();
      return;
    }
    // 关闭所有菜单
    this.closeMenus();
    const menu = document.createElement('div');
    menu.className = 'plugin-more-menu';
    menu._anchorId = item.id; // 标记属于哪个插件
    menu.style.cssText = `
      position: fixed;
      background: #fff;
      border: 1px solid rgba(15,23,42,0.1);
      border-radius: 12px;
      box-shadow: 0 8px 24px rgba(15,23,42,0.18);
      padding: 6px;
      z-index: 25000;
      min-width: 140px;
    `;

    const menuItems = [];

    // 授权/撤销授权（仅 power 模式）
    if (isPower) {
      menuItems.push({
        icon: isApproved ? '🔓' : '🔐',
        label: isApproved ? '撤销授权' : '授权',
        danger: isApproved,
        action: async () => {
          if (isApproved) {
            const ok = await appConfirm({
              title: '撤销高权限授权',
              message: `确定撤销插件 ${manifest.name || item.id} 的高权限授权？`,
              danger: true,
            });
            if (!ok) return;
            await this.store.setPowerApproved(item.id, false);
            if (this.runtime) {
              await this.store.setEnabled(item.id, false);
              await this.runtime.disablePlugin(item.id);
            }
          } else {
            const ok = await appConfirm({
              title: '高权限插件授权',
              message: `插件 ${manifest.name || item.id} 需要高权限授权。\n确认授权？`,
              confirmText: '授权',
              cancelText: '取消',
              danger: true,
            });
            if (!ok) return;
            await this.store.setPowerApproved(item.id, true);
          }
          await this.renderList();
        }
      });
    }

    // 权限授权/撤销（风险权限）
    if (hasRisky) {
      menuItems.push({
        icon: permApproved ? '🔓' : '🔐',
        label: permApproved ? '撤销权限授权' : '授权权限',
        danger: permApproved,
        action: async () => {
          if (permApproved) {
            const ok = await appConfirm({
              title: '撤销权限授权',
              message: `确定撤销插件 ${manifest.name || item.id} 的权限授权？`,
              danger: true,
            });
            if (!ok) return;
            await this.store.revokePermissions(item.id);
            if (this.runtime) {
              await this.store.setEnabled(item.id, false);
              await this.runtime.disablePlugin(item.id);
            }
          } else {
            const risky = getRiskyPermissions(manifest);
            const details = risky.map(p => `${p}（${RISKY_PERMISSIONS.get(p)}）`).join('\n');
            const ok = await appConfirm({
              title: '权限授权确认',
              message: `插件 ${manifest.name || item.id} 需要以下权限：\n${details}\n确认授权？`,
              confirmText: '授权',
              cancelText: '取消',
              danger: true,
            });
            if (!ok) return;
            await this.store.approvePermissions(item.id);
          }
          await this.renderList();
        }
      });
    }

    // 拉黑/解除拉黑
    menuItems.push({
      icon: isBlocked ? '✅' : '🚫',
      label: isBlocked ? '解除拉黑' : '拉黑',
      danger: !isBlocked,
      action: async () => {
        if (isBlocked) {
          await this.store.setBlocked(item.id, false);
          await this.renderList();
          return;
        }
        const ok = await appConfirm({
          title: '拉黑插件',
          message: `拉黑插件 ${manifest.name || item.id}？\n拉黑后将无法启用，需手动解除。`,
          danger: true,
        });
        if (!ok) return;
        if (this.runtime) {
          await this.runtime.disablePlugin(item.id);
        }
        await this.store.setBlocked(item.id, true);
        await this.renderList();
      }
    });

    if (backupCount > 0) {
      menuItems.push({
        icon: '⏪',
        label: '回滚到上一版',
        action: async () => {
          const ok = await appConfirm({
            title: '回滚插件版本',
            message: `确定将插件 ${manifest.name || item.id} 回滚到上一版本？\n回滚后需要重新启用。`,
            danger: true,
          });
          if (!ok) return;
          if (this.runtime) {
            await this.runtime.disablePlugin(item.id);
            await this.store.setEnabled(item.id, false);
          }
          const rolled = await this.store.rollbackPlugin(item.id);
          if (!rolled) {
            window.toastr?.warning?.('没有可回滚版本');
          }
          await this.renderList();
        }
      });
    }

    // 删除
    menuItems.push({
      icon: '🗑️',
      label: '删除插件',
      danger: true,
      action: async () => {
        const ok = await appConfirm({
          title: '删除插件',
          message: `确定删除插件 ${manifest.name || item.id}？`,
          danger: true,
        });
        if (!ok) return;
        if (this.runtime) {
          await this.runtime.disablePlugin(item.id);
        }
        await this.store.removePlugin(item.id);
        await this.renderList();
      }
    });

    menuItems.forEach(({ icon, label, danger, action }) => {
      const btn = document.createElement('button');
      btn.style.cssText = `
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 10px 12px;
        border: none;
        background: transparent;
        border-radius: 8px;
        cursor: pointer;
        font-size: 13px;
        text-align: left;
        color: ${danger ? '#ef4444' : '#334155'};
      `;
      btn.innerHTML = `<span style="font-size:14px;">${icon}</span><span>${label}</span>`;
      btn.addEventListener('mouseenter', () => btn.style.background = danger ? 'rgba(239,68,68,0.08)' : '#f1f5f9');
      btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
      btn.addEventListener('click', () => {
        this.closeMoreMenu();
        action();
      });
      menu.appendChild(btn);
    });

    // 定位
    const rect = anchor.getBoundingClientRect();
    const menuHeight = menuItems.length * 44 + 12;
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow < menuHeight && rect.top > menuHeight) {
      menu.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    } else {
      menu.style.top = `${rect.bottom + 4}px`;
    }
    menu.style.right = `${window.innerWidth - rect.right}px`;
    document.body.appendChild(menu);

    // 点击外部关闭
    const closeMenu = (e) => {
      if (!menu.contains(e.target) && e.target !== anchor) {
        this.closeMoreMenu();
      }
    };
    this.moreMenuCloseHandler = closeMenu;
    setTimeout(() => {
      if (this.moreMenuCloseHandler !== closeMenu) return;
      if (!document.body.contains(menu)) return;
      document.addEventListener('pointerdown', closeMenu, true);
    }, 0);
  }
}
