/**
 * Runtime diagnostics panel for user-facing support exports.
 */

import { appSettings } from '../storage/app-settings.js';
import { pickSavePath as pickNativeSavePath } from '../utils/save-dialog.js';
import { safeInvoke } from '../utils/tauri.js';

export class DebugPanel {
    constructor() {
        this.panel = null;
        this.logContainer = null;
        this.controls = null;
        this.logs = [];
        this.maxLogs = 30;
        this.isVisible = false;
        this.autoHideTimer = null;
        this.toggleBtn = null;
        this.enabled = false;
        this.seenMessages = new Set();
        this.customBundleInspectBtn = null;
        this.errorLogBtn = null;
        this.filterInput = null;
        this.filterClearBtn = null;
        this.copyLogBtn = null;
        this.filterText = '';
        this.customBundleOverlay = null;
        this.customBundlePanel = null;
        this.customBundleMeta = null;
        this.customBundleText = null;
        this.customBundleRefresh = null;
        this.customBundleExport = null;
        this.errorLogOverlay = null;
        this.errorLogPanel = null;
        this.errorLogMeta = null;
        this.errorLogText = null;
        this.errorLogRefresh = null;
        this.errorLogExport = null;
        this.debugLogListener = null;
    }

    init() {
        if (this.panel) return;

        this.panel = document.createElement('div');
        this.panel.id = 'debug-panel';
        this.panel.style.cssText = `
            position: fixed;
            bottom: calc(60px + env(safe-area-inset-bottom, 0px));
            left: 0;
            right: 0;
            max-height: 250px;
            background: rgba(0, 0, 0, 0.95);
            color: #00ff00;
            font-family: monospace;
            font-size: 10px;
            padding: 8px;
            z-index: 30000;
            display: none;
            border-top: 2px solid #00ff00;
            box-sizing: border-box;
            flex-direction: column;
        `;

        this.controls = document.createElement('div');
        this.controls.style.cssText = `
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 6px;
            padding-bottom: 6px;
            margin-bottom: 6px;
            border-bottom: 1px dashed #00ff00;
        `;

        const customBundleInspectBtn = document.createElement('button');
        customBundleInspectBtn.type = 'button';
        customBundleInspectBtn.textContent = '资料包';
        customBundleInspectBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        customBundleInspectBtn.onclick = () => this.showCustomBundleInspector();
        this.customBundleInspectBtn = customBundleInspectBtn;
        this.controls.appendChild(customBundleInspectBtn);

        const errorLogBtn = document.createElement('button');
        errorLogBtn.type = 'button';
        errorLogBtn.textContent = '错误日志';
        errorLogBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        errorLogBtn.onclick = () => this.showErrorLogs();
        this.errorLogBtn = errorLogBtn;
        this.controls.appendChild(errorLogBtn);

        const filterWrap = document.createElement('div');
        filterWrap.style.cssText = `
            display: flex;
            align-items: center;
            gap: 4px;
            margin-left: auto;
        `;
        const clearLogBtn = document.createElement('button');
        clearLogBtn.type = 'button';
        clearLogBtn.textContent = '∅';
        clearLogBtn.title = '清空日志';
        clearLogBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
            opacity: 0.9;
        `;
        clearLogBtn.onclick = () => {
            this.clear();
            if (this.filterInput) this.filterInput.value = '';
            this.filterText = '';
            this.render();
        };
        const copyLogBtn = document.createElement('button');
        copyLogBtn.type = 'button';
        copyLogBtn.textContent = '⧉';
        copyLogBtn.title = '复制当前日志';
        copyLogBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
            opacity: 0.9;
        `;
        copyLogBtn.onclick = () => this.copyVisibleLogs();
        const filterInput = document.createElement('input');
        filterInput.type = 'text';
        filterInput.placeholder = '筛选日志...';
        filterInput.style.cssText = `
            width: 120px;
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            outline: none;
        `;
        const filterClearBtn = document.createElement('button');
        filterClearBtn.type = 'button';
        filterClearBtn.textContent = '×';
        filterClearBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
            opacity: 0.8;
        `;
        filterInput.addEventListener('input', (e) => {
            const val = String(e?.target?.value || '');
            this.filterText = val;
            this.render();
        });
        filterClearBtn.onclick = () => {
            this.filterText = '';
            filterInput.value = '';
            this.render();
            filterInput.focus();
        };
        filterWrap.appendChild(clearLogBtn);
        filterWrap.appendChild(copyLogBtn);
        filterWrap.appendChild(filterInput);
        filterWrap.appendChild(filterClearBtn);
        this.controls.appendChild(filterWrap);
        this.filterInput = filterInput;
        this.filterClearBtn = filterClearBtn;
        this.copyLogBtn = copyLogBtn;

        this.logContainer = document.createElement('div');
        this.logContainer.style.cssText = `
            flex: 1;
            min-height: 0;
            overflow-y: auto;
        `;

        this.panel.appendChild(this.controls);
        this.panel.appendChild(this.logContainer);

        document.body.appendChild(this.panel);

        // 添加一个小按钮来切换显示
        const toggleBtn = document.createElement('button');
        toggleBtn.id = 'debug-toggle';
        toggleBtn.textContent = '诊断';
        toggleBtn.style.cssText = `
            position: fixed;
            bottom: calc(70px + env(safe-area-inset-bottom, 0px));
            right: 10px;
            padding: 4px 8px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            z-index: 30001;
            font-family: monospace;
            font-weight: bold;
        `;
        toggleBtn.onclick = () => this.toggle();
        document.body.appendChild(toggleBtn);
        this.toggleBtn = toggleBtn;

        const settings = appSettings.get();
        this.setEnabled(Boolean(settings.showDebugToggle));
        this.debugLogListener = (ev) => {
            const detail = ev?.detail || {};
            const type = detail.type || 'info';
            const source = String(detail.source || '').trim();
            const message = String(detail.message || '').trim();
            if (!message) return;
            const prefix = source ? `[${source}] ` : '';
            this.log(`${prefix}${message}`, type);
        };
        window.addEventListener('app-debug-log', this.debugLogListener);

        // APP启动时自动显示5秒，让用户看到加载日志（仅在启用时）
        this.log('=== APP 启动，调试面板已激活 ===', 'info');
        if (this.enabled) {
            this.show();
            this.autoHideTimer = setTimeout(() => {
                if (this.logs.length < 3) {
                    // 如果日志很少，说明可能没有重要信息，自动隐藏
                    this.hide();
                }
            }, 8000); // 8秒后自动隐藏
        }
    }

    show() {
        if (!this.panel) return;
        this.panel.style.display = 'flex';
        this.isVisible = true;
        this.scrollToBottom();
        // 取消自动隐藏定时器（如果用户手动打开）
        if (this.autoHideTimer) {
            clearTimeout(this.autoHideTimer);
            this.autoHideTimer = null;
        }
    }

    hide() {
        if (!this.panel) return;
        this.panel.style.display = 'none';
        this.isVisible = false;
    }

    setEnabled(enabled) {
        this.enabled = Boolean(enabled);
        if (this.toggleBtn) {
            this.toggleBtn.style.display = this.enabled ? 'block' : 'none';
        }
        if (!this.enabled) {
            this.hide();
            if (this.autoHideTimer) {
                clearTimeout(this.autoHideTimer);
                this.autoHideTimer = null;
            }
        }
    }

    toggle() {
        if (!this.panel) return;
        if (this.isVisible) {
            this.hide();
        } else {
            this.show();
        }
    }

    getVisibleLogs() {
        let list = this.logs;
        const term = String(this.filterText || '').trim().toLowerCase();
        if (term) {
            list = list.filter(log => String(log?.message || '').toLowerCase().includes(term));
        }
        return list;
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
        const prefix = type === 'error' ? '❌' : type === 'warn' ? '⚠️' : '✓';
        const color = type === 'error' ? '#ff0000' : type === 'warn' ? '#ffaa00' : '#00ff00';
        const key = `${type}|${message}`;
        if (this.seenMessages.has(key)) return;
        this.seenMessages.add(key);

        this.logs.push({ timestamp, message, color, prefix, key, type });
        if (this.logs.length > this.maxLogs) {
            const removed = this.logs.shift();
            if (removed?.key) this.seenMessages.delete(removed.key);
        }

        this.render();
    }

    render() {
        if (!this.logContainer) return;

        const list = this.getVisibleLogs();

        this.logContainer.innerHTML = list.map(log =>
            `<div style="color: ${log.color}; margin-bottom: 2px;">${log.prefix} [${log.timestamp}] ${log.message}</div>`
        ).join('');

        this.scrollToBottom();
    }

    scrollToBottom() {
        if (this.logContainer) {
            this.logContainer.scrollTop = this.logContainer.scrollHeight;
        }
    }

    clear() {
        this.logs = [];
        this.seenMessages.clear();
        if (this.logContainer) {
            this.logContainer.innerHTML = '';
        }
    }

    async copyVisibleLogs() {
        const list = this.getVisibleLogs();
        if (!list.length) {
            window.toastr?.warning?.('暂无日志可复制');
            return;
        }
        const text = list.map(log => `${log.prefix} [${log.timestamp}] ${log.message}`).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            window.toastr?.success?.(`已复制 ${list.length} 条日志`);
        } catch {
            try {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.position = 'fixed';
                ta.style.left = '-9999px';
                ta.style.top = '0';
                ta.setAttribute('readonly', 'true');
                document.body.appendChild(ta);
                ta.select();
                document.execCommand?.('copy');
                ta.remove();
                window.toastr?.success?.(`已复制 ${list.length} 条日志`);
            } catch {
                window.toastr?.error?.('复制失败');
            }
        }
    }

    ensureCustomBundleInspector() {
        if (this.customBundleOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'debug-custom-bundle-overlay';
        overlay.style.cssText = `
            display:none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.38);
            z-index: 22050;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing: border-box;
        `;
        const panel = document.createElement('div');
        panel.id = 'debug-custom-bundle-panel';
        panel.style.cssText = `
            width: 100%;
            height: 100%;
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:900;">资料包导入诊断</div>
                <div id="debug-custom-bundle-meta" style="margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="debug-custom-bundle-refresh" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="debug-custom-bundle-export" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">导出</button>
                <button id="debug-custom-bundle-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                <textarea id="debug-custom-bundle-text" readonly style="
                    width:100%;
                    height:100%;
                    min-height: 100%;
                    resize:none;
                    border:1px solid rgba(0,0,0,0.10);
                    border-radius:12px;
                    padding:12px;
                    font-size:12px;
                    line-height:1.4;
                    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                    white-space: pre;
                    box-sizing:border-box;
                    outline:none;
                "></textarea>
            </div>
        `;
        overlay.appendChild(panel);
        overlay.addEventListener('click', () => this.hideCustomBundleInspector());
        document.body.appendChild(overlay);

        this.customBundleOverlay = overlay;
        this.customBundlePanel = panel;
        this.customBundleMeta = panel.querySelector('#debug-custom-bundle-meta');
        this.customBundleText = panel.querySelector('#debug-custom-bundle-text');
        this.customBundleRefresh = panel.querySelector('#debug-custom-bundle-refresh');
        this.customBundleExport = panel.querySelector('#debug-custom-bundle-export');

        panel.querySelector('#debug-custom-bundle-close')?.addEventListener('click', () => this.hideCustomBundleInspector());
        panel.querySelector('#debug-custom-bundle-refresh')?.addEventListener('click', () => this.refreshCustomBundleInspector());
        panel.querySelector('#debug-custom-bundle-export')?.addEventListener('click', () => this.exportCustomBundleDiagnostics());
    }

    hideCustomBundleInspector() {
        if (this.customBundleOverlay) {
            this.customBundleOverlay.style.display = 'none';
        }
    }

    formatCustomBundleDiagnostics(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return '暂无自定义资料包导入诊断';
        try {
            return JSON.stringify(snapshot, null, 2);
        } catch {
            return String(snapshot || '');
        }
    }

    async exportTextFile(text, filename, successLabel = 'TXT 已导出') {
        const content = String(text || '');
        if (!content.trim()) return false;
        const hasTauriRuntime = (() => {
            const g = typeof globalThis !== 'undefined' ? globalThis : window;
            return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || g?.__TAURI_INVOKE__);
        })();
        const isAndroid = (() => {
            try {
                return /android/i.test(navigator.userAgent || '');
            } catch {
                return false;
            }
        })();
        const buildTextDataUrl = (value) => {
            const bytes = new TextEncoder().encode(String(value || ''));
            let binary = '';
            const chunkSize = 0x8000;
            for (let i = 0; i < bytes.length; i += chunkSize) {
                binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
            }
            return `data:text/plain;charset=utf-8;base64,${btoa(binary)}`;
        };

        if (!hasTauriRuntime) {
            const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            window.toastr?.success?.(`${successLabel}：${filename}`);
            return true;
        }

        let savedPath = '';
        if (!isAndroid) {
            const pick = await pickNativeSavePath({
                defaultName: filename,
                filters: [{ name: 'Text', extensions: ['txt'] }],
            });
            if (pick.cancelled) return false;
            if (!pick.fallback && pick.path) {
                const resp = await safeInvoke('export_attachment', {
                    dataUrl: buildTextDataUrl(content),
                    fileName: filename,
                    path: pick.path,
                });
                savedPath = String(resp?.path || pick.path || '').trim();
            }
        }

        if (!savedPath) {
            const resp = await safeInvoke('export_attachment', {
                dataUrl: buildTextDataUrl(content),
                fileName: filename,
            });
            savedPath = String(resp?.path || '').trim();
        }
        window.toastr?.success?.(`${successLabel}：${savedPath || filename}`);
        return true;
    }

    async exportCustomBundleDiagnostics() {
        try {
            const text = String(this.customBundleText?.value || '');
            if (!text.trim()) {
                window.toastr?.warning?.('暂无资料包导入诊断可导出');
                return;
            }
            const ts = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const filename = `custom-bundle-import-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.txt`;
            await this.exportTextFile(text, filename, '资料包诊断已导出');
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`资料包诊断导出失败: ${msg || 'unknown error'}`, 'warn');
            window.toastr?.error?.('资料包诊断导出失败');
        }
    }

    async refreshCustomBundleInspector() {
        if (!this.customBundleOverlay || !this.customBundleText) return;
        try {
            const registry = window.appBridge?.debugUiRegistry;
            const snapshot = registry?.stores?.customBundleDiagnostics || null;
            const lastImport = snapshot?.lastImport || null;
            const historyCount = Array.isArray(snapshot?.history) ? snapshot.history.length : 0;
            const fileName = String(lastImport?.fileName || '').trim() || '未命名';
            const phase = String(lastImport?.phase || '').trim() || 'none';
            const durationMs = Number(lastImport?.durationMs || 0) || 0;
            if (this.customBundleMeta) {
                this.customBundleMeta.textContent = `phase=${phase} · duration=${durationMs}ms · history=${historyCount} · file=${fileName}`;
            }
            this.customBundleText.value = this.formatCustomBundleDiagnostics(snapshot);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            if (this.customBundleMeta) this.customBundleMeta.textContent = `加载失败: ${msg || 'unknown error'}`;
            if (this.customBundleText) this.customBundleText.value = `资料包导入诊断加载失败\n\n${msg || 'unknown error'}`;
            this.log(`资料包导入诊断加载失败: ${msg || 'unknown error'}`, 'warn');
        }
    }

    async showCustomBundleInspector() {
        this.ensureCustomBundleInspector();
        if (this.customBundleOverlay) {
            this.customBundleOverlay.style.display = 'block';
        }
        await this.refreshCustomBundleInspector();
    }

    ensureErrorLogViewer() {
        if (this.errorLogOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'debug-error-log-overlay';
        overlay.style.cssText = `
            display:none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.38);
            z-index: 22050;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing: border-box;
        `;
        const panel = document.createElement('div');
        panel.id = 'debug-error-log-panel';
        panel.style.cssText = `
            width: 100%;
            height: 100%;
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:900;">错误日志</div>
                <div id="debug-error-log-meta" style="margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="debug-error-log-refresh" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="debug-error-log-export" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">导出</button>
                <button id="debug-error-log-copy" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">复制</button>
                <button id="debug-error-log-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                <textarea id="debug-error-log-text" readonly style="
                    width:100%;
                    height:100%;
                    min-height: 100%;
                    resize:none;
                    border:1px solid rgba(0,0,0,0.10);
                    border-radius:12px;
                    padding:12px;
                    font-size:12px;
                    line-height:1.4;
                    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                    white-space: pre;
                    box-sizing:border-box;
                    outline:none;
                "></textarea>
            </div>
        `;
        overlay.appendChild(panel);
        overlay.addEventListener('click', () => this.hideErrorLogs());
        document.body.appendChild(overlay);

        this.errorLogOverlay = overlay;
        this.errorLogPanel = panel;
        this.errorLogMeta = panel.querySelector('#debug-error-log-meta');
        this.errorLogText = panel.querySelector('#debug-error-log-text');
        this.errorLogRefresh = panel.querySelector('#debug-error-log-refresh');
        this.errorLogExport = panel.querySelector('#debug-error-log-export');

        panel.querySelector('#debug-error-log-close')?.addEventListener('click', () => this.hideErrorLogs());
        panel.querySelector('#debug-error-log-refresh')?.addEventListener('click', () => this.refreshErrorLogs());
        panel.querySelector('#debug-error-log-export')?.addEventListener('click', () => this.exportErrorLogs());
        panel.querySelector('#debug-error-log-copy')?.addEventListener('click', async () => {
            const text = String(this.errorLogText?.value || '');
            if (!text) {
                window.toastr?.warning?.('暂无内容可复制');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                window.toastr?.success?.('已复制');
            } catch {
                try {
                    this.errorLogText?.select?.();
                    document.execCommand?.('copy');
                    window.toastr?.success?.('已复制');
                } catch {
                    window.toastr?.error?.('复制失败');
                }
            }
        });
    }

    hideErrorLogs() {
        if (this.errorLogOverlay) {
            this.errorLogOverlay.style.display = 'none';
        }
    }

    formatErrorLogs() {
        const list = this.logs.filter(log => log.type === 'error' || log.type === 'warn');
        if (!list.length) return '暂无错误日志';
        return list.map(log => `${log.prefix}[${log.timestamp}] ${log.message}`).join('\n');
    }

    refreshErrorLogs() {
        if (!this.errorLogOverlay || !this.errorLogText) return;
        const list = this.logs.filter(log => log.type === 'error' || log.type === 'warn');
        if (this.errorLogMeta) this.errorLogMeta.textContent = `共 ${list.length} 条`;
        this.errorLogText.value = this.formatErrorLogs();
    }

    showErrorLogs() {
        this.ensureErrorLogViewer();
        if (this.errorLogOverlay) {
            this.errorLogOverlay.style.display = 'block';
        }
        this.refreshErrorLogs();
    }

    exportErrorLogs() {
        try {
            const text = this.formatErrorLogs();
            if (!text.trim()) {
                window.toastr?.warning?.('暂无内容可导出');
                return;
            }
            const ts = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const filename = `app-debug-errors-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.txt`;
            const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.style.display = 'none';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`导出失败: ${msg || 'unknown error'}`, 'warn');
            window.toastr?.error?.('导出失败');
        }
    }

}

// 全局单例
let debugPanelInstance = null;

export function getDebugPanel() {
    if (!debugPanelInstance) {
        debugPanelInstance = new DebugPanel();
        debugPanelInstance.init();
    }
    return debugPanelInstance;
}
