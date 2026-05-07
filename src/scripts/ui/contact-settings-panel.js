/**
 * Contact settings panel
 * - Edit contact display name + avatar (does not rename session id)
 */
import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { appSettings } from '../storage/app-settings.js';
import { getSummaryTableIdsForContext, isRpSessionId } from '../memory/memory-context-utils.js';
import { MemoryTableEditor } from './memory-table-editor.js';
import { appConfirm } from './app-confirm.js';
import { normalizeBadgeList } from '../utils/name-badges.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import { bindCustomSelectButton, closeCustomSelectMenu, refreshCustomSelectButton } from './custom-select.js';
import {
    runContactSettingsPopulateFlow,
    runContactSettingsSaveFlow,
} from './contact-settings-runtime-utils.js';
import { createContactMemoryShareRuntime } from './contact-memory-share-runtime-utils.js';
import { createSessionPanelShell } from './session-panel-shell-utils.js';
import {
    applySessionPanelMemoryMode,
    runSessionPanelShowFlow,
} from './session-panel-display-runtime-utils.js';
import {
    buildSessionAvatarButtonStyle,
    buildSessionBlockButtonStyle,
    buildSessionCheckboxInputStyle,
    buildSessionCheckboxLabelStyle,
    buildSessionCompactInputStyle,
    buildSessionCoverImageStyle,
    buildSessionFlexRowStyle,
    buildSessionFooterStyle,
    buildSessionFieldLabelStyle,
    buildSessionHelperTextStyle,
    buildSessionIconButtonStyle,
    buildSessionListContainerStyle,
    buildSessionSurfaceBoxStyle,
    buildSessionSectionStyle,
    buildSessionSummaryRowStyle,
    buildSessionTextInputStyle,
    buildSessionTextActionButtonStyle,
    buildSessionUtilityButtonStyle,
    buildSessionWideActionButtonStyle,
    SESSION_PANEL_STYLES,
} from './session-panel-style-utils.js';
import {
    bindSessionMemoryShareButton,
    bindSessionPanelSharedWindowEvents,
    bindSessionSummarySectionControls,
} from './session-panel-binding-utils.js';
import { createSessionArchiveSectionRuntime } from './session-archive-section-runtime-utils.js';
import { createSessionNewChatSectionRuntime } from './session-new-chat-section-runtime-utils.js';
import { runArchiveSwitchFlow } from './session-archive-switch-utils.js';
import { runArchiveDeleteFlow } from './session-archive-delete-utils.js';
import {
    applyMemoryTableSnapshot as applySharedMemoryTableSnapshot,
    askMemoryTableNewChatMode,
    buildMemoryTableSnapshot as buildSharedMemoryTableSnapshot,
    getMemoryStorageMode,
    resolveDefaultMemoryTemplateDefinition as resolveSharedDefaultMemoryTemplateDefinition,
    resolveDefaultMemoryTemplateId as resolveSharedDefaultMemoryTemplateId,
} from './session-memory-table-utils.js';
import {
    normalizeSummaryItems,
    renderCompactedSummary,
    renderSummaryList,
} from './session-summary-utils.js';
import { emitMemoryRowsUpdated as emitSharedMemoryRowsUpdated } from './session-memory-event-utils.js';
import { createSessionSummarySectionRuntime } from './session-summary-section-runtime-utils.js';
import {
    createSessionArchiveEmptyState,
    createSessionArchiveRow,
} from './session-shared-view-utils.js';
const resolveDefaultMemoryTemplateId = async () => resolveSharedDefaultMemoryTemplateId({
    memoryTemplateStore: window.appBridge?.memoryTemplateStore,
});

const resolveDefaultMemoryTemplateDefinition = async () => resolveSharedDefaultMemoryTemplateDefinition({
    memoryTemplateStore: window.appBridge?.memoryTemplateStore,
});

const buildMemoryTableSnapshot = async ({ sessionId, isGroup } = {}) => buildSharedMemoryTableSnapshot({
    sessionId,
    isGroup,
    memoryTableStore: window.appBridge?.memoryTableStore,
    resolveDefaultMemoryTemplateId,
});

const applyMemoryTableSnapshot = async ({ sessionId, isGroup, snapshot } = {}) => applySharedMemoryTableSnapshot({
    sessionId,
    isGroup,
    snapshot,
    memoryTableStore: window.appBridge?.memoryTableStore,
    resolveDefaultMemoryTemplateId,
    notifyRowsUpdated: ({ sessionId, templateId }) =>
        emitSharedMemoryRowsUpdated({ target: window, sessionId, templateId }),
});

