/**
 * Group chat panels
 * - Create group from contacts
 * - Manage group settings (name/avatar/members)
 */

import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import { appSettings } from '../storage/app-settings.js';
import { MemoryTableEditor } from './memory-table-editor.js';
import { appConfirm } from './app-confirm.js';
import { createSessionContactPickerModal } from './session-contact-picker-modal-utils.js';
import { createGroupCreateRuntime } from './group-create-runtime-utils.js';
import { createGroupMemoryShareRuntime } from './group-memory-share-runtime-utils.js';
import { createGroupMemberManagementRuntime } from './group-member-management-runtime-utils.js';
import { runGroupSettingsSaveFlow } from './group-settings-save-runtime-utils.js';
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
    buildSessionColumnStackStyle,
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

const genGroupId = () => `group:${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const normalize = (s) => String(s || '').trim();
const normalizeKey = (s) => normalize(s).toLowerCase().replace(/\s+/g, '');

const defaultAvatar = FEATHER_DEFAULT;

const resolveContactAvatar = (contact, fallbackName = '') => {
    const c = contact || {};
    const name = String(c?.name || fallbackName || c?.id || '').trim() || '未知';
    const tags = Array.isArray(c?.libraryTags) && c.libraryTags.length
        ? c.libraryTags
        : Array.isArray(c?.labels)
            ? c.labels
            : [];
    return resolveLineAvatar({
        avatar: c?.avatar || defaultAvatar,
        name,
        tags,
        size: 96,
    });
};

export class GroupCreatePanel {
    constructor({ contactsStore, chatStore, onCreated } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        this.onCreated = typeof onCreated === 'function' ? onCreated : null;

        this.overlay = null;
        this.panel = null;
        this.fileInput = null;

        this.avatar = '';
        this.selected = new Set();
        this.createRuntime = null;
    }

    show() {
        if (!this.panel) this.createUI();
        this.avatar = '';
        this.selected.clear();
        this.panel.querySelector('#group-name').value = '';
        this.panel.querySelector('#group-search').value = '';
        this.renderContacts();
        this.updateAvatarPreview();
        this.updateCreateEnabled();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'flex';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    ensureCreateRuntime() {
        if (this.createRuntime) return this.createRuntime;
        this.createRuntime = createGroupCreateRuntime({
            getPanel: () => this.panel,
            getSelected: () => this.selected,
            getContactsStore: () => this.contactsStore,
            getChatStore: () => this.chatStore,
            getAvatar: () => this.avatar,
            normalize,
            normalizeKey,
            resolveContactAvatar,
            genGroupId,
            hide: () => this.hide(),
            onCreated: this.onCreated,
            notifySuccess: (message) => window.toastr?.success?.(message),
            notifyError: (message) => window.toastr?.error?.(message),
            logger,
        });
        return this.createRuntime;
    }

    createUI() {
        const avatarButtonStyle = buildSessionAvatarButtonStyle();
        const coverImageStyle = buildSessionCoverImageStyle();
        const topRowStyle = buildSessionFlexRowStyle({ gap: 14, wrap: true, margin: '0 0 14px' });
        const fieldLabelStyle = buildSessionFieldLabelStyle();
        const fieldInputStyle = buildSessionTextInputStyle();
        const helperTextStyle = buildSessionHelperTextStyle({ marginTop: 6 });
        const topContent = document.createElement('div');
        topContent.innerHTML = `
            <div style="${topRowStyle}">
                <button id="group-avatar-btn" type="button" style="${avatarButtonStyle}">
                    <img id="group-avatar-preview" alt="" style="${coverImageStyle}">
                </button>
                <div style="flex:1; min-width:220px;">
                    <div style="${fieldLabelStyle}">群组名称</div>
                    <input id="group-name" style="${fieldInputStyle}" placeholder="请输入群组名称">
                    <div id="group-name-hint" style="${helperTextStyle}"></div>
                </div>
            </div>
        `;
        const modal = createSessionContactPickerModal({
            documentRef: document,
            overlayId: 'group-create-overlay',
            panelId: 'group-create-panel',
            title: '创建群组',
            subtitle: '从联系人中选择成员',
            closeId: 'group-close',
            cancelId: 'group-cancel',
            confirmId: 'group-create',
            confirmLabel: '创建',
            searchId: 'group-search',
            listId: 'group-contacts',
            searchPlaceholder: '搜索联系人...',
            sectionTitle: '选择成员',
            topContent,
            headerBackground: 'linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08))',
            overlayOpacity: 0.45,
            overlayZIndex: 20000,
            panelZIndex: 21000,
            inset: 10,
            radius: 14,
        });
        this.overlay = modal.overlay;
        this.panel = modal.panel;
        this.overlay.addEventListener('click', () => this.hide());

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = async () => {
            const file = this.fileInput.files?.[0];
            if (!file) return;
            try {
                this.avatar = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 520_000 });
                this.updateAvatarPreview();
            } catch (err) {
                logger.warn('读取/压缩群组头像失败', err);
                window.toastr?.error?.('读取头像失败');
            }
        };

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.fileInput);

        this.panel.querySelector('#group-close').onclick = () => this.hide();
        this.panel.querySelector('#group-cancel').onclick = () => this.hide();
        this.panel.querySelector('#group-avatar-btn').onclick = () => {
            this.fileInput.value = '';
            this.fileInput.click();
        };
        this.panel.querySelector('#group-name').addEventListener('input', () => this.updateCreateEnabled());
        this.panel.querySelector('#group-search').addEventListener('input', () => this.renderContacts());
        this.panel.querySelector('#group-create').onclick = () => this.createGroup();
    }

    updateAvatarPreview() {
        const img = this.panel?.querySelector('#group-avatar-preview');
        if (!img) return;
        const nameInput = this.panel?.querySelector('#group-name');
        const name = String(nameInput?.value || '群聊').trim() || '群聊';
        img.src = resolveLineAvatar({
            avatar: this.avatar || defaultAvatar,
            name,
            tags: [],
            size: 96,
        });
    }

    updateCreateEnabled() {
        return this.ensureCreateRuntime().updateCreateEnabled();
    }

    renderContacts() {
        return this.ensureCreateRuntime().renderContacts();
    }

    createGroup() {
        return this.ensureCreateRuntime().createGroup();
    }
}

export class GroupSettingsPanel {
    constructor({
        contactsStore,
        chatStore,
        memoryTableStore = null,
        memoryTemplateStore = null,
        onSaved,
    } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        const bridge = typeof window !== 'undefined' ? window.appBridge : null;
        this.memoryTableStore = memoryTableStore || getMemoryTableStore(bridge);
        this.memoryTemplateStore = memoryTemplateStore || getMemoryTemplateStore(bridge);
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;

        this.overlay = null;
        this.panel = null;
        this.fileInput = null;

        this.groupId = '';
        this.avatar = '';
        this.members = [];
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
        this.rpBridgeSection = null;
        this.rpBridgeToggle = null;
        this.rpBridgeLimitInput = null;
        this.rpBridgeSourceNote = null;
        this.memoryShareSection = null;
        this.memoryShareButton = null;
        this.memoryShareSummary = null;
        this.memoryShareRuntime = null;
        this.memberManagementRuntime = null;

        this.addOverlay = null;
        this.addPanel = null;
        this.addSelected = new Set();
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

    show(groupId) {
        const id = normalize(groupId);
        if (!id) return;
        return runSessionPanelShowFlow({
            ensureUi: () => {
                if (!this.panel) this.createUI();
            },
            beforeShow: () => {
                this.groupId = id;
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
            overlayId: 'group-settings-overlay',
            panelId: 'group-settings-panel',
            subtitleId: 'group-settings-sub',
            closeId: 'group-settings-close',
            title: '群聊设置',
            overlayOpacity: 0.45,
            overlayZIndex: 20000,
            panelZIndex: 21000,
            inset: 10,
            radius: 14,
        });
        this.overlay = shell.overlay;
        this.panel = shell.panel;
        this.overlay.addEventListener('click', () => this.hide());
        const sectionStyle = buildSessionSectionStyle({ marginTop: 18, paddingTop: 14 });
        const newChatButtonStyle = buildSessionWideActionButtonStyle({ accent: true, marginBottom: 10 });
        const archiveListStyle = buildSessionListContainerStyle({ maxHeight: 160, radius: 8, background: 'var(--app-surface-subtle)' });
        const toolbarIconButtonStyle = buildSessionIconButtonStyle();
        const batchEditButtonStyle = buildSessionIconButtonStyle({ width: 34, height: 30, fontSize: 16 });
        const batchDeleteButtonStyle = buildSessionIconButtonStyle({ danger: true, width: 34, height: 30, fontSize: 16 });
        const batchCancelButtonStyle = buildSessionIconButtonStyle({ width: 34, height: 30, fontSize: 18 });
        const compactedDangerButtonStyle = buildSessionIconButtonStyle({ danger: true });
        const clearTextButtonStyle = buildSessionTextActionButtonStyle({ danger: true });
        const addButtonStyle = buildSessionUtilityButtonStyle({ padding: '6px 10px', fontSize: 14 });
        const summariesListStyle = buildSessionListContainerStyle({ maxHeight: 180, radius: 10 });
        const compactedListStyle = buildSessionListContainerStyle({ maxHeight: 220, radius: 10 });
        const footerStyle = buildSessionFooterStyle();
        const avatarButtonStyle = buildSessionAvatarButtonStyle();
        const coverImageStyle = buildSessionCoverImageStyle();
        const topRowStyle = buildSessionFlexRowStyle({ gap: 14, wrap: true });
        const headerRowStyle = buildSessionFlexRowStyle({ justify: 'space-between', gap: 10, margin: '0 0 6px' });
        const actionsRowStyle = buildSessionFlexRowStyle({ gap: 8 });
        const memberHeaderRowStyle = buildSessionFlexRowStyle({ justify: 'space-between', gap: 10 });
        const memberListStyle = buildSessionColumnStackStyle({ gap: 8, margin: '10px 0 0' });
        const batchBarStyle = buildSessionFlexRowStyle({ display: 'none', justify: 'flex-end', gap: 8, margin: '-2px 0 10px' });
        const summaryHelperStyle = buildSessionHelperTextStyle({ marginBottom: 8 });
        const memoryTableBoxStyle = buildSessionSurfaceBoxStyle({
            display: 'none',
            margin: '18px 0 0',
            padding: 12,
            borderStyle: 'dashed',
            background: 'var(--app-surface-subtle)',
        });
        const fieldLabelStyle = buildSessionFieldLabelStyle({ weight: 800 });
        const nameInputStyle = buildSessionTextInputStyle();
        const helperTextStyle = buildSessionHelperTextStyle({ marginTop: 6 });
        const helperCaptionStyle = buildSessionHelperTextStyle({ marginBottom: 6 });
        const memoryShareButtonStyle = buildSessionBlockButtonStyle();
        const memoryShareSummaryStyle = buildSessionHelperTextStyle({ marginTop: 8 });
        shell.body.innerHTML = `
                <div style="${topRowStyle}">
                    <button id="group-settings-avatar-btn" type="button" style="${avatarButtonStyle}">
                        <img id="group-settings-avatar-preview" alt="" style="${coverImageStyle}">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="${fieldLabelStyle}">群组名称</div>
                        <input id="group-settings-name" style="${nameInputStyle}">
                        <div style="${helperTextStyle}">修改名称不会改变聊天室 ID。</div>
                    </div>
                </div>

	                <div style="margin-top:14px;">
	                    <div style="${memberHeaderRowStyle}">
	                        <div style="${fieldLabelStyle}">成员</div>
	                        <button id="group-settings-add" style="${addButtonStyle}">＋ 添加</button>
	                    </div>
	                    <div id="group-settings-members" style="${memberListStyle}"></div>
	                </div>

                    <div style="${sectionStyle}">
                        <div style="${fieldLabelStyle}; margin-bottom:8px;">聊天管理</div>
                        <button id="group-new-chat" style="${newChatButtonStyle}">
                            <span>✨</span> 开启新聊天（存档当前）
                        </button>
                        <div style="${helperCaptionStyle}">历史存档（点击加载）</div>
                        <div id="group-archives-list" style="${archiveListStyle}"></div>
                    </div>

                    <div id="group-memory-features-section" style="${sectionStyle}">
                        <div style="${fieldLabelStyle}; margin-bottom:10px;">聊天 / RP 桥接（当前会话）</div>
                        <div id="group-rp-bridge-section" style="display:none;"></div>
                        <div id="group-memory-share-section">
                            <button id="group-memory-share-manage" type="button" style="${memoryShareButtonStyle}">
                                记忆共享
                            </button>
                            <div id="group-memory-share-summary" style="${memoryShareSummaryStyle}; line-height:1.5;"></div>
                        </div>
                    </div>

                    <div id="group-summary-section" style="${sectionStyle}">
                        <div style="${headerRowStyle}">
                            <div style="${fieldLabelStyle}; margin-bottom:0;">摘要</div>
                            <div style="${actionsRowStyle}">
                                <button id="group-summaries-batch" type="button" title="批量操作" style="${toolbarIconButtonStyle}">☰</button>
                                <button id="group-summaries-clear" type="button" style="${clearTextButtonStyle}">清空</button>
                            </div>
                        </div>
                        <div style="${summaryHelperStyle}">该群聊每次互动保存一条摘要（与聊天存档绑定）</div>
                        <div id="group-summaries-batchbar" style="${batchBarStyle}">
                            <button id="group-summaries-batch-edit" type="button" title="批量编辑" style="${batchEditButtonStyle}">✎</button>
                            <button id="group-summaries-batch-delete" type="button" title="批量删除" style="${batchDeleteButtonStyle}">🗑</button>
                            <button id="group-summaries-batch-cancel" type="button" title="退出批量" style="${batchCancelButtonStyle}">×</button>
                        </div>
                        <div id="group-summaries-list" style="${summariesListStyle}"></div>

	                    <div style="margin-top:14px;">
	                        <div style="${headerRowStyle}">
	                            <div style="${fieldLabelStyle}; margin-bottom:0;">大总结</div>
	                            <div style="${actionsRowStyle}">
	                                <button id="group-compacted-raw" type="button" title="查看原始回复" style="${toolbarIconButtonStyle}">📄</button>
	                                <button id="group-compacted-edit" type="button" title="编辑" style="${toolbarIconButtonStyle}">✎</button>
	                                <button id="group-compacted-run" type="button" title="手动生成/刷新" style="${toolbarIconButtonStyle}">↻</button>
	                                <button id="group-compacted-clear" type="button" title="删除" style="${compactedDangerButtonStyle}">🗑</button>
	                            </div>
	                        </div>
	                        <div style="${summaryHelperStyle}">摘要总字数超过阈值会自动生成大总结（与聊天存档绑定）</div>
	                        <div id="group-compacted-summary" style="${compactedListStyle}"></div>
	                    </div>
                    </div>

                    <div id="group-memory-table-section" style="${memoryTableBoxStyle}">
                        <div style="${fieldLabelStyle}">记忆表格</div>
                        <div id="group-memory-table-content"></div>
                    </div>
	            </div>
        `;
        const footer = document.createElement('div');
        footer.style.cssText = footerStyle;
        footer.innerHTML = `
            <button id="group-settings-cancel" style="${SESSION_PANEL_STYLES.secondaryActionButton}">取消</button>
            <button id="group-settings-save" style="${SESSION_PANEL_STYLES.primaryActionButton}">保存</button>
        `;
        this.panel.appendChild(footer);

        this.fileInput = document.createElement('input');
        this.fileInput.type = 'file';
        this.fileInput.accept = 'image/*';
        this.fileInput.style.display = 'none';
        this.fileInput.onchange = async () => {
            const file = this.fileInput.files?.[0];
            if (!file) return;
            try {
                this.avatar = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 520_000 });
                this.updateAvatarPreview();
            } catch (err) {
                logger.warn('读取/压缩群组头像失败', err);
                window.toastr?.error?.('读取头像失败');
            }
        };

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.fileInput);
        this.archivesList = this.panel.querySelector('#group-archives-list');
        this.summariesList = this.panel.querySelector('#group-summaries-list');
        this.compactedList = this.panel.querySelector('#group-compacted-summary');
        this.summarySection = this.panel.querySelector('#group-summary-section');
        this.memoryTableSection = this.panel.querySelector('#group-memory-table-section');
        this.memoryFeaturesSection = this.panel.querySelector('#group-memory-features-section');
        this.memoryTableContent = this.panel.querySelector('#group-memory-table-content');
        this.summariesBatchBar = this.panel.querySelector('#group-summaries-batchbar');
        this.rpBridgeSection = this.panel.querySelector('#group-rp-bridge-section');
        this.rpBridgeToggle = this.panel.querySelector('#group-rp-bridge-enabled');
        this.rpBridgeLimitInput = this.panel.querySelector('#group-rp-bridge-limit');
        this.rpBridgeSourceNote = this.panel.querySelector('#group-rp-bridge-source-note');
        this.memoryShareSection = this.panel.querySelector('#group-memory-share-section');
        this.memoryShareButton = this.panel.querySelector('#group-memory-share-manage');
        this.memoryShareSummary = this.panel.querySelector('#group-memory-share-summary');
        const summariesClearButton = this.panel.querySelector('#group-summaries-clear');
        const summariesBatchButton = this.panel.querySelector('#group-summaries-batch');
        const summariesBatchCancelButton = this.panel.querySelector('#group-summaries-batch-cancel');
        const summariesBatchDeleteButton = this.panel.querySelector('#group-summaries-batch-delete');
        const summariesBatchEditButton = this.panel.querySelector('#group-summaries-batch-edit');
        const compactedRawButton = this.panel.querySelector('#group-compacted-raw');
        const compactedEditButton = this.panel.querySelector('#group-compacted-edit');
        const compactedRunButton = this.panel.querySelector('#group-compacted-run');
        const compactedClearButton = this.panel.querySelector('#group-compacted-clear');

        this.panel.querySelector('#group-settings-close').onclick = () => this.hide();
        this.panel.querySelector('#group-settings-cancel').onclick = () => this.hide();
        this.panel.querySelector('#group-settings-avatar-btn').onclick = () => {
            this.fileInput.value = '';
            this.fileInput.click();
        };
        this.panel.querySelector('#group-settings-add').onclick = () => this.openAddMembers();
        this.panel.querySelector('#group-settings-save').onclick = () => this.save();
        bindSessionMemoryShareButton({
            buttonEl: this.memoryShareButton,
            openManager: () => this.openMemoryShareManager(),
            logger,
            warnMessage: 'open group memory share manager failed',
            errorMessage: '打开记忆共享失败',
            toastr: window.toastr,
        });
        this.panel.querySelector('#group-new-chat').onclick = () => this.startNewChat();
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
            getSessionId: () => this.groupId,
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
            summaryClearMessage: '确定要清空该群聊当前存档/聊天的所有摘要吗？',
            compactedClearMessage: '确定要清空该群聊当前存档/聊天的大总结吗？',
        });

        if (this.memoryTableContent && this.memoryTableStore && this.memoryTemplateStore) {
            this.memoryTableEditor = new MemoryTableEditor({
                container: this.memoryTableContent,
                getContext: () => ({ type: 'group', groupId: this.groupId }),
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
            getSessionId: () => this.groupId,
            renderSummaries: () => this.renderSummaries(),
            renderCompactedSummary: () => this.renderCompactedSummary(),
        });
    }

    ensureSummaryRuntime() {
        if (this.summaryRuntime) return this.summaryRuntime;
        this.summaryRuntime = createSessionSummarySectionRuntime({
            variant: 'group',
            getSessionId: () => this.groupId,
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
            getNormalRowStyle: () => buildSessionSummaryRowStyle({ clickable: true }),
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

    setSummaryBatchMode(enabled) {
        return this.ensureSummaryRuntime().setSummaryBatchMode(enabled);
    }

    openCompactedRaw() {
        return this.ensureSummaryRuntime().openCompactedRaw();
    }

    editCompactedSummary() {
        return this.ensureSummaryRuntime().editCompactedSummary();
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

    populate() {
        const g = this.contactsStore?.getContact?.(this.groupId);
        if (!g) return;
        const sub = this.panel.querySelector('#group-settings-sub');
        if (sub) sub.textContent = `会话：${this.groupId}`;
        this.avatar = g.avatar || '';
        this.members = Array.isArray(g.members) ? g.members.map(normalize).filter(Boolean) : [];
        const nameEl = this.panel.querySelector('#group-settings-name');
        if (nameEl) nameEl.value = g.name || '';
        if (this.rpBridgeSection) this.rpBridgeSection.style.display = 'none';
        if (this.memoryShareSection) this.memoryShareSection.style.display = 'block';
        this.refreshMemoryShareSummary().catch((err) => {
            logger.warn('refresh group memory share summary failed', err);
            if (this.memoryShareSummary) this.memoryShareSummary.textContent = '记忆共享状态读取失败';
        });
        this.updateAvatarPreview();
        this.renderMembers();
    }

    ensureMemoryShareRuntime() {
        if (this.memoryShareRuntime) return this.memoryShareRuntime;
        this.memoryShareRuntime = createGroupMemoryShareRuntime({
            getSessionId: () => this.groupId,
            getSummaryEl: () => this.memoryShareSummary,
            getSessionSettings: (sessionId) => this.chatStore?.getSessionSettings?.(sessionId),
            setSessionSettings: (sessionId, sessionSettings) => this.chatStore?.setSessionSettings?.(sessionId, sessionSettings),
            getContact: (sessionId) => this.contactsStore?.getContact?.(sessionId),
            memoryTableStore: this.memoryTableStore,
            resolveTemplateDefinition: () => this.resolveDefaultMemoryTemplateDefinition(),
            resolveTemplateId: () => this.resolveDefaultMemoryTemplateId(),
            getRpCharacterNameForSession: (sessionId) => window.appBridge?.getRpCharacterNameForSession?.(sessionId),
            getRpSessionIdForSession: (sessionId) => window.appBridge?.getRpSessionIdForSession?.(sessionId),
            getRpSessionIdForActivePersona: () => window.appBridge?.getRpSessionIdForActivePersona?.(),
            documentRef: document,
            bodyEl: document.body,
            getGlobalSettings: () => appSettings.get(),
            notifySaveSuccess: () => window.toastr?.success?.('已保存记忆共享设置'),
            notifySaveError: () => window.toastr?.error?.('保存记忆共享失败'),
            logger,
        });
        return this.memoryShareRuntime;
    }

    async refreshMemoryShareSummary(sessionId = this.groupId) {
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

    renderSummaries() {
        return this.ensureSummaryRuntime().renderSummaries();
    }

    renderCompactedSummary() {
        return this.ensureSummaryRuntime().renderCompactedSummary();
    }

    ensureNewChatRuntime() {
        if (this.newChatRuntime) return this.newChatRuntime;
        this.newChatRuntime = createSessionNewChatSectionRuntime({
            getSessionId: () => this.groupId,
            isGroup: true,
            resolveSessionMode: () => 'chat',
            getMemoryStorageMode,
            askMemoryTableNewChatMode,
            promptForArchiveName: () => prompt('请输入当前聊天的存档名称（留空将自动命名）：'),
            buildMemoryTableSnapshot: ({ sessionId, isGroup }) => this.buildMemoryTableSnapshot({ sessionId, isGroup }),
            captureArchivePointer: (sessionId, options) =>
                window.appBridge?.buildArchivePointerFromCurrentThread?.(sessionId, options),
            memoryTableStore: this.memoryTableStore,
            resolveDefaultMemoryTemplateId: () => this.resolveDefaultMemoryTemplateId(),
            resolveSummaryTableIds: ({ isGroup }) => [
                isGroup ? 'group_summary' : 'chat_summary',
                isGroup ? 'group_outline' : 'chat_outline',
            ],
            notifyRowsUpdated: ({ sessionId, templateId }) =>
                emitSharedMemoryRowsUpdated({ target: window, sessionId, templateId }),
            startNewChat: (sessionId, archiveName, options) => this.chatStore.startNewChat(sessionId, archiveName, options),
            persistArchivePointer: (sessionId, archiveId, archivePointer, options) =>
                window.appBridge?.setArchivePointerForArchive?.(sessionId, archiveId, archivePointer, options),
            restoreMemoryForActiveThread: (sessionId, options) =>
                window.appBridge?.restoreMemoryForActiveThread?.(sessionId, options),
            logger,
            sourcePrefix: 'group',
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
            getSessionId: () => this.groupId,
            getChatStore: () => this.chatStore,
            isGroup: true,
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
            onArchiveLoaded: (sessionId) => {
                window.toastr?.success('已加载存档');
                this.onSaved?.({ id: sessionId, forceRefresh: true });
            },
            onArchiveDeleted: () => this.renderArchives(),
            onHide: () => this.hide(),
            createEmptyState: () => createSessionArchiveEmptyState(),
            createArchiveRow: (payload) => createSessionArchiveRow(payload),
            sourcePrefix: 'group',
            restoreWarnMessage: 'restore checkpoint memory after group archive load failed',
            deleteWarnMessage: 'delete group archive turn checkpoint state failed',
        });
        return this.archiveRuntime;
    }

    renderArchives() {
        return this.ensureArchiveRuntime().renderArchives();
    }

    ensureMemberManagementRuntime() {
        if (this.memberManagementRuntime) return this.memberManagementRuntime;
        this.memberManagementRuntime = createGroupMemberManagementRuntime({
            getPanel: () => this.panel,
            getMembers: () => this.members,
            setMembers: (nextMembers) => {
                this.members = Array.isArray(nextMembers) ? nextMembers : [];
            },
            getContactsStore: () => this.contactsStore,
            getAddOverlay: () => this.addOverlay,
            setAddOverlay: (overlay) => {
                this.addOverlay = overlay;
            },
            getAddPanel: () => this.addPanel,
            setAddPanel: (panel) => {
                this.addPanel = panel;
            },
            getAddSelected: () => this.addSelected,
            documentRef: document,
            bodyEl: document.body,
            normalize,
            normalizeKey,
            resolveContactAvatar,
            notifyInfo: (message) => window.toastr?.info?.(message),
        });
        return this.memberManagementRuntime;
    }

    updateAvatarPreview() {
        const img = this.panel?.querySelector('#group-settings-avatar-preview');
        if (!img) return;
        const name = String(this.name || '群聊').trim() || '群聊';
        img.src = resolveLineAvatar({
            avatar: this.avatar || defaultAvatar,
            name,
            tags: [],
            size: 96,
        });
    }

    renderMembers() {
        return this.ensureMemberManagementRuntime().renderMembers();
    }

    openAddMembers() {
        return this.ensureMemberManagementRuntime().openAddMembers();
    }

    ensureAddModal() {
        return this.ensureMemberManagementRuntime().ensureAddModal();
    }

    closeAddModal() {
        return this.ensureMemberManagementRuntime().closeAddModal();
    }

    renderAddCandidates() {
        return this.ensureMemberManagementRuntime().renderAddCandidates();
    }

    async startNewChat() {
        if (!this.chatStore) return;
        return this.ensureNewChatRuntime().startNewChat();
    }

    save() {
        return runGroupSettingsSaveFlow({
            groupId: this.groupId,
            panel: this.panel,
            avatar: this.avatar,
            members: this.members,
            contactsStore: this.contactsStore,
            chatStore: this.chatStore,
            onSaved: this.onSaved,
            hide: () => this.hide(),
            normalize,
            normalizeKey,
            notifySuccess: (message) => window.toastr?.success?.(message),
            notifyError: (message) => window.toastr?.error?.(message),
            logger,
        });
    }
}
