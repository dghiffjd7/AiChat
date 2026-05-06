/**
 * Contact settings panel
 * - Edit contact display name + avatar (does not rename session id)
 */
import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { appSettings } from '../storage/app-settings.js';
import { getSummaryTableIdsForContext, isRpSessionId } from '../memory/memory-context-utils.js';
import {
    getBridgeTableShortLabel,
    getChatToRpBridgeSourceMeta,
    getChatToRpBridgeTableIds,
    getRpToChatBridgeTableIds,
    isChatToRpGroupTableId,
    normalizeBridgeLimit,
    pruneChatToRpBridgeTableSettings,
    pruneRpToChatBridgeTableSettings,
    resolveChatToRpBridgeTableSettings,
    resolveRpToChatBridgeTableSettings,
} from '../memory/memory-bridge-utils.js';
import { MemoryTableEditor } from './memory-table-editor.js';
import { appConfirm } from './app-confirm.js';
import { normalizeBadgeList } from '../utils/name-badges.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import { bindCustomSelectButton, closeCustomSelectMenu, refreshCustomSelectButton } from './custom-select.js';
import { createSessionPanelShell } from './session-panel-shell-utils.js';
import {
    clearSessionMemoriesForNewChat,
    runStartNewChatFlow,
} from './session-new-chat-utils.js';
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
    buildSelectedSummaryEntries,
    normalizeSummaryItems,
    parseEditedSummaryLines,
    renderCompactedSummary,
    renderSummaryList,
} from './session-summary-utils.js';
import {
    openCompactedRawFlow,
    openCompactedSummaryEditFlow,
    runCompactedSummaryGenerationFlow,
    runDeleteSelectedSummariesFlow,
    runEditSelectedSummariesFlow,
} from './session-summary-runtime-utils.js';
import {
    createEditableTextareaModal,
    createReadonlyTextareaModal,
} from './session-summary-modal-utils.js';
import {
    createMemoryShareEmptyState,
    createMemoryShareEntryRow,
    createSessionMemoryShareModal,
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
    notifyRowsUpdated: ({ sessionId, templateId }) => {
        window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId, templateId } }));
    },
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
        this.memoryShareOverlay = null;
        this.memorySharePanel = null;
        this.memoryShareSourceSelect = null;
        this.memoryShareSourceButton = null;
        this.memoryShareRows = null;
        this.memoryShareSaveBtn = null;
        this.memoryShareDraft = null;
        this.exportExperiencePackBtn = null;
    }

    show() {
        if (!this.panel) this.createUI();
        this.applyMemoryMode();
        this.populate();
        this.renderArchives();
        this.renderSummaries();
        this.renderCompactedSummary();
        if (getMemoryStorageMode() === 'table') {
            this.memoryTableEditor?.render?.();
        }
        this.overlay.style.display = 'block';
        this.panel.style.display = 'flex';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    applyMemoryMode() {
        const memoryMode = getMemoryStorageMode();
        const memoryOn = memoryMode !== 'off';
        const summaryOn = memoryMode === 'summary';
        if (this.memoryFeaturesSection) this.memoryFeaturesSection.style.display = memoryOn ? 'block' : 'none';
        if (this.summarySection) this.summarySection.style.display = memoryOn && summaryOn ? 'block' : 'none';
        if (this.memoryTableSection) this.memoryTableSection.style.display = memoryOn && !summaryOn ? 'block' : 'none';
        if (memoryOn && !summaryOn) this.memoryTableEditor?.render?.();
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

        shell.body.innerHTML = `
                <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                    <button id="contact-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid var(--app-border-default); background:var(--app-surface-card); padding:0; overflow:hidden; cursor:pointer;">
                        <img id="contact-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">名称</div>
                        <input id="contact-name-input" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:14px;">
                        <div style="color:var(--app-text-muted); font-size:12px; margin-top:6px;">仅修改显示名称，不会改变聊天室 ID。</div>
                    </div>
                </div>

                <div style="margin-top:12px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">标签</div>
                    <input
                        id="contact-labels-input"
                        placeholder="用逗号分隔，如：重制版, SG线"
                        style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:14px;"
                    >
                    <div style="color:var(--app-text-muted); font-size:12px; margin-top:6px;">用于展示标签；不设置则界面保持原样。</div>
                </div>

	                <div style="margin-top:16px; border-top:1px solid var(--app-border-subtle); padding-top:14px;">
	                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:10px;">模板与脚本（本会话）</div>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:8px;">
                        <input type="checkbox" id="contact-template-enabled" style="width:18px; height:18px;">
                        <span>启用模板处理</span>
                    </label>
                    <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:8px;">
                        <input type="checkbox" id="contact-script-enabled" style="width:18px; height:18px;">
                        <span>启用脚本</span>
                    </label>
                    <button id="contact-reset-vars" type="button" style="padding:8px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; font-size:12px;">
                        重置本会话变量
                    </button>
	                    <div style="color:var(--app-text-muted); font-size:12px; margin-top:6px;">仅清空本会话 local 变量，不影响全局变量。</div>
	                </div>

                    <div id="contact-memory-features-section" style="margin-top:16px; border-top:1px solid var(--app-border-subtle); padding-top:14px;">
                        <div id="contact-bridge-block-title" style="font-weight:700; color:var(--app-text-primary); margin-bottom:10px;">聊天 / RP 桥接（当前会话）</div>
                        <div id="contact-rp-bridge-section" style="display:none; padding:10px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); margin-bottom:10px;">
                            <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer;">
                                <span style="font-weight:700; color:var(--app-text-primary);">注入 RP 总体大纲</span>
                                <input type="checkbox" id="contact-rp-bridge-enabled" style="width:18px; height:18px;">
                            </label>
                            <div style="color:var(--app-text-muted); font-size:12px; margin-top:6px;">默认来源为当前角色的 RP 会话。</div>
                            <div id="contact-rp-bridge-source-note" style="color:var(--app-text-secondary); font-size:12px; margin-top:6px;"></div>
                            <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; color:var(--app-text-secondary); margin-top:10px;">
                                <span>注入条数（0=全部）</span>
                                <input type="number" id="contact-rp-bridge-limit" min="0" step="1"
                                       style="width:88px; padding:4px 6px; border:1px solid var(--app-border-default); border-radius:8px; font-size:12px; text-align:right;">
                            </label>
                        </div>
                        <div id="contact-memory-share-section" style="display:none;">
                            <button id="contact-memory-share-manage" type="button" style="width:100%; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); color:var(--app-text-primary); font-weight:800; cursor:pointer;">
                                记忆共享
                            </button>
                            <div id="contact-memory-share-summary" style="color:var(--app-text-muted); font-size:12px; line-height:1.5; margin-top:8px;"></div>
                        </div>
                    </div>

	                <div style="margin-top:20px; border-top:1px solid var(--app-border-subtle); padding-top:14px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:10px;">聊天管理</div>
                    <button id="contact-new-chat" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); color:#019aff; font-weight:700; margin-bottom:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <span>✨</span> 开启新聊天（存档当前）
                    </button>
                    <button id="contact-export-experience-pack" type="button" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); color:var(--app-text-primary); font-weight:700; margin-bottom:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <span>📦</span> 导出角色体验包
                    </button>
                    <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:6px;">历史存档（点击加载）</div>
                    <div id="contact-archives-list" style="max-height:160px; overflow-y:auto; border:1px solid var(--app-border-subtle); border-radius:8px; background:var(--app-surface-subtle); padding:0;"></div>

                    <div id="contact-summary-section">
	                    <div style="margin-top:14px;">
	                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
	                            <div style="font-size:12px; color:var(--app-text-muted);">摘要（每次对话保存一条）</div>
                                <div style="display:flex; align-items:center; gap:8px;">
	                                <button id="contact-summaries-batch" type="button" title="批量操作" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">☰</button>
	                                <button id="contact-summaries-clear" type="button" style="padding:6px 10px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#ef4444;">清空</button>
                                </div>
	                        </div>
                            <div id="contact-summaries-batchbar" style="display:none; align-items:center; justify-content:flex-end; gap:8px; margin:6px 0 8px;">
                                <button id="contact-summaries-batch-edit" type="button" title="批量编辑" style="width:34px; height:30px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px;">✎</button>
                                <button id="contact-summaries-batch-delete" type="button" title="批量删除" style="width:34px; height:30px; border:1px solid #fecaca; border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#b91c1c; font-size:16px;">🗑</button>
                                <button id="contact-summaries-batch-cancel" type="button" title="退出批量" style="width:34px; height:30px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:18px;">×</button>
                            </div>
	                        <div id="contact-summaries-list" style="max-height:160px; overflow-y:auto; border:1px solid var(--app-border-subtle); border-radius:8px; background:var(--app-surface-card); padding:0;"></div>
	                    </div>

                        <div style="margin-top:14px;">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                <div style="font-size:12px; color:var(--app-text-muted);">大总结（自动生成）</div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <button id="contact-compacted-raw" type="button" title="查看原始回复" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">📄</button>
                                    <button id="contact-compacted-edit" type="button" title="编辑" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">✎</button>
                                    <button id="contact-compacted-run" type="button" title="手动生成/刷新" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">↻</button>
                                    <button id="contact-compacted-clear" type="button" title="删除" style="width:32px; height:28px; border:1px solid #fecaca; border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#b91c1c; font-size:16px; line-height:1;">🗑</button>
                                </div>
                            </div>
                            <div id="contact-compacted-summary" style="max-height:200px; overflow-y:auto; border:1px solid var(--app-border-subtle); border-radius:8px; background:var(--app-surface-card); padding:0;"></div>
                        </div>
                    </div>

                    <div id="contact-memory-table-section" style="display:none; margin-top:14px; padding:12px; border:1px dashed var(--app-border-default); border-radius:12px; background:var(--app-surface-subtle);">
                        <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">记忆表格</div>
                        <div id="contact-memory-table-content"></div>
                    </div>
	                </div>
        `;
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:14px 16px calc(14px + env(safe-area-inset-bottom, 0px)); border-top:1px solid rgba(0,0,0,0.06); background:var(--app-surface-subtle); display:flex; align-items:center; gap:10px;';
        footer.innerHTML = `
            <button id="contact-avatar-clear" type="button" style="padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; white-space:nowrap;">清除头像</button>
            <button id="contact-settings-cancel" type="button" style="flex:1; padding:10px 14px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle); cursor:pointer;">取消</button>
            <button id="contact-settings-save" type="button" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:700;">保存</button>
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
        this.memoryShareButton?.addEventListener('click', () => {
            this.openMemoryShareManager().catch((err) => {
                logger.warn('open memory share manager failed', err);
                window.toastr?.error?.('打开记忆共享失败');
            });
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
        this.panel.querySelector('#contact-summaries-clear').onclick = async () => {
            const sid = this.getSessionId();
            if (!sid) return;
            const ok = await appConfirm({
                title: '清空摘要',
                message: '确定要清空当前存档/聊天的所有摘要吗？',
                danger: true,
            });
            if (!ok) return;
            try { this.chatStore?.clearSummaries?.(sid); } catch {}
            this.summarySelectedKeys = new Set();
            this.setSummaryBatchMode(false);
            this.renderSummaries();
        };
        this.panel.querySelector('#contact-summaries-batch').onclick = () => {
            this.setSummaryBatchMode(!this.summaryBatchMode);
        };
        this.panel.querySelector('#contact-summaries-batch-cancel').onclick = () => this.setSummaryBatchMode(false);
        this.panel.querySelector('#contact-summaries-batch-delete').onclick = () => this.deleteSelectedSummaries();
        this.panel.querySelector('#contact-summaries-batch-edit').onclick = () => this.editSelectedSummaries();

        this.panel.querySelector('#contact-compacted-raw').onclick = () => this.openCompactedRaw();
        this.panel.querySelector('#contact-compacted-edit').onclick = () => this.editCompactedSummary();
        this.panel.querySelector('#contact-compacted-run').onclick = () => this.runCompactedSummary();
        this.panel.querySelector('#contact-compacted-clear').onclick = async () => {
            const sid = this.getSessionId();
            if (!sid) return;
            const ok = await appConfirm({
                title: '清空大总结',
                message: '确定要清空当前存档/聊天的大总结吗？',
                danger: true,
            });
            if (!ok) return;
            try { this.chatStore?.clearCompactedSummary?.(sid); } catch {}
            this.renderCompactedSummary();
        };

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

        window.addEventListener('memory-storage-mode-changed', () => {
            try {
                if (!this.panel || this.panel.style.display === 'none') return;
                this.applyMemoryMode();
            } catch {}
        });
        window.addEventListener('chatapp-summaries-updated', (ev) => {
            try {
                if (!this.panel || this.panel.style.display === 'none') return;
                const sid = this.getSessionId();
                const target = String(ev?.detail?.sessionId || '').trim();
                if (!sid || !target || sid !== target) return;
                this.renderSummaries();
                this.renderCompactedSummary();
            } catch {}
        });
    }

    ensureCompactedRawModal() {
        if (this.__compactedRawReady) return;
        this.__compactedRawReady = true;
        this.__compactedRawModal = createReadonlyTextareaModal({
            overlayClass: 'app-themed-overlay contact-inline-modal-overlay',
            panelClass: 'app-themed-panel contact-inline-modal-panel',
            title: '大总结原始回复',
            copySuccessMessage: '已复制原始回复',
            copyText: async (text) => navigator.clipboard?.writeText?.(text),
            toastr: window.toastr,
        });
        this.__compactedRawOverlay = this.__compactedRawModal.overlay;
        this.__compactedRawPanel = this.__compactedRawModal.panel;
        this.__compactedRawTextarea = this.__compactedRawModal.textarea;
        this.__compactedRawClose = this.__compactedRawModal.close;
    }

    openCompactedRaw() {
        openCompactedRawFlow({
            sessionId: this.getSessionId(),
            getCompactedSummaryRaw: (sessionId) => this.chatStore?.getCompactedSummaryRaw?.(sessionId),
            ensureModal: () => this.ensureCompactedRawModal(),
            setRawValue: (raw) => this.__compactedRawModal?.setValue?.(raw),
            showModal: () => this.__compactedRawModal?.show?.(),
            focusTextarea: () => this.__compactedRawModal?.focus?.(),
            toastr: window.toastr,
        });
    }

    ensureCompactedEditModal() {
        if (this.__compactedEditReady) return;
        this.__compactedEditReady = true;
        this.__compactedEditModal = createEditableTextareaModal({
            overlayClass: 'app-themed-overlay contact-inline-modal-overlay',
            panelClass: 'app-themed-panel contact-inline-modal-panel',
            title: '编辑大总结',
            minHeight: '200px',
        });
        this.__compactedEditOverlay = this.__compactedEditModal.overlay;
        this.__compactedEditPanel = this.__compactedEditModal.panel;
        this.__compactedEditTextarea = this.__compactedEditModal.textarea;
        this.__compactedEditClose = this.__compactedEditModal.close;
    }

    editCompactedSummary() {
        openCompactedSummaryEditFlow({
            sessionId: this.getSessionId(),
            getCompactedSummary: (sessionId) => this.chatStore?.getCompactedSummary?.(sessionId),
            getCompactedSummaryRaw: (sessionId) => this.chatStore?.getCompactedSummaryRaw?.(sessionId),
            ensureModal: () => this.ensureCompactedEditModal(),
            setOnSave: (handler) => this.__compactedEditModal?.setOnSave?.(handler),
            setTextareaValue: (text) => this.__compactedEditModal?.setValue?.(text),
            showModal: () => this.__compactedEditModal?.show?.(),
            focusTextarea: () => this.__compactedEditModal?.focus?.(),
            setCompactedSummary: (text, sessionId, options) => this.chatStore?.setCompactedSummary?.(text, sessionId, options),
            renderCompactedSummary: () => this.renderCompactedSummary(),
            closeModal: () => this.__compactedEditClose?.(),
            dispatchUpdated: (sessionId) => {
                window.dispatchEvent(new CustomEvent('chatapp-summaries-updated', { detail: { sessionId } }));
            },
            toastr: window.toastr,
        });
    }

    setSummaryBatchMode(enabled) {
        const next = Boolean(enabled);
        this.summaryBatchMode = next;
        if (!next) this.summarySelectedKeys = new Set();
        if (this.summariesBatchBar) this.summariesBatchBar.style.display = next ? 'flex' : 'none';
        this.renderSummaries();
    }

    ensureSummaryEditModal() {
        if (this.summaryEditPanel) return;
        this.__summaryEditModal = createEditableTextareaModal({
            overlayClass: 'app-themed-overlay contact-inline-modal-overlay',
            panelClass: 'app-themed-panel contact-inline-modal-panel',
            title: '批量编辑摘要',
            helperText: '每行一条摘要（顺序对应所选摘要）。',
            minHeight: '180px',
        });
        this.summaryEditOverlay = this.__summaryEditModal.overlay;
        this.summaryEditPanel = this.__summaryEditModal.panel;
        this.summaryEditTextarea = this.__summaryEditModal.textarea;
        this.summaryEditSave = this.__summaryEditModal.saveButton;
        this.summaryEditCancel = this.__summaryEditModal.cancelButton;
    }

    openSummaryEditModal(value, onSave) {
        this.ensureSummaryEditModal();
        this.__summaryEditModal?.setOnSave?.((valueRaw) => {
            try { onSave?.(valueRaw); } catch {}
        });
        this.__summaryEditModal?.setValue?.(value);
        this.__summaryEditModal?.show?.();
        setTimeout(() => {
            try { this.__summaryEditModal?.focus?.(); } catch {}
        }, 0);
    }

    closeSummaryEditModal() {
        this.__summaryEditModal?.close?.();
    }

    async deleteSelectedSummaries() {
        await runDeleteSelectedSummariesFlow({
            sessionId: this.getSessionId(),
            selectedKeys: [...this.summarySelectedKeys],
            confirm: (options) => appConfirm(options),
            buildSelectedSummaryEntries,
            deleteSummaryItems: (items, sessionId) => this.chatStore?.deleteSummaryItems?.(items, sessionId),
            setSummaryBatchMode: (enabled) => this.setSummaryBatchMode(enabled),
            renderSummaries: () => this.renderSummaries(),
            toastr: window.toastr,
        });
    }

    editSelectedSummaries() {
        runEditSelectedSummariesFlow({
            sessionId: this.getSessionId(),
            selectedKeys: [...this.summarySelectedKeys],
            buildSelectedSummaryEntries,
            openSummaryEditModal: (value, onSave) => this.openSummaryEditModal(value, onSave),
            parseEditedSummaryLines,
            updateSummaryItems: (updates, sessionId) => this.chatStore?.updateSummaryItems?.(updates, sessionId),
            closeSummaryEditModal: () => this.closeSummaryEditModal(),
            setSummaryBatchMode: (enabled) => this.setSummaryBatchMode(enabled),
            renderSummaries: () => this.renderSummaries(),
            toastr: window.toastr,
        });
    }

    async runCompactedSummary() {
        await runCompactedSummaryGenerationFlow({
            sessionId: this.getSessionId(),
            summaryCompacting: this.summaryCompacting,
            setSummaryCompacting: (value) => {
                this.summaryCompacting = value;
            },
            resolveRequestSummaryCompaction: () =>
                globalThis?.__chatappRequestSummaryCompaction ||
                window?.__chatappRequestSummaryCompaction ||
                window?.appBridge?.requestSummaryCompaction,
            renderSummaries: () => this.renderSummaries(),
            renderCompactedSummary: () => this.renderCompactedSummary(),
            logger,
            toastr: window.toastr,
        });
    }

    renderArchives() {
        if (!this.archivesList || !this.chatStore) return;
        const sid = this.getSessionId();
        const archives = this.chatStore.getArchives(sid);
        const currentId = this.chatStore.state.sessions[sid]?.currentArchiveId; 
        this.archivesList.innerHTML = '';
        
        if (!archives.length) {
            this.archivesList.appendChild(createSessionArchiveEmptyState());
            return;
        }

        archives.forEach(arc => {
            const dateStr = new Date(arc.timestamp).toLocaleString();
            const msgCount = Number(arc.messageCount || (Array.isArray(arc.messages) ? arc.messages.length : 0)) || 0;
            const isCurrent = arc.id === currentId;
            const { row } = createSessionArchiveRow({
                archiveName: arc.name,
                isCurrent,
                dateText: dateStr,
                messageCount: msgCount,
                onSelect: async () => {
                if (isCurrent) return;
                const ok = await appConfirm({
                    title: '加载存档',
                    message: `确定要加载存档「${arc.name}」吗？\n当前聊天将被自动保存。`,
                });
                if (!ok) return;
                await runArchiveSwitchFlow({
                    sessionId: sid,
                    isGroup: false,
                    archive: arc,
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
                    sourcePrefix: 'contact',
                    restoreWarnMessage: 'restore checkpoint memory after archive load failed',
                });
                window.toastr?.success('已加载存档');
                this.onSaved?.({ id: sid, forceRefresh: true });
                this.hide();
                },
                onDelete: async (e) => {
                e.stopPropagation();
                const ok = await appConfirm({
                    title: '删除存档',
                    message: '确定要删除这条存档吗？',
                    danger: true,
                });
                if (!ok) return;
                await runArchiveDeleteFlow({
                    sessionId: sid,
                    archiveId: arc.id,
                    deleteArchiveTurnCheckpointState: (sessionId, archiveId) =>
                        window.appBridge?.deleteArchiveTurnCheckpointState?.(sessionId, archiveId),
                    deleteArchive: (archiveId, sessionId) => this.chatStore.deleteArchive(archiveId, sessionId),
                    renderArchives: () => this.renderArchives(),
                    logger,
                    warnMessage: 'delete archive turn checkpoint state failed',
                });
                },
            });
            this.archivesList.appendChild(row);
        });
    }

    renderSummaries() {
        if (!this.summariesList || !this.chatStore) return;
        const sid = this.getSessionId();
        const items = normalizeSummaryItems(this.chatStore.getSummaries(sid) || []);
        renderSummaryList({
            container: this.summariesList,
            items,
            batchMode: this.summaryBatchMode,
            selectedKeys: this.summarySelectedKeys,
            onToggleSelected: (key) => {
                if (this.summarySelectedKeys.has(key)) this.summarySelectedKeys.delete(key);
                else this.summarySelectedKeys.add(key);
                this.renderSummaries();
            },
            onCopyText: async (text) => {
                await navigator.clipboard?.writeText?.(text);
                window.toastr?.success?.('已复制摘要');
            },
            normalRowStyle: 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06);',
        });
    }

    renderCompactedSummary() {
        if (!this.compactedList || !this.chatStore) return;
        const sid = this.getSessionId();
        renderCompactedSummary({
            container: this.compactedList,
            compactedSummary: this.chatStore.getCompactedSummary?.(sid),
            onCopyText: async (text) => {
                await navigator.clipboard?.writeText?.(text);
                window.toastr?.success?.('已复制大总结');
            },
        });
    }

    async startNewChat() {
        if (!this.chatStore) return;
        const sid = this.getSessionId();
        const isRpSession = isRpSessionId(sid);
        const result = await runStartNewChatFlow({
            sessionId: sid,
            isGroup: false,
            sessionMode: isRpSession ? 'rp' : 'chat',
            getMemoryStorageMode,
            askMemoryTableNewChatMode,
            promptForArchiveName: () => prompt('请输入当前聊天的存档名称（留空将自动命名）：'),
            buildMemoryTableSnapshot: ({ sessionId, isGroup }) => buildMemoryTableSnapshot({ sessionId, isGroup }),
            captureArchivePointer: (sessionId, options) =>
                window.appBridge?.buildArchivePointerFromCurrentThread?.(sessionId, options),
            clearSessionMemories: ({ sessionId, isGroup, keepNonSummary, sessionMode }) =>
                clearSessionMemoriesForNewChat({
                    sessionId,
                    isGroup,
                    keepNonSummary,
                    memoryTableStore: window.appBridge?.memoryTableStore,
                    resolveDefaultMemoryTemplateId,
                    resolveSummaryTableIds: ({ sessionId, isGroup }) => {
                        const { summaryTableId, outlineTableId } = getSummaryTableIdsForContext({
                            sessionId,
                            isGroup,
                            contextType: isRpSessionId(sessionId) ? 'rp' : (isGroup ? 'group' : 'contact'),
                            uiMode: sessionMode === 'rp' || isRpSessionId(sessionId) ? 'rp' : 'chat',
                        });
                        return [summaryTableId, outlineTableId];
                    },
                    notifyRowsUpdated: ({ sessionId, templateId }) => {
                        window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId, templateId } }));
                    },
                }),
            startNewChat: (sessionId, archiveName, options) => this.chatStore.startNewChat(sessionId, archiveName, options),
            persistArchivePointer: (sessionId, archiveId, archivePointer, options) =>
                window.appBridge?.setArchivePointerForArchive?.(sessionId, archiveId, archivePointer, options),
            restoreMemoryForActiveThread: (sessionId, options) =>
                window.appBridge?.restoreMemoryForActiveThread?.(sessionId, options),
            logger,
            sourcePrefix: 'contact',
        });
        if (!result?.started) return;
        window.toastr?.success('已开启新聊天');
        this.onSaved?.({ id: sid, forceRefresh: true });
        this.hide();
    }

    getRpDisplayName(sessionId = this.getSessionId()) {
        const sid = String(sessionId || '').trim();
        const direct = String(window.appBridge?.getRpCharacterNameForSession?.(sid) || '').trim();
        if (direct) return direct;
        const contact = this.contactsStore?.getContact?.(sid);
        const saved = String(contact?.name || '').trim();
        if (saved && !saved.startsWith('rp:')) return saved;
        return saved || sid || '角色';
    }

    getSessionDisplayName(sessionId = '') {
        const sid = String(sessionId || '').trim();
        if (!sid) return '';
        if (isRpSessionId(sid)) return this.getRpDisplayName(sid);
        const contact = this.contactsStore?.getContact?.(sid);
        return String(contact?.name || sid).trim() || sid;
    }

    listSocialSessions() {
        return (this.chatStore?.listSessions?.() || [])
            .map((id) => String(id || '').trim())
            .filter(Boolean)
            .filter((id) => !isRpSessionId(id));
    }

    getDefaultRpBridgeSourceId(sessionId = this.getSessionId()) {
        return String(
            window.appBridge?.getRpSessionIdForSession?.(sessionId)
            || window.appBridge?.getRpSessionIdForActivePersona?.()
            || '',
        ).trim();
    }

    getMemoryShareTableLabel(table, { tableId = '', sourceMode = '' } = {}) {
        const base = getBridgeTableShortLabel(table);
        if (sourceMode === 'all_social') {
            return `${isChatToRpGroupTableId(tableId) ? '群聊' : '私聊'}${base}`;
        }
        return base;
    }

    async loadMemoryShareRows(sourceId = '', { templateId = '', sourceIsGroup = false } = {}) {
        const sid = String(sourceId || '').trim();
        if (!sid || !templateId || !window.appBridge?.memoryTableStore?.getMemories) return [];
        try {
            const rows = await window.appBridge.memoryTableStore.getMemories({
                scope: sourceIsGroup ? 'group' : 'contact',
                group_id: sourceIsGroup ? sid : undefined,
                contact_id: sourceIsGroup ? undefined : sid,
                template_id: templateId,
            });
            return Array.isArray(rows) ? rows.filter((row) => row && row.is_active !== false) : [];
        } catch {
            return [];
        }
    }

    async buildChatToRpMemoryShareContext(sessionId = this.getSessionId(), rawSourceId = null, rawTableSettings = null) {
        const sid = String(sessionId || '').trim();
        const template = await resolveDefaultMemoryTemplateDefinition();
        const templateId = await resolveDefaultMemoryTemplateId();
        const tableMap = new Map((template?.tables || []).map((table) => [String(table?.id || '').trim(), table]));
        const sessionSettings = this.chatStore?.getSessionSettings?.(sid) || {};
        const selectedSourceId = rawSourceId === null
            ? String(sessionSettings.chatBridgeSourceSessionId || '').trim()
            : String(rawSourceId || '').trim();
        const { sourceMode, sourceId, sourceIsGroup } = getChatToRpBridgeSourceMeta(selectedSourceId);
        const mergedSessionSettings = {
            ...sessionSettings,
            chatBridgeSourceSessionId: selectedSourceId,
        };
        if (rawTableSettings && typeof rawTableSettings === 'object') {
            if (sourceMode === 'all_social') mergedSessionSettings.chatBridgeAllSocialTableSettings = rawTableSettings;
            else mergedSessionSettings.chatBridgeTableSettings = rawTableSettings;
        }
        const tableSettings = resolveChatToRpBridgeTableSettings({
            sessionSettings: mergedSessionSettings,
            sourceIsGroup,
            sourceMode,
            fallbackEnabled: appSettings.get().memoryBridgeChatToRpEnabled !== false,
            fallbackLimit: 0,
        });
        const socialSessionIds = this.listSocialSessions();
        const sourceRecords = sourceMode === 'all_social'
            ? await Promise.all(socialSessionIds.map(async (socialId) => ({
                sourceId: socialId,
                sourceIsGroup: socialId.startsWith('group:'),
                rows: await this.loadMemoryShareRows(socialId, {
                    templateId,
                    sourceIsGroup: socialId.startsWith('group:'),
                }),
            })))
            : [{
                sourceId,
                sourceIsGroup,
                rows: await this.loadMemoryShareRows(sourceId, { templateId, sourceIsGroup }),
            }];
        const entries = getChatToRpBridgeTableIds({ sourceIsGroup, sourceMode })
            .map((tableId) => {
                const table = tableMap.get(tableId);
                if (!table) return null;
                const enabled = tableSettings?.[tableId]?.enabled === true;
                const limit = normalizeBridgeLimit(tableSettings?.[tableId]?.limit, 0);
                const rowCount = sourceRecords.reduce((total, record) => {
                    if (!record || !Array.isArray(record.rows)) return total;
                    if (sourceMode === 'all_social') {
                        const expectsGroup = isChatToRpGroupTableId(tableId);
                        if (expectsGroup !== record.sourceIsGroup) return total;
                    }
                    return total + record.rows.filter((row) => String(row?.table_id || '').trim() === tableId).length;
                }, 0);
                return {
                    tableId,
                    table,
                    enabled,
                    limit,
                    rowCount,
                    actualCount: limit > 0 ? Math.min(rowCount, limit) : rowCount,
                    shortLabel: this.getMemoryShareTableLabel(table, { tableId, sourceMode }),
                };
            })
            .filter(Boolean);
        return {
            mode: 'chat_to_rp',
            sessionSettings,
            sourceMode,
            selectedSourceId,
            sourceId,
            sourceIsGroup,
            sourceLabel: sourceMode === 'all_social'
                ? '所有聊天室（默认）'
                : (sourceId ? this.getSessionDisplayName(sourceId) : ''),
            summarySourceText: sourceMode === 'all_social'
                ? '来源：所有聊天室（默认）'
                : (sourceId ? `来源：${this.getSessionDisplayName(sourceId) || sourceId}` : '来源：指定聊天室（当前为空）'),
            entries,
        };
    }

    async buildRpToChatMemoryShareContext(sessionId = this.getSessionId(), rawTableSettings = null) {
        const sid = String(sessionId || '').trim();
        const template = await resolveDefaultMemoryTemplateDefinition();
        const templateId = await resolveDefaultMemoryTemplateId();
        const tableMap = new Map((template?.tables || []).map((table) => [String(table?.id || '').trim(), table]));
        const sessionSettings = this.chatStore?.getSessionSettings?.(sid) || {};
        const sourceId = this.getDefaultRpBridgeSourceId(sid);
        const mergedSessionSettings = { ...sessionSettings };
        if (rawTableSettings && typeof rawTableSettings === 'object') {
            mergedSessionSettings.rpBridgeTableSettings = rawTableSettings;
        }
        const tableSettings = resolveRpToChatBridgeTableSettings({
            sessionSettings: mergedSessionSettings,
            fallbackEnabled: appSettings.get().memoryBridgeRpToChatEnabled !== false,
            fallbackLimit: normalizeBridgeLimit(appSettings.get().memoryBridgeRpToChatLimit, 0),
        });
        const activeRows = await this.loadMemoryShareRows(sourceId, { templateId, sourceIsGroup: false });
        const entries = getRpToChatBridgeTableIds()
            .map((tableId) => {
                const table = tableMap.get(tableId);
                if (!table) return null;
                const enabled = tableSettings?.[tableId]?.enabled === true;
                const limit = normalizeBridgeLimit(tableSettings?.[tableId]?.limit, 0);
                const rowCount = activeRows.filter((row) => String(row?.table_id || '').trim() === tableId).length;
                return {
                    tableId,
                    table,
                    enabled,
                    limit,
                    rowCount,
                    actualCount: limit > 0 ? Math.min(rowCount, limit) : rowCount,
                    shortLabel: this.getMemoryShareTableLabel(table, { tableId }),
                };
            })
            .filter(Boolean);
        return {
            mode: 'rp_to_chat',
            sessionSettings,
            sourceId,
            sourceLabel: sourceId ? this.getRpDisplayName(sourceId) : '',
            summarySourceText: sourceId
                ? `来源：${this.getRpDisplayName(sourceId) || sourceId}`
                : '来源：当前角色 RP 会话（当前为空）',
            entries,
        };
    }

    async buildMemoryShareContext(sessionId = this.getSessionId(), rawSourceId = null, rawTableSettings = null) {
        const sid = String(sessionId || '').trim();
        if (!sid) return null;
        return isRpSessionId(sid)
            ? this.buildChatToRpMemoryShareContext(sid, rawSourceId, rawTableSettings)
            : this.buildRpToChatMemoryShareContext(sid, rawTableSettings);
    }

    async refreshMemoryShareSummary(sessionId = this.getSessionId()) {
        if (!this.memoryShareSummary) return;
        const sid = String(sessionId || '').trim();
        if (!sid) {
            this.memoryShareSummary.textContent = '';
            return;
        }
        this.memoryShareSummary.textContent = '正在计算注入记忆...';
        const context = await this.buildMemoryShareContext(sid).catch(() => null);
        if (!context) {
            this.memoryShareSummary.textContent = '记忆共享状态读取失败';
            return;
        }
        const enabledEntries = context.entries.filter((entry) => entry.enabled);
        if (!enabledEntries.length) {
            this.memoryShareSummary.textContent = `${context.summarySourceText}；未启用跨模式记忆注入`;
            return;
        }
        const parts = enabledEntries.map((entry) => `${entry.shortLabel}${entry.actualCount}条`);
        this.memoryShareSummary.textContent = `${context.summarySourceText}；注入记忆：${parts.join('、')}`;
    }

    ensureMemoryShareModal() {
        if (this.memorySharePanel) return;
        const modal = createSessionMemoryShareModal({
            variant: 'contact',
            documentRef: document,
        });
        this.memoryShareOverlay = modal.overlay;
        this.memorySharePanel = modal.panel;
        this.memoryShareHint = modal.hint;
        this.memoryShareSourceWrap = modal.sourceWrap;
        this.memoryShareSourceStatic = modal.sourceStatic;
        this.memoryShareSourceSelect = modal.sourceSelect;
        this.memoryShareSourceButton = modal.sourceButton;
        this.memoryShareRows = modal.rows;
        this.memoryShareSaveBtn = modal.saveButton;
        this.memoryShareOverlay.addEventListener('click', () => this.closeMemoryShareManager());
        document.body.appendChild(this.memoryShareOverlay);
        document.body.appendChild(this.memorySharePanel);
        bindCustomSelectButton({
            buttonEl: this.memoryShareSourceButton,
            selectEl: this.memoryShareSourceSelect,
            fallback: '所有聊天室（默认仅注入大纲）',
        });

        modal.closeButton.onclick = () => this.closeMemoryShareManager();
        modal.cancelButton.onclick = () => this.closeMemoryShareManager();
        this.memoryShareSourceSelect?.addEventListener('change', () => {
            if (!this.memoryShareDraft) return;
            this.memoryShareDraft.sourceId = String(this.memoryShareSourceSelect?.value || '').trim();
            this.renderMemoryShareManager().catch((err) => {
                logger.warn('render memory share manager failed', err);
            });
        });
        this.memoryShareSaveBtn?.addEventListener('click', () => {
            this.saveMemoryShareManager().catch((err) => {
                logger.warn('save memory share manager failed', err);
                window.toastr?.error?.('保存记忆共享失败');
            });
        });
    }

    closeMemoryShareManager() {
        closeCustomSelectMenu();
        if (this.memoryShareOverlay) this.memoryShareOverlay.style.display = 'none';
        if (this.memorySharePanel) this.memorySharePanel.style.display = 'none';
        this.memoryShareDraft = null;
    }

    async renderMemoryShareManager() {
        if (!this.memoryShareDraft || !this.memoryShareSourceSelect || !this.memoryShareRows) return;
        const sessionId = String(this.memoryShareDraft.sessionId || '').trim();
        const isRpTarget = isRpSessionId(sessionId);
        const hint = this.memoryShareHint;
        const sourceWrap = this.memoryShareSourceWrap;
        const sourceStatic = this.memoryShareSourceStatic;
        if (hint) {
            hint.textContent = isRpTarget
                ? '真正全局的用户档案会自动共享；这里仅管理聊天 / 群聊注入到当前 RP 会话的额外记忆。'
                : '真正全局的用户档案会自动共享；这里仅管理当前角色的 RP 会话注入到本聊天的额外记忆。';
        }
        if (sourceWrap) sourceWrap.style.display = isRpTarget ? 'block' : 'none';
        if (sourceStatic) sourceStatic.style.display = isRpTarget ? 'none' : 'block';
        if (isRpTarget) {
            const sessionIds = this.listSocialSessions();
            this.memoryShareSourceSelect.innerHTML = '';
            const appendOption = (value, label) => {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = label;
                this.memoryShareSourceSelect.appendChild(option);
            };
            appendOption('', '所有聊天室（默认仅注入大纲）');
            sessionIds.forEach((id) => appendOption(id, this.getSessionDisplayName(id)));
            this.memoryShareSourceSelect.value = String(this.memoryShareDraft.sourceId || '').trim();
            refreshCustomSelectButton(this.memoryShareSourceButton, this.memoryShareSourceSelect, '所有聊天室（默认仅注入大纲）');
        } else if (sourceStatic) {
            const sourceId = this.getDefaultRpBridgeSourceId(sessionId);
            const sourceLabel = sourceId ? (this.getRpDisplayName(sourceId) || sourceId) : '当前为空';
            sourceStatic.textContent = `来源 RP 会话：${sourceLabel}`;
        }

        const context = await this.buildMemoryShareContext(
            sessionId,
            this.memoryShareDraft.sourceId,
            this.memoryShareDraft.tableSettings,
        );
        this.memoryShareRows.innerHTML = '';
        if (!context.entries.length) {
            this.memoryShareRows.appendChild(createMemoryShareEmptyState());
            return;
        }
        context.entries.forEach((entry) => {
            const { row } = createMemoryShareEntryRow({
                entry,
                onToggle: ({ toggle, limitInput }) => {
                const current = this.memoryShareDraft.tableSettings?.[entry.tableId] || {};
                this.memoryShareDraft.tableSettings = {
                    ...(this.memoryShareDraft.tableSettings || {}),
                    [entry.tableId]: {
                        ...current,
                        enabled: toggle.checked === true,
                        limit: normalizeBridgeLimit(current.limit, entry.limit),
                    },
                };
                limitInput.disabled = toggle.checked !== true;
                },
                onLimitInput: ({ limitInput }) => {
                const safe = normalizeBridgeLimit(limitInput.value, 0);
                limitInput.value = String(safe);
                const current = this.memoryShareDraft.tableSettings?.[entry.tableId] || {};
                this.memoryShareDraft.tableSettings = {
                    ...(this.memoryShareDraft.tableSettings || {}),
                    [entry.tableId]: {
                        ...current,
                        enabled: current.enabled === true,
                        limit: safe,
                    },
                };
                },
            });
            this.memoryShareRows.appendChild(row);
        });
    }

    async openMemoryShareManager() {
        const sessionId = this.getSessionId();
        this.ensureMemoryShareModal();
        const sessionSettings = this.chatStore?.getSessionSettings?.(sessionId) || {};
        const isRpTarget = isRpSessionId(sessionId);
        const sourceId = isRpTarget ? String(sessionSettings.chatBridgeSourceSessionId || '').trim() : '';
        this.memoryShareDraft = {
            sessionId,
            sourceId,
            tableSettings: {
                ...(
                    isRpTarget
                        ? (
                            sourceId
                                ? (sessionSettings.chatBridgeTableSettings && typeof sessionSettings.chatBridgeTableSettings === 'object'
                                    ? sessionSettings.chatBridgeTableSettings
                                    : {})
                                : (sessionSettings.chatBridgeAllSocialTableSettings && typeof sessionSettings.chatBridgeAllSocialTableSettings === 'object'
                                    ? sessionSettings.chatBridgeAllSocialTableSettings
                                    : {})
                        )
                        : (sessionSettings.rpBridgeTableSettings && typeof sessionSettings.rpBridgeTableSettings === 'object'
                            ? sessionSettings.rpBridgeTableSettings
                            : {})
                ),
            },
        };
        await this.renderMemoryShareManager();
        if (this.memoryShareOverlay) this.memoryShareOverlay.style.display = 'block';
        if (this.memorySharePanel) this.memorySharePanel.style.display = 'flex';
    }

    async saveMemoryShareManager() {
        if (!this.memoryShareDraft) return;
        const sessionId = String(this.memoryShareDraft.sessionId || '').trim();
        if (!sessionId) return;
        const sessionSettings = this.chatStore?.getSessionSettings?.(sessionId) || {};
        if (isRpSessionId(sessionId)) {
            const sourceId = String(this.memoryShareDraft.sourceId || '').trim();
            const { sourceMode, sourceIsGroup } = getChatToRpBridgeSourceMeta(sourceId);
            if (sourceMode === 'all_social') {
                const normalizedAllSocialTableSettings = {
                    ...(sessionSettings.chatBridgeAllSocialTableSettings && typeof sessionSettings.chatBridgeAllSocialTableSettings === 'object'
                        ? sessionSettings.chatBridgeAllSocialTableSettings
                        : {}),
                    ...pruneChatToRpBridgeTableSettings(this.memoryShareDraft.tableSettings || {}, { sourceMode }),
                };
                const resolvedTableSettings = resolveChatToRpBridgeTableSettings({
                    sessionSettings: {
                        ...sessionSettings,
                        chatBridgeSourceSessionId: '',
                        chatBridgeAllSocialTableSettings: normalizedAllSocialTableSettings,
                    },
                    sourceMode,
                    fallbackEnabled: appSettings.get().memoryBridgeChatToRpEnabled !== false,
                    fallbackLimit: 0,
                });
                sessionSettings.chatBridgeSourceSessionId = '';
                sessionSettings.chatBridgeAllSocialTableSettings = normalizedAllSocialTableSettings;
                sessionSettings.chatBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
                sessionSettings.chatBridgeOutlineLimit = Math.max(
                    normalizeBridgeLimit(resolvedTableSettings?.chat_outline?.limit, 0),
                    normalizeBridgeLimit(resolvedTableSettings?.group_outline?.limit, 0),
                );
            } else {
                const normalizedTableSettings = {
                    ...(sessionSettings.chatBridgeTableSettings && typeof sessionSettings.chatBridgeTableSettings === 'object'
                        ? sessionSettings.chatBridgeTableSettings
                        : {}),
                    ...pruneChatToRpBridgeTableSettings(this.memoryShareDraft.tableSettings || {}, { sourceIsGroup, sourceMode }),
                };
                const resolvedTableSettings = resolveChatToRpBridgeTableSettings({
                    sessionSettings: {
                        ...sessionSettings,
                        chatBridgeSourceSessionId: sourceId,
                        chatBridgeTableSettings: normalizedTableSettings,
                    },
                    sourceIsGroup,
                    sourceMode,
                    fallbackEnabled: appSettings.get().memoryBridgeChatToRpEnabled !== false,
                    fallbackLimit: 0,
                });
                const outlineTableId = sourceIsGroup ? 'group_outline' : 'chat_outline';
                sessionSettings.chatBridgeSourceSessionId = sourceId;
                sessionSettings.chatBridgeTableSettings = normalizedTableSettings;
                sessionSettings.chatBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
                sessionSettings.chatBridgeOutlineLimit = normalizeBridgeLimit(resolvedTableSettings?.[outlineTableId]?.limit, 0);
            }
        } else {
            const normalizedTableSettings = {
                ...(sessionSettings.rpBridgeTableSettings && typeof sessionSettings.rpBridgeTableSettings === 'object'
                    ? sessionSettings.rpBridgeTableSettings
                    : {}),
                ...pruneRpToChatBridgeTableSettings(this.memoryShareDraft.tableSettings || {}),
            };
            const resolvedTableSettings = resolveRpToChatBridgeTableSettings({
                sessionSettings: {
                    ...sessionSettings,
                    rpBridgeTableSettings: normalizedTableSettings,
                },
                fallbackEnabled: appSettings.get().memoryBridgeRpToChatEnabled !== false,
                fallbackLimit: normalizeBridgeLimit(appSettings.get().memoryBridgeRpToChatLimit, 0),
            });
            sessionSettings.rpBridgeTableSettings = normalizedTableSettings;
            sessionSettings.rpBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
            sessionSettings.rpBridgeOutlineLimit = normalizeBridgeLimit(resolvedTableSettings?.rp_outline?.limit, 0);
        }
        this.chatStore?.setSessionSettings?.(sessionId, sessionSettings);
        this.closeMemoryShareManager();
        await this.refreshMemoryShareSummary(sessionId);
        window.toastr?.success?.('已保存记忆共享设置');
    }

    populate() {
        const sessionId = this.getSessionId();
        const c = this.contactsStore?.getContact?.(sessionId) || { id: sessionId, name: sessionId, avatar: '' };
        const isRpSession = isRpSessionId(sessionId);
        const rpDisplayName = isRpSession ? this.getRpDisplayName(sessionId) : '';
        // Ensure it exists (so save works)
        this.contactsStore?.upsertContact?.(c);
        const title = this.panel.querySelector('#contact-settings-title');
        if (title) title.textContent = isRpSession ? '设置' : '好友设置';
        const sub = this.panel.querySelector('#contact-settings-sub');
        if (sub) sub.textContent = `会话：${sessionId}`;
        this.currentAvatar = c.avatar || '';
        if (this.avatarPreview) {
            const savedName = String(c?.name || '').trim();
            const nameForAvatar = isRpSession
                ? (rpDisplayName || (savedName && !savedName.startsWith('rp:') ? savedName : '') || sessionId || '角色')
                : (savedName || sessionId || '好友');
            const tags = Array.isArray(c?.libraryTags) && c.libraryTags.length
                ? c.libraryTags
                : Array.isArray(c?.labels)
                    ? c.labels
                    : [];
            this.avatarPreview.src = resolveLineAvatar({
                avatar: this.currentAvatar || FEATHER_DEFAULT,
                name: nameForAvatar,
                tags,
                size: 96,
            });
        }
        if (this.nameInput) {
            const savedName = String(c?.name || '').trim();
            this.nameInput.value = isRpSession
                ? (savedName && !savedName.startsWith('rp:') ? savedName : (rpDisplayName || savedName || sessionId))
                : (savedName || sessionId);
        }
        if (this.labelsInput) {
            const labels = Array.isArray(c.labels) ? c.labels : [];
            this.labelsInput.value = labels.join(', ');
        }
        const sessionSettings = this.chatStore?.getSessionSettings?.(sessionId) || {};
        const globalSettings = appSettings.get();
        if (this.templateToggle) {
            this.templateToggle.checked = (typeof sessionSettings.templateEnabled === 'boolean')
                ? sessionSettings.templateEnabled
                : (globalSettings.templateEnabled !== false);
        }
        if (this.scriptToggle) {
            this.scriptToggle.checked = (typeof sessionSettings.scriptEnabled === 'boolean')
                ? sessionSettings.scriptEnabled
                : (globalSettings.scriptEnabled === true);
        }
        const bridgeBlockTitle = this.panel.querySelector('#contact-bridge-block-title');
        if (bridgeBlockTitle) bridgeBlockTitle.style.display = isRpSession ? 'none' : 'block';
        if (this.rpBridgeSection) this.rpBridgeSection.style.display = 'none';
        if (this.memoryShareSection) this.memoryShareSection.style.display = 'block';
        if (this.exportExperiencePackBtn) {
            const isGroup = c?.isGroup === true;
            const canExport = !isRpSession && !isGroup && typeof this.onExportExperiencePack === 'function';
            this.exportExperiencePackBtn.style.display = canExport ? 'flex' : 'none';
            this.exportExperiencePackBtn.disabled = !canExport;
        }
        this.refreshMemoryShareSummary(sessionId).catch((err) => {
            logger.warn('refresh memory share summary failed', err);
            if (this.memoryShareSummary) this.memoryShareSummary.textContent = '记忆共享状态读取失败';
        });
    }

    save() {
        try {
            const sessionId = this.getSessionId();
            const prev = this.contactsStore?.getContact?.(sessionId) || { id: sessionId };
            const name = String(this.nameInput?.value || '').trim() || prev.name || sessionId;
            const avatar = String(this.currentAvatar || '');
            const rawLabels = String(this.labelsInput?.value || '');
            const labels = normalizeBadgeList(
                rawLabels
                    .split(/[,，\n\r]/)
                    .map(s => s.trim())
                    .filter(Boolean),
                { max: 8 },
            );
            const sessionSettings = this.chatStore?.getSessionSettings?.(sessionId) || {};
            if (this.templateToggle) sessionSettings.templateEnabled = Boolean(this.templateToggle.checked);
            if (this.scriptToggle) sessionSettings.scriptEnabled = Boolean(this.scriptToggle.checked);
            this.chatStore?.setSessionSettings?.(sessionId, sessionSettings);
            this.contactsStore?.upsertContact?.({ ...prev, id: sessionId, name, avatar, labels });
            window.toastr?.success?.(isRpSessionId(sessionId) ? '已保存设置' : '已保存好友设置');
            this.onSaved?.({ id: sessionId, name, avatar, labels });
            this.hide();
        } catch (err) {
            logger.error('保存好友设置失败', err);
            window.toastr?.error?.(err.message || '保存失败');
        }
    }
}
