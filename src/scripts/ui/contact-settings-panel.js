/**
 * Contact settings panel
 * - Edit contact display name + avatar (does not rename session id)
 */
import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { appSettings } from '../storage/app-settings.js';
import { MemoryTableEditor } from './memory-table-editor.js';
import { appConfirm } from './app-confirm.js';

const getMemoryStorageMode = () => {
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

export class ContactSettingsPanel {
    constructor({ contactsStore, chatStore, getSessionId, onSaved } = {}) {
        this.contactsStore = contactsStore;
        this.chatStore = chatStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => 'default';
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;
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
        const summaryOn = getMemoryStorageMode() === 'summary';
        if (this.summarySection) this.summarySection.style.display = summaryOn ? 'block' : 'none';
        if (this.memoryTableSection) this.memoryTableSection.style.display = summaryOn ? 'none' : 'block';
        if (!summaryOn) this.memoryTableEditor?.render?.();
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            overflow:hidden;
            display:flex; flex-direction:column;
        `;
        this.panel.onclick = (e) => e.stopPropagation();

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

        this.panel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:800; color:#0f172a;">好友设置</div>
                    <div id="contact-settings-sub" style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                </div>
                <button id="contact-settings-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap;">
                    <button id="contact-avatar-btn" type="button" style="width:72px; height:72px; border-radius:18px; border:1px solid #e2e8f0; background:#fff; padding:0; overflow:hidden; cursor:pointer;">
                        <img id="contact-avatar-preview" alt="" style="width:100%; height:100%; object-fit:cover; display:block;">
                    </button>
                    <div style="flex:1; min-width:220px;">
                        <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">名称</div>
                        <input id="contact-name-input" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px;">
                        <div style="color:#64748b; font-size:12px; margin-top:6px;">仅修改显示名称，不会改变聊天室 ID。</div>
                    </div>
                </div>

                <div style="margin-top:20px; border-top:1px solid #eee; padding-top:14px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:10px;">聊天管理</div>
                    <button id="contact-new-chat" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:8px; background:#fff; color:#019aff; font-weight:700; margin-bottom:10px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                        <span>✨</span> 开启新聊天（存档当前）
                    </button>
                    <div style="font-size:12px; color:#64748b; margin-bottom:6px;">历史存档（点击加载）</div>
                    <div id="contact-archives-list" style="max-height:160px; overflow-y:auto; border:1px solid #eee; border-radius:8px; background:#f9f9f9; padding:0;"></div>

                    <div id="contact-summary-section">
	                    <div style="margin-top:14px;">
	                        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
	                            <div style="font-size:12px; color:#64748b;">摘要（每次对话保存一条）</div>
                                <div style="display:flex; align-items:center; gap:8px;">
	                                <button id="contact-summaries-batch" type="button" title="批量操作" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">☰</button>
	                                <button id="contact-summaries-clear" type="button" style="padding:6px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#ef4444;">清空</button>
                                </div>
	                        </div>
                            <div id="contact-summaries-batchbar" style="display:none; align-items:center; justify-content:flex-end; gap:8px; margin:6px 0 8px;">
                                <button id="contact-summaries-batch-edit" type="button" title="批量编辑" style="width:34px; height:30px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px;">✎</button>
                                <button id="contact-summaries-batch-delete" type="button" title="批量删除" style="width:34px; height:30px; border:1px solid #fecaca; border-radius:10px; background:#fff; cursor:pointer; color:#b91c1c; font-size:16px;">🗑</button>
                                <button id="contact-summaries-batch-cancel" type="button" title="退出批量" style="width:34px; height:30px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:18px;">×</button>
                            </div>
	                        <div id="contact-summaries-list" style="max-height:160px; overflow-y:auto; border:1px solid #eee; border-radius:8px; background:#fff; padding:0;"></div>
	                    </div>

                        <div style="margin-top:14px;">
                            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                                <div style="font-size:12px; color:#64748b;">大总结（自动生成）</div>
                                <div style="display:flex; align-items:center; gap:8px;">
                                    <button id="contact-compacted-raw" type="button" title="查看原始回复" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">📄</button>
                                    <button id="contact-compacted-edit" type="button" title="编辑" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">✎</button>
                                    <button id="contact-compacted-run" type="button" title="手动生成/刷新" style="width:32px; height:28px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; color:#0f172a; font-size:16px; line-height:1;">↻</button>
                                    <button id="contact-compacted-clear" type="button" title="删除" style="width:32px; height:28px; border:1px solid #fecaca; border-radius:10px; background:#fff; cursor:pointer; color:#b91c1c; font-size:16px; line-height:1;">🗑</button>
                                </div>
                            </div>
                            <div id="contact-compacted-summary" style="max-height:200px; overflow-y:auto; border:1px solid #eee; border-radius:8px; background:#fff; padding:0;"></div>
                        </div>
                    </div>

                    <div id="contact-memory-table-section" style="display:none; margin-top:14px; padding:12px; border:1px dashed #e2e8f0; border-radius:12px; background:#f8fafc;">
                        <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">记忆表格</div>
                        <div id="contact-memory-table-content"></div>
                    </div>
	                </div>

                <div style="margin-top:14px; display:flex; gap:10px; flex-wrap:wrap; justify-content:flex-end;">
                    <button id="contact-avatar-clear" type="button" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">清除头像</button>
                    <button id="contact-settings-cancel" type="button" style="padding:10px 18px; border:1px solid #e2e8f0; border-radius:10px; background:#f8fafc; cursor:pointer;">取消</button>
                    <button id="contact-settings-save" type="button" style="padding:10px 18px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:700;">保存</button>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.fileInput);

        this.avatarPreview = this.panel.querySelector('#contact-avatar-preview');
        this.nameInput = this.panel.querySelector('#contact-name-input');
        this.archivesList = this.panel.querySelector('#contact-archives-list');
        this.summariesList = this.panel.querySelector('#contact-summaries-list');
        this.compactedList = this.panel.querySelector('#contact-compacted-summary');
        this.summarySection = this.panel.querySelector('#contact-summary-section');
        this.memoryTableSection = this.panel.querySelector('#contact-memory-table-section');
        this.memoryTableContent = this.panel.querySelector('#contact-memory-table-content');
        this.summariesBatchBar = this.panel.querySelector('#contact-summaries-batchbar');

        this.panel.querySelector('#contact-settings-close').onclick = () => this.hide();
        this.panel.querySelector('#contact-settings-cancel').onclick = () => this.hide();
        this.panel.querySelector('#contact-avatar-btn').onclick = () => {
            this.fileInput.value = '';
            this.fileInput.click();
        };
        this.panel.querySelector('#contact-avatar-clear').onclick = () => {
            this.currentAvatar = '';
            if (this.avatarPreview) this.avatarPreview.src = './assets/external/feather-default.png';
        };
        this.panel.querySelector('#contact-settings-save').onclick = () => this.save();
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
                getContext: () => ({ type: 'contact', contactId: this.getSessionId() }),
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
        const sid = this.getSessionId();
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
        const sid = this.getSessionId();
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

    setSummaryBatchMode(enabled) {
        const next = Boolean(enabled);
        this.summaryBatchMode = next;
        if (!next) this.summarySelectedKeys = new Set();
        if (this.summariesBatchBar) this.summariesBatchBar.style.display = next ? 'flex' : 'none';
        this.renderSummaries();
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
        const sid = this.getSessionId();
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
        const sid = this.getSessionId();
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
        const sid = this.getSessionId();
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

    renderArchives() {
        if (!this.archivesList || !this.chatStore) return;
        const sid = this.getSessionId();
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
                    currentSnapshot = await buildMemoryTableSnapshot({ sessionId: sid, isGroup: false });
                }
                const targetSnapshot = arc?.memoryTableSnapshot;
                const loaded = await this.chatStore.loadArchivedMessages(arc.id, sid, { memoryTableSnapshot: currentSnapshot });
                if (loaded && memoryTableOn && targetSnapshot) {
                    try {
                        await applyMemoryTableSnapshot({ sessionId: sid, isGroup: false, snapshot: targetSnapshot });
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

    renderSummaries() {
        if (!this.summariesList || !this.chatStore) return;
        const sid = this.getSessionId();
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
                row.style.cssText = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06);';
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
        const sid = this.getSessionId();
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

    async startNewChat() {
        if (!this.chatStore) return;
        const sid = this.getSessionId();
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
            memoryTableSnapshot = await buildMemoryTableSnapshot({ sessionId: sid, isGroup: false });
            try {
                await clearSessionMemoriesForNewChat({ sessionId: sid, isGroup: false, keepNonSummary });
            } catch (err) {
                logger.warn('clear memory tables for new chat failed', err);
            }
        }
        this.chatStore.startNewChat(sid, raw.trim(), { memoryTableSnapshot });
        window.toastr?.success('已开启新聊天');
        this.onSaved?.({ id: sid, forceRefresh: true });
        this.hide();
    }

    populate() {
        const sessionId = this.getSessionId();
        const c = this.contactsStore?.getContact?.(sessionId) || { id: sessionId, name: sessionId, avatar: '' };
        // Ensure it exists (so save works)
        this.contactsStore?.upsertContact?.(c);
        const sub = this.panel.querySelector('#contact-settings-sub');
        if (sub) sub.textContent = `会话：${sessionId}`;
        this.currentAvatar = c.avatar || '';
        if (this.avatarPreview) {
            this.avatarPreview.src = this.currentAvatar || './assets/external/feather-default.png';
        }
        if (this.nameInput) this.nameInput.value = c.name || sessionId;
    }

    save() {
        try {
            const sessionId = this.getSessionId();
            const prev = this.contactsStore?.getContact?.(sessionId) || { id: sessionId };
            const name = String(this.nameInput?.value || '').trim() || prev.name || sessionId;
            const avatar = String(this.currentAvatar || '');
            this.contactsStore?.upsertContact?.({ ...prev, id: sessionId, name, avatar });
            window.toastr?.success?.('已保存好友设置');
            this.onSaved?.({ id: sessionId, name, avatar });
            this.hide();
        } catch (err) {
            logger.error('保存好友设置失败', err);
            window.toastr?.error?.(err.message || '保存失败');
        }
    }
}
