/**
 * Contact settings panel
 * - Edit contact display name + avatar (does not rename session id)
 */
import { logger } from '../utils/logger.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { appSettings } from '../storage/app-settings.js';
import { sortMemoryRowsForSnapshot } from '../memory/memory-row-order.js';
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
    overlay.className = 'app-themed-overlay memory-table-dialog-overlay';
    overlay.style.cssText = `
        position:fixed; inset:0; background:rgba(15,23,42,0.45);
        display:flex; align-items:center; justify-content:center;
        padding:16px; z-index:22000;
    `;
    const panel = document.createElement('div');
    panel.className = 'app-themed-panel memory-table-dialog-panel';
    panel.style.cssText = `
        width:min(360px, 92vw);
        background:var(--app-surface-card); border-radius:14px;
        padding:16px; box-shadow:0 20px 60px rgba(0,0,0,0.3);
        display:flex; flex-direction:column; gap:10px;
    `;
    panel.innerHTML = `
        <div style="font-weight:800; color:var(--app-text-primary);">记忆表格：开启新聊天</div>
        <div style="font-size:12px; color:var(--app-text-muted);">请选择新聊天处理方式</div>
    `;
    const btnWrap = document.createElement('div');
    btnWrap.style.cssText = 'display:flex; flex-direction:column; gap:8px;';
    const buildBtn = (text, style) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'memory-table-dialog-btn';
        btn.textContent = text;
        btn.style.cssText = `
            padding:10px 12px; border-radius:10px; border:1px solid var(--app-border-default);
            background:var(--app-surface-card); font-weight:700; cursor:pointer; text-align:left;
            ${style || ''}
        `;
        return btn;
    };
    const keepBtn = buildBtn('保留其他表格（仅清空摘要/大纲）', 'color:var(--app-text-primary);');
    const clearBtn = buildBtn('清空全部记忆表格', 'color:#ef4444; border-color:#fecaca; background:#fff5f5;');
    const cancelBtn = buildBtn('取消', 'color:var(--app-text-secondary); background:var(--app-surface-subtle);');
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
    const picked = sortMemoryRowsForSnapshot(Array.isArray(rows) ? rows : [])
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
              .filter(Boolean);
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
    const rows = sortMemoryRowsForSnapshot(Array.isArray(snapshot?.rows) ? snapshot.rows : []);
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

