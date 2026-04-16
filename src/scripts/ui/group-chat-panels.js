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

const getMemoryStorageMode = () => {
    if (appSettings.get().memoryEnabled === false) return 'off';
    const mode = String(appSettings.get().memoryStorageMode || 'table').toLowerCase();
    return mode === 'table' ? 'table' : 'summary';
};

const resolveDefaultMemoryTemplateId = async () => {
    const store = window.appBridge?.memoryTemplateStore;
    if (!store?.getTemplates) return '';
    try {
        const list = await store.getTemplates({ is_default: true });
        if (Array.isArray(list) && list.length) {
            return String(list[0]?.id || '').trim();
        }
    } catch {}
    try {
        const fallback = await store.getTemplates({ id: 'default-v1' });
        if (Array.isArray(fallback) && fallback.length) {
            return String(fallback[0]?.id || '').trim();
        }
    } catch {}
    return '';
};

const resolveDefaultMemoryTemplateDefinition = async () => {
    const store = window.appBridge?.memoryTemplateStore;
    if (!store?.getTemplates) return null;
    try {
        const list = await store.getTemplates({ is_default: true });
        if (Array.isArray(list) && list.length) {
            return store.toTemplateDefinition?.(list[0]) || list[0]?.schema || null;
        }
    } catch {}
    try {
        const fallback = await store.getTemplates({ id: 'default-v1' });
        if (Array.isArray(fallback) && fallback.length) {
            return store.toTemplateDefinition?.(fallback[0]) || fallback[0]?.schema || null;
        }
    } catch {}
    return null;
};

