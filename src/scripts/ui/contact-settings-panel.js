/**
 * Contact settings panel
 * - Edit contact display name + avatar (does not rename session id)
 */
import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { appSettings } from '../storage/app-settings.js';
import { getSummaryTableIdsForContext, isRpSessionId } from '../memory/memory-context-utils.js';
import { MemoryTableEditor } from './memory-table-editor.js';
import { appChoice, appConfirm, appPromptText } from './app-confirm.js';
import { normalizeBadgeList } from '../utils/name-badges.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import { bindCustomSelectButton, closeCustomSelectMenu, refreshCustomSelectButton } from './custom-select.js';
import {
    runContactSettingsPopulateFlow,
    runContactSettingsSaveFlow,
} from './contact-settings-runtime-utils.js';
import { createContactMemoryShareRuntime } from './contact-memory-share-runtime-utils.js';
import { getMemoryTableStore, getMemoryTemplateStore } from './memory-store-runtime-utils.js';
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
import { runSessionConversationExportFlow } from './session-conversation-export-utils.js';
import {
    createSessionArchiveEmptyState,
    createSessionArchiveManagerModal,
    createSessionArchiveRow,
} from './session-shared-view-utils.js';
const resolveDefaultMemoryTemplateId = async (memoryTemplateStore = null) => resolveSharedDefaultMemoryTemplateId({
    memoryTemplateStore,
});

const resolveDefaultMemoryTemplateDefinition = async (memoryTemplateStore = null) => resolveSharedDefaultMemoryTemplateDefinition({
    memoryTemplateStore,
});

const buildMemoryTableSnapshot = async ({
    sessionId,
    isGroup,
    memoryTableStore = null,
    memoryTemplateStore = null,
} = {}) => buildSharedMemoryTableSnapshot({
    sessionId,
    isGroup,
    memoryTableStore,
    resolveDefaultMemoryTemplateId: () => resolveDefaultMemoryTemplateId(memoryTemplateStore),
});

const applyMemoryTableSnapshot = async ({
    sessionId,
    isGroup,
    snapshot,
    memoryTableStore = null,
    memoryTemplateStore = null,
} = {}) => applySharedMemoryTableSnapshot({
    sessionId,
    isGroup,
    snapshot,
    memoryTableStore,
    resolveDefaultMemoryTemplateId: () => resolveDefaultMemoryTemplateId(memoryTemplateStore),
    notifyRowsUpdated: ({ sessionId, templateId }) =>
        emitSharedMemoryRowsUpdated({ target: window, sessionId, templateId }),
});

const trimProfileText = (value, fallback = '') => {
    const text = String(value ?? '').trim();
    return text || fallback;
};

const listProfileText = (items = [], {
    field = '',
    limit = 6,
} = {}) => {
    const source = Array.isArray(items) ? items : [items];
    const values = source
        .map(item => trimProfileText(field && item && typeof item === 'object' ? item[field] : item))
        .filter(Boolean)
        .slice(0, Math.max(0, Number(limit) || 0));
    return values.join('、');
};

const formatProfileUpdatedAt = (value = 0) => {
    const time = Number(value || 0);
    if (!Number.isFinite(time) || time <= 0) return '';
    try {
        return new Date(time).toLocaleString();
    } catch {
        return '';
    }
};

const clearElement = (element) => {
    if (!element) return;
    while (element.firstChild) element.removeChild(element.firstChild);
};

export class ContactSettingsPanel {
    constructor({
        contactsStore,
        chatStore,
        getSessionId,
        memoryTableStore = null,
        memoryTemplateStore = null,
        onSaved,
        onExportExperiencePack,
        onOpenRegex,
        onOpenVariables,
        voiceRegistryStore = null,
    } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        const bridge = typeof window !== 'undefined' ? window.appBridge : null;
        this.memoryTableStore = memoryTableStore || getMemoryTableStore(bridge);
        this.memoryTemplateStore = memoryTemplateStore || getMemoryTemplateStore(bridge);
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => 'default';
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;
        this.onExportExperiencePack = typeof onExportExperiencePack === 'function' ? onExportExperiencePack : null;
        this.onOpenRegex = typeof onOpenRegex === 'function' ? onOpenRegex : null;
        this.onOpenVariables = typeof onOpenVariables === 'function' ? onOpenVariables : null;
        this.voiceRegistryStore = voiceRegistryStore;
        this.overlay = null;
        this.panel = null;
        this.fileInput = null;
        this.avatarPreview = null;
        this.nameInput = null;
        this.archivesList = null;
        this.archiveRuntime = null;
        this.archiveManageButton = null;
        this.archiveManagerModal = null;
        this.archiveManagerRuntime = null;
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
        this.openRegexBtn = null;
        this.openVariablesBtn = null;
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
        this.contactProfileButton = null;
        this.contactProfileOverlay = null;
        this.contactProfilePanel = null;
        this.contactProfileTitle = null;
        this.contactProfileSubtitle = null;
        this.contactProfileBody = null;
        this.contactProfileRefreshButton = null;
        this.contactProfileGenerateButton = null;
    }