const clearSessionMemoriesForNewChat = async ({ sessionId, isGroup, keepNonSummary, sessionMode = '' } = {}) => {
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
    const { summaryTableId, outlineTableId } = getSummaryTableIdsForContext({
        sessionId: sid,
        isGroup,
        contextType: isRpSessionId(sid) ? 'rp' : (isGroup ? 'group' : 'contact'),
        uiMode: sessionMode === 'rp' || isRpSessionId(sid) ? 'rp' : 'social',
    });
    const summaryTableIds = new Set([summaryTableId, outlineTableId]);
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
        this.memoryShareRows = null;
        this.memoryShareSaveBtn = null;
        this.memoryShareDraft = null;
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
        if (this.memoryTableSection) this.memoryTableSection.style.display = !summaryOn ? 'block' : 'none';
        if (!summaryOn) this.memoryTableEditor?.render?.();
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'contact-settings-overlay';
        this.overlay.className = 'app-themed-overlay';
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.id = 'contact-settings-panel';
        this.panel.className = 'app-themed-panel';
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:var(--app-surface-card); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
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
                    <div id="contact-settings-title" style="font-weight:800; color:var(--app-text-primary);">好友设置</div>
                    <div id="contact-settings-sub" style="color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                </div>
                <button id="contact-settings-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
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

                    <div style="margin-top:16px; border-top:1px solid var(--app-border-subtle); padding-top:14px;">
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

            </div>

            <div style="padding:14px 16px calc(14px + env(safe-area-inset-bottom, 0px)); border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; gap:10px;">
                <button id="contact-avatar-clear" type="button" style="padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; white-space:nowrap;">清除头像</button>
                <button id="contact-settings-cancel" type="button" style="flex:1; padding:10px 14px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle); cursor:pointer;">取消</button>
                <button id="contact-settings-save" type="button" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:700;">保存</button>
            </div>
        `;

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
        const syncBridgeControls = () => {
            if (this.rpBridgeLimitInput) {
                this.rpBridgeLimitInput.disabled = this.rpBridgeToggle?.checked === false;
            }
        };

        this.panel.querySelector('#contact-settings-close').onclick = () => this.hide();
        this.panel.querySelector('#contact-settings-cancel').onclick = () => this.hide();
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

        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay contact-inline-modal-overlay';
        overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        const panel = document.createElement('div');
        panel.className = 'app-themed-panel contact-inline-modal-panel';
        panel.style.cssText = `
            display:none; position:fixed;
            left: calc(12px + env(safe-area-inset-left, 0px));
            right: calc(12px + env(safe-area-inset-right, 0px));
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:var(--app-surface-card); border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
            z-index:23000;
            overflow:hidden;
            display:flex; flex-direction:column;
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.innerHTML = `
            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:900; color:var(--app-text-primary);">大总结原始回复</div>
                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>
            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
                <textarea data-role="textarea" readonly style="width:100%; min-height:220px; resize:vertical; padding:10px; border:1px solid var(--app-border-default); border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box; white-space:pre-wrap;"></textarea>
            </div>
            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button data-role="copy" style="flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); cursor:pointer;">复制</button>
                <button data-role="ok" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:900;">关闭</button>
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
        overlay.className = 'app-themed-overlay contact-inline-modal-overlay';
        overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        overlay.addEventListener('click', () => close());
        const panel = document.createElement('div');
        panel.className = 'app-themed-panel contact-inline-modal-panel';
        panel.style.cssText = `
            display:none; position:fixed;
            left: calc(12px + env(safe-area-inset-left, 0px));
            right: calc(12px + env(safe-area-inset-right, 0px));
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:var(--app-surface-card); border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
            z-index:23000;
            overflow:hidden;
            display:flex; flex-direction:column;
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.innerHTML = `
            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:900; color:var(--app-text-primary);">编辑大总结</div>
                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>
            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
                <textarea data-role="textarea" style="width:100%; min-height:200px; resize:vertical; padding:10px; border:1px solid var(--app-border-default); border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box;"></textarea>
            </div>
            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); cursor:pointer;">取消</button>
                <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:900;">保存</button>
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
        this.summaryEditOverlay.className = 'app-themed-overlay contact-inline-modal-overlay';
        this.summaryEditOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.summaryEditOverlay.addEventListener('click', () => this.closeSummaryEditModal());

        this.summaryEditPanel = document.createElement('div');
        this.summaryEditPanel.className = 'app-themed-panel contact-inline-modal-panel';
        this.summaryEditPanel.style.cssText = `
            display:none; position:fixed;
            left: calc(12px + env(safe-area-inset-left, 0px));
            right: calc(12px + env(safe-area-inset-right, 0px));
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:var(--app-surface-card); border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
            z-index:23000;
            overflow:hidden;
            display:flex; flex-direction:column;
        `;
        this.summaryEditPanel.addEventListener('click', (e) => e.stopPropagation());
        this.summaryEditPanel.innerHTML = `
            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:900; color:var(--app-text-primary);">批量编辑摘要</div>
                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>
            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
                <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:8px;">每行一条摘要（顺序对应所选摘要）。</div>
                <textarea data-role="textarea" style="width:100%; min-height:180px; resize:vertical; padding:10px; border:1px solid var(--app-border-default); border-radius:12px; font-size:13px; line-height:1.4; box-sizing:border-box;"></textarea>
            </div>
            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); cursor:pointer;">取消</button>
                <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:900;">保存</button>
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
            this.archivesList.innerHTML = '<div style="padding:12px; color:var(--app-text-muted); text-align:center; font-size:12px;">暂无历史存档</div>';
            return;
        }

        archives.forEach(arc => {
            const dateStr = new Date(arc.timestamp).toLocaleString();
            const msgCount = Number(arc.messageCount || (Array.isArray(arc.messages) ? arc.messages.length : 0)) || 0;
            const isCurrent = arc.id === currentId;
            const row = document.createElement('div');
            row.style.cssText = `display:flex; align-items:center; justify-content:space-between; padding:8px 10px; border-bottom:1px solid var(--app-border-subtle); background:${isCurrent ? '#eff6ff' : 'var(--app-surface-card)'}; border-left:${isCurrent ? '3px solid #019aff' : 'none'};`;
            
            const info = document.createElement('div');
            info.style.cssText = 'flex:1; cursor:pointer; min-width:0;';
            info.innerHTML = `
                <div style="font-weight:600; color:var(--app-text-secondary); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${arc.name || '未命名存档'} ${isCurrent ? '(当前)' : ''}</div>
                <div style="color:var(--app-text-muted); font-size:11px;">${dateStr} · ${msgCount}条消息</div>
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
                let currentArchivePointer = null;
                if (memoryTableOn) {
                    currentSnapshot = await buildMemoryTableSnapshot({ sessionId: sid, isGroup: false });
                    try {
                        currentArchivePointer = await window.appBridge?.buildArchivePointerFromCurrentThread?.(sid, {
                            fallbackSnapshot: currentSnapshot,
                            source: 'contact_archive_switch_capture',
                        });
                    } catch (err) {
                        logger.warn('build archive pointer before contact archive switch failed', err);
                    }
                }
                const targetSnapshot = arc?.memoryTableSnapshot;
                const loaded = await this.chatStore.loadArchivedMessages(arc.id, sid, { memoryTableSnapshot: currentSnapshot });
                const transition = this.chatStore.getLastArchiveTransition?.(sid) || null;
                const archivedCurrentId = String(transition?.archivedCurrentId || '').trim();
                if (loaded && archivedCurrentId && currentArchivePointer) {
                    try {
                        await window.appBridge?.setArchivePointerForArchive?.(sid, archivedCurrentId, currentArchivePointer, {
                            fallbackSnapshot: currentSnapshot,
                            source: 'contact_archive_switch_save_previous',
                        });
                    } catch (err) {
                        logger.warn('persist previous contact archive pointer failed', err);
                    }
                }
                if (loaded && memoryTableOn && targetSnapshot) {
                    try {
                        await applyMemoryTableSnapshot({ sessionId: sid, isGroup: false, snapshot: targetSnapshot });
                    } catch (err) {
                        logger.warn('apply memory table snapshot failed', err);
                    }
                }
                if (loaded) {
                    try {
                        await window.appBridge?.restoreArchivePointerForLoadedThread?.(sid, {
                            refreshBaselineWhenNoTail: true,
                            source: 'archive_load_contact',
                        });
                    } catch (err) {
                        logger.warn('restore checkpoint memory after archive load failed', err);
                    }
                }
                window.toastr?.success('已加载存档');
                this.onSaved?.({ id: sid, forceRefresh: true });
                this.hide();
            };

            const delBtn = document.createElement('button');
            delBtn.textContent = '×';
            delBtn.style.cssText = 'padding:4px 8px; border:none; background:transparent; color:var(--app-text-muted); font-size:16px; cursor:pointer; margin-left:6px;';
            delBtn.onclick = async (e) => {
                e.stopPropagation();
                const ok = await appConfirm({
                    title: '删除存档',
                    message: '确定要删除这条存档吗？',
                    danger: true,
                });
                if (!ok) return;
                try {
                    await window.appBridge?.deleteArchiveTurnCheckpointState?.(sid, arc.id);
                } catch (err) {
                    logger.warn('delete archive turn checkpoint state failed', err);
                }
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
            this.summariesList.innerHTML = '<div style="padding:12px; color:var(--app-text-muted); text-align:center; font-size:12px;">暂无摘要</div>';
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
                row.style.cssText = `padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; gap:10px; align-items:flex-start; cursor:pointer; background:${selected ? 'rgba(59,130,246,0.06)' : 'var(--app-surface-card)'};`;
                row.innerHTML = `
                    <div style="width:20px; height:20px; border-radius:999px; border:2px solid ${selected ? '#2563eb' : 'rgba(0,0,0,0.20)'}; margin-top:2px; display:flex; align-items:center; justify-content:center; color:var(--app-text-inverse); font-weight:900; font-size:12px; background:${selected ? '#2563eb' : 'transparent'}; box-sizing:border-box;">${selected ? '✓' : ''}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                        ${time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${time}</div>` : ''}
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
                    <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    ${time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${time}</div>` : ''}
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
            this.compactedList.innerHTML = '<div style="padding:12px; color:var(--app-text-muted); text-align:center; font-size:12px;">暂无大总结</div>';
            return;
        }
        const at = Number(cs?.at || 0) || 0;
        const time = at ? new Date(at).toLocaleString() : '';
        const row = document.createElement('div');
        row.style.cssText = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer;';
        row.innerHTML = `
            <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${time}</div>` : ''}
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
        let archivePointer = null;
        const isRpSession = isRpSessionId(sid);
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
                archivePointer = await window.appBridge?.buildArchivePointerFromCurrentThread?.(sid, {
                    fallbackSnapshot: memoryTableSnapshot,
                    source: 'contact_start_new_chat_capture',
                });
            } catch (err) {
                logger.warn('build archive pointer before new chat failed', err);
            }
            try {
                await clearSessionMemoriesForNewChat({
                    sessionId: sid,
                    isGroup: false,
                    keepNonSummary,
                    sessionMode: isRpSession ? 'rp' : 'chat',
                });
            } catch (err) {
                logger.warn('clear memory tables for new chat failed', err);
            }
        }
        const archiveId = this.chatStore.startNewChat(sid, raw.trim(), { memoryTableSnapshot });
        if (archiveId && archivePointer) {
            try {
                await window.appBridge?.setArchivePointerForArchive?.(sid, archiveId, archivePointer, {
                    fallbackSnapshot: memoryTableSnapshot,
                    source: 'contact_start_new_chat_save_archive',
                });
            } catch (err) {
                logger.warn('persist archive pointer for new chat archive failed', err);
            }
        }
        try {
            await window.appBridge?.restoreMemoryForActiveThread?.(sid, {
                refreshBaselineWhenNoTail: true,
                source: 'start_new_chat_contact',
            });
        } catch (err) {
            logger.warn('refresh turn checkpoint baseline after new chat failed', err);
        }
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
        this.memoryShareOverlay = document.createElement('div');
        this.memoryShareOverlay.className = 'app-themed-overlay contact-inline-modal-overlay';
        this.memoryShareOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.memoryShareOverlay.addEventListener('click', () => this.closeMemoryShareManager());

        this.memorySharePanel = document.createElement('div');
        this.memorySharePanel.className = 'app-themed-panel contact-inline-modal-panel';
        this.memorySharePanel.style.cssText = `
            display:none; position:fixed;
            left: calc(12px + env(safe-area-inset-left, 0px));
            right: calc(12px + env(safe-area-inset-right, 0px));
            bottom: calc(12px + env(safe-area-inset-bottom, 0px));
            max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:var(--app-surface-card); border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
            z-index:23000; overflow:hidden; display:flex; flex-direction:column;
        `;
        this.memorySharePanel.addEventListener('click', (e) => e.stopPropagation());
        this.memorySharePanel.innerHTML = `
            <div style="padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="font-weight:900; color:var(--app-text-primary);">记忆共享</div>
                <button data-role="close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>
            <div style="padding:12px 14px; flex:1; min-height:0; overflow:auto;">
                <div data-role="hint" style="font-size:12px; color:var(--app-text-muted); line-height:1.5; margin-bottom:12px;"></div>
                <label data-role="source-wrap" style="display:block; margin-bottom:12px;">
                    <div style="font-size:12px; color:var(--app-text-secondary); margin-bottom:6px;">来源聊天 / 群聊</div>
                    <select data-role="source" style="width:100%; padding:8px; border:1px solid var(--app-border-default); border-radius:10px; font-size:12px; background:var(--app-surface-card);"></select>
                </label>
                <div data-role="source-static" style="display:none; margin-bottom:12px; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-subtle); color:var(--app-text-secondary); font-size:12px; line-height:1.5;"></div>
                <div data-role="rows" style="display:flex; flex-direction:column; gap:10px;"></div>
            </div>
            <div style="padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button data-role="cancel" style="flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); cursor:pointer;">取消</button>
                <button data-role="save" style="flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:900;">保存</button>
            </div>
        `;
        document.body.appendChild(this.memoryShareOverlay);
        document.body.appendChild(this.memorySharePanel);

        this.memoryShareSourceSelect = this.memorySharePanel.querySelector('[data-role="source"]');
        this.memoryShareRows = this.memorySharePanel.querySelector('[data-role="rows"]');
        this.memoryShareSaveBtn = this.memorySharePanel.querySelector('[data-role="save"]');

        this.memorySharePanel.querySelector('[data-role="close"]').onclick = () => this.closeMemoryShareManager();
        this.memorySharePanel.querySelector('[data-role="cancel"]').onclick = () => this.closeMemoryShareManager();
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
        if (this.memoryShareOverlay) this.memoryShareOverlay.style.display = 'none';
        if (this.memorySharePanel) this.memorySharePanel.style.display = 'none';
        this.memoryShareDraft = null;
    }

    async renderMemoryShareManager() {
        if (!this.memoryShareDraft || !this.memoryShareSourceSelect || !this.memoryShareRows) return;
        const sessionId = String(this.memoryShareDraft.sessionId || '').trim();
        const isRpTarget = isRpSessionId(sessionId);
        const hint = this.memorySharePanel?.querySelector('[data-role="hint"]');
        const sourceWrap = this.memorySharePanel?.querySelector('[data-role="source-wrap"]');
        const sourceStatic = this.memorySharePanel?.querySelector('[data-role="source-static"]');
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
            const empty = document.createElement('div');
            empty.className = 'memory-share-empty';
            empty.style.cssText = 'padding:10px; border:1px dashed var(--app-border-default); border-radius:12px; color:var(--app-text-muted); font-size:12px;';
            empty.textContent = '当前来源没有可配置的跨模式记忆表格。';
            this.memoryShareRows.appendChild(empty);
            return;
        }
        context.entries.forEach((entry) => {
            const row = document.createElement('div');
            row.className = 'memory-share-row';
            row.style.cssText = 'padding:10px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card);';
            row.innerHTML = `
                <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer;">
                    <span class="memory-share-row-title" style="font-weight:700; color:var(--app-text-primary);">${entry.shortLabel}</span>
                    <input type="checkbox" data-role="enabled" style="width:18px; height:18px;">
                </label>
                <div class="memory-share-row-desc" style="color:var(--app-text-secondary); font-size:12px; margin-top:6px;">当前可注入 ${entry.rowCount} 条；0 代表全部注入。</div>
                <label class="memory-share-row-limit" style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; color:var(--app-text-secondary); margin-top:10px;">
                    <span class="memory-share-row-limit-label">注入条数</span>
                    <input type="number" data-role="limit" min="0" step="1"
                           style="width:88px; padding:4px 6px; border:1px solid var(--app-border-default); border-radius:8px; font-size:12px; text-align:right; background:var(--app-surface-input); color:var(--app-text-primary);">
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