const askMemoryTableNewChatMode = () => new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(15,23,42,0.45);
        display:flex; align-items:center; justify-content:center;
        padding:16px; z-index:22000;
    `;
    const panel = document.createElement('div');
    panel.style.cssText = `
        width:min(360px, 92vw);
        background:#fff; border-radius:14px;
        padding:16px; box-shadow:0 20px 60px rgba(0,0,0,0.3);
        display:flex; flex-direction:column; gap:10px;
    `;
    panel.innerHTML = `
        <div style="font-weight:800; color:#0f172a;">记忆表格：开启新聊天</div>
        <div style="font-size:12px; color:#64748b;">请选择新聊天处理方式</div>
    `;
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px;';
    const buildBtn = (text, style) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        btn.style.cssText = `
            padding:10px 12px; border-radius:10px; border:1px solid #e2e8f0;
            background:#fff; font-weight:700; cursor:pointer; text-align:left;
            ${style || ''}
        `;
        return btn;
    };
    const keepBtn = buildBtn('保留其他表格（仅清空摘要/大纲）', 'color:#0f172a;');
    const clearBtn = buildBtn('清空全部记忆表格', 'color:#ef4444; border-color:#fecaca; background:#fff5f5;');
    const cancelBtn = buildBtn('取消', 'color:#475569; background:#f8fafc;');
    const done = (value) => {
        overlay.remove();
        resolve(value);
    };
    keepBtn.onclick = () => done('keep');
    clearBtn.onclick = () => done('clear');
    cancelBtn.onclick = () => done('cancel');
    btnWrap.appendChild(keepBtn);
    btnWrap.appendChild(clearBtn);
    btnWrap.appendChild(cancelBtn);
    panel.appendChild(btnWrap);
    overlay.appendChild(panel);
    overlay.addEventListener('click', () => done('cancel'));
    panel.addEventListener('click', (e) => e.stopPropagation());
    document.body.appendChild(overlay);
});

const buildMemoryTableSnapshot = async ({ sessionId, isGroup } = {}) => {
    const memoryTableStore = window.appBridge?.memoryTableStore;
    if (!memoryTableStore?.getMemories) return null;
    const templateId = await resolveDefaultMemoryTemplateId();
    if (!templateId) return null;
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    let rows = [];
    try {
        rows = await memoryTableStore.getMemories({
            scope: isGroup ? 'group' : 'contact',
            group_id: isGroup ? sid : undefined,
            contact_id: isGroup ? undefined : sid,
            template_id: templateId,
        });
    } catch {
        return null;
    }
    const picked = Array.isArray(rows)
        ? rows
              .map((row) => {
                  const tableId = String(row?.table_id || '').trim();
                  if (!tableId) return null;
                  return {
                      id: String(row?.id || '').trim(),
                      table_id: tableId,
                      row_data: row?.row_data ?? {},
                      is_active: row?.is_active !== false,
                      is_pinned: Boolean(row?.is_pinned),
                      priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
                      sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
                  };
              })
              .filter(Boolean)
        : [];
    return { templateId, rows: picked };
};

const applyMemoryTableSnapshot = async ({ sessionId, isGroup, snapshot } = {}) => {
    if (!snapshot) return false;
    const memoryTableStore = window.appBridge?.memoryTableStore;
    if (!memoryTableStore?.getMemories) return false;
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const templateId = String(snapshot?.templateId || '').trim() || (await resolveDefaultMemoryTemplateId());
    if (!templateId) return false;
    let existing = [];
    try {
        existing = await memoryTableStore.getMemories({
            scope: isGroup ? 'group' : 'contact',
            group_id: isGroup ? sid : undefined,
            contact_id: isGroup ? undefined : sid,
            template_id: templateId,
        });
    } catch {}
    const ids = Array.isArray(existing)
        ? existing.map(row => String(row?.id || '').trim()).filter(Boolean)
        : [];
    if (ids.length) {
        try {
            await memoryTableStore.batchDeleteMemories?.(ids);
        } catch {
            for (const id of ids) {
                try {
                    await memoryTableStore.deleteMemory?.(id);
                } catch {}
            }
        }
    }
    const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
    const inputs = rows
        .map((row) => {
            const tableId = String(row?.table_id || '').trim();
            if (!tableId) return null;
            return {
                id: row?.id ? String(row.id) : undefined,
                template_id: templateId,
                table_id: tableId,
                contact_id: isGroup ? null : sid,
                group_id: isGroup ? sid : null,
                row_data: row?.row_data ?? {},
                is_active: row?.is_active !== false,
                is_pinned: Boolean(row?.is_pinned),
                priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
                sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
            };
        })
        .filter(Boolean);
    if (inputs.length) {
        try {
            await memoryTableStore.batchCreateMemories?.(inputs);
        } catch {
            for (const input of inputs) {
                try {
                    await memoryTableStore.createMemory?.(input);
                } catch {}
            }
        }
    }
    window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId: sid, templateId } }));
    return true;
};

const clearSessionMemoriesForNewChat = async ({ sessionId, isGroup, keepNonSummary } = {}) => {
    const memoryTableStore = window.appBridge?.memoryTableStore;
    if (!memoryTableStore?.getMemories) return false;
    const templateId = await resolveDefaultMemoryTemplateId();
    if (!templateId) return false;
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    let rows = [];
    try {
        rows = await memoryTableStore.getMemories({
            scope: isGroup ? 'group' : 'contact',
            group_id: isGroup ? sid : undefined,
            contact_id: isGroup ? undefined : sid,
            template_id: templateId,
        });
    } catch {
        return false;
    }
    if (!Array.isArray(rows) || rows.length === 0) return true;
    const summaryTableIds = new Set([
        isGroup ? 'group_summary' : 'chat_summary',
        isGroup ? 'group_outline' : 'chat_outline',
    ]);
    const ids = rows
        .filter(row => row && (!keepNonSummary || summaryTableIds.has(String(row?.table_id || '').trim())))
        .map(row => String(row?.id || '').trim())
        .filter(Boolean);
    if (!ids.length) return true;
    try {
        await memoryTableStore.batchDeleteMemories?.(ids);
    } catch {
        for (const id of ids) {
            try {
                await memoryTableStore.deleteMemory?.(id);
            } catch {}
        }
    }
    window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId: sid, templateId } }));
    return true;
};

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
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:20000;';
        this.overlay.addEventListener('click', () => this.hide());

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            overflow:hidden;
            flex-direction:column;
        `;
        this.panel.addEventListener('click', (e) => e.stopPropagation());

        this.panel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08)); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:900; color:#0f172a;">创建群组</div>
                    <div style="color:#64748b; font-size:12px;">从联系人中选择成员</div>
                </div>
                <button id="group-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                    <button id="group-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid #e2e8f0; background:#fff; padding:0; overflow:hidden; cursor:pointer;">
                        <img id="group-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">群组名称</div>
                        <input id="group-name" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;" placeholder="请输入群组名称">
                        <div id="group-name-hint" style="color:#64748b; font-size:12px; margin-top:6px;"></div>
                    </div>
                </div>

                <div style="margin-top:14px;">
                    <div style="font-weight:800; color:#0f172a; margin-bottom:8px;">选择成员</div>
                    <div style="position:relative;">
                        <input id="group-search" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px; box-sizing:border-box;" placeholder="搜索联系人...">
                    </div>
                    <div id="group-contacts" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
                </div>
            </div>

            <div style="padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button id="group-cancel" style="flex:1; padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">取消</button>
                <button id="group-create" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:800;">创建</button>
            </div>
        `;

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
            hint.style.color = error ? '#ef4444' : '#64748b';
        }
        if (btn) btn.disabled = Boolean(error);
    }

    renderContacts() {
        const listEl = this.panel?.querySelector('#group-contacts');
        if (!listEl) return;
        const q = normalizeKey(this.panel.querySelector('#group-search')?.value);
        const friends = this.contactsStore?.listFriends?.() || [];
        const filtered = q
            ? friends.filter(c => normalizeKey(c?.name || c?.id).includes(q))
            : friends;

        listEl.innerHTML = '';
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.textContent = '暂无联系人';
            empty.style.cssText = 'color:#94a3b8; font-size:13px; padding:10px 6px;';
            listEl.appendChild(empty);
            this.updateCreateEnabled();
            return;
        }

        filtered.forEach((c) => {
            const id = normalize(c?.id);
            if (!id) return;
            const row = document.createElement('button');
            row.type = 'button';
            row.style.cssText = `
                display:flex; align-items:center; gap:10px;
                padding:10px 10px;
                border:1px solid ${this.selected.has(id) ? '#93c5fd' : '#e2e8f0'};
                background:${this.selected.has(id) ? 'rgba(59,130,246,0.08)' : '#fff'};
                border-radius:12px;
                cursor:pointer;
                text-align:left;
            `;
            const img = document.createElement('img');
            img.src = resolveContactAvatar(c, id);
            img.alt = '';
            img.style.cssText = 'width:36px; height:36px; border-radius:50%; object-fit:cover;';
            const name = document.createElement('div');
            name.textContent = c?.name || id;
            name.style.cssText = 'font-weight:700; color:#0f172a; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            const tag = document.createElement('div');
            tag.textContent = this.selected.has(id) ? '已选' : '';
            tag.style.cssText = 'font-size:12px; color:#2563eb;';
            row.appendChild(img);
            row.appendChild(name);
            row.appendChild(tag);

            row.onclick = () => {
                if (this.selected.has(id)) this.selected.delete(id);
                else this.selected.add(id);
                this.renderContacts();
            };
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
        const summaryOn = getMemoryStorageMode() === 'summary';
        if (this.summarySection) this.summarySection.style.display = summaryOn ? 'block' : 'none';
        if (this.memoryTableSection) this.memoryTableSection.style.display = summaryOn ? 'none' : 'block';
        if (!summaryOn) this.memoryTableEditor?.render?.();
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:20000;';
        this.overlay.addEventListener('click', () => this.hide());

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            overflow:hidden;
            flex-direction:column;
        `;
        this.panel.addEventListener('click', (e) => e.stopPropagation());

        this.panel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:900; color:#0f172a;">群聊设置</div>
                    <div id="group-settings-sub" style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                </div>
                <button id="group-settings-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                    <button id="group-settings-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid #e2e8f0; background:#fff; padding:0; overflow:hidden; cursor:pointer;">
                        <img id="group-settings-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">群组名称</div>
                        <input id="group-settings-name" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;">
                        <div style="color:#64748b; font-size:12px; margin-top:6px;">修改名称不会改变聊天室 ID。</div>
                    </div>
                </div>

	                <div style="margin-top:14px;">
	                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
	                        <div style="font-weight:800; color:#0f172a;">成员</div>
	                        <button id="group-settings-add" style="border:1px solid #e2e8f0; background:#fff; padding:6px 10px; border-radius:10px; cursor:pointer;">＋ 添加</button>
	                    </div>
	                    <div id="group-settings-members" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
	                </div>

                    <div style="margin-top:18px; border-top:1px solid rgba(0,0,0,0.06); padding-top:14px;">
                        <div style="font-weight:800; color:#0f172a; margin-bottom:8px;">聊天管理</div>
                        <button id="group-new-chat" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; background:#fff; color:#019aff; font-weight:700; margin-bottom:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                            <span>✨</span> 开启新聊天（存档当前）
                        </button>
                        <div style="font-size:12px; color:#64748b; margin-bottom:6px;">历史存档（点击加载）</div>
                        <div id="group-archives-list" style="max-height:160px; overflow-y:auto; border:1px solid #eee; border-radius:8px; background:#f9f9f9; padding:0;"></div>
                    </div>

                    <div style="margin-top:18px; border-top:1px solid rgba(0,0,0,0.06); padding-top:14px;">
                        <div style="font-weight:800; color:#0f172a; margin-bottom:10px;">聊天 / RP 桥接（当前会话）</div>
                        <div id="group-rp-bridge-section" style="display:none;"></div>
                        <div id="group-memory-share-section">
                            <button id="group-memory-share-manage" type="button" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; color:#0f172a; font-weight:800; cursor:pointer;">
                                记忆共享
                            </button>
                            <div id="group-memory-share-summary" style="color:#64748b; font-size:12px; line-height:1.5; margin-top:8px;"></div>
                        </div>
                    </div>

                    <div id="group-summary-section" style="margin-top:18px; border-top:1px solid rgba(0,0,0,0.06); padding-top:14px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                            <div style="font-weight:800; color:#0f172a;">摘要</div>
                            <div style="display:flex; align-items:center; gap:8px;">
                                <button id="group-summaries-batch" type="button" title="批量操作" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">☰</button>
                                <button id="group-summaries-clear" type="button" style="padding:6px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#ef4444;">清空</button>
                            </div>
                        </div>
                        <div style="font-size:12px; color:#64748b; margin-bottom:8px;">该群聊每次互动保存一条摘要（与聊天存档绑定）</div>
                        <div id="group-summaries-batchbar" style="display:none; align-items:center; justify-content:flex-end; gap:8px; margin:-2px 0 10px;">
                            <button id="group-summaries-batch-edit" type="button" title="批量编辑" style="width:34px; height:30px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px;">✎</button>
                            <button id="group-summaries-batch-delete" type="button" title="批量删除" style="width:34px; height:30px; border:1px solid #fecaca; border-radius:10px; background:#fff; cursor:pointer; color:#b91c1c; font-size:16px;">🗑</button>
                            <button id="group-summaries-batch-cancel" type="button" title="退出批量" style="width:34px; height:30px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:18px;">×</button>
                        </div>
                        <div id="group-summaries-list" style="max-height:180px; overflow-y:auto; border:1px solid #eee; border-radius:10px; background:#fff; padding:0;"></div>

	                    <div style="margin-top:14px;">
	                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
	                            <div style="font-weight:800; color:#0f172a;">大总结</div>
	                            <div style="display:flex; align-items:center; gap:8px;">
	                                <button id="group-compacted-raw" type="button" title="查看原始回复" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">📄</button>
	                                <button id="group-compacted-edit" type="button" title="编辑" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">✎</button>
	                                <button id="group-compacted-run" type="button" title="手动生成/刷新" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">↻</button>
	                                <button id="group-compacted-clear" type="button" title="删除" style="width:32px; height:28px; border:1px solid #fecaca; border-radius:10px; background:#fff; cursor:pointer; color:#b91c1c; font-size:16px; line-height:1;">🗑</button>
	                            </div>
	                        </div>
	                        <div style="font-size:12px; color:#64748b; margin-bottom:8px;">摘要总字数超过阈值会自动生成大总结（与聊天存档绑定）</div>
	                        <div id="group-compacted-summary" style="max-height:220px; overflow-y:auto; border:1px solid #eee; border-radius:10px; background:#fff; padding:0;"></div>
	                    </div>
                    </div>

                    <div id="group-memory-table-section" style="display:none; margin-top:18px; padding:12px; border:1px dashed #e2e8f0; border-radius:12px; background:#f8fafc;">
                        <div style="font-weight:800; color:#0f172a; margin-bottom:6px;">记忆表格</div>
                        <div id="group-memory-table-content"></div>
                    </div>
	            </div>

            <div style="padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button id="group-settings-cancel" style="flex:1; padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">取消</button>
                <button id="group-settings-save" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:800;">保存</button>
            </div>
        `;

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

	        const overlay = document.createElement('div');
	        overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
	        const panel = document.createElement('div');
	        panel.style.cssText = `
	            display:none; position:fixed;
	            left: calc(12px + env(safe-area-inset-left, 0px));
	            right: calc(12px + env(safe-area-inset-right, 0px));
	            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
	            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
	            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
	            z-index:23000;
	            overflow:hidden;
	            display:flex; flex-direction:column;
	        `;
	        panel.addEventListener('click', (e) => e.stopPropagation());
	        panel.innerHTML = `
	            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
	                <div style="font-weight:900; color:#0f172a;">大总结原始回复</div>
	                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
	            </div>
	            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
	                <textarea data-role="textarea" readonly style="width:100%; min-height:220px; resize:vertical; padding:10px; border:1px solid #e2e8f0; border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box; white-space:pre-wrap;"></textarea>
	            </div>
	            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
	                <button data-role="copy" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; cursor:pointer;">复制</button>
	                <button data-role="ok" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:#fff; cursor:pointer; font-weight:900;">关闭</button>
	            </div>
	        `;
	        document.body.appendChild(overlay);
	        document.body.appendChild(panel);

	        const textarea = panel.querySelector('[data-role="textarea"]');
	        const close = () => {
	            overlay.style.display = 'none';
	            panel.style.display = 'none';
	        };
	        overlay.addEventListener('click', close);
	        panel.querySelector('[data-role="close"]').onclick = close;
	        panel.querySelector('[data-role="ok"]').onclick = close;
	        panel.querySelector('[data-role="copy"]').onclick = async () => {
	            try {
	                await navigator.clipboard?.writeText?.(String(textarea?.value || ''));
	                window.toastr?.success?.('已复制原始回复');
	            } catch {}
	        };

	        this.__compactedRawOverlay = overlay;
	        this.__compactedRawPanel = panel;
	        this.__compactedRawTextarea = textarea;
	        this.__compactedRawClose = close;
	    }

	    openCompactedRaw() {
	        const sid = this.groupId;
	        if (!sid) return;
	        const raw = String(this.chatStore?.getCompactedSummaryRaw?.(sid) || '').trim();
	        if (!raw) {
	            window.toastr?.info?.('暂无本次大总结的原始回复（旧数据可能未记录）');
	            return;
	        }
	        this.ensureCompactedRawModal();
	        this.__compactedRawTextarea.value = raw;
	        this.__compactedRawOverlay.style.display = 'block';
	        this.__compactedRawPanel.style.display = 'flex';
	        setTimeout(() => {
	            try { this.__compactedRawTextarea?.focus?.(); } catch {}
	        }, 0);
	    }

	    ensureCompactedEditModal() {
	        if (this.__compactedEditReady) return;
	        this.__compactedEditReady = true;

	        const overlay = document.createElement('div');
	        overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
	        overlay.addEventListener('click', () => close());
	        const panel = document.createElement('div');
	        panel.style.cssText = `
	            display:none; position:fixed;
	            left: calc(12px + env(safe-area-inset-left, 0px));
	            right: calc(12px + env(safe-area-inset-right, 0px));
	            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
	            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
	            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
	            z-index:23000;
	            overflow:hidden;
	            display:flex; flex-direction:column;
	        `;
	        panel.addEventListener('click', (e) => e.stopPropagation());
	        panel.innerHTML = `
	            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
	                <div style="font-weight:900; color:#0f172a;">编辑大总结</div>
	                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
	            </div>
	            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
	                <textarea data-role="textarea" style="width:100%; min-height:200px; resize:vertical; padding:10px; border:1px solid #e2e8f0; border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box;"></textarea>
	            </div>
	            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
	                <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; cursor:pointer;">取消</button>
	                <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:#fff; cursor:pointer; font-weight:900;">保存</button>
	            </div>
	        `;
	        document.body.appendChild(overlay);
	        document.body.appendChild(panel);

	        const textarea = panel.querySelector('[data-role="textarea"]');
	        const close = () => {
	            overlay.style.display = 'none';
	            panel.style.display = 'none';
	            this.__compactedEditOnSave = null;
	        };
	        panel.querySelector('[data-role="close"]').onclick = close;
	        panel.querySelector('[data-role="cancel"]').onclick = close;
	        panel.querySelector('[data-role="save"]').onclick = () => {
	            const v = String(textarea?.value || '').trim();
	            this.__compactedEditOnSave?.(v);
	        };

	        this.__compactedEditOverlay = overlay;
	        this.__compactedEditPanel = panel;
	        this.__compactedEditTextarea = textarea;
	        this.__compactedEditClose = close;
	    }

	    editCompactedSummary() {
	        const sid = this.groupId;
	        if (!sid) return;
	        const cs = this.chatStore?.getCompactedSummary?.(sid);
	        const text = String(cs?.text || '').trim();
	        if (!text) {
	            window.toastr?.info?.('暂无大总结可编辑');
	            return;
	        }
	        this.ensureCompactedEditModal();
	        this.__compactedEditOnSave = (next) => {
	            const t = String(next || '').trim();
	            if (!t) {
	                window.toastr?.error?.('内容不能为空');
	                return;
	            }
	            const raw = String(this.chatStore?.getCompactedSummaryRaw?.(sid) || '');
	            try { this.chatStore?.setCompactedSummary?.(t, sid, { raw }); } catch {}
	            try { window.dispatchEvent(new CustomEvent('chatapp-summaries-updated', { detail: { sessionId: sid } })); } catch {}
	            this.renderCompactedSummary();
	            try { this.__compactedEditClose?.(); } catch {}
	            window.toastr?.success?.('已更新大总结');
	        };
	        if (this.__compactedEditTextarea) this.__compactedEditTextarea.value = text;
	        this.__compactedEditOverlay.style.display = 'block';
	        this.__compactedEditPanel.style.display = 'flex';
	        setTimeout(() => {
	            try { this.__compactedEditTextarea?.focus?.(); } catch {}
	        }, 0);
	    }

    ensureSummaryEditModal() {
        if (this.summaryEditPanel) return;
        this.summaryEditOverlay = document.createElement('div');
        this.summaryEditOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.summaryEditOverlay.addEventListener('click', () => this.closeSummaryEditModal());

        this.summaryEditPanel = document.createElement('div');
        this.summaryEditPanel.style.cssText = `
            display:none; position:fixed;
            left: calc(12px + env(safe-area-inset-left, 0px));
            right: calc(12px + env(safe-area-inset-right, 0px));
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
            z-index:23000;
            overflow:hidden;
            display:flex; flex-direction:column;
        `;
        this.summaryEditPanel.addEventListener('click', (e) => e.stopPropagation());
        this.summaryEditPanel.innerHTML = `
            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:900; color:#0f172a;">批量编辑摘要</div>
                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>
            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
                <div style="font-size:12px; color:#64748b; margin-bottom:8px;">每行一条摘要（顺序对应所选摘要）。</div>
                <textarea data-role="textarea" style="width:100%; min-height:180px; resize:vertical; padding:10px; border:1px solid #e2e8f0; border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box;"></textarea>
            </div>
            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; cursor:pointer;">取消</button>
                <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:#fff; cursor:pointer; font-weight:900;">保存</button>
            </div>
        `;
        document.body.appendChild(this.summaryEditOverlay);
        document.body.appendChild(this.summaryEditPanel);
        this.summaryEditTextarea = this.summaryEditPanel.querySelector('[data-role="textarea"]');
        this.summaryEditSave = this.summaryEditPanel.querySelector('[data-role="save"]');
        this.summaryEditCancel = this.summaryEditPanel.querySelector('[data-role="cancel"]');
        this.summaryEditPanel.querySelector('[data-role="close"]').onclick = () => this.closeSummaryEditModal();
        this.summaryEditCancel.onclick = () => this.closeSummaryEditModal();
    }

    openSummaryEditModal(value, onSave) {
        this.ensureSummaryEditModal();
        this.__summaryEditOnSave = typeof onSave === 'function' ? onSave : null;
        if (this.summaryEditTextarea) this.summaryEditTextarea.value = String(value || '');
        if (this.summaryEditSave) {
            this.summaryEditSave.disabled = false;
            this.summaryEditSave.onclick = () => {
                const v = String(this.summaryEditTextarea?.value || '');
                try { this.__summaryEditOnSave?.(v); } catch {}
            };
        }
        if (this.summaryEditOverlay) this.summaryEditOverlay.style.display = 'block';
        if (this.summaryEditPanel) this.summaryEditPanel.style.display = 'flex';
        setTimeout(() => {
            try { this.summaryEditTextarea?.focus?.(); } catch {}
        }, 0);
    }

    closeSummaryEditModal() {
        if (this.summaryEditOverlay) this.summaryEditOverlay.style.display = 'none';
        if (this.summaryEditPanel) this.summaryEditPanel.style.display = 'none';
        this.__summaryEditOnSave = null;
    }

    parseEditedSummaryLines(text) {
        const raw = String(text || '');
        const lines = raw.split(/\r?\n/).map(s => String(s).trim());
        const bullet = lines
            .filter(l => l.startsWith('- '))
            .map(l => l.slice(2).trim())
            .filter(Boolean);
        if (bullet.length) return bullet;
        return lines.filter(Boolean);
    }

    async deleteSelectedSummaries() {
        const sid = this.groupId;
        if (!sid) return;
        const keys = [...this.summarySelectedKeys];
        if (!keys.length) {
            window.toastr?.info?.('未选择任何摘要');
            return;
        }
        const ok = await appConfirm({
            title: '删除摘要',
            message: `确定要删除所选摘要（${keys.length}条）吗？`,
            danger: true,
        });
        if (!ok) return;
        const items = keys.map((k) => {
            const [atStr, ...rest] = String(k).split('|');
            return { at: Number(atStr || 0) || 0, text: rest.join('|') };
        });
        try { this.chatStore?.deleteSummaryItems?.(items, sid); } catch {}
        this.setSummaryBatchMode(false);
        this.renderSummaries();
    }

    editSelectedSummaries() {
        const sid = this.groupId;
        if (!sid) return;
        const keys = [...this.summarySelectedKeys];
        if (!keys.length) {
            window.toastr?.info?.('未选择任何摘要');
            return;
        }
        const entries = keys.map((k) => {
            const [atStr, ...rest] = String(k).split('|');
            return { at: Number(atStr || 0) || 0, text: rest.join('|') };
        });
        const initial = entries.map(e => `- ${e.text}`).join('\n');
        this.openSummaryEditModal(initial, (nextRaw) => {
            const lines = this.parseEditedSummaryLines(nextRaw);
            if (lines.length !== entries.length) {
                window.toastr?.error?.(`行数不匹配：需要 ${entries.length} 行，实际 ${lines.length} 行`);
                return;
            }
            const updates = entries.map((e, i) => ({ at: e.at, fromText: e.text, toText: lines[i] }));
            try { this.chatStore?.updateSummaryItems?.(updates, sid); } catch {}
            this.closeSummaryEditModal();
            this.setSummaryBatchMode(false);
            this.renderSummaries();
        });
    }

    async runCompactedSummary() {
        const sid = this.groupId;
        if (!sid) return;
        if (this.summaryCompacting) return;
        const pick = () =>
            globalThis?.__chatappRequestSummaryCompaction ||
            window?.__chatappRequestSummaryCompaction ||
            window?.appBridge?.requestSummaryCompaction;
        let fn = pick();
        if (typeof fn !== 'function') {
            await new Promise((r) => setTimeout(r, 50));
            fn = pick();
        }
        if (typeof fn !== 'function') {
            window.toastr?.error?.('大总结生成器尚未初始化，请稍后再试');
            return;
        }
        this.summaryCompacting = true;
        try {
            window.toastr?.info?.('正在生成大总结…');
            const ok = await fn(sid, { force: true });
            if (!ok) window.toastr?.error?.('大总结解析失败：未输出 <summary>…</summary> 或内容格式不符合要求，请重试');
            this.renderSummaries();
            this.renderCompactedSummary();
        } catch (err) {
            logger.warn('手动生成大总结失败', err);
            window.toastr?.error?.('生成失败');
        } finally {
            this.summaryCompacting = false;
        }
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
        this.memoryShareOverlay = document.createElement('div');
        this.memoryShareOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.memoryShareOverlay.addEventListener('click', () => this.closeMemoryShareManager());

        this.memorySharePanel = document.createElement('div');
        this.memorySharePanel.style.cssText = `
            display:none; position:fixed;
            left: calc(12px + env(safe-area-inset-left, 0px));
            right: calc(12px + env(safe-area-inset-right, 0px));
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
            z-index:23000; overflow:hidden; display:flex; flex-direction:column;
        `;
        this.memorySharePanel.addEventListener('click', (e) => e.stopPropagation());
        this.memorySharePanel.innerHTML = `
            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:900; color:#0f172a;">记忆共享</div>
                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>
            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
                <div style="font-size:12px; color:#64748b; line-height:1.5; margin-bottom:12px;">真正全局的用户档案会自动共享；这里仅管理当前角色的 RP 会话注入到本群聊的额外记忆。</div>
                <div data-role="source" style="margin-bottom:12px; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc; color:#334155; font-size:12px; line-height:1.5;"></div>
                <div data-role="rows" style="display:flex; flex-direction:column; gap:10px;"></div>
            </div>
            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid #e2e8f0; border-radius:12px; background:#fff; cursor:pointer;">取消</button>
                <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:#fff; cursor:pointer; font-weight:900;">保存</button>
            </div>
        `;
        document.body.appendChild(this.memoryShareOverlay);
        document.body.appendChild(this.memorySharePanel);

        this.memoryShareRows = this.memorySharePanel.querySelector('[data-role="rows"]');
        this.memoryShareSaveBtn = this.memorySharePanel.querySelector('[data-role="save"]');
        this.memorySharePanel.querySelector('[data-role="close"]').onclick = () => this.closeMemoryShareManager();
        this.memorySharePanel.querySelector('[data-role="cancel"]').onclick = () => this.closeMemoryShareManager();
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
        const sourceEl = this.memorySharePanel?.querySelector('[data-role="source"]');
        const sourceId = this.getDefaultRpBridgeSourceId(sessionId);
        const sourceLabel = sourceId ? (this.getRpDisplayName(sourceId) || sourceId) : '当前为空';
        if (sourceEl) sourceEl.textContent = `来源 RP 会话：${sourceLabel}`;

        const context = await this.buildMemoryShareContext(sessionId, this.memoryShareDraft.tableSettings);
        this.memoryShareRows.innerHTML = '';
        context.entries.forEach((entry) => {
            const row = document.createElement('div');
            row.style.cssText = 'padding:10px; border:1px solid #e2e8f0; border-radius:12px; background:#fff;';
            row.innerHTML = `
                <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer;">
                    <span style="font-weight:700; color:#0f172a;">${entry.shortLabel}</span>
                    <input type="checkbox" data-role="enabled" style="width:18px; height:18px;">
                </label>
                <div style="color:#64748b; font-size:12px; margin-top:6px;">当前可注入 ${entry.rowCount} 条；0 代表全部注入。</div>
                <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; color:#475569; margin-top:10px;">
                    <span>注入条数</span>
                    <input type="number" data-role="limit" min="0" step="1"
                           style="width:88px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; text-align:right;">
                </label>
            `;
            const toggle = row.querySelector('[data-role="enabled"]');
            const limitInput = row.querySelector('[data-role="limit"]');
            toggle.checked = entry.enabled;
            limitInput.value = String(entry.limit);
            limitInput.disabled = entry.enabled !== true;
            toggle.addEventListener('change', () => {
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
            });
            limitInput.addEventListener('input', () => {
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
        const list = this.chatStore.getSummaries(sid) || [];
        const summaries = Array.isArray(list) ? list.slice().reverse() : [];
        this.summariesList.innerHTML = '';
        if (!summaries.length) {
            this.summariesList.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:12px;">暂无摘要</div>';
            return;
        }
        summaries.slice(0, 50).forEach((it) => {
            const text = String((typeof it === 'string') ? it : it?.text || '').trim();
            if (!text) return;
            const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
            const time = at ? new Date(at).toLocaleString() : '';
            const key = `${Number(at || 0) || 0}|${text}`;
            const row = document.createElement('div');
            if (this.summaryBatchMode) {
                const selected = this.summarySelectedKeys.has(key);
                row.style.cssText = `padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; gap:10px; align-items:flex-start; cursor:pointer; background:${selected ? 'rgba(59,130,246,0.06)' : '#fff'};`;
                row.innerHTML = `
                    <div style="width:20px; height:20px; border-radius:999px; border:2px solid ${selected ? '#2563eb' : 'rgba(0,0,0,0.20)'}; margin-top:2px; display:flex; align-items:center; justify-content:center; color:#fff; font-weight:900; font-size:12px; background:${selected ? '#2563eb' : 'transparent'}; box-sizing:border-box;">${selected ? '✓' : ''}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="color:#0f172a; font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                        ${time ? `<div style="color:#94a3b8; font-size:11px; margin-top:6px;">${time}</div>` : ''}
                    </div>
                `;
                row.addEventListener('click', () => {
                    if (this.summarySelectedKeys.has(key)) this.summarySelectedKeys.delete(key);
                    else this.summarySelectedKeys.add(key);
                    this.renderSummaries();
                });
            } else {
                row.style.cssText = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer;';
                row.innerHTML = `
                    <div style="color:#0f172a; font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    ${time ? `<div style="color:#94a3b8; font-size:11px; margin-top:6px;">${time}</div>` : ''}
                `;
                row.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard?.writeText?.(text);
                        window.toastr?.success?.('已复制摘要');
                    } catch {}
                });
            }
            this.summariesList.appendChild(row);
        });
    }

    renderCompactedSummary() {
        if (!this.compactedList || !this.chatStore) return;
        const sid = this.groupId;
        const cs = this.chatStore.getCompactedSummary?.(sid);
        this.compactedList.innerHTML = '';
        const text = String(cs?.text || '').trim();
        if (!text) {
            this.compactedList.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:12px;">暂无大总结</div>';
            return;
        }
        const at = Number(cs?.at || 0) || 0;
        const time = at ? new Date(at).toLocaleString() : '';
        const row = document.createElement('div');
        row.style.cssText = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer;';
        row.innerHTML = `
            <div style="color:#0f172a; font-size:13px; line-height:1.35; white-space:pre-wrap;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${time ? `<div style="color:#94a3b8; font-size:11px; margin-top:6px;">${time}</div>` : ''}
        `;
        row.addEventListener('click', async () => {
            try {
                await navigator.clipboard?.writeText?.(text);
                window.toastr?.success?.('已复制大总结');
            } catch {}
        });
        this.compactedList.appendChild(row);
    }

    renderArchives() {
        if (!this.archivesList || !this.chatStore) return;
        const sid = this.groupId;
        const archives = this.chatStore.getArchives(sid);
        const currentId = this.chatStore.state.sessions[sid]?.currentArchiveId;
        this.archivesList.innerHTML = '';

        if (!archives.length) {
            this.archivesList.innerHTML = '<div style="padding:12px; color:#94a3b8; text-align:center; font-size:12px;">暂无历史存档</div>';
            return;
        }

        archives.forEach(arc => {
            const dateStr = new Date(arc.timestamp).toLocaleString();
            const msgCount = Number(arc.messageCount || (Array.isArray(arc.messages) ? arc.messages.length : 0)) || 0;
            const isCurrent = arc.id === currentId;
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid #eee; background:${isCurrent ? '#eff6ff' : '#fff'}; border-left:${isCurrent ? '3px solid #019aff' : 'none'};`;

            const info = document.createElement('div');
            info.style.cssText = 'flex:1; cursor:pointer; min-width:0;';
            info.innerHTML = `
                <div style="font-weight:600; color:#334155; font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${arc.name || '未命名存档'} ${isCurrent ? '(当前)' : ''}</div>
                <div style="color:#94a3b8; font-size:11px;">${dateStr} · ${msgCount}条消息</div>
            `;
            info.onclick = async () => {
                if (isCurrent) return;
                const ok = await appConfirm({
                    title: '加载存档',
                    message: `确定要加载存档「${arc.name}」吗？\n当前聊天将被自动保存。`,
                });
                if (!ok) return;
                const memoryTableOn = getMemoryStorageMode() === 'table';
                let currentSnapshot = null;
                if (memoryTableOn) {
                    currentSnapshot = await buildMemoryTableSnapshot({ sessionId: sid, isGroup: true });
                }
                const targetSnapshot = arc?.memoryTableSnapshot;
                const loaded = await this.chatStore.loadArchivedMessages(arc.id, sid, { memoryTableSnapshot: currentSnapshot });
                if (loaded && memoryTableOn && targetSnapshot) {
                    try {
                        await applyMemoryTableSnapshot({ sessionId: sid, isGroup: true, snapshot: targetSnapshot });
                    } catch (err) {
                        logger.warn('apply memory table snapshot failed', err);
                    }
                }
                window.toastr?.success('已加载存档');
                this.onSaved?.({ id: sid, forceRefresh: true });
                this.hide();
            };

            const delBtn = document.createElement('button');
            delBtn.textContent = '×';
            delBtn.style.cssText = 'padding:4px 8px; border:none; background:transparent; color:#94a3b8; font-size:16px; cursor:pointer; margin-left:6px;';
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                const ok = await appConfirm({
                    title: '删除存档',
                    message: '确定要删除这条存档吗？',
                    danger: true,
                });
                if (!ok) return;
                this.chatStore.deleteArchive(arc.id, sid);
                this.renderArchives();
            };

            row.appendChild(info);
            row.appendChild(delBtn);
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
            const empty = document.createElement('div');
            empty.textContent = '暂无成员';
            empty.style.cssText = 'color:#94a3b8; font-size:13px; padding:10px 6px;';
            listEl.appendChild(empty);
            return;
        }
        this.members.forEach((mid) => {
            const c = this.contactsStore?.getContact?.(mid);
            const row = document.createElement('div');
            row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px; border:1px solid #e2e8f0; border-radius:12px;';
            const img = document.createElement('img');
            img.src = resolveContactAvatar(c, mid);
            img.alt = '';
            img.style.cssText = 'width:32px; height:32px; border-radius:50%; object-fit:cover;';
            const name = document.createElement('div');
            name.textContent = c?.name || mid;
            name.style.cssText = 'font-weight:700; color:#0f172a; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            const rm = document.createElement('button');
            rm.textContent = '移除';
            rm.type = 'button';
            rm.style.cssText = 'border:none; background:#fee2e2; color:#b91c1c; padding:6px 10px; border-radius:10px; cursor:pointer;';
            rm.onclick = () => {
                this.members = this.members.filter(x => x !== mid);
                this.renderMembers();
            };
            row.appendChild(img);
            row.appendChild(name);
            row.appendChild(rm);
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
        this.addOverlay = document.createElement('div');
        this.addOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.addOverlay.addEventListener('click', () => this.closeAddModal());

        this.addPanel = document.createElement('div');
        this.addPanel.style.cssText = `
            display:none; position:fixed;
            top: calc(18px + env(safe-area-inset-top, 0px));
            left: calc(18px + env(safe-area-inset-left, 0px));
            right: calc(18px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 36px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 36px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:23000;
            overflow:hidden;
            flex-direction:column;
        `;
        this.addPanel.addEventListener('click', (e) => e.stopPropagation());
        this.addPanel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08)); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:900; color:#0f172a;">添加成员</div>
                    <div style="color:#64748b; font-size:12px;">从联系人中选择</div>
                </div>
                <button id="group-add-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <input id="group-add-search" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px; box-sizing:border-box;" placeholder="搜索联系人...">
                <div id="group-add-list" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
            </div>

            <div style="padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button id="group-add-cancel" style="flex:1; padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">取消</button>
                <button id="group-add-confirm" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:800;">添加</button>
            </div>
        `;

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
        const candidates = friends.filter(f => f?.id && !this.members.includes(f.id));
        const filtered = q
            ? candidates.filter(c => normalizeKey(c?.name || c?.id).includes(q))
            : candidates;

        listEl.innerHTML = '';
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.textContent = '暂无可添加联系人';
            empty.style.cssText = 'color:#94a3b8; font-size:13px; padding:10px 6px;';
            listEl.appendChild(empty);
            return;
        }
        filtered.forEach((c) => {
            const id = normalize(c?.id);
            if (!id) return;
            const row = document.createElement('button');
            row.type = 'button';
            row.style.cssText = `
                display:flex; align-items:center; gap:10px;
                padding:10px 10px;
                border:1px solid ${this.addSelected.has(id) ? '#93c5fd' : '#e2e8f0'};
                background:${this.addSelected.has(id) ? 'rgba(59,130,246,0.08)' : '#fff'};
                border-radius:12px;
                cursor:pointer;
                text-align:left;
            `;
            const img = document.createElement('img');
            img.src = resolveContactAvatar(c, id);
            img.alt = '';
            img.style.cssText = 'width:36px; height:36px; border-radius:50%; object-fit:cover;';
            const name = document.createElement('div');
            name.textContent = c?.name || id;
            name.style.cssText = 'font-weight:700; color:#0f172a; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            const tag = document.createElement('div');
            tag.textContent = this.addSelected.has(id) ? '已选' : '';
            tag.style.cssText = 'font-size:12px; color:#2563eb;';
            row.appendChild(img);
            row.appendChild(name);
            row.appendChild(tag);
            row.onclick = () => {
                if (this.addSelected.has(id)) this.addSelected.delete(id);
                else this.addSelected.add(id);
                this.renderAddCandidates();
            };
            listEl.appendChild(row);
        });
    }

    async startNewChat() {
        if (!this.chatStore) return;
        const sid = this.groupId;
        let keepNonSummary = false;
        let memoryTableSnapshot = null;
        if (getMemoryStorageMode() === 'table') {
            const choice = await askMemoryTableNewChatMode();
            if (choice === 'cancel') return;
            keepNonSummary = choice === 'keep';
        }
        const raw = prompt('请输入当前聊天的存档名称（留空将自动命名）：');
        if (raw === null) return;

        if (getMemoryStorageMode() === 'table') {
            memoryTableSnapshot = await buildMemoryTableSnapshot({ sessionId: sid, isGroup: true });
            try {
                await clearSessionMemoriesForNewChat({ sessionId: sid, isGroup: true, keepNonSummary });
            } catch (err) {
                logger.warn('clear memory tables for new chat failed', err);
            }
        }
        this.chatStore.startNewChat(sid, raw.trim(), { memoryTableSnapshot });
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