export class ContactSettingsPanel {
    constructor({ contactsStore, chatStore, getSessionId, onSaved, onExportExperiencePack } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => 'default';
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;
        this.onExportExperiencePack = typeof onExportExperiencePack === 'function' ? onExportExperiencePack : null;
        this.overlay = null;
        this.panel = null;
        this.fileInput = null;
        this.avatarPreview = null;
        this.nameInput = null;
        this.archivesList = null;
        this.archiveRuntime = null;
        this.newChatRuntime = null;
        this.summariesList = null;
        this.compactedList = null;
        this.summarySection = null;
        this.memoryTableSection = null;
        this.memoryFeaturesSection = null;
        this.memoryTableContent = null;
        this.memoryTableEditor = null;
        this.currentAvatar = '';
        this.summaryBatchMode = false;
        this.summarySelectedKeys = new Set();
        this.summaryRuntime = null;
        this.summariesBatchBar = null;
        this.summaryEditOverlay = null;
        this.summaryEditPanel = null;
        this.summaryEditTextarea = null;
        this.summaryEditSave = null;
        this.summaryEditCancel = null;
        this.summaryCompacting = false;
        this.templateToggle = null;
        this.scriptToggle = null;
        this.resetVarsBtn = null;
        this.rpBridgeSection = null;
        this.rpBridgeToggle = null;
        this.rpBridgeLimitInput = null;
        this.rpBridgeSourceNote = null;
        this.memoryShareSection = null;
        this.memoryShareButton = null;
        this.memoryShareSummary = null;
        this.memoryShareRuntime = null;
        this.exportExperiencePackBtn = null;
    }

    show() {
        return runSessionPanelShowFlow({
            ensureUi: () => {
                if (!this.panel) this.createUI();
            },
            applyMemoryMode: () => this.applyMemoryMode(),
            populate: () => this.populate(),
            renderArchives: () => this.renderArchives(),
            renderSummaries: () => this.renderSummaries(),
            renderCompactedSummary: () => this.renderCompactedSummary(),
            getMemoryMode: getMemoryStorageMode,
            renderMemoryTable: () => this.memoryTableEditor?.render?.(),
            getOverlayEl: () => this.overlay,
            getPanelEl: () => this.panel,
        });
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    applyMemoryMode() {
        return applySessionPanelMemoryMode({
            memoryMode: getMemoryStorageMode(),
            memoryFeaturesSection: this.memoryFeaturesSection,
            summarySection: this.summarySection,
            memoryTableSection: this.memoryTableSection,
            renderMemoryTable: () => this.memoryTableEditor?.render?.(),
        });
    }

    createUI() {
        const shell = createSessionPanelShell({
            documentRef: document,
            overlayId: 'contact-settings-overlay',
            panelId: 'contact-settings-panel',
            titleId: 'contact-settings-title',
            subtitleId: 'contact-settings-sub',
            closeId: 'contact-settings-close',
            title: '好友设置',
            overlayOpacity: 0.4,
            overlayZIndex: 20000,
            panelZIndex: 21000,
            inset: 10,
            radius: 12,
        });
        this.overlay = shell.overlay;
        this.panel = shell.panel;
        this.overlay.onclick = () => this.hide();

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = async () => {
            const file = this.fileInput.files?.[0];
            if (!file) return;
            try {
                this.currentAvatar = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 420_000 });
                if (this.avatarPreview) this.avatarPreview.src = this.currentAvatar;
            } catch (err) {
                logger.warn('读取/压缩头像失败', err);
                window.toastr?.error?.('读取头像失败');
            }
        };

