/**
 * Group chat panels
 * - Create group from contacts
 * - Manage group settings (name/avatar/members)
 */

import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import { appSettings } from '../storage/app-settings.js';
import {
    getBridgeTableShortLabel,
    getRpToChatBridgeTableIds,
    normalizeBridgeLimit,
    pruneRpToChatBridgeTableSettings,
    resolveRpToChatBridgeTableSettings,
} from '../memory/memory-bridge-utils.js';
import { MemoryTableEditor } from './memory-table-editor.js';
import { appConfirm } from './app-confirm.js';
import { createSessionContactPickerModal } from './session-contact-picker-modal-utils.js';
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
    createMemoryShareEntryRow,
    createMemberManageRow,
    createSelectableContactEmptyState,
    createSelectableContactRow,
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

    createUI() {
        const topContent = document.createElement('div');
        topContent.innerHTML = `
            <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin-bottom:14px;">
                <button id="group-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid var(--app-border-default); background:var(--app-surface-card); padding:0; overflow:hidden; cursor:pointer;">
                    <img id="group-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                </button>
                <div style="flex:1; min-width:220px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">群组名称</div>
                    <input id="group-name" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:14px;" placeholder="请输入群组名称">
                    <div id="group-name-hint" style="color:var(--app-text-muted); font-size:12px; margin-top:6px;"></div>
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
        if (!this.panel) return;
        const btn = this.panel.querySelector('#group-create');
        const hint = this.panel.querySelector('#group-name-hint');
        const name = normalize(this.panel.querySelector('#group-name')?.value);
        const membersCount = this.selected.size;
        const nameKey = normalizeKey(name);

        let error = '';
        if (!name) error = '请输入群组名称';
        else {
            const groups = this.contactsStore?.listGroups?.() || [];
            const dup = groups.find(g => normalizeKey(g?.name) === nameKey);
            if (dup) error = '已存在同名群组';
        }
        if (!error && membersCount < 2) error = '请至少选择 2 位成员';

        if (hint) {
            hint.textContent = error ? error : `已选择 ${membersCount} 位成员`;
            hint.style.color = error ? '#ef4444' : 'var(--app-text-muted)';
        }
        if (btn) btn.disabled = Boolean(error);
    }

    renderContacts() {
        const listEl = this.panel?.querySelector('#group-contacts');
        if (!listEl) return;
        const q = normalizeKey(this.panel.querySelector('#group-search')?.value);
        const friends = (this.contactsStore?.listFriends?.() || []).filter(f => !String(f?.id || '').startsWith('rp:'));
        const filtered = q
            ? friends.filter(c => normalizeKey(c?.name || c?.id).includes(q))
            : friends;

        listEl.innerHTML = '';
        if (!filtered.length) {
            listEl.appendChild(createSelectableContactEmptyState());
            this.updateCreateEnabled();
            return;
        }

        filtered.forEach((c) => {
            const id = normalize(c?.id);
            if (!id) return;
            const { row } = createSelectableContactRow({
                id,
                name: c?.name || id,
                avatar: resolveContactAvatar(c, id),
                selected: this.selected.has(id),
                selectedText: '已选',
                onClick: () => {
                    if (this.selected.has(id)) this.selected.delete(id);
                    else this.selected.add(id);
                    this.renderContacts();
                },
            });
            listEl.appendChild(row);
        });
        this.updateCreateEnabled();
    }

    createGroup() {
        try {
            const name = normalize(this.panel?.querySelector('#group-name')?.value);
            if (!name) return;
            const members = [...this.selected].map(normalize).filter(Boolean);
            if (members.length < 2) return;

            const id = genGroupId();
            logger.info(
                `[group-chat] create scope=${this.contactsStore?.scopeId || 'default'} id=${id} name=${name} members=${members.length} avatarLen=${String(this.avatar || '').trim().length}`
            );
            this.contactsStore?.upsertContact?.({
                id,
                name,
                avatar: this.avatar || '',
                isGroup: true,
                members,
                addedAt: Date.now(),
            });

            // System messages
            const memberNames = members
                .map(mid => this.contactsStore?.getContact?.(mid)?.name || mid)
                .filter(Boolean);
            const sys1 = { role: 'system', type: 'meta', content: `你创建了群聊「${name}」`, name: '系统', avatar: '' , time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
            const sys2 = { role: 'system', type: 'meta', content: `你邀请了：${memberNames.join('、')} 加入群聊`, name: '系统', avatar: '' , time: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) };
            this.chatStore?.appendMessage?.(sys1, id);
            this.chatStore?.appendMessage?.(sys2, id);

            this.hide();
            window.toastr?.success?.('群组已创建');
            this.onCreated?.({ id, name });
        } catch (err) {
            logger.error('创建群组失败', err);
            window.toastr?.error?.(err.message || '创建失败');
        }
    }
}

export class GroupSettingsPanel {
    constructor({ contactsStore, chatStore, onSaved } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;

        this.overlay = null;
        this.panel = null;
        this.fileInput = null;

        this.groupId = '';
        this.avatar = '';
        this.members = [];
        this.archivesList = null;
        this.summariesList = null;
        this.compactedList = null;
        this.summarySection = null;
        this.memoryTableSection = null;
        this.memoryFeaturesSection = null;
        this.memoryTableContent = null;
        this.memoryTableEditor = null;
        this.summaryBatchMode = false;
        this.summarySelectedKeys = new Set();
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
        this.memoryShareOverlay = null;
        this.memorySharePanel = null;
        this.memoryShareRows = null;
        this.memoryShareSaveBtn = null;
        this.memoryShareDraft = null;

        this.addOverlay = null;
        this.addPanel = null;
        this.addSelected = new Set();
    }

    show(groupId) {
        const id = normalize(groupId);
        if (!id) return;
        if (!this.panel) this.createUI();
        this.groupId = id;
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
        shell.body.innerHTML = `
                <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                    <button id="group-settings-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid var(--app-border-default); background:var(--app-surface-card); padding:0; overflow:hidden; cursor:pointer;">
                        <img id="group-settings-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">群组名称</div>
                        <input id="group-settings-name" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:14px;">
                        <div style="color:var(--app-text-muted); font-size:12px; margin-top:6px;">修改名称不会改变聊天室 ID。</div>
                    </div>
                </div>

	                <div style="margin-top:14px;">
	                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
	                        <div style="font-weight:800; color:var(--app-text-primary);">成员</div>
	                        <button id="group-settings-add" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); padding:6px 10px; border-radius:10px; cursor:pointer;">＋ 添加</button>
	                    </div>
	                    <div id="group-settings-members" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
	                </div>

                    <div style="margin-top:18px; border-top:1px solid rgba(0,0,0,0.06); padding-top:14px;">
                        <div style="font-weight:800; color:var(--app-text-primary); margin-bottom:8px;">聊天管理</div>
                        <button id="group-new-chat" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); color:#019aff; font-weight:700; margin-bottom:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                            <span>✨</span> 开启新聊天（存档当前）
                        </button>
                        <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:6px;">历史存档（点击加载）</div>
                        <div id="group-archives-list" style="max-height:160px; overflow-y:auto; border:1px solid var(--app-border-subtle); border-radius:8px; background:var(--app-surface-subtle); padding:0;"></div>
                    </div>

                    <div id="group-memory-features-section" style="margin-top:18px; border-top:1px solid rgba(0,0,0,0.06); padding-top:14px;">
                        <div style="font-weight:800; color:var(--app-text-primary); margin-bottom:10px;">聊天 / RP 桥接（当前会话）</div>
                        <div id="group-rp-bridge-section" style="display:none;"></div>
                        <div id="group-memory-share-section">
                            <button id="group-memory-share-manage" type="button" style="width:100%; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); color:var(--app-text-primary); font-weight:800; cursor:pointer;">
                                记忆共享
                            </button>
                            <div id="group-memory-share-summary" style="color:var(--app-text-muted); font-size:12px; line-height:1.5; margin-top:8px;"></div>
                        </div>
                    </div>

                    <div id="group-summary-section" style="margin-top:18px; border-top:1px solid rgba(0,0,0,0.06); padding-top:14px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                            <div style="font-weight:800; color:var(--app-text-primary);">摘要</div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <button id="group-summaries-batch" type="button" title="批量操作" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">☰</button>
                                <button id="group-summaries-clear" type="button" style="padding:6px 10px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#ef4444;">清空</button>
                            </div>
                        </div>
                        <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:8px;">该群聊每次互动保存一条摘要（与聊天存档绑定）</div>
                        <div id="group-summaries-batchbar" style="display:none; align-items:center; justify-content:flex-end; gap:8px; margin:-2px 0 10px;">
                            <button id="group-summaries-batch-edit" type="button" title="批量编辑" style="width:34px; height:30px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px;">✎</button>
                            <button id="group-summaries-batch-delete" type="button" title="批量删除" style="width:34px; height:30px; border:1px solid #fecaca; border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#b91c1c; font-size:16px;">🗑</button>
                            <button id="group-summaries-batch-cancel" type="button" title="退出批量" style="width:34px; height:30px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:18px;">×</button>
                        </div>
                        <div id="group-summaries-list" style="max-height:180px; overflow-y:auto; border:1px solid var(--app-border-subtle); border-radius:10px; background:var(--app-surface-card); padding:0;"></div>

	                    <div style="margin-top:14px;">
	                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
	                            <div style="font-weight:800; color:var(--app-text-primary);">大总结</div>
	                            <div style="display:flex; align-items:center; gap:8px;">
	                                <button id="group-compacted-raw" type="button" title="查看原始回复" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">📄</button>
	                                <button id="group-compacted-edit" type="button" title="编辑" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">✎</button>
	                                <button id="group-compacted-run" type="button" title="手动生成/刷新" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">↻</button>
	                                <button id="group-compacted-clear" type="button" title="删除" style="width:32px; height:28px; border:1px solid #fecaca; border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#b91c1c; font-size:16px; line-height:1;">🗑</button>
	                            </div>
	                        </div>
	                        <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:8px;">摘要总字数超过阈值会自动生成大总结（与聊天存档绑定）</div>
	                        <div id="group-compacted-summary" style="max-height:220px; overflow-y:auto; border:1px solid var(--app-border-subtle); border-radius:10px; background:var(--app-surface-card); padding:0;"></div>
	                    </div>
                    </div>

                    <div id="group-memory-table-section" style="display:none; margin-top:18px; padding:12px; border:1px dashed var(--app-border-default); border-radius:12px; background:var(--app-surface-subtle);">
                        <div style="font-weight:800; color:var(--app-text-primary); margin-bottom:6px;">记忆表格</div>
                        <div id="group-memory-table-content"></div>
                    </div>
	            </div>
        `;
        const footer = document.createElement('div');
        footer.style.cssText = 'padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:var(--app-surface-subtle); display:flex; gap:10px;';
        footer.innerHTML = `
            <button id="group-settings-cancel" style="flex:1; padding:10px 14px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">取消</button>
            <button id="group-settings-save" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:800;">保存</button>
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

        this.panel.querySelector('#group-settings-close').onclick = () => this.hide();
        this.panel.querySelector('#group-settings-cancel').onclick = () => this.hide();
        this.panel.querySelector('#group-settings-avatar-btn').onclick = () => {
            this.fileInput.value = '';
            this.fileInput.click();
        };
        this.panel.querySelector('#group-settings-add').onclick = () => this.openAddMembers();
        this.panel.querySelector('#group-settings-save').onclick = () => this.save();
        this.memoryShareButton?.addEventListener('click', () => {
            this.openMemoryShareManager().catch((err) => {
                logger.warn('open group memory share manager failed', err);
                window.toastr?.error?.('打开记忆共享失败');
            });
        });
        this.panel.querySelector('#group-new-chat').onclick = () => this.startNewChat();
        this.panel.querySelector('#group-summaries-clear').onclick = async () => {
            const sid = this.groupId;
            if (!sid) return;
            const ok = await appConfirm({
                title: '清空摘要',
                message: '确定要清空该群聊当前存档/聊天的所有摘要吗？',
                danger: true,
            });
            if (!ok) return;
            try { this.chatStore?.clearSummaries?.(sid); } catch {}
            this.summarySelectedKeys = new Set();
            this.setSummaryBatchMode(false);
            this.renderSummaries();
        };
        this.panel.querySelector('#group-summaries-batch').onclick = () => this.setSummaryBatchMode(!this.summaryBatchMode);
	        this.panel.querySelector('#group-summaries-batch-cancel').onclick = () => this.setSummaryBatchMode(false);
	        this.panel.querySelector('#group-summaries-batch-delete').onclick = () => this.deleteSelectedSummaries();
	        this.panel.querySelector('#group-summaries-batch-edit').onclick = () => this.editSelectedSummaries();
	        this.panel.querySelector('#group-compacted-raw').onclick = () => this.openCompactedRaw();
	        this.panel.querySelector('#group-compacted-edit').onclick = () => this.editCompactedSummary();
	        this.panel.querySelector('#group-compacted-run').onclick = () => this.runCompactedSummary();
        this.panel.querySelector('#group-compacted-clear').onclick = async () => {
            const sid = this.groupId;
            if (!sid) return;
            const ok = await appConfirm({
                title: '清空大总结',
                message: '确定要清空该群聊当前存档/聊天的大总结吗？',
                danger: true,
            });
            if (!ok) return;
            try { this.chatStore?.clearCompactedSummary?.(sid); } catch {}
            this.renderCompactedSummary();
        };

        if (this.memoryTableContent && window.appBridge) {
            this.memoryTableEditor = new MemoryTableEditor({
                container: this.memoryTableContent,
                getContext: () => ({ type: 'group', groupId: this.groupId }),
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
                const sid = this.groupId;
                const target = String(ev?.detail?.sessionId || '').trim();
                if (!sid || !target || sid !== target) return;
                this.renderSummaries();
                this.renderCompactedSummary();
            } catch {}
        });
    }

	    setSummaryBatchMode(enabled) {
	        const next = Boolean(enabled);
	        this.summaryBatchMode = next;
	        if (!next) this.summarySelectedKeys = new Set();
	        if (this.summariesBatchBar) this.summariesBatchBar.style.display = next ? 'flex' : 'none';
	        this.renderSummaries();
	    }

	    ensureCompactedRawModal() {
	        if (this.__compactedRawReady) return;
	        this.__compactedRawReady = true;
	        this.__compactedRawModal = createReadonlyTextareaModal({
	            overlayClass: 'app-themed-overlay group-inline-modal-overlay',
	            panelClass: 'app-themed-panel group-inline-modal-panel',
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
	            sessionId: this.groupId,
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
	            overlayClass: 'app-themed-overlay group-inline-modal-overlay',
	            panelClass: 'app-themed-panel group-inline-modal-panel',
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
	            sessionId: this.groupId,
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

    ensureSummaryEditModal() {
        if (this.summaryEditPanel) return;
        this.__summaryEditModal = createEditableTextareaModal({
            overlayClass: 'app-themed-overlay group-inline-modal-overlay',
            panelClass: 'app-themed-panel group-inline-modal-panel',
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
            sessionId: this.groupId,
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
            sessionId: this.groupId,
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
            sessionId: this.groupId,
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

    getRpDisplayName(sessionId = '') {
        const sid = normalize(sessionId);
        if (!sid) return '';
        const contact = this.contactsStore?.getContact?.(sid);
        const saved = String(contact?.name || '').trim();
        if (saved && !saved.startsWith('rp:')) return saved;
        return window.appBridge?.getRpCharacterNameForSession?.(sid) || saved || sid || '角色';
    }

    getDefaultRpBridgeSourceId(sessionId = this.groupId) {
        return normalize(
            window.appBridge?.getRpSessionIdForSession?.(sessionId)
            || window.appBridge?.getRpSessionIdForActivePersona?.()
            || '',
        );
    }

    async loadRpMemoryShareRows(sourceId = '', templateId = '') {
        const sid = normalize(sourceId);
        if (!sid || !templateId || !window.appBridge?.memoryTableStore?.getMemories) return [];
        try {
            const rows = await window.appBridge.memoryTableStore.getMemories({
                scope: 'contact',
                contact_id: sid,
                template_id: templateId,
            });
            return Array.isArray(rows) ? rows.filter((row) => row && row.is_active !== false) : [];
        } catch {
            return [];
        }
    }

    async buildMemoryShareContext(sessionId = this.groupId, rawTableSettings = null) {
        const sid = normalize(sessionId);
        const template = await resolveDefaultMemoryTemplateDefinition();
        const templateId = await resolveDefaultMemoryTemplateId();
        const tableMap = new Map((template?.tables || []).map((table) => [normalize(table?.id), table]));
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
        const activeRows = await this.loadRpMemoryShareRows(sourceId, templateId);
        return {
            sourceId,
            sourceLabel: sourceId ? this.getRpDisplayName(sourceId) : '',
            summarySourceText: sourceId
                ? `来源：${this.getRpDisplayName(sourceId) || sourceId}`
                : '来源：当前角色 RP 会话（当前为空）',
            entries: getRpToChatBridgeTableIds().map((tableId) => {
                const table = tableMap.get(tableId);
                const rowCount = activeRows.filter((row) => normalize(row?.table_id) === tableId).length;
                const limit = normalizeBridgeLimit(tableSettings?.[tableId]?.limit, 0);
                return {
                    tableId,
                    shortLabel: getBridgeTableShortLabel(table || { id: tableId, name: tableId }),
                    enabled: tableSettings?.[tableId]?.enabled === true,
                    limit,
                    rowCount,
                    actualCount: limit > 0 ? Math.min(rowCount, limit) : rowCount,
                };
            }),
        };
    }

    async refreshMemoryShareSummary(sessionId = this.groupId) {
        if (!this.memoryShareSummary) return;
        const sid = normalize(sessionId);
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
            variant: 'group',
            documentRef: document,
            hintText: '真正全局的用户档案会自动共享；这里仅管理当前角色的 RP 会话注入到本群聊的额外记忆。',
        });
        this.memoryShareOverlay = modal.overlay;
        this.memorySharePanel = modal.panel;
        this.memoryShareSourceStatic = modal.sourceStatic;
        this.memoryShareRows = modal.rows;
        this.memoryShareSaveBtn = modal.saveButton;
        this.memoryShareOverlay.addEventListener('click', () => this.closeMemoryShareManager());
        document.body.appendChild(this.memoryShareOverlay);
        document.body.appendChild(this.memorySharePanel);

        modal.closeButton.onclick = () => this.closeMemoryShareManager();
        modal.cancelButton.onclick = () => this.closeMemoryShareManager();
        this.memoryShareSaveBtn?.addEventListener('click', () => {
            this.saveMemoryShareManager().catch((err) => {
                logger.warn('save group memory share manager failed', err);
                window.toastr?.error?.('保存记忆共享失败');
            });
        });
    }

    closeMemoryShareManager() {
        if (this.memoryShareOverlay) this.memoryShareOverlay.style.display = 'none';
        if (this.memorySharePanel) this.memorySharePanel.style.display = 'none';
        this.memoryShareDraft = null;
    }

    async renderMemoryShareManager() {
        if (!this.memoryShareDraft || !this.memoryShareRows) return;
        const sessionId = normalize(this.memoryShareDraft.sessionId);
        const sourceEl = this.memoryShareSourceStatic;
        const sourceId = this.getDefaultRpBridgeSourceId(sessionId);
        const sourceLabel = sourceId ? (this.getRpDisplayName(sourceId) || sourceId) : '当前为空';
        if (sourceEl) sourceEl.textContent = `来源 RP 会话：${sourceLabel}`;

        const context = await this.buildMemoryShareContext(sessionId, this.memoryShareDraft.tableSettings);
        this.memoryShareRows.innerHTML = '';
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
        this.ensureMemoryShareModal();
        const sessionSettings = this.chatStore?.getSessionSettings?.(this.groupId) || {};
        this.memoryShareDraft = {
            sessionId: this.groupId,
            tableSettings: {
                ...(sessionSettings.rpBridgeTableSettings && typeof sessionSettings.rpBridgeTableSettings === 'object'
                    ? sessionSettings.rpBridgeTableSettings
                    : {}),
            },
        };
        await this.renderMemoryShareManager();
        if (this.memoryShareOverlay) this.memoryShareOverlay.style.display = 'block';
        if (this.memorySharePanel) this.memorySharePanel.style.display = 'flex';
    }

    async saveMemoryShareManager() {
        if (!this.memoryShareDraft) return;
        const sessionSettings = this.chatStore?.getSessionSettings?.(this.groupId) || {};
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
        this.chatStore?.setSessionSettings?.(this.groupId, sessionSettings);
        this.closeMemoryShareManager();
        await this.refreshMemoryShareSummary();
        window.toastr?.success?.('已保存记忆共享设置');
    }

    renderSummaries() {
        if (!this.summariesList || !this.chatStore) return;
        const sid = this.groupId;
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
            normalRowStyle: 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer;',
        });
    }

    renderCompactedSummary() {
        if (!this.compactedList || !this.chatStore) return;
        const sid = this.groupId;
        renderCompactedSummary({
            container: this.compactedList,
            compactedSummary: this.chatStore.getCompactedSummary?.(sid),
            onCopyText: async (text) => {
                await navigator.clipboard?.writeText?.(text);
                window.toastr?.success?.('已复制大总结');
            },
        });
    }

    renderArchives() {
        if (!this.archivesList || !this.chatStore) return;
        const sid = this.groupId;
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
                        isGroup: true,
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
                        sourcePrefix: 'group',
                        restoreWarnMessage: 'restore checkpoint memory after group archive load failed',
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
                        warnMessage: 'delete group archive turn checkpoint state failed',
                    });
                },
            });
            this.archivesList.appendChild(row);
        });
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
        const listEl = this.panel?.querySelector('#group-settings-members');
        if (!listEl) return;
        listEl.innerHTML = '';
        listEl.style.maxHeight = '260px';
        listEl.style.overflowY = 'auto';
        listEl.style.paddingRight = '4px';
        if (!this.members.length) {
            listEl.appendChild(createSelectableContactEmptyState({ text: '暂无成员' }));
            return;
        }
        this.members.forEach((mid) => {
            const c = this.contactsStore?.getContact?.(mid);
            const { row } = createMemberManageRow({
                memberId: mid,
                name: c?.name || mid,
                avatar: resolveContactAvatar(c, mid),
                onRemove: () => {
                    this.members = this.members.filter(x => x !== mid);
                    this.renderMembers();
                },
            });
            listEl.appendChild(row);
        });
    }

    openAddMembers() {
        this.ensureAddModal();
        this.addSelected.clear();
        this.renderAddCandidates();
        this.addOverlay.style.display = 'block';
        this.addPanel.style.display = 'flex';
    }

    ensureAddModal() {
        if (this.addPanel) return;
        const modal = createSessionContactPickerModal({
            documentRef: document,
            overlayId: 'group-add-overlay',
            panelId: 'group-add-panel',
            title: '添加成员',
            subtitle: '从联系人中选择',
            closeId: 'group-add-close',
            cancelId: 'group-add-cancel',
            confirmId: 'group-add-confirm',
            confirmLabel: '添加',
            searchId: 'group-add-search',
            listId: 'group-add-list',
            searchPlaceholder: '搜索联系人...',
            headerBackground: 'linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08))',
            overlayOpacity: 0.45,
            overlayZIndex: 22000,
            panelZIndex: 23000,
            inset: 18,
            radius: 14,
        });
        this.addOverlay = modal.overlay;
        this.addPanel = modal.panel;
        this.addOverlay.addEventListener('click', () => this.closeAddModal());

        document.body.appendChild(this.addOverlay);
        document.body.appendChild(this.addPanel);

        this.addPanel.querySelector('#group-add-close').onclick = () => this.closeAddModal();
        this.addPanel.querySelector('#group-add-cancel').onclick = () => this.closeAddModal();
        this.addPanel.querySelector('#group-add-search').addEventListener('input', () => this.renderAddCandidates());
        this.addPanel.querySelector('#group-add-confirm').onclick = () => {
            const picks = [...this.addSelected].map(normalize).filter(Boolean);
            if (!picks.length) {
                window.toastr?.info?.('未选择任何成员');
                return;
            }
            const next = [...new Set([...this.members, ...picks])];
            this.members = next;
            this.renderMembers();
            this.closeAddModal();
        };
    }

    closeAddModal() {
        if (this.addOverlay) this.addOverlay.style.display = 'none';
        if (this.addPanel) this.addPanel.style.display = 'none';
    }

    renderAddCandidates() {
        const listEl = this.addPanel?.querySelector('#group-add-list');
        if (!listEl) return;
        const q = normalizeKey(this.addPanel.querySelector('#group-add-search')?.value);
        const friends = this.contactsStore?.listFriends?.() || [];
        const candidates = friends.filter(f => f?.id && !this.members.includes(f.id) && !String(f.id).startsWith('rp:'));
        const filtered = q
            ? candidates.filter(c => normalizeKey(c?.name || c?.id).includes(q))
            : candidates;

        listEl.innerHTML = '';
        if (!filtered.length) {
            listEl.appendChild(createSelectableContactEmptyState({ text: '暂无可添加联系人' }));
            return;
        }
        filtered.forEach((c) => {
            const id = normalize(c?.id);
            if (!id) return;
            const { row } = createSelectableContactRow({
                id,
                name: c?.name || id,
                avatar: resolveContactAvatar(c, id),
                selected: this.addSelected.has(id),
                selectedText: '已选',
                onClick: () => {
                    if (this.addSelected.has(id)) this.addSelected.delete(id);
                    else this.addSelected.add(id);
                    this.renderAddCandidates();
                },
            });
            listEl.appendChild(row);
        });
    }

    async startNewChat() {
        if (!this.chatStore) return;
        const sid = this.groupId;
        const result = await runStartNewChatFlow({
            sessionId: sid,
            isGroup: true,
            sessionMode: 'chat',
            getMemoryStorageMode,
            askMemoryTableNewChatMode,
            promptForArchiveName: () => prompt('请输入当前聊天的存档名称（留空将自动命名）：'),
            buildMemoryTableSnapshot: ({ sessionId, isGroup }) => buildMemoryTableSnapshot({ sessionId, isGroup }),
            captureArchivePointer: (sessionId, options) =>
                window.appBridge?.buildArchivePointerFromCurrentThread?.(sessionId, options),
            clearSessionMemories: ({ sessionId, isGroup, keepNonSummary }) =>
                clearSessionMemoriesForNewChat({
                    sessionId,
                    isGroup,
                    keepNonSummary,
                    memoryTableStore: window.appBridge?.memoryTableStore,
                    resolveDefaultMemoryTemplateId,
                    resolveSummaryTableIds: ({ isGroup }) => [
                        isGroup ? 'group_summary' : 'chat_summary',
                        isGroup ? 'group_outline' : 'chat_outline',
                    ],
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
            sourcePrefix: 'group',
        });
        if (!result?.started) return;
        window.toastr?.success('已开启新聊天');
        this.onSaved?.({ id: sid, forceRefresh: true });
        this.hide();
    }

    save() {
        try {
            const prev = this.contactsStore?.getContact?.(this.groupId);
            if (!prev) return;
            const sessionSettings = this.chatStore?.getSessionSettings?.(this.groupId) || {};
            const nextName = normalize(this.panel?.querySelector('#group-settings-name')?.value) || prev.name;
            const nextKey = normalizeKey(nextName);
            const groups = this.contactsStore?.listGroups?.() || [];
            const dup = groups.find(g => g?.id !== this.groupId && normalizeKey(g?.name) === nextKey);
            if (dup) {
                window.toastr?.error?.('已存在同名群组');
                return;
            }

            const beforeMembers = Array.isArray(prev.members) ? prev.members.map(normalize).filter(Boolean) : [];
            const afterMembers = [...new Set(this.members.map(normalize).filter(Boolean))];
            logger.info(
                `[group-chat] save scope=${this.contactsStore?.scopeId || 'default'} id=${this.groupId} prevName=${String(prev.name || '')} nextName=${nextName} beforeMembers=${beforeMembers.length} afterMembers=${afterMembers.length} avatarLen=${String(this.avatar || '').trim().length}`
            );
            this.chatStore?.setSessionSettings?.(this.groupId, sessionSettings);
            this.contactsStore?.upsertContact?.({
                ...prev,
                id: this.groupId,
                name: nextName,
                avatar: this.avatar || '',
                isGroup: true,
                members: afterMembers,
            });

            const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
            let didAppendSystem = false;
            if (nextName !== prev.name) {
                this.chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `群聊名称已更新：${prev.name} → ${nextName}`, name: '系统', time }, this.groupId);
                didAppendSystem = true;
            }
            const added = afterMembers.filter(x => !beforeMembers.includes(x));
            const removed = beforeMembers.filter(x => !afterMembers.includes(x));
            if (added.length) {
                const names = added.map(mid => this.contactsStore?.getContact?.(mid)?.name || mid).join('、');
                this.chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `成员加入：${names}`, name: '系统', time }, this.groupId);
                didAppendSystem = true;
            }
            if (removed.length) {
                const names = removed.map(mid => this.contactsStore?.getContact?.(mid)?.name || mid).join('、');
                this.chatStore?.appendMessage?.({ role: 'system', type: 'meta', content: `成员已移除：${names}`, name: '系统', time }, this.groupId);
                didAppendSystem = true;
            }

            window.toastr?.success?.('已保存群聊设置');
            this.onSaved?.({ id: this.groupId, forceRefresh: didAppendSystem });
            this.hide();
        } catch (err) {
            logger.error('保存群聊设置失败', err);
            window.toastr?.error?.(err.message || '保存失败');
        }
    }
}
