/**
 * Runtime diagnostics panel for user-facing support exports.
 */

import { appSettings } from '../storage/app-settings.js';
import { createDebugPanelDom } from './debug-panel-dom-utils.js';
import {
    buildCustomBundleDiagnosticsMeta,
    buildDebugTextFilename,
    collectErrorLogs,
    formatCustomBundleDiagnostics,
    formatErrorLogs,
} from './debug-panel-utils.js';
import {
    bindDebugViewerRefs,
    createDebugViewerModal,
    setDebugViewerVisibility,
    showDebugViewer,
} from './debug-panel-viewer-utils.js';
import { exportDebugTextFile } from './debug-panel-export-utils.js';
import {
    appendDebugLog,
    getVisibleDebugLogs,
    renderDebugLogHtml,
} from './debug-panel-log-utils.js';
import {
    applyDebugPanelEnabledState,
    createDebugLogListener,
    hideDebugPanel,
    runDebugPanelStartupAutoShow,
    showDebugPanel,
    toggleDebugPanelVisibility,
} from './debug-panel-state-utils.js';
import {
    copyVisibleDebugLogsFlow,
    copyDebugTextFlow,
    createDebugViewerTextBindings,
    createDetachedTextareaCopyFallback,
    createSelectedTextareaCopyFallback,
    exportDebugTextFlow,
    handleCustomBundleDiagnosticsLoadError,
    refreshCustomBundleDiagnosticsView,
    refreshErrorLogView,
} from './debug-panel-runtime-utils.js';

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

        const dom = createDebugPanelDom({
            documentRef: document,
            onShowCustomBundle: () => this.showCustomBundleInspector(),
            onShowErrorLogs: () => this.showErrorLogs(),
            onClearLogs: ({ filterInput }) => {
                this.clear();
                if (filterInput) filterInput.value = '';
                this.filterText = '';
                this.render();
            },
            onCopyLogs: () => this.copyVisibleLogs(),
            onFilterChange: (value) => {
                this.filterText = value;
                this.render();
            },
            onClearFilter: ({ filterInput }) => {
                this.filterText = '';
                if (filterInput) {
                    filterInput.value = '';
                    filterInput.focus?.();
                }
                this.render();
            },
            onToggle: () => this.toggle(),
        });
        this.panel = dom.panel;
        this.controls = dom.controls;
        this.customBundleInspectBtn = dom.customBundleInspectBtn;
        this.errorLogBtn = dom.errorLogBtn;
        this.copyLogBtn = dom.copyLogBtn;
        this.filterInput = dom.filterInput;
        this.filterClearBtn = dom.filterClearBtn;
        this.logContainer = dom.logContainer;
        this.toggleBtn = dom.toggleBtn;

        const settings = appSettings.get();
        this.setEnabled(Boolean(settings.showDebugToggle));
        this.debugLogListener = createDebugLogListener({
            log: (message, type) => this.log(message, type),
        });
        window.addEventListener('app-debug-log', this.debugLogListener);

        // APP启动时自动显示5秒，让用户看到加载日志（仅在启用时）
        this.log('=== APP 启动，调试面板已激活 ===', 'info');
        this.autoHideTimer = runDebugPanelStartupAutoShow({
            enabled: this.enabled,
            show: () => this.show(),
            hide: () => this.hide(),
            getLogCount: () => this.logs.length,
        });
    }

    show() {
        const result = showDebugPanel({
            panel: this.panel,
            scrollToBottom: () => this.scrollToBottom(),
            autoHideTimer: this.autoHideTimer,
        });
        this.isVisible = result.isVisible;
        this.autoHideTimer = result.autoHideTimer;
    }

    hide() {
        const result = hideDebugPanel({
            panel: this.panel,
        });
        this.isVisible = result.isVisible;
    }

    setEnabled(enabled) {
        const result = applyDebugPanelEnabledState({
            enabled,
            toggleBtn: this.toggleBtn,
            onDisable: () => this.hide(),
            autoHideTimer: this.autoHideTimer,
        });
        this.enabled = result.enabled;
        this.autoHideTimer = result.autoHideTimer;
    }

    toggle() {
        if (!this.panel) return;
        toggleDebugPanelVisibility({
            isVisible: this.isVisible,
            onShow: () => this.show(),
            onHide: () => this.hide(),
        });
    }

    getVisibleLogs() {
        return getVisibleDebugLogs({
            logs: this.logs,
            filterText: this.filterText,
        });
    }

    log(message, type = 'info') {
        const { appended } = appendDebugLog({
            logs: this.logs,
            seenMessages: this.seenMessages,
            message,
            type,
            maxLogs: this.maxLogs,
        });
        if (!appended) return;
        this.render();
    }

    render() {
        if (!this.logContainer) return;

        const list = this.getVisibleLogs();
        this.logContainer.innerHTML = renderDebugLogHtml(list);

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
        await copyVisibleDebugLogsFlow({
            logs: list,
            writeText: async (text) => navigator.clipboard.writeText(text),
            fallbackCopy: createDetachedTextareaCopyFallback({
                documentRef: document,
                execCommand: (command) => document.execCommand?.(command),
            }),
            onWarning: () => window.toastr?.warning?.('暂无日志可复制'),
            onSuccess: (message) => window.toastr?.success?.(message),
            onError: () => window.toastr?.error?.('复制失败'),
        });
    }

    ensureCustomBundleInspector() {
        if (this.customBundleOverlay) return;
        const viewer = createDebugViewerModal({
            overlayId: 'debug-custom-bundle-overlay',
            panelId: 'debug-custom-bundle-panel',
            title: '资料包导入诊断',
            onClose: () => this.hideCustomBundleInspector(),
            onRefresh: () => this.refreshCustomBundleInspector(),
            onExport: () => this.exportCustomBundleDiagnostics(),
        });
        bindDebugViewerRefs({
            target: this,
            prefix: 'customBundle',
            viewer,
        });
    }

    hideCustomBundleInspector() {
        setDebugViewerVisibility({ overlay: this.customBundleOverlay, visible: false });
    }

    async exportCustomBundleDiagnostics() {
        await exportDebugTextFlow({
            text: String(this.customBundleText?.value || ''),
            filenamePrefix: 'custom-bundle-import',
            successLabel: '资料包诊断已导出',
            emptyMessage: '暂无资料包导入诊断可导出',
            exportFailureToast: '资料包诊断导出失败',
            exportFailurePrefix: '资料包诊断导出失败: ',
            buildFilename: buildDebugTextFilename,
            exportTextFile: (text, filename, successLabel) => exportDebugTextFile({
                text,
                filename,
                successLabel,
                onSuccess: (message) => window.toastr?.success?.(message),
            }),
            onWarning: (message) => window.toastr?.warning?.(message),
            onLogWarn: (message) => this.log(message, 'warn'),
            onError: (message) => window.toastr?.error?.(message),
        });
    }

    async refreshCustomBundleInspector() {
        const viewer = createDebugViewerTextBindings({
            metaEl: this.customBundleMeta,
            textEl: this.customBundleText,
        });
        if (!this.customBundleOverlay || !viewer.hasViewer()) return;
        try {
            const registry = window.appBridge?.debugUiRegistry;
            const snapshot = registry?.stores?.customBundleDiagnostics || null;
            refreshCustomBundleDiagnosticsView({
                snapshot,
                setMeta: viewer.setMeta,
                setText: viewer.setText,
            });
        } catch (err) {
            handleCustomBundleDiagnosticsLoadError({
                error: err,
                setMeta: viewer.setMeta,
                setText: viewer.setText,
                logWarn: (message) => this.log(message, 'warn'),
            });
        }
    }

    async showCustomBundleInspector() {
        this.ensureCustomBundleInspector();
        await showDebugViewer({
            overlay: this.customBundleOverlay,
            onShow: () => this.refreshCustomBundleInspector(),
        });
    }

    ensureErrorLogViewer() {
        if (this.errorLogOverlay) return;
        const viewer = createDebugViewerModal({
            overlayId: 'debug-error-log-overlay',
            panelId: 'debug-error-log-panel',
            title: '错误日志',
            includeCopyButton: true,
            onClose: () => this.hideErrorLogs(),
            onRefresh: () => this.refreshErrorLogs(),
            onExport: () => this.exportErrorLogs(),
            onCopy: async () => {
                const viewer = createDebugViewerTextBindings({
                    textEl: this.errorLogText,
                });
                await copyDebugTextFlow({
                    text: viewer.getText(),
                    writeText: async (text) => navigator.clipboard.writeText(text),
                    fallbackCopy: createSelectedTextareaCopyFallback({
                        textEl: this.errorLogText,
                        execCommand: (command) => document.execCommand?.(command),
                    }),
                    onWarning: (message) => window.toastr?.warning?.(message),
                    onSuccess: (message) => window.toastr?.success?.(message),
                    onError: (message) => window.toastr?.error?.(message),
                });
            },
        });
        bindDebugViewerRefs({
            target: this,
            prefix: 'errorLog',
            viewer,
        });
    }

    hideErrorLogs() {
        setDebugViewerVisibility({ overlay: this.errorLogOverlay, visible: false });
    }

    refreshErrorLogs() {
        const viewer = createDebugViewerTextBindings({
            metaEl: this.errorLogMeta,
            textEl: this.errorLogText,
        });
        if (!this.errorLogOverlay || !viewer.hasViewer()) return;
        refreshErrorLogView({
            logs: this.logs,
            setMeta: viewer.setMeta,
            setText: viewer.setText,
        });
    }

    showErrorLogs() {
        this.ensureErrorLogViewer();
        void showDebugViewer({
            overlay: this.errorLogOverlay,
            onShow: () => this.refreshErrorLogs(),
        });
    }

    exportErrorLogs() {
        void exportDebugTextFlow({
            text: formatErrorLogs(this.logs),
            filenamePrefix: 'app-debug-errors',
            successLabel: '错误日志已导出',
            emptyMessage: '暂无内容可导出',
            exportFailureToast: '导出失败',
            exportFailurePrefix: '导出失败: ',
            buildFilename: buildDebugTextFilename,
            exportTextFile: (text, filename, successLabel) => exportDebugTextFile({
                text,
                filename,
                successLabel,
                onSuccess: (message) => window.toastr?.success?.(message),
            }),
            onWarning: (message) => window.toastr?.warning?.(message),
            onLogWarn: (message) => this.log(message, 'warn'),
            onError: (message) => window.toastr?.error?.(message),
        });
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