        const featuresSectionStyle = buildSessionSectionStyle({ marginTop: 16, paddingTop: 14 });
        const manageSectionStyle = buildSessionSectionStyle({ marginTop: 20, paddingTop: 14 });
        const archiveListStyle = buildSessionListContainerStyle({ maxHeight: 160, radius: 8, background: 'var(--app-surface-subtle)' });
        const summariesListStyle = buildSessionListContainerStyle({ maxHeight: 160, radius: 8 });
        const compactedListStyle = buildSessionListContainerStyle({ maxHeight: 200, radius: 8 });
        const newChatButtonStyle = buildSessionWideActionButtonStyle({ accent: true, marginBottom: 10 });
        const exportButtonStyle = buildSessionWideActionButtonStyle({ marginBottom: 10 });
        const toolbarIconButtonStyle = buildSessionIconButtonStyle();
        const batchEditButtonStyle = buildSessionIconButtonStyle({ width: 34, height: 30, fontSize: 16 });
        const batchDeleteButtonStyle = buildSessionIconButtonStyle({ danger: true, width: 34, height: 30, fontSize: 16 });
        const batchCancelButtonStyle = buildSessionIconButtonStyle({ width: 34, height: 30, fontSize: 18 });
        const compactedDangerButtonStyle = buildSessionIconButtonStyle({ danger: true });
        const clearTextButtonStyle = buildSessionTextActionButtonStyle({ danger: true });
        const utilitySmallButtonStyle = buildSessionUtilityButtonStyle({ padding: '8px 12px', fontSize: 12 });
        const utilityButtonStyle = buildSessionUtilityButtonStyle({ whiteSpace: 'nowrap' });
        const footerStyle = buildSessionFooterStyle({ safeAreaBottom: true, alignItems: 'center' });
        const avatarButtonStyle = buildSessionAvatarButtonStyle();
        const coverImageStyle = buildSessionCoverImageStyle();
        const topRowStyle = buildSessionFlexRowStyle({ gap: 14, wrap: true });
        const summaryHeaderRowStyle = buildSessionFlexRowStyle({ justify: 'space-between', gap: 10, margin: '0 0 6px' });
        const toolbarRowStyle = buildSessionFlexRowStyle({ gap: 8 });
        const checkboxRowStyle = buildSessionCheckboxLabelStyle({ margin: '0 0 8px' });
        const checkboxInputStyle = buildSessionCheckboxInputStyle();
        const bridgeCardStyle = buildSessionSurfaceBoxStyle({ display: 'none', margin: '0 0 10px' });
        const bridgeLimitRowStyle = buildSessionCheckboxLabelStyle({
            justify: 'space-between',
            gap: 8,
            margin: '10px 0 0',
            fontSize: 12,
            color: 'var(--app-text-secondary)',
        });
        const bridgeLimitInputStyle = buildSessionCompactInputStyle();
        const summariesBatchBarStyle = buildSessionFlexRowStyle({ display: 'none', justify: 'flex-end', gap: 8, margin: '6px 0 8px' });
        const memoryTableBoxStyle = buildSessionSurfaceBoxStyle({
            display: 'none',
            margin: '14px 0 0',
            padding: 12,
            borderStyle: 'dashed',
            background: 'var(--app-surface-subtle)',
        });
        const fieldLabelStyle = buildSessionFieldLabelStyle();
        const fieldInputStyle = buildSessionTextInputStyle();
        const helperTextStyle = buildSessionHelperTextStyle({ marginTop: 6 });
        const helperCaptionStyle = buildSessionHelperTextStyle({ marginBottom: 6 });
        const sectionTitleStyle = buildSessionHelperTextStyle();
        const bridgeNoteStyle = buildSessionHelperTextStyle({ marginTop: 6, color: 'var(--app-text-secondary)' });
        const memoryShareButtonStyle = buildSessionBlockButtonStyle();
        const memoryShareSummaryStyle = buildSessionHelperTextStyle({ marginTop: 8 });
        const bridgeTitleStyle = buildSessionFieldLabelStyle({ marginBottom: 10 });

