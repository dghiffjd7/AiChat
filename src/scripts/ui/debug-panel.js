/**
 * Debug panel - show config status on screen for Android debugging
 */

import { appSettings } from '../storage/app-settings.js';
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
        this.smokeBtn = null;
        this.smokeTestRunning = false;
        this.smokeRunId = 0;
        this.memoryModeBtn = null;
        this.memoryInspectBtn = null;
        this.stickerDebugBtn = null;
        this.variableInspectBtn = null;
        this.groupAvatarInspectBtn = null;
        this.templateLogBtn = null;
        this.promptPreviewBtn = null;
        this.errorLogBtn = null;
        this.heightDiagBtn = null;
        this.themeAuditBtn = null;
        this.filterInput = null;
        this.filterClearBtn = null;
        this.copyLogBtn = null;
        this.filterText = '';
        this.quickFilterMode = 'none';
        this.memoryInspectorOverlay = null;
        this.memoryInspectorPanel = null;
        this.memoryInspectorMeta = null;
        this.memoryInspectorTokens = null;
        this.memoryInspectorIncluded = null;
        this.memoryInspectorTruncated = null;
        this.memoryInspectorPrompt = null;
        this.memoryInspectorRefresh = null;
        this.variableInspectorOverlay = null;
        this.variableInspectorPanel = null;
        this.variableInspectorMeta = null;
        this.variableInspectorText = null;
        this.variableInspectorRefresh = null;
        this.groupAvatarOverlay = null;
        this.groupAvatarPanel = null;
        this.groupAvatarMeta = null;
        this.groupAvatarText = null;
        this.groupAvatarRefresh = null;
        this.templateLogOverlay = null;
        this.templateLogPanel = null;
        this.templateLogMeta = null;
        this.templateLogText = null;
        this.templateLogRefresh = null;
        this.templateLogClear = null;
        this.errorLogOverlay = null;
        this.errorLogPanel = null;
        this.errorLogMeta = null;
        this.errorLogText = null;
        this.errorLogRefresh = null;
        this.errorLogExport = null;
        this.themeAuditOverlay = null;
        this.themeAuditPanel = null;
        this.themeAuditMeta = null;
        this.themeAuditSummary = null;
        this.themeAuditList = null;
        this.themeAuditListTitle = null;
        this.themeAuditRefresh = null;
        this.themeAuditBatchBtn = null;
        this.themeAuditReport = null;
        this.themeAuditIssues = [];
        this.themeAuditLastReportText = '';
        this.themeAuditCopyText = '';
        this.themeAuditModule = null;
        this.themeAuditBatchModule = null;
        this.themeAuditMode = 'single';
        this.themeAuditBatchResult = null;
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

        const smokeBtn = document.createElement('button');
        smokeBtn.type = 'button';
        smokeBtn.textContent = 'DB 烟测';
        smokeBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        smokeBtn.onclick = () => this.runMemoryDbSmokeTest();
        this.smokeBtn = smokeBtn;
        this.controls.appendChild(smokeBtn);

        const inspectBtn = document.createElement('button');
        inspectBtn.type = 'button';
        inspectBtn.textContent = '记忆检查器';
        inspectBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        inspectBtn.onclick = () => this.showMemoryInspector();
        this.memoryInspectBtn = inspectBtn;
        this.controls.appendChild(inspectBtn);

        const memoryModeBtn = document.createElement('button');
        memoryModeBtn.type = 'button';
        memoryModeBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        memoryModeBtn.onclick = () => this.toggleMemoryMode();
        this.memoryModeBtn = memoryModeBtn;
        this.controls.appendChild(memoryModeBtn);

        const stickerDebugBtn = document.createElement('button');
        stickerDebugBtn.type = 'button';
        stickerDebugBtn.textContent = '贴图调试';
        stickerDebugBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        stickerDebugBtn.onclick = () => this.runStickerDebug();
        this.stickerDebugBtn = stickerDebugBtn;
        this.controls.appendChild(stickerDebugBtn);

        const variableInspectBtn = document.createElement('button');
        variableInspectBtn.type = 'button';
        variableInspectBtn.textContent = '变量';
        variableInspectBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        variableInspectBtn.onclick = () => this.showVariableInspector();
        this.variableInspectBtn = variableInspectBtn;
        this.controls.appendChild(variableInspectBtn);

        const groupAvatarInspectBtn = document.createElement('button');
        groupAvatarInspectBtn.type = 'button';
        groupAvatarInspectBtn.textContent = '群聊头像';
        groupAvatarInspectBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        groupAvatarInspectBtn.onclick = () => this.showGroupAvatarInspector();
        this.groupAvatarInspectBtn = groupAvatarInspectBtn;
        this.controls.appendChild(groupAvatarInspectBtn);

        const templateLogBtn = document.createElement('button');
        templateLogBtn.type = 'button';
        templateLogBtn.textContent = '模板日志';
        templateLogBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        templateLogBtn.onclick = () => this.showTemplateLogs();
        this.templateLogBtn = templateLogBtn;
        this.controls.appendChild(templateLogBtn);

        const promptPreviewBtn = document.createElement('button');
        promptPreviewBtn.type = 'button';
        promptPreviewBtn.textContent = 'Prompt';
        promptPreviewBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        promptPreviewBtn.onclick = () => this.showPromptPreview();
        this.promptPreviewBtn = promptPreviewBtn;
        this.controls.appendChild(promptPreviewBtn);

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

        const heightDiagBtn = document.createElement('button');
        heightDiagBtn.type = 'button';
        heightDiagBtn.textContent = '高度诊断';
        heightDiagBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        heightDiagBtn.onclick = () => this.toggleHeightDiagnosticsFilter();
        this.heightDiagBtn = heightDiagBtn;
        this.controls.appendChild(heightDiagBtn);

        const themeAuditBtn = document.createElement('button');
        themeAuditBtn.type = 'button';
        themeAuditBtn.textContent = '主题审计';
        themeAuditBtn.style.cssText = `
            padding: 2px 6px;
            background: rgba(0, 0, 0, 0.8);
            color: #00ff00;
            border: 1px solid #00ff00;
            border-radius: 4px;
            font-size: 10px;
            font-family: monospace;
            cursor: pointer;
        `;
        themeAuditBtn.onclick = () => this.showThemeAuditViewer();
        this.themeAuditBtn = themeAuditBtn;
        this.controls.appendChild(themeAuditBtn);

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
        this.updateQuickFilterButtons();

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
        toggleBtn.textContent = 'DEBUG';
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
        this.updateMemoryModeButton();
        window.addEventListener('app-settings-changed', (ev) => {
            try {
                if (ev?.detail?.key === 'memoryStorageMode' || ev?.detail?.key === 'memoryEnabled') {
                    this.updateMemoryModeButton();
                }
            } catch {}
        });
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

    getMemoryMode() {
        if (appSettings.get().memoryEnabled === false) return 'off';
        const mode = String(appSettings.get().memoryStorageMode || 'table').toLowerCase();
        return mode === 'table' ? 'table' : 'summary';
    }

    updateMemoryModeButton() {
        if (!this.memoryModeBtn) return;
        const mode = this.getMemoryMode();
        this.memoryModeBtn.textContent = mode === 'table' ? '记忆: 表格' : mode === 'summary' ? '记忆: 摘要' : '记忆: 关闭';
    }

    toggleMemoryMode() {
        const current = this.getMemoryMode();
        const next = current === 'table' ? 'summary' : current === 'summary' ? 'off' : 'table';
        const patch = next === 'off' ? { memoryEnabled: false } : { memoryEnabled: true, memoryStorageMode: next };
        appSettings.update(patch);
        window.dispatchEvent(new CustomEvent('memory-storage-mode-changed', { detail: { mode: next } }));
        window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryEnabled', value: next !== 'off' } }));
        if (next !== 'off') {
            window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryStorageMode', value: next } }));
        }
        this.updateMemoryModeButton();
        this.log(`[记忆模式] 已切换为 ${next === 'table' ? '表格' : next === 'summary' ? '摘要' : '关闭'}`);
    }

    async runStickerDebug() {
        const runId = Math.random().toString(36).slice(2, 6);
        this.filterText = '';
        if (this.filterInput) this.filterInput.value = '';
        this.render();
        try {
            const { logStickerDebugInfo } = await import('../utils/sticker-debug.js');
            await logStickerDebugInfo(this, runId);
        } catch (err) {
            this.log(`[#${runId}] 贴图调试失败: ${err.message}`, 'error');
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

    isHeightDiagnosticLog(message = '') {
        const text = String(message || '').toLowerCase();
        if (!text) return false;
        return (
            text.includes('[rich]') ||
            text.includes('[iframe]') ||
            text.includes('[iframe-height]')
        );
    }

    getVisibleLogs() {
        let list = this.logs;
        if (this.quickFilterMode === 'height') {
            list = list.filter(log => this.isHeightDiagnosticLog(log?.message || ''));
        }
        const term = String(this.filterText || '').trim().toLowerCase();
        if (term) {
            list = list.filter(log => String(log?.message || '').toLowerCase().includes(term));
        }
        return list;
    }

    updateQuickFilterButtons() {
        if (!this.heightDiagBtn) return;
        const active = this.quickFilterMode === 'height';
        this.heightDiagBtn.style.background = active ? '#00ff00' : 'rgba(0, 0, 0, 0.8)';
        this.heightDiagBtn.style.color = active ? '#001500' : '#00ff00';
        this.heightDiagBtn.style.fontWeight = active ? '700' : '400';
        this.heightDiagBtn.title = active
            ? '已启用：仅显示高度相关日志'
            : '点击后仅显示 rich/iframe/iframe-height 日志';
    }

    toggleHeightDiagnosticsFilter() {
        this.quickFilterMode = this.quickFilterMode === 'height' ? 'none' : 'height';
        if (this.filterInput && this.quickFilterMode === 'height') {
            this.filterInput.value = '';
            this.filterText = '';
        }
        this.updateQuickFilterButtons();
        this.render();
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

    async runMemoryDbSmokeTest() {
        if (this.smokeTestRunning) return;
        this.smokeTestRunning = true;
        const runId = ++this.smokeRunId;
        if (this.smokeBtn) {
            this.smokeBtn.disabled = true;
            this.smokeBtn.style.opacity = '0.6';
            this.smokeBtn.style.cursor = 'not-allowed';
        }
        this.log(`[#${runId}] Memory DB 烟测开始`);
        try {
            const store = window.appBridge?.memoryTableStore;
            if (!store || typeof store.getMemories !== 'function') {
                this.log(`[#${runId}] Memory DB 烟测失败：memoryTableStore 未就绪`, 'warn');
                return;
            }
            const scope = String(store.scopeId || '').trim();
            const rows = await store.getMemories({});
            const count = Array.isArray(rows) ? rows.length : 0;
            const label = scope ? `scope=${scope}` : 'scope=default';
            this.log(`[#${runId}] Memory DB 烟测成功：${count} 条 (${label})`);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`[#${runId}] Memory DB 烟测失败：${msg || 'unknown error'}`, 'error');
        } finally {
            this.smokeTestRunning = false;
            if (this.smokeBtn) {
                this.smokeBtn.disabled = false;
                this.smokeBtn.style.opacity = '1';
                this.smokeBtn.style.cursor = 'pointer';
            }
        }
    }

    ensureMemoryInspector() {
        if (this.memoryInspectorOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'memory-inspector-overlay';
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
        panel.id = 'memory-inspector-panel';
        panel.style.cssText = `
            width: 100%;
            height: 100%;
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:900;">记忆检查器</div>
                <div id="memory-inspector-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="memory-inspector-refresh" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="memory-inspector-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                <button id="memory-inspector-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:12px; display:flex; flex-direction:column; gap:12px;">
                <div id="memory-inspector-tokens" style="font-size:12px; color:#475569;"></div>
                <div>
                    <div style="font-weight:700; margin-bottom:6px;">将注入的记忆</div>
                    <div id="memory-inspector-included" style="display:flex; flex-direction:column; gap:6px; font-size:12px;"></div>
                </div>
                <div>
                    <div style="font-weight:700; margin-bottom:6px;">被截断的记忆</div>
                    <div id="memory-inspector-truncated" style="display:flex; flex-direction:column; gap:6px; font-size:12px;"></div>
                </div>
                <div style="flex:1; min-height:120px; display:flex; flex-direction:column; gap:6px;">
                    <div style="font-weight:700;">Prompt 预览</div>
                    <textarea id="memory-inspector-prompt" readonly style="
                        flex:1;
                        min-height: 140px;
                        width:100%;
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
            </div>
        `;
        overlay.appendChild(panel);
        overlay.addEventListener('click', () => this.hideMemoryInspector());
        document.body.appendChild(overlay);

        this.memoryInspectorOverlay = overlay;
        this.memoryInspectorPanel = panel;
        this.memoryInspectorMeta = panel.querySelector('#memory-inspector-meta');
        this.memoryInspectorTokens = panel.querySelector('#memory-inspector-tokens');
        this.memoryInspectorIncluded = panel.querySelector('#memory-inspector-included');
        this.memoryInspectorTruncated = panel.querySelector('#memory-inspector-truncated');
        this.memoryInspectorPrompt = panel.querySelector('#memory-inspector-prompt');
        this.memoryInspectorRefresh = panel.querySelector('#memory-inspector-refresh');

        panel.querySelector('#memory-inspector-close')?.addEventListener('click', () => this.hideMemoryInspector());
        panel.querySelector('#memory-inspector-refresh')?.addEventListener('click', () => this.refreshMemoryInspector());
        panel.querySelector('#memory-inspector-copy')?.addEventListener('click', async () => {
            const text = String(this.memoryInspectorPrompt?.value || '');
            if (!text) {
                window.toastr?.warning?.('暂无内容可复制');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                window.toastr?.success?.('已复制');
            } catch {
                try {
                    this.memoryInspectorPrompt?.select?.();
                    document.execCommand?.('copy');
                    window.toastr?.success?.('已复制');
                } catch {
                    window.toastr?.error?.('复制失败');
                }
            }
        });
    }

    hideMemoryInspector() {
        if (this.memoryInspectorOverlay) {
            this.memoryInspectorOverlay.style.display = 'none';
        }
    }

    renderMemoryInspector(plan) {
        const metaEl = this.memoryInspectorMeta;
        const tokensEl = this.memoryInspectorTokens;
        const includedEl = this.memoryInspectorIncluded;
        const truncatedEl = this.memoryInspectorTruncated;
        const promptEl = this.memoryInspectorPrompt;
        if (!metaEl || !tokensEl || !includedEl || !truncatedEl || !promptEl) return;

        const clearList = (el) => {
            if (el) el.innerHTML = '';
        };
        const addEmpty = (el, text) => {
            if (!el) return;
            const div = document.createElement('div');
            div.style.cssText = 'color:#94a3b8;';
            div.textContent = text;
            el.appendChild(div);
        };
        const formatTime = (ts) => {
            const num = Number(ts || 0);
            if (!Number.isFinite(num) || num <= 0) return '';
            try {
                return new Date(num).toLocaleString();
            } catch {
                return '';
            }
        };
        const renderItems = (el, list, { dimmed = false, reasonLabel = '' } = {}) => {
            clearList(el);
            if (!Array.isArray(list) || list.length === 0) {
                addEmpty(el, '暂无条目');
                return;
            }
            list.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = `color:${dimmed ? '#94a3b8' : '#0f172a'}; line-height:1.4;`;
                const flags = [];
                if (item?.isPinned) flags.push('📌');
                if (Number.isFinite(Number(item?.priority)) && Number(item.priority) !== 0) flags.push(`P${Number(item.priority)}`);
                const updated = formatTime(item?.updatedAt);
                if (updated) flags.push(updated);
                const suffix = flags.length ? `（${flags.join(' · ')}）` : '';
                const reason = reasonLabel ? `（${reasonLabel}）` : '';
                row.textContent = `[${item?.tableName || item?.tableId || '记忆'}] ${item?.rowSummary || item?.rowText || ''}${suffix}${reason}`;
                el.appendChild(row);
            });
        };

        const disabledReason = (() => {
            if (!plan || plan.enabled !== true) {
                const reason = String(plan?.reason || '');
                if (reason === 'memory_mode') return '当前记忆模式为摘要，请切换到记忆表格';
                if (reason === 'missing_store') return '记忆表格未就绪';
                if (reason === 'missing_template') return '未找到默认模板';
                if (reason === 'missing_session') return '未找到会话';
                return '记忆检查器暂不可用';
            }
            return '';
        })();

        if (disabledReason) {
            metaEl.textContent = disabledReason;
            tokensEl.textContent = '';
            clearList(includedEl);
            clearList(truncatedEl);
            addEmpty(includedEl, disabledReason);
            addEmpty(truncatedEl, '暂无条目');
            promptEl.value = '';
            return;
        }

        const scopeLabel = plan?.scope === 'group' ? '群聊' : '私聊';
        const metaParts = [];
        if (plan?.targetName) metaParts.push(`${scopeLabel} · ${plan.targetName}`);
        if (plan?.templateName) metaParts.push(plan.templateName);
        if (plan?.position) metaParts.push(`位置:${plan.position}`);
        metaEl.textContent = metaParts.join(' | ');

        const budgetSafety = Number(plan?.tokenBudgetSafety || 0);
        const overhead = Number(plan?.overheadTokens || 0);
        const budget = Number(plan?.tokenBudget || 0);
        const tokenTotal = Number(plan?.tokenTotal || 0);
        const tokenInfo = [
            `Tokens: ${tokenTotal} / ${budget}`,
            budgetSafety ? `安全上限: ${budgetSafety}` : '',
            overhead ? `包裹开销: ${overhead}` : '',
        ].filter(Boolean).join(' · ');
        tokensEl.textContent = tokenInfo;

        const included = Array.isArray(plan?.items) ? plan.items : [];
        const truncated = Array.isArray(plan?.truncated) ? plan.truncated : [];
        const reasonLabelFor = (reason) => {
            if (reason === 'max_rows') return '因条数上限截断';
            if (reason === 'max_tokens') return '因预算截断';
            return '因预算截断';
        };
        renderItems(includedEl, included, { dimmed: false });
        const truncatedWithReason = truncated.map(item => ({
            ...item,
            _reasonLabel: reasonLabelFor(item?.reason),
        }));
        clearList(truncatedEl);
        if (!truncatedWithReason.length) {
            addEmpty(truncatedEl, '暂无条目');
        } else {
            truncatedWithReason.forEach(item => {
                const row = document.createElement('div');
                row.style.cssText = 'color:#94a3b8; line-height:1.4;';
                row.textContent = `[${item?.tableName || item?.tableId || '记忆'}] ${item?.rowSummary || item?.rowText || ''}（${item?._reasonLabel || '因预算截断'}）`;
                truncatedEl.appendChild(row);
            });
        }

        if (included.length === 0 && truncated.length === 0) {
            clearList(includedEl);
            addEmpty(includedEl, '暂无可注入记忆');
        }

        promptEl.value = String(plan?.promptText || '').trim();
    }

    async refreshMemoryInspector() {
        if (!this.memoryInspectorOverlay) return;
        try {
            const metaEl = this.memoryInspectorMeta;
            if (metaEl) metaEl.textContent = '加载中...';
            const plan = await window.appBridge?.getMemoryPromptPlan?.();
            this.renderMemoryInspector(plan);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.renderMemoryInspector({ enabled: false, reason: msg ? 'error' : '' });
            if (this.memoryInspectorMeta) this.memoryInspectorMeta.textContent = `加载失败: ${msg || 'unknown error'}`;
        }
    }

    async showMemoryInspector() {
        this.ensureMemoryInspector();
        if (this.memoryInspectorOverlay) {
            this.memoryInspectorOverlay.style.display = 'block';
        }
        await this.refreshMemoryInspector();
    }

    showPromptPreview() {
        try {
            if (typeof window?.appBridge?.showPromptPreview === 'function') {
                window.appBridge.showPromptPreview();
                return;
            }
            window.toastr?.warning?.('暂无 Prompt 预览入口');
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`Prompt 预览失败: ${msg || 'unknown error'}`, 'warn');
            window.toastr?.error?.('打开 Prompt 失败');
        }
    }

    ensureVariableInspector() {
        if (this.variableInspectorOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'debug-variable-overlay';
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
        panel.id = 'debug-variable-panel';
        panel.style.cssText = `
            width: 100%;
            height: 100%;
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:900;">变量查看器</div>
                <div id="debug-variable-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="debug-variable-refresh" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="debug-variable-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                <button id="debug-variable-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                <textarea id="debug-variable-text" readonly style="
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
        overlay.addEventListener('click', () => this.hideVariableInspector());
        document.body.appendChild(overlay);

        this.variableInspectorOverlay = overlay;
        this.variableInspectorPanel = panel;
        this.variableInspectorMeta = panel.querySelector('#debug-variable-meta');
        this.variableInspectorText = panel.querySelector('#debug-variable-text');
        this.variableInspectorRefresh = panel.querySelector('#debug-variable-refresh');

        panel.querySelector('#debug-variable-close')?.addEventListener('click', () => this.hideVariableInspector());
        panel.querySelector('#debug-variable-refresh')?.addEventListener('click', () => this.refreshVariableInspector());
        panel.querySelector('#debug-variable-copy')?.addEventListener('click', async () => {
            const text = String(this.variableInspectorText?.value || '');
            if (!text) {
                window.toastr?.warning?.('暂无内容可复制');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                window.toastr?.success?.('已复制');
            } catch {
                try {
                    this.variableInspectorText?.select?.();
                    document.execCommand?.('copy');
                    window.toastr?.success?.('已复制');
                } catch {
                    window.toastr?.error?.('复制失败');
                }
            }
        });
    }

    hideVariableInspector() {
        if (this.variableInspectorOverlay) {
            this.variableInspectorOverlay.style.display = 'none';
        }
    }

    renderVariableInspector({ sessionId, sessionName, globals, locals, initials, messageVars } = {}) {
        if (!this.variableInspectorText || !this.variableInspectorMeta) return;
        const formatJson = (value) => {
            try {
                return JSON.stringify(value ?? {}, null, 2);
            } catch {
                return String(value ?? '');
            }
        };
        const metaParts = [];
        if (sessionName) metaParts.push(sessionName);
        if (sessionId) metaParts.push(`sid=${sessionId}`);
        this.variableInspectorMeta.textContent = metaParts.join(' · ');
        const text = [
            '# Global Variables',
            formatJson(globals || {}),
            '',
            '# Local Variables',
            formatJson(locals || {}),
            '',
            '# Initial Variables',
            formatJson(initials || {}),
            '',
            '# Message Variables (last)',
            formatJson(messageVars || {}),
        ].join('\n');
        this.variableInspectorText.value = text;
    }

    async refreshVariableInspector() {
        if (!this.variableInspectorOverlay) return;
        try {
            const bridge = window.appBridge;
            const chatStore = bridge?.chatStore;
            const sessionId = String(bridge?.activeSessionId || chatStore?.getCurrent?.() || '').trim();
            const contact = bridge?.contactsStore?.getContact?.(sessionId);
            const sessionName = contact?.name || sessionId || '未选择会话';
            const globals = chatStore?.listGlobalVariables?.() || {};
            const locals = sessionId ? (chatStore?.listVariables?.(sessionId) || {}) : {};
            const initials = sessionId ? (chatStore?.listInitialVariables?.(sessionId) || {}) : {};
            const messages = sessionId ? (chatStore?.getMessages?.(sessionId) || []) : [];
            let messageVars = {};
            for (let i = messages.length - 1; i >= 0; i--) {
                const vars = messages[i]?.meta?.templateVars;
                if (vars && Object.keys(vars).length) {
                    messageVars = vars;
                    break;
                }
            }
            this.renderVariableInspector({ sessionId, sessionName, globals, locals, initials, messageVars });
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.renderVariableInspector({ sessionName: '加载失败', sessionId: '', globals: {}, locals: {}, initials: {}, messageVars: {} });
            if (this.variableInspectorMeta) this.variableInspectorMeta.textContent = `加载失败: ${msg || 'unknown error'}`;
        }
    }

    async showVariableInspector() {
        this.ensureVariableInspector();
        if (this.variableInspectorOverlay) {
            this.variableInspectorOverlay.style.display = 'block';
        }
        await this.refreshVariableInspector();
    }

    ensureGroupAvatarInspector() {
        if (this.groupAvatarOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'debug-group-avatar-overlay';
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
        panel.id = 'debug-group-avatar-panel';
        panel.style.cssText = `
            width: 100%;
            height: 100%;
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:900;">群聊头像 / Scope 调试</div>
                <div id="debug-group-avatar-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="debug-group-avatar-refresh" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="debug-group-avatar-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                <button id="debug-group-avatar-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                <textarea id="debug-group-avatar-text" readonly style="
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
        overlay.addEventListener('click', () => this.hideGroupAvatarInspector());
        document.body.appendChild(overlay);

        this.groupAvatarOverlay = overlay;
        this.groupAvatarPanel = panel;
        this.groupAvatarMeta = panel.querySelector('#debug-group-avatar-meta');
        this.groupAvatarText = panel.querySelector('#debug-group-avatar-text');
        this.groupAvatarRefresh = panel.querySelector('#debug-group-avatar-refresh');

        panel.querySelector('#debug-group-avatar-close')?.addEventListener('click', () => this.hideGroupAvatarInspector());
        panel.querySelector('#debug-group-avatar-refresh')?.addEventListener('click', () => this.refreshGroupAvatarInspector());
        panel.querySelector('#debug-group-avatar-copy')?.addEventListener('click', async () => {
            const text = String(this.groupAvatarText?.value || '');
            if (!text) {
                window.toastr?.warning?.('暂无内容可复制');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                window.toastr?.success?.('已复制');
            } catch {
                try {
                    this.groupAvatarText?.select?.();
                    document.execCommand?.('copy');
                    window.toastr?.success?.('已复制');
                } catch {
                    window.toastr?.error?.('复制失败');
                }
            }
        });
    }

    hideGroupAvatarInspector() {
        if (this.groupAvatarOverlay) {
            this.groupAvatarOverlay.style.display = 'none';
        }
    }

    formatGroupAvatarSnapshot(snapshot) {
        if (!snapshot || typeof snapshot !== 'object') return '暂无调试快照';
        return JSON.stringify(snapshot, null, 2);
    }

    async refreshGroupAvatarInspector() {
        if (!this.groupAvatarOverlay || !this.groupAvatarText) return;
        try {
            const loader = window.appBridge?.getGroupAvatarDebugSnapshot;
            if (typeof loader !== 'function') throw new Error('getGroupAvatarDebugSnapshot not available');
            const snapshot = await loader();
            const sessionId = String(snapshot?.session?.id || '').trim() || '未选择会话';
            const scope = String(snapshot?.storeScopes?.contacts || '').trim() || 'default';
            if (this.groupAvatarMeta) {
                this.groupAvatarMeta.textContent = `session=${sessionId} | scope=${scope}`;
            }
            this.groupAvatarText.value = this.formatGroupAvatarSnapshot(snapshot);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            if (this.groupAvatarMeta) this.groupAvatarMeta.textContent = `加载失败: ${msg || 'unknown error'}`;
            this.groupAvatarText.value = `群聊头像调试加载失败\n\n${msg || 'unknown error'}`;
            this.log(`群聊头像调试加载失败: ${msg || 'unknown error'}`, 'warn');
        }
    }

    async showGroupAvatarInspector() {
        this.ensureGroupAvatarInspector();
        if (this.groupAvatarOverlay) {
            this.groupAvatarOverlay.style.display = 'block';
        }
        await this.refreshGroupAvatarInspector();
    }

    ensureTemplateLogViewer() {
        if (this.templateLogOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'debug-template-log-overlay';
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
        panel.id = 'debug-template-log-panel';
        panel.style.cssText = `
            width: 100%;
            height: 100%;
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:900;">模板执行日志</div>
                <div id="debug-template-log-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="debug-template-log-refresh" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="debug-template-log-clear" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">清空</button>
                <button id="debug-template-log-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                <button id="debug-template-log-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                <textarea id="debug-template-log-text" readonly style="
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
        overlay.addEventListener('click', () => this.hideTemplateLogs());
        document.body.appendChild(overlay);

        this.templateLogOverlay = overlay;
        this.templateLogPanel = panel;
        this.templateLogMeta = panel.querySelector('#debug-template-log-meta');
        this.templateLogText = panel.querySelector('#debug-template-log-text');
        this.templateLogRefresh = panel.querySelector('#debug-template-log-refresh');
        this.templateLogClear = panel.querySelector('#debug-template-log-clear');

        panel.querySelector('#debug-template-log-close')?.addEventListener('click', () => this.hideTemplateLogs());
        panel.querySelector('#debug-template-log-refresh')?.addEventListener('click', () => this.refreshTemplateLogs());
        panel.querySelector('#debug-template-log-clear')?.addEventListener('click', () => this.clearTemplateLogs());
        panel.querySelector('#debug-template-log-copy')?.addEventListener('click', async () => {
            const text = String(this.templateLogText?.value || '');
            if (!text) {
                window.toastr?.warning?.('暂无内容可复制');
                return;
            }
            try {
                await navigator.clipboard.writeText(text);
                window.toastr?.success?.('已复制');
            } catch {
                try {
                    this.templateLogText?.select?.();
                    document.execCommand?.('copy');
                    window.toastr?.success?.('已复制');
                } catch {
                    window.toastr?.error?.('复制失败');
                }
            }
        });
    }

    hideTemplateLogs() {
        if (this.templateLogOverlay) {
            this.templateLogOverlay.style.display = 'none';
        }
    }

    formatTemplateLogs(logs) {
        const list = Array.isArray(logs) ? logs : [];
        if (!list.length) return '暂无模板执行记录';
        const parts = list.map(entry => {
            const ts = entry?.at ? new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false }) : '';
            const dur = Number.isFinite(Number(entry?.durationMs)) ? `${Math.round(Number(entry.durationMs))}ms` : '';
            const stage = entry?.stage ? `stage=${entry.stage}` : '';
            const sid = entry?.sessionId ? `sid=${entry.sessionId}` : '';
            const head = `[${ts}] ${[stage, dur, sid].filter(Boolean).join(' · ')}`.trim();
            const err = entry?.error ? `error: ${entry.error}` : '';
            const input = entry?.input ? `-- input --\n${entry.input}` : '';
            const output = entry?.output ? `-- output --\n${entry.output}` : '';
            return [head, err, input, output].filter(Boolean).join('\n');
        });
        return parts.join('\n\n---\n\n');
    }

    async refreshTemplateLogs() {
        if (!this.templateLogOverlay) return;
        try {
            const { templateDebug } = await import('../plugins/template-engine.js');
            const logs = templateDebug?.getLogs?.() || [];
            if (this.templateLogMeta) this.templateLogMeta.textContent = `共 ${logs.length} 条`;
            if (this.templateLogText) this.templateLogText.value = this.formatTemplateLogs(logs);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            if (this.templateLogMeta) this.templateLogMeta.textContent = `加载失败: ${msg || 'unknown error'}`;
            if (this.templateLogText) this.templateLogText.value = '模板日志加载失败';
        }
    }

    async clearTemplateLogs() {
        try {
            const { templateDebug } = await import('../plugins/template-engine.js');
            templateDebug?.clearLogs?.();
        } catch {}
        await this.refreshTemplateLogs();
    }

    async showTemplateLogs() {
        this.ensureTemplateLogViewer();
        if (this.templateLogOverlay) {
            this.templateLogOverlay.style.display = 'block';
        }
        await this.refreshTemplateLogs();
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
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:900;">错误日志</div>
                <div id="debug-error-log-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="debug-error-log-refresh" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="debug-error-log-export" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">导出</button>
                <button id="debug-error-log-copy" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">复制</button>
                <button id="debug-error-log-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
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

    async getThemeAuditModule() {
        if (!this.themeAuditModule) {
            this.themeAuditModule = import('./theme-dark-audit.js');
        }
        return this.themeAuditModule;
    }

    async getThemeBatchAuditModule() {
        if (!this.themeAuditBatchModule) {
            this.themeAuditBatchModule = import('./theme-dark-batch-audit.js');
        }
        return this.themeAuditBatchModule;
    }

    ensureThemeAuditViewer() {
        if (this.themeAuditOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'debug-theme-audit-overlay';
        overlay.setAttribute('data-debug-panel-root', 'true');
        overlay.setAttribute('data-theme-dark-audit-root', 'true');
        overlay.style.cssText = `
            display:none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.42);
            z-index: 22050;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing: border-box;
        `;
        const panel = document.createElement('div');
        panel.id = 'debug-theme-audit-panel';
        panel.style.cssText = `
            width: 100%;
            height: 100%;
            background: #0f172a;
            color: #e2e8f0;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
            box-shadow: 0 18px 48px rgba(0, 0, 0, 0.35);
        `;
        panel.addEventListener('click', e => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#111827; border-bottom:1px solid rgba(148,163,184,0.24); flex-wrap:wrap;">
                <div style="font-weight:900; color:#f8fafc;">Dark Theme 审计</div>
                <div id="debug-theme-audit-meta" style="margin-left:auto; font-size:12px; color:#94a3b8; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="debug-theme-audit-refresh" style="border:1px solid rgba(148,163,184,0.3); background:#1e293b; color:#e2e8f0; border-radius:10px; padding:6px 10px;">刷新</button>
                <button id="debug-theme-audit-batch" style="border:1px solid rgba(148,163,184,0.3); background:#1e293b; color:inherit; border-radius:10px; padding:6px 10px;">批量</button>
                <button id="debug-theme-audit-highlight" style="border:1px solid rgba(148,163,184,0.3); background:#1e293b; color:#e2e8f0; border-radius:10px; padding:6px 10px;">高亮</button>
                <button id="debug-theme-audit-clear" style="border:1px solid rgba(148,163,184,0.3); background:#1e293b; color:#e2e8f0; border-radius:10px; padding:6px 10px;">清除</button>
                <button id="debug-theme-audit-copy" style="border:1px solid rgba(148,163,184,0.3); background:#1e293b; color:#e2e8f0; border-radius:10px; padding:6px 10px;">复制</button>
                <button id="debug-theme-audit-export" style="border:1px solid rgba(148,163,184,0.3); background:#1e293b; color:inherit; border-radius:10px; padding:6px 10px;">TXT</button>
                <button id="debug-theme-audit-close" style="border:1px solid rgba(148,163,184,0.3); background:#1e293b; color:#e2e8f0; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="padding:10px 12px; border-bottom:1px solid rgba(148,163,184,0.18); display:flex; flex-direction:column; gap:6px; background:#0b1220;">
                <div id="debug-theme-audit-summary" style="font-size:12px; line-height:1.5; color:#cbd5e1;"></div>
                <div style="font-size:11px; color:inherit; opacity:0.72;">刷新会扫当前场景，批量会尝试自动打开已接入的页面与弹窗。源码硬编码请用 npm run audit:theme / npm run audit:theme:update。</div>
            </div>
            <div style="flex:1; min-height:0; display:grid; grid-template-columns:minmax(0, 1.1fr) minmax(280px, 0.9fr);">
                <div style="min-height:0; border-right:1px solid rgba(148,163,184,0.18); display:flex; flex-direction:column;">
                    <div style="padding:10px 12px; font-size:12px; font-weight:700; color:#e2e8f0; border-bottom:1px solid rgba(148,163,184,0.18);">报告</div>
                    <textarea id="debug-theme-audit-report" readonly style="
                        flex:1;
                        width:100%;
                        min-height:100%;
                        resize:none;
                        border:none;
                        background:#0b1220;
                        color:#dbeafe;
                        padding:12px;
                        font-size:12px;
                        line-height:1.45;
                        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                        box-sizing:border-box;
                        outline:none;
                    "></textarea>
                </div>
                <div style="min-height:0; display:flex; flex-direction:column;">
                    <div id="debug-theme-audit-list-title" style="padding:10px 12px; font-size:12px; font-weight:700; color:#e2e8f0; border-bottom:1px solid rgba(148,163,184,0.18);">问题列表</div>
                    <div id="debug-theme-audit-list" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px; display:flex; flex-direction:column; gap:8px; background:#111827;"></div>
                </div>
            </div>
        `;
        overlay.appendChild(panel);
        overlay.addEventListener('click', () => this.hideThemeAuditViewer());
        document.body.appendChild(overlay);

        this.themeAuditOverlay = overlay;
        this.themeAuditPanel = panel;
        this.themeAuditMeta = panel.querySelector('#debug-theme-audit-meta');
        this.themeAuditSummary = panel.querySelector('#debug-theme-audit-summary');
        this.themeAuditList = panel.querySelector('#debug-theme-audit-list');
        this.themeAuditListTitle = panel.querySelector('#debug-theme-audit-list-title');
        this.themeAuditRefresh = panel.querySelector('#debug-theme-audit-refresh');
        this.themeAuditBatchBtn = panel.querySelector('#debug-theme-audit-batch');
        this.themeAuditReport = panel.querySelector('#debug-theme-audit-report');

        panel.querySelector('#debug-theme-audit-close')?.addEventListener('click', () => this.hideThemeAuditViewer());
        panel.querySelector('#debug-theme-audit-refresh')?.addEventListener('click', () => this.refreshThemeAuditViewer());
        panel.querySelector('#debug-theme-audit-batch')?.addEventListener('click', () => this.runBatchThemeAuditViewer());
        panel.querySelector('#debug-theme-audit-highlight')?.addEventListener('click', () => this.highlightThemeAuditIssues());
        panel.querySelector('#debug-theme-audit-clear')?.addEventListener('click', () => this.clearThemeAuditHighlights());
        panel.querySelector('#debug-theme-audit-copy')?.addEventListener('click', () => this.copyThemeAuditReport());
        panel.querySelector('#debug-theme-audit-export')?.addEventListener('click', () => this.exportThemeAuditReport());
        this.themeAuditList?.addEventListener('click', (event) => {
            if (this.themeAuditMode !== 'single') return;
            const button = event.target?.closest?.('[data-theme-audit-index]');
            if (!button) return;
            const index = Number(button.getAttribute('data-theme-audit-index'));
            if (!Number.isFinite(index) || index < 0) return;
            this.focusThemeAuditIssue(index);
        });
    }

    hideThemeAuditViewer() {
        if (this.themeAuditOverlay) {
            this.themeAuditOverlay.style.display = 'none';
        }
    }

    setThemeAuditMode(mode = 'single') {
        this.themeAuditMode = mode === 'batch' ? 'batch' : 'single';
        if (this.themeAuditListTitle) {
            this.themeAuditListTitle.textContent = this.themeAuditMode === 'batch' ? '场景列表' : '问题列表';
        }
    }

    setThemeAuditBusy(isBusy, {
        refreshLabel = '刷新',
        batchLabel = '批量',
    } = {}) {
        if (this.themeAuditRefresh) {
            this.themeAuditRefresh.disabled = isBusy;
            this.themeAuditRefresh.textContent = refreshLabel;
            this.themeAuditRefresh.style.opacity = isBusy ? '0.7' : '1';
            this.themeAuditRefresh.style.cursor = isBusy ? 'progress' : 'pointer';
        }
        if (this.themeAuditBatchBtn) {
            this.themeAuditBatchBtn.disabled = isBusy;
            this.themeAuditBatchBtn.textContent = batchLabel;
            this.themeAuditBatchBtn.style.opacity = isBusy ? '0.7' : '1';
            this.themeAuditBatchBtn.style.cursor = isBusy ? 'progress' : 'pointer';
        }
    }

    async refreshThemeAuditViewer() {
        if (!this.themeAuditOverlay) return;
        this.setThemeAuditMode('single');
        this.themeAuditBatchResult = null;
        this.themeAuditCopyText = '';
        this.setThemeAuditBusy(true, { refreshLabel: '刷新中…' });
        try {
            const audit = await this.getThemeAuditModule();
            const report = audit.runDarkThemeDomAudit();
            this.themeAuditIssues = Array.isArray(report?.issues) ? report.issues : [];
            this.themeAuditLastReportText = audit.formatDarkThemeAuditReport(report);
            this.themeAuditCopyText = this.themeAuditLastReportText;

            if (this.themeAuditMeta) {
                this.themeAuditMeta.textContent = `mode=${report.mode} · visible=${report.scannedElements} · issues=${report.summary?.total || 0}`;
            }
            if (this.themeAuditSummary) {
                const categorySummary = Object.entries(report.summary?.byCategory || {})
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([key, count]) => `${key}: ${count}`)
                    .join(' · ');
                this.themeAuditSummary.textContent = categorySummary
                    ? `${report.message ? `${report.message} · ` : ''}${categorySummary}`
                    : (report.message || '当前视口没有发现明显问题。');
            }
            if (this.themeAuditReport) {
                this.themeAuditReport.value = this.themeAuditLastReportText;
            }
            if (this.themeAuditList) {
                if (!this.themeAuditIssues.length) {
                    this.themeAuditList.innerHTML = '<div style="padding:12px; border:1px dashed rgba(148,163,184,0.24); border-radius:12px; color:#94a3b8; background:#0b1220;">当前视口没有发现可报告的问题。</div>';
                } else {
                    this.themeAuditList.innerHTML = this.themeAuditIssues
                        .map((issue, index) => audit.renderDarkThemeAuditIssueHtml(issue, index))
                        .join('');
                }
            }
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            if (this.themeAuditMeta) this.themeAuditMeta.textContent = `加载失败: ${msg || 'unknown error'}`;
            if (this.themeAuditSummary) this.themeAuditSummary.textContent = '运行时主题审计加载失败。';
            if (this.themeAuditReport) this.themeAuditReport.value = `运行时主题审计加载失败\n\n${msg || 'unknown error'}`;
            if (this.themeAuditList) {
                this.themeAuditList.innerHTML = `<div style="padding:12px; border:1px solid rgba(239,68,68,0.35); border-radius:12px; color:#fecaca; background:rgba(127,29,29,0.35);">${msg || 'unknown error'}</div>`;
            }
            this.log(`主题审计加载失败: ${msg || 'unknown error'}`, 'warn');
        } finally {
            this.setThemeAuditBusy(false);
        }
    }

    async runBatchThemeAuditViewer() {
        if (!this.themeAuditOverlay) return;
        this.setThemeAuditMode('batch');
        this.themeAuditIssues = [];
        this.themeAuditCopyText = '';
        this.setThemeAuditBusy(true, { batchLabel: '执行中…' });
        try {
            const batchAudit = await this.getThemeBatchAuditModule();
            const result = await batchAudit.runBatchDarkThemeAudit();
            this.themeAuditBatchResult = result;
            this.themeAuditLastReportText = batchAudit.formatBatchDarkThemeAuditReport(result);
            this.themeAuditCopyText = this.themeAuditLastReportText;

            if (this.themeAuditMeta) {
                this.themeAuditMeta.textContent = `mode=${result.mode} · scenes=${result.sceneCount || 0} · audited=${result.auditedSceneCount || 0} · issues=${result.totalIssues || 0}`;
            }
            if (this.themeAuditSummary) {
                const categorySummary = Object.entries(result.summary?.byCategory || {})
                    .sort((a, b) => a[0].localeCompare(b[0]))
                    .map(([key, count]) => `${key}: ${count}`)
                    .join(' · ');
                const sceneSummary = [`已审计 ${result.auditedSceneCount || 0}`, `跳过 ${result.skippedSceneCount || 0}`, `失败 ${result.errorSceneCount || 0}`].join(' · ');
                this.themeAuditSummary.textContent = [result.message || '', sceneSummary, categorySummary].filter(Boolean).join(' · ');
            }
            if (this.themeAuditReport) {
                this.themeAuditReport.value = this.themeAuditLastReportText;
            }
            if (this.themeAuditList) {
                const scenes = Array.isArray(result.scenes) ? result.scenes : [];
                this.themeAuditList.innerHTML = scenes.length
                    ? scenes.map((scene, index) => batchAudit.renderBatchDarkThemeAuditSceneHtml(scene, index)).join('')
                    : '<div style="padding:12px; border:1px dashed rgba(148,163,184,0.24); border-radius:12px; color:inherit; opacity:0.72; background:#0b1220;">没有可审计的场景。</div>';
            }
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            if (this.themeAuditMeta) this.themeAuditMeta.textContent = `批量执行失败: ${msg || 'unknown error'}`;
            if (this.themeAuditSummary) this.themeAuditSummary.textContent = '批量主题审计执行失败。';
            if (this.themeAuditReport) this.themeAuditReport.value = `批量主题审计执行失败\n\n${msg || 'unknown error'}`;
            if (this.themeAuditList) {
                this.themeAuditList.innerHTML = `<div style="padding:12px; border:1px solid rgba(239,68,68,0.35); border-radius:12px; color:#fecaca; background:rgba(127,29,29,0.35);">${msg || 'unknown error'}</div>`;
            }
            this.log(`批量主题审计执行失败: ${msg || 'unknown error'}`, 'warn');
        } finally {
            this.setThemeAuditBusy(false);
        }
    }

    async highlightThemeAuditIssues() {
        if (this.themeAuditMode === 'batch') {
            window.toastr?.info?.('批量结果不支持直接高亮，请改用单页刷新后高亮');
            return;
        }
        try {
            const audit = await this.getThemeAuditModule();
            const count = audit.highlightDarkThemeAuditIssues(this.themeAuditIssues);
            window.toastr?.success?.(`已高亮 ${count} 个问题节点`);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`主题审计高亮失败: ${msg || 'unknown error'}`, 'warn');
            window.toastr?.error?.('主题审计高亮失败');
        }
    }

    async clearThemeAuditHighlights() {
        try {
            const audit = await this.getThemeAuditModule();
            const count = audit.clearDarkThemeAuditHighlights();
            window.toastr?.success?.(`已清除 ${count} 个高亮`);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`清除主题审计高亮失败: ${msg || 'unknown error'}`, 'warn');
            window.toastr?.error?.('清除主题审计高亮失败');
        }
    }

    async focusThemeAuditIssue(index) {
        if (this.themeAuditMode !== 'single') return;
        try {
            const audit = await this.getThemeAuditModule();
            const issue = this.themeAuditIssues?.[index];
            if (!issue) return;
            audit.highlightDarkThemeAuditIssues([issue], { limit: 1 });
            audit.focusDarkThemeAuditIssue(issue);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`定位主题审计节点失败: ${msg || 'unknown error'}`, 'warn');
        }
    }

    async copyThemeAuditReport() {
        const text = String(this.themeAuditCopyText || this.themeAuditLastReportText || this.themeAuditReport?.value || '');
        if (!text) {
            window.toastr?.warning?.('暂无主题审计结果可复制');
            return;
        }
        try {
            await navigator.clipboard.writeText(text);
            window.toastr?.success?.('主题审计结果已复制');
        } catch {
            try {
                this.themeAuditReport?.select?.();
                document.execCommand?.('copy');
                window.toastr?.success?.('主题审计结果已复制');
            } catch {
                window.toastr?.error?.('复制失败');
            }
        }
    }

    async exportThemeAuditReport() {
        try {
            const text = String(this.themeAuditCopyText || this.themeAuditLastReportText || this.themeAuditReport?.value || '');
            if (!text.trim()) {
                window.toastr?.warning?.('暂无主题审计结果可导出');
                return;
            }
            const ts = new Date();
            const pad = (n) => String(n).padStart(2, '0');
            const mode = this.themeAuditMode === 'batch' ? 'batch' : 'single';
            const filename = `theme-audit-${mode}-${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.txt`;
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
                window.toastr?.success?.(`主题审计 TXT 已导出：${filename}`);
                return;
            }

            let savedPath = '';
            if (!isAndroid) {
                try {
                    const { save } = await import('@tauri-apps/plugin-dialog');
                    const result = await save({
                        defaultPath: filename,
                        filters: [{ name: 'Text', extensions: ['txt'] }],
                    });
                    if (result) {
                        const resp = await safeInvoke('export_attachment', {
                            dataUrl: buildTextDataUrl(text),
                            fileName: filename,
                            path: result,
                        });
                        savedPath = String(resp?.path || result || '').trim();
                    } else {
                        return;
                    }
                } catch {}
            }

            if (!savedPath) {
                const resp = await safeInvoke('export_attachment', {
                    dataUrl: buildTextDataUrl(text),
                    fileName: filename,
                });
                savedPath = String(resp?.path || '').trim();
            }

            window.toastr?.success?.(`主题审计 TXT 已导出：${savedPath || filename}`);
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || '');
            this.log(`主题审计导出失败: ${msg || 'unknown error'}`, 'warn');
            window.toastr?.error?.('主题审计导出失败');
        }
    }

    async showThemeAuditViewer() {
        this.ensureThemeAuditViewer();
        if (this.themeAuditOverlay) {
            this.themeAuditOverlay.style.display = 'block';
        }
        await this.refreshThemeAuditViewer();
    }

    showConfigStatus(configManager) {
        if (!configManager) return;

        try {
            const activeId = configManager.getActiveProfileId?.();
            const active = configManager.getActiveProfile?.();
            const profiles = configManager.getProfiles?.() || [];

            this.log(`配置总数: ${profiles.length}`);
            this.log(`当前活跃ID: ${activeId ? activeId.slice(0, 20) + '...' : '无'}`);
            this.log(`当前活跃配置: ${active?.name || '无'} (${active?.provider || '无'})`);
            this.log('--- 所有配置（按最后修改时间排序）---');

            profiles.forEach((p, i) => {
                const isCurrent = p.id === activeId;
                const updatedTime = p.updatedAt ? new Date(p.updatedAt).toLocaleString('zh-CN', {
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit'
                }) : '未知';
                const marker = isCurrent ? ' ← 当前' : '';
                const rank = i === 0 ? ' [最新]' : '';
                this.log(`  ${i + 1}. ${p.name} (${p.provider})${marker}${rank}`, isCurrent ? 'info' : 'info');
                this.log(`     更新: ${updatedTime}`, 'info');
            });
        } catch (err) {
            this.log(`显示配置状态失败: ${err.message}`, 'error');
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