    resolveDefaultMemoryTemplateId() {
        return resolveDefaultMemoryTemplateId(this.memoryTemplateStore);
    }

    resolveDefaultMemoryTemplateDefinition() {
        return resolveDefaultMemoryTemplateDefinition(this.memoryTemplateStore);
    }

    buildMemoryTableSnapshot(payload = {}) {
        return buildMemoryTableSnapshot({
            ...payload,
            memoryTableStore: this.memoryTableStore,
            memoryTemplateStore: this.memoryTemplateStore,
        });
    }

    applyMemoryTableSnapshot(payload = {}) {
        return applyMemoryTableSnapshot({
            ...payload,
            memoryTableStore: this.memoryTableStore,
            memoryTemplateStore: this.memoryTemplateStore,
        });
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
        this.hideArchiveManager();
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
        const contactProfileButtonStyle = buildSessionUtilityButtonStyle({
            padding: '7px 10px',
            fontSize: 12,
            whiteSpace: 'nowrap',
        });

        shell.body.innerHTML = `
                <div style="${topRowStyle}">
                    <button id="contact-avatar-btn" type="button" style="${avatarButtonStyle}">
                        <img id="contact-avatar-preview" alt="" style="${coverImageStyle}">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div class="has-help" data-help="仅修改显示名称，不会改变聊天室 ID。" style="${fieldLabelStyle}">名称</div>
                        <input id="contact-name-input" style="${fieldInputStyle}">
                    </div>
                </div>

                <div style="margin-top:12px;">
                    <div class="has-help" data-help="用于展示标签；不设置则界面保持原样。" style="${fieldLabelStyle}">标签</div>
                    <input
                        id="contact-labels-input"
                        placeholder="用逗号分隔，如：重制版, SG线"
                        style="${fieldInputStyle}"
                    >
                </div>

                <div id="contact-voice-section" style="margin-top:12px;">
                    <div class="has-help" data-help="人物声音在 API 设置 → 语音模型 → 人物声音库中管理。" style="${fieldLabelStyle}">声音</div>
                    <select id="contact-voice-select" style="${fieldInputStyle}"></select>
                    <div style="${helperTextStyle}">默认（全局）会跟随当前 TTS 设置；声音绑定仅保存在本机。</div>
                </div>

	                <div style="${featuresSectionStyle}">
	                    <div class="has-help" data-help="正则与变量属于高级脚本配置；重置仅清空本会话 local 变量，不影响全局变量。" style="${bridgeTitleStyle}">模板与脚本（本会话）</div>
                    <label style="${checkboxRowStyle}">
                        <input type="checkbox" id="contact-template-enabled" style="${checkboxInputStyle}">
                        <span>启用模板处理</span>
                    </label>
                    <label style="${checkboxRowStyle}">
                        <input type="checkbox" id="contact-script-enabled" style="${checkboxInputStyle}">
                        <span>启用脚本</span>
                    </label>
                    <div style="${buildSessionFlexRowStyle({ gap: 8, wrap: true, margin: '8px 0 8px' })}">
                        <button id="contact-open-regex" type="button" style="${utilitySmallButtonStyle}">
                            正规表达式
                        </button>
                        <button id="contact-open-vars-panel" type="button" style="${utilitySmallButtonStyle}">
                            变量管理器
                        </button>
                    </div>
                    <button id="contact-reset-vars" type="button" style="${utilitySmallButtonStyle}">
                        重置本会话变量
                    </button>
	                </div>

                    <div id="contact-memory-features-section" style="margin-top:16px; border-top:1px solid var(--app-border-subtle); padding-top:14px;">
                        <div id="contact-bridge-block-title" style="${bridgeTitleStyle}">聊天 / 创意写作桥接（当前会话）</div>
                        <div id="contact-rp-bridge-section" style="${bridgeCardStyle}">
                            <label style="${buildSessionCheckboxLabelStyle({ justify: 'space-between', gap: 10 })}">
                                <span class="has-help" data-help="默认来源为当前角色的创意写作会话。" data-help-mode="press" style="${fieldLabelStyle}">注入创意写作总体大纲</span>
                                <input type="checkbox" id="contact-rp-bridge-enabled" style="${checkboxInputStyle}">
                            </label>
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
                    <div style="${summaryHeaderRowStyle}">
                        <div style="${helperCaptionStyle}; margin-bottom:0;">历史存档（点击加载）</div>
                        <button id="contact-archives-manage" type="button" style="${utilitySmallButtonStyle}">管理</button>
                    </div>
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
                        <div style="${summaryHeaderRowStyle}">
                            <div style="${fieldLabelStyle}; margin-bottom:0;">记忆表格</div>
                            <button id="contact-profile-manage" type="button" style="${contactProfileButtonStyle}">联系人画像</button>
                        </div>
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
        this.voiceSelect = this.panel.querySelector('#contact-voice-select');
        this.voiceSection = this.panel.querySelector('#contact-voice-section');
        this.archivesList = this.panel.querySelector('#contact-archives-list');
        this.archiveManageButton = this.panel.querySelector('#contact-archives-manage');
        this.summariesList = this.panel.querySelector('#contact-summaries-list');
        this.compactedList = this.panel.querySelector('#contact-compacted-summary');
        this.summarySection = this.panel.querySelector('#contact-summary-section');
        this.memoryTableSection = this.panel.querySelector('#contact-memory-table-section');
        this.memoryFeaturesSection = this.panel.querySelector('#contact-memory-features-section');
        this.memoryTableContent = this.panel.querySelector('#contact-memory-table-content');
        this.summariesBatchBar = this.panel.querySelector('#contact-summaries-batchbar');
        this.templateToggle = this.panel.querySelector('#contact-template-enabled');
        this.scriptToggle = this.panel.querySelector('#contact-script-enabled');
        this.openRegexBtn = this.panel.querySelector('#contact-open-regex');
        this.openVariablesBtn = this.panel.querySelector('#contact-open-vars-panel');
        this.resetVarsBtn = this.panel.querySelector('#contact-reset-vars');
        this.rpBridgeSection = this.panel.querySelector('#contact-rp-bridge-section');
        this.rpBridgeToggle = this.panel.querySelector('#contact-rp-bridge-enabled');
        this.rpBridgeLimitInput = this.panel.querySelector('#contact-rp-bridge-limit');
        this.rpBridgeSourceNote = this.panel.querySelector('#contact-rp-bridge-source-note');
        this.memoryShareSection = this.panel.querySelector('#contact-memory-share-section');
        this.memoryShareButton = this.panel.querySelector('#contact-memory-share-manage');
        this.memoryShareSummary = this.panel.querySelector('#contact-memory-share-summary');
        this.exportExperiencePackBtn = this.panel.querySelector('#contact-export-experience-pack');
        this.contactProfileButton = this.panel.querySelector('#contact-profile-manage');
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
        this.openRegexBtn?.addEventListener('click', () => {
            this.hide();
            this.onOpenRegex?.();
        });
        this.openVariablesBtn?.addEventListener('click', () => {
            this.hide();
            this.onOpenVariables?.();
        });
        bindSessionMemoryShareButton({
            buttonEl: this.memoryShareButton,
            openManager: () => this.openMemoryShareManager(),
            logger,
            warnMessage: 'open memory share manager failed',
            errorMessage: '打开记忆共享失败',
            toastr: window.toastr,
        });
        this.contactProfileButton?.addEventListener('click', () => {
            this.openContactProfileManager();
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
        this.archiveManageButton?.addEventListener('click', () => this.openArchiveManager());
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

        if (this.memoryTableContent && this.memoryTableStore && this.memoryTemplateStore) {
            this.memoryTableEditor = new MemoryTableEditor({
                container: this.memoryTableContent,
                getContext: () => {
                    const contactId = this.getSessionId();
                    return { type: isRpSessionId(contactId) ? 'rp' : 'contact', contactId };
                },
                memoryStore: this.memoryTableStore,
                templateStore: this.memoryTemplateStore,
                contactsStore: this.contactsStore,
                chatStore: this.chatStore,
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
            promptForArchiveName: () => appPromptText({
                title: '为当前聊天存档',
                message: '留空会自动命名；取消则不会开启新聊天。',
                placeholder: '存档名称（可选）',
                confirmText: '继续',
            }),
            buildMemoryTableSnapshot: ({ sessionId, isGroup }) => this.buildMemoryTableSnapshot({ sessionId, isGroup }),
            captureArchivePointer: (sessionId, options) =>
                window.appBridge?.buildArchivePointerFromCurrentThread?.(sessionId, options),
            memoryTableStore: this.memoryTableStore,
            resolveDefaultMemoryTemplateId: () => this.resolveDefaultMemoryTemplateId(),
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
            buildMemoryTableSnapshot: ({ sessionId, isGroup }) => this.buildMemoryTableSnapshot({ sessionId, isGroup }),
            captureArchivePointer: (sessionId, options) =>
                window.appBridge?.buildArchivePointerFromCurrentThread?.(sessionId, options),
            loadArchivedMessages: (archiveId, sessionId, options) =>
                this.chatStore.loadArchivedMessages(archiveId, sessionId, options),
            getLastArchiveTransition: (sessionId) => this.chatStore.getLastArchiveTransition?.(sessionId),
            persistArchivePointer: (sessionId, archiveId, archivePointer, options) =>
                window.appBridge?.setArchivePointerForArchive?.(sessionId, archiveId, archivePointer, options),
            applyMemoryTableSnapshot: ({ sessionId, isGroup, snapshot }) =>
                this.applyMemoryTableSnapshot({ sessionId, isGroup, snapshot }),
            restoreArchivePointerForLoadedThread: (sessionId, options) =>
                window.appBridge?.restoreArchivePointerForLoadedThread?.(sessionId, options),
            logger,
            appConfirmFn: appConfirm,
            runArchiveSwitchFlow,
            runArchiveDeleteFlow,
            deleteArchiveTurnCheckpointState: (sessionId, archiveId) =>
                window.appBridge?.deleteArchiveTurnCheckpointState?.(sessionId, archiveId),
            deleteArchive: (archiveId, sessionId) => this.chatStore.deleteArchive(archiveId, sessionId),
            renameArchive: (archiveId, name, sessionId) => this.chatStore.renameArchive(archiveId, name, sessionId),
            promptArchiveRenameName: ({ archive }) => prompt('重命名存档', archive?.name || ''),
            includeCurrentThread: true,
            onExportCurrent: ({ sessionId }) => this.exportConversationArchive({ sessionId, current: true }),
            onExportArchive: ({ sessionId, archive }) => this.exportConversationArchive({ sessionId, archive }),
            onArchiveLoaded: (sessionId) => {
                window.toastr?.success('已加载存档');
                this.onSaved?.({ id: sessionId, forceRefresh: true });
            },
            onArchiveDeleted: () => this.renderArchives(),
            onArchiveRenamed: (sessionId) => {
                window.toastr?.success('已重命名存档');
                this.onSaved?.({ id: sessionId, forceRefresh: true });
                this.renderArchives();
            },
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

    exportConversationArchive(payload = {}) {
        const sessionId = String(payload?.sessionId || this.getSessionId() || '').trim();
        const archive = payload?.archive || null;
        const current = payload?.current === true;
        return runSessionConversationExportFlow({
            chatStore: this.chatStore,
            sessionId,
            archive,
            current,
            title: current ? '当前聊天' : (archive?.name || '未命名存档'),
            sourceLabel: current ? '当前聊天' : `存档：${archive?.name || archive?.id || '未命名存档'}`,
            appChoiceFn: appChoice,
            toastSuccess: text => window.toastr?.success?.(text),
            toastWarning: text => window.toastr?.warning?.(text),
            toastError: text => window.toastr?.error?.(text),
            logger,
        });
    }

    ensureArchiveManagerModal() {
        if (this.archiveManagerModal) return this.archiveManagerModal;
        const modal = createSessionArchiveManagerModal({
            documentRef: document,
            title: '历史存档',
        });
        modal.overlay.addEventListener('click', () => this.hideArchiveManager());
        modal.closeButton.addEventListener('click', () => this.hideArchiveManager());
        document.body.appendChild(modal.overlay);
        document.body.appendChild(modal.panel);
        this.archiveManagerModal = modal;
        return modal;
    }

    openArchiveManager() {
        const modal = this.ensureArchiveManagerModal();
        const sessionId = this.getSessionId();
        const count = Number(this.chatStore?.getArchives?.(sessionId)?.length || 0) || 0;
        if (modal.subtitleEl) modal.subtitleEl.textContent = `${count} 份`;
        modal.overlay.style.display = 'block';
        modal.panel.style.display = 'flex';
        this.renderArchiveManagerArchives();
    }

    hideArchiveManager() {
        if (this.archiveManagerModal?.overlay) this.archiveManagerModal.overlay.style.display = 'none';
        if (this.archiveManagerModal?.panel) this.archiveManagerModal.panel.style.display = 'none';
    }

    ensureArchiveManagerRuntime() {
        if (this.archiveManagerRuntime) return this.archiveManagerRuntime;
        this.archiveManagerRuntime = createSessionArchiveSectionRuntime({
            getContainer: () => this.ensureArchiveManagerModal().listEl,
            getSessionId: () => this.getSessionId(),
            getChatStore: () => this.chatStore,
            isGroup: false,
            getMemoryStorageMode,
            buildMemoryTableSnapshot: ({ sessionId, isGroup }) => this.buildMemoryTableSnapshot({ sessionId, isGroup }),
            captureArchivePointer: (sessionId, options) =>
                window.appBridge?.buildArchivePointerFromCurrentThread?.(sessionId, options),
            loadArchivedMessages: (archiveId, sessionId, options) =>
                this.chatStore.loadArchivedMessages(archiveId, sessionId, options),
            getLastArchiveTransition: (sessionId) => this.chatStore.getLastArchiveTransition?.(sessionId),
            persistArchivePointer: (sessionId, archiveId, archivePointer, options) =>
                window.appBridge?.setArchivePointerForArchive?.(sessionId, archiveId, archivePointer, options),
            applyMemoryTableSnapshot: ({ sessionId, isGroup, snapshot }) =>
                this.applyMemoryTableSnapshot({ sessionId, isGroup, snapshot }),
            restoreArchivePointerForLoadedThread: (sessionId, options) =>
                window.appBridge?.restoreArchivePointerForLoadedThread?.(sessionId, options),
            logger,
            appConfirmFn: appConfirm,
            runArchiveSwitchFlow,
            runArchiveDeleteFlow,
            deleteArchiveTurnCheckpointState: (sessionId, archiveId) =>
                window.appBridge?.deleteArchiveTurnCheckpointState?.(sessionId, archiveId),
            deleteArchive: (archiveId, sessionId) => this.chatStore.deleteArchive(archiveId, sessionId),
            renameArchive: (archiveId, name, sessionId) => this.chatStore.renameArchive(archiveId, name, sessionId),
            promptArchiveRenameName: ({ archive }) => prompt('重命名存档', archive?.name || ''),
            includeCurrentThread: true,
            onExportCurrent: ({ sessionId }) => this.exportConversationArchive({ sessionId, current: true }),
            onExportArchive: ({ sessionId, archive }) => this.exportConversationArchive({ sessionId, archive }),
            onArchiveLoaded: (sessionId) => {
                window.toastr?.success('已加载存档');
                this.onSaved?.({ id: sessionId, forceRefresh: true });
            },
            onArchiveDeleted: () => {
                this.renderArchives();
                this.renderArchiveManagerArchives();
            },
            onArchiveRenamed: (sessionId) => {
                window.toastr?.success('已重命名存档');
                this.onSaved?.({ id: sessionId, forceRefresh: true });
                this.renderArchives();
                this.renderArchiveManagerArchives();
            },
            onHide: () => {
                this.hideArchiveManager();
                this.hide();
            },
            createEmptyState: () => createSessionArchiveEmptyState(),
            createArchiveRow: (payload) => createSessionArchiveRow(payload),
            sourcePrefix: 'contact',
            restoreWarnMessage: 'restore checkpoint memory after archive load failed',
            deleteWarnMessage: 'delete archive turn checkpoint state failed',
        });
        return this.archiveManagerRuntime;
    }

    renderArchiveManagerArchives() {
        const modal = this.ensureArchiveManagerModal();
        const sessionId = this.getSessionId();
        const count = Number(this.chatStore?.getArchives?.(sessionId)?.length || 0) || 0;
        if (modal.subtitleEl) modal.subtitleEl.textContent = `${count} 份`;
        return this.ensureArchiveManagerRuntime().renderArchives();
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
            memoryTableStore: this.memoryTableStore,
            resolveTemplateDefinition: () => this.resolveDefaultMemoryTemplateDefinition(),
            resolveTemplateId: () => this.resolveDefaultMemoryTemplateId(),
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
            updateGlobalSettings: (patch) => appSettings.update(patch),
            dispatchSettingChanged: (key, value) =>
                window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key, value } })),
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

    getContactProfileBridge() {
        return typeof window !== 'undefined' ? window.appBridge : null;
    }

    getCurrentContactProfile(contactId = this.getSessionId()) {
        const id = trimProfileText(contactId);
        if (!id) return null;
        const bridge = this.getContactProfileBridge();
        try {
            const direct = bridge?.getContactProfile?.(id);
            if (direct) return direct;
        } catch {}
        try {
            return (bridge?.listContactProfiles?.() || [])
                .find(profile => trimProfileText(profile?.contactId || profile?.id) === id) || null;
        } catch {
            return null;
        }
    }

    listContactProfilePendingUpdates(contactId = this.getSessionId()) {
        const id = trimProfileText(contactId);
        if (!id) return [];
        const bridge = this.getContactProfileBridge();
        try {
            return (bridge?.listContactProfilePendingUpdates?.() || [])
                .filter(item => trimProfileText(item?.contactId || item?.profile?.contactId) === id);
        } catch {
            return [];
        }
    }

    callContactProfileAction(actionName = '', payload = {}) {
        const bridge = this.getContactProfileBridge();
        const direct = bridge?.[actionName];
        if (typeof direct === 'function') return direct.call(bridge, payload);
        const debugAction = bridge?.debugUiRegistry?.actions?.[actionName];
        if (typeof debugAction === 'function') return debugAction(payload);
        return null;
    }

    describeContactProfile(profile = {}) {
        const parts = [];
        const relationship = trimProfileText(profile?.relationship?.current);
        const focus = listProfileText(profile?.interaction_focus, { limit: 4 });
        const traits = listProfileText(profile?.stable_traits, { field: 'label', limit: 3 });
        const events = listProfileText(profile?.important_events, { field: 'label', limit: 2 });
        if (relationship) parts.push(relationship);
        if (focus) parts.push(`近期主题：${focus}`);
        if (traits) parts.push(`特征：${traits}`);
        if (events) parts.push(`事件：${events}`);
        return parts.join('；');
    }

    createContactProfileField(label = '', value = '') {
        const text = trimProfileText(value);
        if (!text) return null;
        const row = document.createElement('div');
        row.style.cssText = 'display:grid; grid-template-columns:86px minmax(0, 1fr); gap:8px; align-items:start; margin-top:8px;';
        const labelEl = document.createElement('div');
        labelEl.style.cssText = 'color:var(--app-text-muted); font-size:12px;';
        labelEl.textContent = label;
        const valueEl = document.createElement('div');
        valueEl.style.cssText = 'color:var(--app-text-primary); font-size:13px; line-height:1.55; white-space:pre-wrap; overflow-wrap:anywhere;';
        valueEl.textContent = text;
        row.appendChild(labelEl);
        row.appendChild(valueEl);
        return row;
    }

    createContactProfileButton(label = '', {
        danger = false,
        primary = false,
    } = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = label;
        button.style.cssText = `
            padding:8px 10px; border-radius:10px; cursor:pointer; font-weight:800;
            border:1px solid ${danger ? '#fecaca' : (primary ? '#2563eb' : 'var(--app-border-default)')};
            background:${primary ? '#2563eb' : 'var(--app-surface-card)'};
            color:${primary ? 'white' : (danger ? '#b91c1c' : 'var(--app-text-primary)')};
        `;
        return button;
    }

    ensureContactProfileModal() {
        if (this.contactProfileOverlay) return;
        const overlay = document.createElement('div');
        overlay.id = 'contact-profile-overlay';
        overlay.className = 'app-themed-overlay';
        overlay.style.cssText = `
            display:none; position:fixed; inset:0; z-index:23000;
            background:rgba(0,0,0,0.45); align-items:center; justify-content:center;
            padding:calc(12px + env(safe-area-inset-top, 0px)) calc(12px + env(safe-area-inset-right, 0px)) calc(12px + env(safe-area-inset-bottom, 0px)) calc(12px + env(safe-area-inset-left, 0px));
        `;
        const panel = document.createElement('div');
        panel.id = 'contact-profile-panel';
        panel.className = 'app-themed-panel';
        panel.style.cssText = `
            width:min(640px, 100%); max-height:calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:var(--app-surface-card); color:var(--app-text-primary);
            border:1px solid var(--app-border-default); border-radius:14px; box-shadow:0 16px 48px rgba(0,0,0,0.32);
            overflow:hidden; display:flex; flex-direction:column;
        `;
        const header = document.createElement('div');
        header.style.cssText = 'padding:14px 16px; border-bottom:1px solid var(--app-border-subtle); background:var(--app-surface-subtle); display:flex; align-items:center; justify-content:space-between; gap:10px;';
        const titleWrap = document.createElement('div');
        titleWrap.style.minWidth = '0';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:900; color:var(--app-text-primary);';
        title.textContent = '联系人画像';
        const subtitle = document.createElement('div');
        subtitle.style.cssText = 'margin-top:2px; color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
        titleWrap.appendChild(title);
        titleWrap.appendChild(subtitle);
        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.textContent = '×';
        closeButton.style.cssText = SESSION_PANEL_STYLES.closeButton;
        header.appendChild(titleWrap);
        header.appendChild(closeButton);

        const body = document.createElement('div');
        body.style.cssText = 'padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;';
        const footer = document.createElement('div');
        footer.style.cssText = buildSessionFooterStyle({ safeAreaBottom: true, alignItems: 'center' });
        const refreshButton = this.createContactProfileButton('刷新');
        const generateButton = this.createContactProfileButton('生成候选', { primary: true });
        const doneButton = this.createContactProfileButton('关闭');
        footer.appendChild(refreshButton);
        footer.appendChild(generateButton);
        footer.appendChild(doneButton);

        panel.appendChild(header);
        panel.appendChild(body);
        panel.appendChild(footer);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        overlay.addEventListener('click', () => this.closeContactProfileManager());
        panel.addEventListener('click', event => event.stopPropagation());
        closeButton.addEventListener('click', () => this.closeContactProfileManager());
        doneButton.addEventListener('click', () => this.closeContactProfileManager());
        refreshButton.addEventListener('click', () => this.renderContactProfileManager());
        generateButton.addEventListener('click', () => this.runContactProfileCandidateUpdate());

        this.contactProfileOverlay = overlay;
        this.contactProfilePanel = panel;
        this.contactProfileTitle = title;
        this.contactProfileSubtitle = subtitle;
        this.contactProfileBody = body;
        this.contactProfileRefreshButton = refreshButton;
        this.contactProfileGenerateButton = generateButton;
    }

    closeContactProfileManager() {
        if (this.contactProfileOverlay) this.contactProfileOverlay.style.display = 'none';
    }

    async openContactProfileManager() {
        this.ensureContactProfileModal();
        if (this.contactProfileOverlay) this.contactProfileOverlay.style.display = 'flex';
        await this.renderContactProfileManager();
    }

    appendContactProfileCard(title = '') {
        const card = document.createElement('section');
        card.style.cssText = buildSessionSurfaceBoxStyle({
            margin: '0 0 12px',
            padding: 12,
            radius: 10,
            background: 'var(--app-surface-subtle)',
        });
        if (title) {
            const titleEl = document.createElement('div');
            titleEl.style.cssText = 'font-weight:900; margin-bottom:8px; color:var(--app-text-primary);';
            titleEl.textContent = title;
            card.appendChild(titleEl);
        }
        this.contactProfileBody?.appendChild(card);
        return card;
    }

    appendContactProfileEmpty(message = '') {
        const empty = this.appendContactProfileCard('');
        empty.style.textAlign = 'center';
        empty.style.color = 'var(--app-text-muted)';
        empty.style.fontWeight = '700';
        empty.textContent = message;
    }

    async renderContactProfileManager() {
        this.ensureContactProfileModal();
        const body = this.contactProfileBody;
        if (!body) return;
        clearElement(body);
        const sessionId = trimProfileText(this.getSessionId());
        const contact = sessionId ? (this.contactsStore?.getContact?.(sessionId) || {}) : {};
        const displayName = trimProfileText(contact.name || contact.displayName || sessionId, '当前联系人');
        if (this.contactProfileTitle) this.contactProfileTitle.textContent = '联系人画像';
        if (this.contactProfileSubtitle) {
            this.contactProfileSubtitle.dataset.i18nSkip = '';
            this.contactProfileSubtitle.textContent = `${displayName} · ${sessionId || '-'}`;
        }

        const profile = this.getCurrentContactProfile(sessionId);
        const pendingUpdates = this.listContactProfilePendingUpdates(sessionId);
        if (!profile && !pendingUpdates.length) {
            this.appendContactProfileEmpty('还没有画像候选。');
        }

        if (profile) {
            const card = this.appendContactProfileCard('当前画像');
            [
                this.createContactProfileField('名称', trimProfileText(profile.displayName || displayName)),
                this.createContactProfileField('关系', trimProfileText(profile.relationship?.current)),
                this.createContactProfileField('互动', trimProfileText(profile.relationship?.user_dynamic)),
                this.createContactProfileField('近期主题', listProfileText(profile.interaction_focus, { limit: 8 })),
                this.createContactProfileField('触发词', listProfileText(profile.trigger_keywords, { limit: 12 })),
                this.createContactProfileField('稳定特征', listProfileText(profile.stable_traits, { field: 'label', limit: 6 })),
                this.createContactProfileField('重要事件', listProfileText(profile.important_events, { field: 'label', limit: 4 })),
                this.createContactProfileField('注意事项', listProfileText(profile.negative_or_sensitive, { limit: 6 })),
                this.createContactProfileField('更新时间', formatProfileUpdatedAt(profile.updatedAt)),
            ].filter(Boolean).forEach(row => card.appendChild(row));
        }

        pendingUpdates.forEach((item) => {
            const card = this.appendContactProfileCard('待保存候选');
            const profileSummary = this.describeContactProfile(item.profile || {});
            [
                this.createContactProfileField('原因', trimProfileText(item.reason, '手动更新')),
                this.createContactProfileField('摘要', profileSummary || trimProfileText(item.raw).slice(0, 240)),
                this.createContactProfileField('时间', formatProfileUpdatedAt(item.updatedAt || item.createdAt)),
            ].filter(Boolean).forEach(row => card.appendChild(row));
            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; gap:8px; justify-content:flex-end; flex-wrap:wrap; margin-top:12px;';
            const approve = this.createContactProfileButton('保存画像', { primary: true });
            const deny = this.createContactProfileButton('忽略', { danger: true });
            approve.addEventListener('click', () => this.handleContactProfilePendingAction('approve', item.id));
            deny.addEventListener('click', () => this.handleContactProfilePendingAction('deny', item.id));
            actions.appendChild(approve);
            actions.appendChild(deny);
            card.appendChild(actions);
        });
    }

    async runContactProfileCandidateUpdate() {
        const sessionId = trimProfileText(this.getSessionId());
        if (!sessionId) return;
        const button = this.contactProfileGenerateButton;
        if (button) button.disabled = true;
        try {
            const result = await Promise.resolve(this.callContactProfileAction('runContactProfileUpdate', {
                sessionId,
                contactId: sessionId,
                reason: 'manual_contact_settings',
                force: true,
            }));
            if (!result) {
                window.toastr?.info?.('当前环境暂不支持生成画像候选');
                return;
            }
            window.toastr?.success?.('已生成画像候选');
            await this.renderContactProfileManager();
        } catch (err) {
            logger.warn('run contact profile update failed', err);
            window.toastr?.error?.(err?.message || '生成画像候选失败');
        } finally {
            if (button) button.disabled = false;
        }
    }

    async handleContactProfilePendingAction(action = '', pendingId = '') {
        const id = trimProfileText(pendingId);
        if (!id) return;
        const approving = action === 'approve';
        const ok = await appConfirm({
            title: approving ? '保存联系人画像' : '忽略画像候选',
            message: approving ? '保存后会用于后续提示词上下文和动态弱触发。' : '忽略只会清除本次候选，不删除已有画像。',
            danger: !approving,
            confirmText: approving ? '保存' : '忽略',
        });
        if (!ok) return;
        try {
            const result = await Promise.resolve(this.callContactProfileAction(
                approving ? 'approveContactProfilePendingUpdate' : 'denyContactProfilePendingUpdate',
                { id },
            ));
            if (!result?.ok) {
                const conflictMessage = result?.reason === 'profile_changed_during_operation'
                    ? '画像在候选生成后已被修改，请忽略旧候选并重新生成'
                    : (result?.reason === 'target_scope_changed'
                        ? '当前角色已切换，请返回原角色后再处理候选'
                        : '');
                window.toastr?.error?.(conflictMessage || (approving ? '保存画像失败' : '忽略候选失败'));
                return;
            }
            window.toastr?.success?.(approving ? '已保存画像' : '已忽略候选');
            await this.renderContactProfileManager();
        } catch (err) {
            logger.warn('contact profile pending action failed', err);
            window.toastr?.error?.(err?.message || '画像候选处理失败');
        }
    }

    populate() {
        this.syncVoiceOptions();
        void Promise.resolve(this.voiceRegistryStore?.ready).then(() => this.syncVoiceOptions());
        return runContactSettingsPopulateFlow({
            sessionId: this.getSessionId(),
            contactsStore: this.contactsStore,
            chatStore: this.chatStore,
            panel: this.panel,
            avatarPreview: this.avatarPreview,
            nameInput: this.nameInput,
            labelsInput: this.labelsInput,
            voiceSelect: this.voiceSelect,
            voiceSection: this.voiceSection,
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
            voiceSelect: this.voiceSelect,
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

    syncVoiceOptions() {
        if (!this.voiceSelect) return;
        const current = String(
            this.contactsStore?.getContact?.(this.getSessionId())?.voiceRef || this.voiceSelect.value || '',
        ).trim();
        const voices = this.voiceRegistryStore?.list?.() || [];
        this.voiceSelect.innerHTML = '';
        const addOption = (value, label) => {
            const option = document.createElement('option');
            option.value = value;
            option.textContent = label;
            this.voiceSelect.appendChild(option);
        };
        addOption('', '默认（全局）');
        voices.forEach(record => addOption(record.id, `${record.label} · ${record.providerSnapshot || '未知服务商'}`));
        if (current && !voices.some(record => record.id === current)) {
            addOption(current, '当前绑定（已失效，将回退默认）');
        }
        this.voiceSelect.value = current;
    }
}