        shell.body.innerHTML = `
                <div style="${topRowStyle}">
                    <button id="contact-avatar-btn" type="button" style="${avatarButtonStyle}">
                        <img id="contact-avatar-preview" alt="" style="${coverImageStyle}">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="${fieldLabelStyle}">名称</div>
                        <input id="contact-name-input" style="${fieldInputStyle}">
                        <div style="${helperTextStyle}">仅修改显示名称，不会改变聊天室 ID。</div>
                    </div>
                </div>

                <div style="margin-top:12px;">
                    <div style="${fieldLabelStyle}">标签</div>
                    <input
                        id="contact-labels-input"
                        placeholder="用逗号分隔，如：重制版, SG线"
                        style="${fieldInputStyle}"
                    >
                    <div style="${helperTextStyle}">用于展示标签；不设置则界面保持原样。</div>
                </div>

	                <div style="${featuresSectionStyle}">
	                    <div style="${bridgeTitleStyle}">模板与脚本（本会话）</div>
                    <label style="${checkboxRowStyle}">
                        <input type="checkbox" id="contact-template-enabled" style="${checkboxInputStyle}">
                        <span>启用模板处理</span>
                    </label>
                    <label style="${checkboxRowStyle}">
                        <input type="checkbox" id="contact-script-enabled" style="${checkboxInputStyle}">
                        <span>启用脚本</span>
                    </label>
                    <button id="contact-reset-vars" type="button" style="${utilitySmallButtonStyle}">
                        重置本会话变量
                    </button>
	                    <div style="${helperTextStyle}">仅清空本会话 local 变量，不影响全局变量。</div>
	                </div>

                    <div id="contact-memory-features-section" style="margin-top:16px; border-top:1px solid var(--app-border-subtle); padding-top:14px;">
                        <div id="contact-bridge-block-title" style="${bridgeTitleStyle}">聊天 / RP 桥接（当前会话）</div>
                        <div id="contact-rp-bridge-section" style="${bridgeCardStyle}">
                            <label style="${buildSessionCheckboxLabelStyle({ justify: 'space-between', gap: 10 })}">
                                <span style="${fieldLabelStyle}">注入 RP 总体大纲</span>
                                <input type="checkbox" id="contact-rp-bridge-enabled" style="${checkboxInputStyle}">
                            </label>
                            <div style="${helperTextStyle}">默认来源为当前角色的 RP 会话。</div>
                            <div id="contact-rp-bridge-source-note" style="${bridgeNoteStyle}"></div>
                            <label style="${bridgeLimitRowStyle}">
                                <span>注入条数（0=全部）</span>
                                <input type="number" id="contact-rp-bridge-limit" min="0" step="1"
                                       style="${bridgeLimitInputStyle}">
                            </label>
                        </div>
                        <div id="contact-memory-share-section" style="display:none;">
                            <button id="contact-memory-share-manage" type="button" style="${memoryShareButtonStyle}">
                                记忆共享
                            </button>
                            <div id="contact-memory-share-summary" style="${memoryShareSummaryStyle}; line-height:1.5;"></div>
                        </div>
                    </div>

	                <div style="${manageSectionStyle}">
                    <div style="${bridgeTitleStyle}">聊天管理</div>
                    <button id="contact-new-chat" style="${newChatButtonStyle}">
                        <span>✨</span> 开启新聊天（存档当前）
                    </button>
                    <button id="contact-export-experience-pack" type="button" style="${exportButtonStyle}">
                        <span>📦</span> 导出角色体验包
                    </button>
                    <div style="${helperCaptionStyle}">历史存档（点击加载）</div>
                    <div id="contact-archives-list" style="${archiveListStyle}"></div>

                    <div id="contact-summary-section">
	                    <div style="margin-top:14px;">
	                        <div style="${summaryHeaderRowStyle}">
	                            <div style="${sectionTitleStyle}">摘要（每次对话保存一条）</div>
                                <div style="${toolbarRowStyle}">
	                                <button id="contact-summaries-batch" type="button" title="批量操作" style="${toolbarIconButtonStyle}">☰</button>
	                                <button id="contact-summaries-clear" type="button" style="${clearTextButtonStyle}">清空</button>
                                </div>
	                        </div>
                            <div id="contact-summaries-batchbar" style="${summariesBatchBarStyle}">
                                <button id="contact-summaries-batch-edit" type="button" title="批量编辑" style="${batchEditButtonStyle}">✎</button>
                                <button id="contact-summaries-batch-delete" type="button" title="批量删除" style="${batchDeleteButtonStyle}">🗑</button>
                                <button id="contact-summaries-batch-cancel" type="button" title="退出批量" style="${batchCancelButtonStyle}">×</button>
                            </div>
	                        <div id="contact-summaries-list" style="${summariesListStyle}"></div>
	                    </div>

                        <div style="margin-top:14px;">
                            <div style="${summaryHeaderRowStyle}">
                                <div style="${sectionTitleStyle}">大总结（自动生成）</div>
                                <div style="${toolbarRowStyle}">
                                    <button id="contact-compacted-raw" type="button" title="查看原始回复" style="${toolbarIconButtonStyle}">📄</button>
                                    <button id="contact-compacted-edit" type="button" title="编辑" style="${toolbarIconButtonStyle}">✎</button>
                                    <button id="contact-compacted-run" type="button" title="手动生成/刷新" style="${toolbarIconButtonStyle}">↻</button>
                                    <button id="contact-compacted-clear" type="button" title="删除" style="${compactedDangerButtonStyle}">🗑</button>
                                </div>
                            </div>
                            <div id="contact-compacted-summary" style="${compactedListStyle}"></div>
                        </div>
                    </div>

                    <div id="contact-memory-table-section" style="${memoryTableBoxStyle}">
                        <div style="${fieldLabelStyle}">记忆表格</div>
                        <div id="contact-memory-table-content"></div>
                    </div>
	                </div>
        `;
        const footer = document.createElement('div');
        footer.style.cssText = footerStyle;
        footer.innerHTML = `
            <button id="contact-avatar-clear" type="button" style="${utilityButtonStyle}">清除头像</button>
            <button id="contact-settings-cancel" type="button" style="${SESSION_PANEL_STYLES.secondaryActionButton}">取消</button>
            <button id="contact-settings-save" type="button" style="${SESSION_PANEL_STYLES.primaryActionButton}">保存</button>
        `;
        this.panel.appendChild(footer);

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.fileInput);

        this.avatarPreview = this.panel.querySelector('#contact-avatar-preview');
        this.nameInput = this.panel.querySelector('#contact-name-input');
        this.labelsInput = this.panel.querySelector('#contact-labels-input');
        this.archivesList = this.panel.querySelector('#contact-archives-list');
        this.summariesList = this.panel.querySelector('#contact-summaries-list');
        this.compactedList = this.panel.querySelector('#contact-compacted-summary');
        this.summarySection = this.panel.querySelector('#contact-summary-section');
        this.memoryTableSection = this.panel.querySelector('#contact-memory-table-section');
        this.memoryFeaturesSection = this.panel.querySelector('#contact-memory-features-section');
        this.memoryTableContent = this.panel.querySelector('#contact-memory-table-content');
        this.summariesBatchBar = this.panel.querySelector('#contact-summaries-batchbar');
        this.templateToggle = this.panel.querySelector('#contact-template-enabled');
        this.scriptToggle = this.panel.querySelector('#contact-script-enabled');
        this.resetVarsBtn = this.panel.querySelector('#contact-reset-vars');
        this.rpBridgeSection = this.panel.querySelector('#contact-rp-bridge-section');
        this.rpBridgeToggle = this.panel.querySelector('#contact-rp-bridge-enabled');
        this.rpBridgeLimitInput = this.panel.querySelector('#contact-rp-bridge-limit');
        this.rpBridgeSourceNote = this.panel.querySelector('#contact-rp-bridge-source-note');
        this.memoryShareSection = this.panel.querySelector('#contact-memory-share-section');
        this.memoryShareButton = this.panel.querySelector('#contact-memory-share-manage');
        this.memoryShareSummary = this.panel.querySelector('#contact-memory-share-summary');
        this.exportExperiencePackBtn = this.panel.querySelector('#contact-export-experience-pack');
        const summariesClearButton = this.panel.querySelector('#contact-summaries-clear');
        const summariesBatchButton = this.panel.querySelector('#contact-summaries-batch');
        const summariesBatchCancelButton = this.panel.querySelector('#contact-summaries-batch-cancel');
        const summariesBatchDeleteButton = this.panel.querySelector('#contact-summaries-batch-delete');
        const summariesBatchEditButton = this.panel.querySelector('#contact-summaries-batch-edit');
        const compactedRawButton = this.panel.querySelector('#contact-compacted-raw');
        const compactedEditButton = this.panel.querySelector('#contact-compacted-edit');
        const compactedRunButton = this.panel.querySelector('#contact-compacted-run');
        const compactedClearButton = this.panel.querySelector('#contact-compacted-clear');
        const syncBridgeControls = () => {
            if (this.rpBridgeLimitInput) {
                this.rpBridgeLimitInput.disabled = this.rpBridgeToggle?.checked === false;
            }
        };

        this.panel.querySelector('#contact-settings-close').onclick = () => this.hide();
        this.panel.querySelector('#contact-settings-cancel').onclick = () => this.hide();
        this.exportExperiencePackBtn?.addEventListener('click', async () => {
            const sid = String(this.getSessionId?.() || '').trim();
            if (!sid || typeof this.onExportExperiencePack !== 'function') return;
            if (this.exportExperiencePackBtn) this.exportExperiencePackBtn.disabled = true;
            try {
                await this.onExportExperiencePack(sid);
            } catch (err) {
                logger.error('导出角色体验包失败', err);
                window.toastr?.error?.(err?.message || '导出体验包失败');
            } finally {
                if (this.exportExperiencePackBtn) this.exportExperiencePackBtn.disabled = false;
            }
        });
        this.panel.querySelector('#contact-avatar-btn').onclick = () => {
            this.fileInput.value = '';
            this.fileInput.click();
        };
        this.panel.querySelector('#contact-avatar-clear').onclick = () => {
            this.currentAvatar = '';
            if (this.avatarPreview) {
                const sid = this.getSessionId();
                const c = sid ? (this.contactsStore?.getContact?.(sid) || {}) : {};
                const name = String(this.nameInput?.value || c?.name || sid || '好友').trim() || '好友';
                const tags = Array.isArray(c?.libraryTags) && c.libraryTags.length
                    ? c.libraryTags
                    : Array.isArray(c?.labels)
                        ? c.labels
                        : [];
                this.avatarPreview.src = resolveLineAvatar({
                    avatar: FEATHER_DEFAULT,
                    name,
                    tags,
                    size: 96,
                });
            }
        };
        this.panel.querySelector('#contact-settings-save').onclick = () => this.save();
        this.rpBridgeToggle?.addEventListener('change', syncBridgeControls);
        bindSessionMemoryShareButton({
            buttonEl: this.memoryShareButton,
            openManager: () => this.openMemoryShareManager(),
            logger,
            warnMessage: 'open memory share manager failed',
            errorMessage: '打开记忆共享失败',
            toastr: window.toastr,
        });
        this.resetVarsBtn?.addEventListener('click', async () => {
            const sid = this.getSessionId();
            if (!sid) return;
            const ok = await appConfirm({
                title: '重置变量',
                message: '确定要清空本会话的全部 local 变量吗？',
                danger: true,
            });
            if (!ok) return;
            try {
                this.chatStore?.clearVariables?.(sid);
                window.toastr?.success?.('已清空本会话变量');
            } catch (err) {
                logger.warn('clear session variables failed', err);
                window.toastr?.error?.('清空失败');
            }
        });
        this.panel.querySelector('#contact-new-chat').onclick = () => this.startNewChat();
        bindSessionSummarySectionControls({
            clearButtonEl: summariesClearButton,
            batchButtonEl: summariesBatchButton,
            batchCancelButtonEl: summariesBatchCancelButton,
            batchDeleteButtonEl: summariesBatchDeleteButton,
            batchEditButtonEl: summariesBatchEditButton,
            compactedRawButtonEl: compactedRawButton,
            compactedEditButtonEl: compactedEditButton,
            compactedRunButtonEl: compactedRunButton,
            compactedClearButtonEl: compactedClearButton,
            getSessionId: () => this.getSessionId(),
            getSummaryBatchMode: () => this.summaryBatchMode,
            clearSelectedKeys: () => {
                this.summarySelectedKeys = new Set();
            },
            setSummaryBatchMode: (enabled) => this.setSummaryBatchMode(enabled),
            renderSummaries: () => this.renderSummaries(),
            deleteSelectedSummaries: () => this.deleteSelectedSummaries(),
            editSelectedSummaries: () => this.editSelectedSummaries(),
            openCompactedRaw: () => this.openCompactedRaw(),
            editCompactedSummary: () => this.editCompactedSummary(),
            runCompactedSummary: () => this.runCompactedSummary(),
            renderCompactedSummary: () => this.renderCompactedSummary(),
            clearSummaries: (sessionId) => this.chatStore?.clearSummaries?.(sessionId),
            clearCompactedSummary: (sessionId) => this.chatStore?.clearCompactedSummary?.(sessionId),
            confirm: (options) => appConfirm(options),
        });

        if (this.memoryTableContent && window.appBridge) {
            this.memoryTableEditor = new MemoryTableEditor({
                container: this.memoryTableContent,
                getContext: () => {
                    const contactId = this.getSessionId();
                    return { type: isRpSessionId(contactId) ? 'rp' : 'contact', contactId };
                },
                memoryStore: window.appBridge.memoryTableStore,
                templateStore: window.appBridge.memoryTemplateStore,
                includeGlobal: true,
            });
        }

        bindSessionPanelSharedWindowEvents({
            target: window,
            isPanelVisible: () => Boolean(this.panel && this.panel.style.display !== 'none'),
            applyMemoryMode: () => this.applyMemoryMode(),
            getSessionId: () => this.getSessionId(),
            renderSummaries: () => this.renderSummaries(),
            renderCompactedSummary: () => this.renderCompactedSummary(),
        });
    }

    ensureSummaryRuntime() {
        if (this.summaryRuntime) return this.summaryRuntime;
        this.summaryRuntime = createSessionSummarySectionRuntime({
            variant: 'contact',
            getSessionId: () => this.getSessionId(),
            getChatStore: () => this.chatStore,
            getSummariesContainer: () => this.summariesList,
            getCompactedContainer: () => this.compactedList,
            getBatchBar: () => this.summariesBatchBar,
            getBatchMode: () => this.summaryBatchMode,
            setBatchModeState: (value) => {
                this.summaryBatchMode = Boolean(value);
            },
            getSelectedKeys: () => this.summarySelectedKeys,
            setSelectedKeys: (value) => {
                this.summarySelectedKeys = value instanceof Set ? value : new Set(value || []);
            },
            getSummaryCompacting: () => this.summaryCompacting,
            setSummaryCompacting: (value) => {
                this.summaryCompacting = Boolean(value);
            },
            confirm: (options) => appConfirm(options),
            copyText: async (text) => navigator.clipboard?.writeText?.(text),
            toastr: window.toastr,
            logger,
            getNormalRowStyle: () => buildSessionSummaryRowStyle(),
            dispatchUpdated: (sessionId) => {
                window.dispatchEvent(new CustomEvent('chatapp-summaries-updated', { detail: { sessionId } }));
            },
            resolveRequestSummaryCompaction: () =>
                globalThis?.__chatappRequestSummaryCompaction ||
                window?.__chatappRequestSummaryCompaction ||
                window?.appBridge?.requestSummaryCompaction,
        });
        return this.summaryRuntime;
    }

    openCompactedRaw() {
        return this.ensureSummaryRuntime().openCompactedRaw();
    }

    editCompactedSummary() {
        return this.ensureSummaryRuntime().editCompactedSummary();
    }

    setSummaryBatchMode(enabled) {
        return this.ensureSummaryRuntime().setSummaryBatchMode(enabled);
    }

    async deleteSelectedSummaries() {
        await this.ensureSummaryRuntime().deleteSelectedSummaries();
    }

    editSelectedSummaries() {
        return this.ensureSummaryRuntime().editSelectedSummaries();
    }

    async runCompactedSummary() {
        await this.ensureSummaryRuntime().runCompactedSummary();
    }

    ensureNewChatRuntime() {
        if (this.newChatRuntime) return this.newChatRuntime;
        this.newChatRuntime = createSessionNewChatSectionRuntime({
            getSessionId: () => this.getSessionId(),
            isGroup: false,
            resolveSessionMode: ({ sessionId }) => isRpSessionId(sessionId) ? 'rp' : 'chat',
            getMemoryStorageMode,
            askMemoryTableNewChatMode,
            promptForArchiveName: () => prompt('请输入当前聊天的存档名称（留空将自动命名）：'),
            buildMemoryTableSnapshot: ({ sessionId, isGroup }) => buildMemoryTableSnapshot({ sessionId, isGroup }),
            captureArchivePointer: (sessionId, options) =>
                window.appBridge?.buildArchivePointerFromCurrentThread?.(sessionId, options),
            memoryTableStore: window.appBridge?.memoryTableStore,
            resolveDefaultMemoryTemplateId,
            resolveSummaryTableIds: ({ sessionId, isGroup, sessionMode }) => {
                const { summaryTableId, outlineTableId } = getSummaryTableIdsForContext({
                    sessionId,
                    isGroup,
                    contextType: isRpSessionId(sessionId) ? 'rp' : (isGroup ? 'group' : 'contact'),
                    uiMode: sessionMode === 'rp' || isRpSessionId(sessionId) ? 'rp' : 'chat',
                });
                return [summaryTableId, outlineTableId];
            },
            notifyRowsUpdated: ({ sessionId, templateId }) =>
                emitSharedMemoryRowsUpdated({ target: window, sessionId, templateId }),
            startNewChat: (sessionId, archiveName, options) => this.chatStore.startNewChat(sessionId, archiveName, options),
            persistArchivePointer: (sessionId, archiveId, archivePointer, options) =>
                window.appBridge?.setArchivePointerForArchive?.(sessionId, archiveId, archivePointer, options),
            restoreMemoryForActiveThread: (sessionId, options) =>
                window.appBridge?.restoreMemoryForActiveThread?.(sessionId, options),
            logger,
            sourcePrefix: 'contact',
            onStarted: ({ sessionId }) => {
                window.toastr?.success('已开启新聊天');
                this.onSaved?.({ id: sessionId, forceRefresh: true });
                this.hide();
            },
        });
        return this.newChatRuntime;
    }

    ensureArchiveRuntime() {
        if (this.archiveRuntime) return this.archiveRuntime;
        this.archiveRuntime = createSessionArchiveSectionRuntime({
            getContainer: () => this.archivesList,
            getSessionId: () => this.getSessionId(),
            getChatStore: () => this.chatStore,
            isGroup: false,
            getMemoryStorageMode,
            buildMemoryTableSnapshot: ({ sessionId, isGroup }) => buildMemoryTableSnapshot({ sessionId, isGroup }),
            captureArchivePointer: (sessionId, options) =>
                window.appBridge?.buildArchivePointerFromCurrentThread?.(sessionId, options),
            loadArchivedMessages: (archiveId, sessionId, options) =>
                this.chatStore.loadArchivedMessages(archiveId, sessionId, options),
            getLastArchiveTransition: (sessionId) => this.chatStore.getLastArchiveTransition?.(sessionId),
            persistArchivePointer: (sessionId, archiveId, archivePointer, options) =>
                window.appBridge?.setArchivePointerForArchive?.(sessionId, archiveId, archivePointer, options),
            applyMemoryTableSnapshot: ({ sessionId, isGroup, snapshot }) =>
                applyMemoryTableSnapshot({ sessionId, isGroup, snapshot }),
            restoreArchivePointerForLoadedThread: (sessionId, options) =>
                window.appBridge?.restoreArchivePointerForLoadedThread?.(sessionId, options),
            logger,
            appConfirmFn: appConfirm,
            runArchiveSwitchFlow,
            runArchiveDeleteFlow,
            deleteArchiveTurnCheckpointState: (sessionId, archiveId) =>
                window.appBridge?.deleteArchiveTurnCheckpointState?.(sessionId, archiveId),
            deleteArchive: (archiveId, sessionId) => this.chatStore.deleteArchive(archiveId, sessionId),
            onArchiveLoaded: (sessionId) => {
                window.toastr?.success('已加载存档');
                this.onSaved?.({ id: sessionId, forceRefresh: true });
            },
            onArchiveDeleted: () => this.renderArchives(),
            onHide: () => this.hide(),
            createEmptyState: () => createSessionArchiveEmptyState(),
            createArchiveRow: (payload) => createSessionArchiveRow(payload),
            sourcePrefix: 'contact',
            restoreWarnMessage: 'restore checkpoint memory after archive load failed',
            deleteWarnMessage: 'delete archive turn checkpoint state failed',
        });
        return this.archiveRuntime;
    }

    renderArchives() {
        return this.ensureArchiveRuntime().renderArchives();
    }

    renderSummaries() {
        return this.ensureSummaryRuntime().renderSummaries();
    }

    renderCompactedSummary() {
        return this.ensureSummaryRuntime().renderCompactedSummary();
    }

    async startNewChat() {
        if (!this.chatStore) return;
        return this.ensureNewChatRuntime().startNewChat();
    }

    getRpDisplayName(sessionId = this.getSessionId()) {
        return this.ensureMemoryShareRuntime().getRpDisplayName(sessionId);
    }

    ensureMemoryShareRuntime() {
        if (this.memoryShareRuntime) return this.memoryShareRuntime;
        this.memoryShareRuntime = createContactMemoryShareRuntime({
            getSessionId: () => this.getSessionId(),
            getSummaryEl: () => this.memoryShareSummary,
            getSessionSettings: (sessionId) => this.chatStore?.getSessionSettings?.(sessionId),
            setSessionSettings: (sessionId, sessionSettings) => this.chatStore?.setSessionSettings?.(sessionId, sessionSettings),
            getContact: (sessionId) => this.contactsStore?.getContact?.(sessionId),
            listSessions: () => this.chatStore?.listSessions?.() || [],
            memoryTableStore: window.appBridge?.memoryTableStore,
            resolveTemplateDefinition: () => resolveDefaultMemoryTemplateDefinition(),
            resolveTemplateId: () => resolveDefaultMemoryTemplateId(),
            getRpCharacterNameForSession: (sessionId) => window.appBridge?.getRpCharacterNameForSession?.(sessionId),
            getRpSessionIdForSession: (sessionId) => window.appBridge?.getRpSessionIdForSession?.(sessionId),
            getRpSessionIdForActivePersona: () => window.appBridge?.getRpSessionIdForActivePersona?.(),
            bodyEl: document.body,
            bindSourceButton: ({ buttonEl, selectEl, fallback }) => {
                bindCustomSelectButton({ buttonEl, selectEl, fallback });
            },
            refreshSourceButton: ({ sourceButtonEl, sourceSelectEl, fallbackLabel }) =>
                refreshCustomSelectButton(sourceButtonEl, sourceSelectEl, fallbackLabel),
            closeSourceMenu: () => closeCustomSelectMenu(),
            documentRef: document,
            getGlobalSettings: () => appSettings.get(),
            notifySaveSuccess: () => window.toastr?.success?.('已保存记忆共享设置'),
            notifySaveError: () => window.toastr?.error?.('保存记忆共享失败'),
            logger,
        });
        return this.memoryShareRuntime;
    }

    async refreshMemoryShareSummary(sessionId = this.getSessionId()) {
        return this.ensureMemoryShareRuntime().refreshMemoryShareSummary(sessionId);
    }

    ensureMemoryShareModal() {
        return this.ensureMemoryShareRuntime().ensureMemoryShareModal();
    }

    closeMemoryShareManager() {
        return this.ensureMemoryShareRuntime().closeMemoryShareManager();
    }

    async renderMemoryShareManager() {
        return this.ensureMemoryShareRuntime().renderMemoryShareManager();
    }

    async openMemoryShareManager() {
        await this.ensureMemoryShareRuntime().openMemoryShareManager();
    }

    async saveMemoryShareManager() {
        await this.ensureMemoryShareRuntime().saveMemoryShareManager();
    }

    populate() {
        return runContactSettingsPopulateFlow({
            sessionId: this.getSessionId(),
            contactsStore: this.contactsStore,
            chatStore: this.chatStore,
            panel: this.panel,
            avatarPreview: this.avatarPreview,
            nameInput: this.nameInput,
            labelsInput: this.labelsInput,
            templateToggle: this.templateToggle,
            scriptToggle: this.scriptToggle,
            rpBridgeSection: this.rpBridgeSection,
            memoryShareSection: this.memoryShareSection,
            memoryShareSummary: this.memoryShareSummary,
            exportExperiencePackBtn: this.exportExperiencePackBtn,
            onExportExperiencePack: this.onExportExperiencePack,
            globalSettings: appSettings.get(),
            setCurrentAvatar: (value) => {
                this.currentAvatar = value;
            },
            getRpDisplayName: (sessionId) => this.getRpDisplayName(sessionId),
            refreshMemoryShareSummary: (sessionId) => this.refreshMemoryShareSummary(sessionId),
            resolveAvatar: (payload) => resolveLineAvatar(payload),
            defaultAvatar: FEATHER_DEFAULT,
            logger,
        });
    }

    save() {
        return runContactSettingsSaveFlow({
            sessionId: this.getSessionId(),
            contactsStore: this.contactsStore,
            chatStore: this.chatStore,
            nameInput: this.nameInput,
            labelsInput: this.labelsInput,
            currentAvatar: this.currentAvatar,
            templateToggle: this.templateToggle,
            scriptToggle: this.scriptToggle,
            onSaved: this.onSaved,
            hide: () => this.hide(),
            notifySuccess: (message) => window.toastr?.success?.(message),
            notifyError: (message) => window.toastr?.error?.(message),
            logger,
        });
    }
}
