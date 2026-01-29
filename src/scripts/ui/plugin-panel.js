import { appConfirm } from './app-confirm.js';
import { validateManifest } from '../storage/plugin-store.js';
import { safeInvoke } from '../utils/tauri.js';

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
  }

  async show() {
    await this.store?.ready;
    if (!this.element) this.createUI();
    await this.renderList();
    this.element.style.display = 'flex';
    this.overlayElement.style.display = 'block';
  }

  hide() {
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
          <div style="font-size:12px;color:#94a3b8;margin-top:2px;">导入 / 启用 / 禁用插件</div>
        </div>
        <button id="plugin-panel-close" style="border:none;background:rgba(15,23,42,0.08);width:28px;height:28px;border-radius:10px;cursor:pointer;font-size:16px;">×</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid rgba(148,163,184,0.2);background:#f8fafc;">
        <button id="plugin-import-btn" style="padding:6px 12px;border-radius:10px;border:none;background:#2563eb;color:#fff;font-size:13px;cursor:pointer;">导入插件文件夹</button>
        <button id="plugin-import-zip-btn" style="padding:6px 12px;border-radius:10px;border:none;background:#0ea5e9;color:#fff;font-size:13px;cursor:pointer;">导入插件 ZIP</button>
        <button id="plugin-install-url-btn" style="padding:6px 12px;border-radius:10px;border:1px solid rgba(15,23,42,0.1);background:#fff;font-size:13px;cursor:pointer;">安装插件（链接）</button>
        <button id="plugin-refresh-btn" style="padding:6px 12px;border-radius:10px;border:1px solid rgba(15,23,42,0.1);background:#fff;font-size:13px;cursor:pointer;">刷新</button>
        <div id="plugin-status" style="margin-left:auto;font-size:12px;color:#64748b;"></div>
      </div>
      <div id="plugin-list" style="flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px;"></div>
    `;

    this.element.querySelector('#plugin-panel-close')?.addEventListener('click', () => this.hide());
    this.statusEl = this.element.querySelector('#plugin-status');
    this.listEl = this.element.querySelector('#plugin-list');
    const importBtn = this.element.querySelector('#plugin-import-btn');
    const importZipBtn = this.element.querySelector('#plugin-import-zip-btn');
    const installUrlBtn = this.element.querySelector('#plugin-install-url-btn');
    const refreshBtn = this.element.querySelector('#plugin-refresh-btn');

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

    if (this.isAndroid && importBtn) {
      importBtn.disabled = true;
      importBtn.textContent = '导入插件文件夹（安卓不支持）';
      importBtn.title = '安卓端不支持文件夹选择，请使用 ZIP 导入';
      importBtn.style.opacity = '0.55';
      importBtn.style.cursor = 'not-allowed';
      if (this.statusEl) {
        this.statusEl.textContent = '安卓端请使用 ZIP 导入插件';
      }
    } else {
      importBtn?.addEventListener('click', () => {
        if (this.fileInput) {
          this.fileInput.value = '';
          this.fileInput.click();
        }
      });
    }
    importZipBtn?.addEventListener('click', () => {
      if (this.zipInput) {
        this.zipInput.value = '';
        this.zipInput.click();
      }
    });
    installUrlBtn?.addEventListener('click', () => this.handleUrlInstall());
    refreshBtn?.addEventListener('click', () => this.renderList());

    document.body.appendChild(this.overlayElement);
    document.body.appendChild(this.element);
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
    try {
      this.setStatus('正在下载插件…');
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`下载失败 (${res.status})`);
      }
      const buffer = await res.arrayBuffer();
      const name = url.split('/').pop() || 'plugin.zip';
      this.setStatus('正在解析 ZIP…');
      const installed = await this.installFromZipBytes(Array.from(new Uint8Array(buffer)), { name, url });
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
        await this.store.setEnabled(manifest.id, true);
        await this.runtime.enablePlugin(manifest.id);
        await this.renderList();
      }
    } else {
      window.toastr?.warning?.('当前环境不支持插件运行');
    }
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
    const dangerPerms = new Set(['network', 'system.settings', 'ui.inject', 'prompt.modify', 'variables.write']);
    const hasDanger = perms.some(p => dangerPerms.has(p));
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
        gap: 8px;
      `;
      const manifest = item.manifest || {};
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:8px;';
      const title = document.createElement('div');
      title.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
      const name = document.createElement('div');
      name.textContent = `${manifest.name || item.id} ${manifest.version ? `v${manifest.version}` : ''}`.trim();
      name.style.cssText = 'font-weight:700;color:#0f172a;font-size:14px;';
      const idLine = document.createElement('div');
      idLine.textContent = item.id;
      idLine.style.cssText = 'font-size:11px;color:#64748b;';
      title.appendChild(name);
      title.appendChild(idLine);

      const actions = document.createElement('div');
      actions.style.cssText = 'display:flex;align-items:center;gap:6px;';
      const toggleBtn = document.createElement('button');
      const enabled = Boolean(item.enabled);
      toggleBtn.textContent = enabled ? '已启用' : '未启用';
      toggleBtn.style.cssText = `
        border: none;
        border-radius: 10px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        color: ${enabled ? '#fff' : '#0f172a'};
        background: ${enabled ? '#16a34a' : 'rgba(15,23,42,0.08)'};
      `;
      toggleBtn.onclick = async () => {
        if (!this.runtime) {
          window.toastr?.warning?.('当前环境不支持插件运行');
          return;
        }
        const next = !item.enabled;
        await this.store.setEnabled(item.id, next);
        if (next) {
          await this.runtime.enablePlugin(item.id);
        } else {
          await this.runtime.disablePlugin(item.id);
        }
        await this.renderList();
      };
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '删除';
      removeBtn.style.cssText = `
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 10px;
        padding: 6px 10px;
        font-size: 12px;
        cursor: pointer;
        color: #ef4444;
        background: #fff;
      `;
      removeBtn.onclick = async () => {
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
      };
      actions.appendChild(toggleBtn);
      actions.appendChild(removeBtn);

      header.appendChild(title);
      header.appendChild(actions);
      card.appendChild(header);

      if (manifest.description) {
        const desc = document.createElement('div');
        desc.textContent = String(manifest.description || '');
        desc.style.cssText = 'font-size:12px;color:#475569;line-height:1.4;';
        card.appendChild(desc);
      }

      const metaRow = document.createElement('div');
      metaRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;font-size:11px;color:#64748b;';
      const mode = document.createElement('span');
      mode.textContent = `模式: ${manifest.mode || 'safe'}`;
      metaRow.appendChild(mode);
      const statusInfo = this.runtime?.getStatus?.(item.id);
      if (statusInfo?.status && statusInfo.status !== 'running') {
        const statusTag = document.createElement('span');
        statusTag.textContent = `状态: ${statusInfo.status}`;
        statusTag.style.color = statusInfo.status === 'error' ? '#ef4444' : '#64748b';
        metaRow.appendChild(statusTag);
      }
      card.appendChild(metaRow);

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

      this.listEl.appendChild(card);
    });
  }
}
