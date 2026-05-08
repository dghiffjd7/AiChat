
import { MediaPicker } from './media-picker.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { appConfirm } from './app-confirm.js';
import { appSettings } from '../storage/app-settings.js';
import { CharacterCardImporter } from './character-card-importer.js';
import { getCharacterCardDisplayName, getCharacterCardSource } from '../utils/character-card-display.js';
import { getDefaultAppIcon } from '../utils/default-icon.js';
import { bindCustomSelectButton, closeCustomSelectMenu, refreshCustomSelectButton } from './custom-select.js';
import { cleanupPersonaScopedData, deletePersonaCard } from './persona-runtime-utils.js';
import { getRegexLocalSet, removeRegexLocalSet, waitForRegexStoreReady } from './regex-store-runtime-utils.js';
import { waitForScriptStoreReady } from './script-runtime-utils.js';
import { deleteWorldSessionMapEntry } from './world-session-runtime-utils.js';

export class PersonaPanel {
    constructor({ personaStore, userStore = null, chatStore = null, contactsStore = null, rpSessionStore = null, getSessionId = null, onPersonaChanged }) {
        this.store = personaStore;
        this.userStore = userStore;
        this.chatStore = chatStore;
        this.contactsStore = contactsStore;
        this.rpSessionStore = rpSessionStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : null;
        this.onPersonaChanged = onPersonaChanged;
        this.overlay = null;
        this.panel = null;
        this.mediaPicker = new MediaPicker({
            onUrl: (url) => this.updateAvatarPreview(url),
            onFile: async (dataUrl, file) => {
                if (file) {
                    try {
                        const compressed = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 420_000 });
                        this.updateAvatarPreview(compressed);
                        return;
                    } catch {}
                }
                if (dataUrl) this.updateAvatarPreview(dataUrl);
            }
        });
        this.editingId = null;
        this.bulkModal = null;
        this.bulkState = null;
        this.cardImporter = new CharacterCardImporter({
            personaStore: this.store,
            appBridge: window.appBridge,
            rpSessionStore: this.rpSessionStore,
            onPersonaChanged: this.onPersonaChanged,
        });
        this.importInput = null;
        this.importOverlay = null;
        this.importModal = null;
        this.importUrlInput = null;
        this.importUrlBtn = null;
        this.importFileBtn = null;
        this.importCloseBtn = null;
    }

    ensureUI() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'panel-overlay app-themed-overlay persona-panel-overlay';
        this.overlay.style.display = 'none';
        this.overlay.style.zIndex = '21000'; // High z-index to sit on top
        this.overlay.style.position = 'fixed';
        this.overlay.style.inset = '0';
        this.overlay.style.background = 'rgba(0,0,0,0.38)';
        this.overlay.style.padding = 'calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px';
        this.overlay.style.boxSizing = 'border-box';
        
        // Handle clicking outside to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay) this.hide();
        });

        this.panel = document.createElement('div');
        this.panel.className = 'panel-content app-themed-panel persona-panel-shell';
        this.panel.style.cssText = `
            position: relative;
            display: flex; flex-direction: column;
            width: min(94vw, 420px); height: min(82vh, 640px); max-height: calc(100% - 8px);
            background: var(--app-surface-card); border-radius: 12px; overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
        `;

        this.panel.innerHTML = `
            <div class="panel-header" style="padding: 15px; border-bottom: 1px solid var(--app-border-subtle); display: flex; justify-content: space-between; align-items: center; background: var(--app-surface-subtle);">
                <span style="font-weight: bold; font-size: 16px;">🎭 角色卡管理</span>
                <button class="close-btn" style="border: none; background: transparent; font-size: 20px; cursor: pointer; color: var(--app-text-secondary);">×</button>
            </div>
            <div id="persona-session-lock-bar" style="padding: 10px 15px; border-bottom: 1px solid rgba(0,0,0,0.06); background: var(--app-surface-card); display:none;">
                <!-- Filled dynamically -->
            </div>
            <div id="persona-list-container" style="flex: 1; overflow-y: auto; padding: 10px;">
                <!-- List goes here -->
            </div>
            <div class="panel-footer" style="padding: 15px; border-top: 1px solid var(--app-border-subtle); background: var(--app-surface-card); text-align: center;">
                <div style="display:flex; gap:8px;">
                    <button id="import-card-btn" style="
                        background: #0f172a; color: var(--app-text-inverse); border: none; padding: 10px 16px;
                        border-radius: 18px; font-size: 13px; cursor: pointer; flex: 1;
                    ">导入角色卡</button>
                    <button id="create-persona-btn" style="
                        background: #007bff; color: var(--app-text-inverse); border: none; padding: 10px 16px; 
                        border-radius: 18px; font-size: 13px; cursor: pointer; flex: 1;
                        box-shadow: 0 2px 5px rgba(0,123,255,0.3);
                    ">+ 新建角色卡</button>
                </div>
            </div>
            <input type="file" id="persona-card-import" accept=".png,.json,application/json,image/png" style="display:none;">

            <!-- Edit View (Hidden by default) -->
            <div id="persona-edit-view" style="
                display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                background: var(--app-surface-card); z-index: 10; flex-direction: column;
            ">
                <div style="padding: 12px 12px; border-bottom: 1px solid var(--app-border-subtle); display: flex; align-items: center; gap: 8px; background: var(--app-surface-subtle);">
                    <button id="edit-back-btn" aria-label="返回" style="
                        width: 44px; height: 44px;
                        border: none; background: transparent;
                        font-size: 22px; cursor: pointer;
                        display: flex; align-items: center; justify-content: center;
                        border-radius: 12px;
                    ">←</button>
                    <span style="font-weight: bold; font-size: 16px;">编辑角色卡</span>
                </div>
                <div style="flex: 1; overflow-y: auto; padding: 20px;">
                    <div style="text-align: center; margin-bottom: 20px;">
                        <div id="edit-avatar-preview" style="
                            width: 80px; height: 80px; border-radius: 50%; background-color: var(--app-surface-hover);
                            margin: 0 auto 10px; background-size: cover; background-position: center;
                            border: 2px solid var(--app-surface-card); box-shadow: 0 2px 8px rgba(0,0,0,0.1); cursor: pointer;
                        "></div>
                        <button id="edit-avatar-btn" style="font-size: 12px; padding: 4px 10px; background: var(--app-surface-hover); border: none; border-radius: 10px; color: var(--app-text-primary);">更换头像</button>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-size: 12px; color: var(--app-text-secondary); margin-bottom: 5px;">角色卡名称</label>
                        <input type="text" id="edit-name" style="width: 100%; padding: 10px; border: 1px solid var(--app-border-default); border-radius: 8px; box-sizing: border-box;">
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: block; font-size: 12px; color: var(--app-text-secondary); margin-bottom: 5px;">
                            角色描述
                            <span style="color:var(--app-text-muted); font-size:11px; margin-left:5px;">可用于手动补充角色卡设定</span>
                        </label>
                        <textarea id="edit-desc" style="
                            width: 100%; height: 120px; padding: 10px; border: 1px solid var(--app-border-default); 
                            border-radius: 8px; resize: none; box-sizing: border-box; font-family: inherit;
                        " placeholder="例如：外表冷淡、说话简短，但会在关键时刻保护同伴。"></textarea>
                    </div>

                    <div style="margin-bottom: 15px; padding: 12px; border: 1px solid rgba(0,0,0,0.06); border-radius: 10px; background: rgba(248,250,252,0.8);">
                        <div style="font-size: 12px; font-weight: 700; color: var(--app-text-secondary); margin-bottom: 8px;">注入设置</div>
                        <div style="margin-bottom: 10px;">
                            <label style="display:block; font-size:12px; color:var(--app-text-secondary); margin-bottom:5px;">插入位置</label>
                            <select id="edit-position" style="display:none;">
                                <option value="0">IN_PROMPT（作为 system prompt 注入）</option>
                                <option value="4">AT_DEPTH（插入到聊天历史指定深度）</option>
                                <option value="9">NONE（不注入）</option>
                            </select>
                            <button type="button" id="edit-position-btn" class="world-app-select-btn" style="width:100%; margin-top:0;">
                                <span data-custom-select-label>插入位置</span>
                                <span class="world-app-select-btn-chevron">▾</span>
                            </button>
                        </div>
                        <div id="edit-depth-wrap" style="display:none; gap:10px;">
                            <div style="flex:1;">
                                <label style="display:block; font-size:12px; color:var(--app-text-secondary); margin-bottom:5px;">深度（0=最后一条）</label>
                                <input type="number" id="edit-depth" min="0" step="1" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:8px; box-sizing:border-box;" />
                            </div>
                            <div style="flex:1;">
                                <label style="display:block; font-size:12px; color:var(--app-text-secondary); margin-bottom:5px;">注入角色</label>
                                <select id="edit-role" style="display:none;">
                                    <option value="0">system</option>
                                    <option value="1">user</option>
                                    <option value="2">assistant</option>
                                </select>
                                <button type="button" id="edit-role-btn" class="world-app-select-btn" style="width:100%; margin-top:0;">
                                    <span data-custom-select-label>注入角色</span>
                                    <span class="world-app-select-btn-chevron">▾</span>
                                </button>
                            </div>
                        </div>
                        <div style="margin-top:10px; font-size:11px; color:var(--app-text-muted); line-height:1.4;">
                            当前仍沿用旧字段结构，后续会继续调整角色卡编辑内容。
                        </div>
                    </div>

                    <button id="delete-persona-btn" style="width: 100%; padding: 12px; background: #fee2e2; color: #dc2626; border: none; border-radius: 8px; margin-top: 20px; cursor: pointer;">删除此角色卡</button>
                </div>
                <div style="padding: 15px; border-top: 1px solid var(--app-border-subtle); background: var(--app-surface-card);">
                    <button id="save-persona-btn" style="width: 100%; padding: 12px; background: #007bff; color: var(--app-text-inverse); border: none; border-radius: 8px; font-weight: bold; cursor: pointer;">保存</button>
                </div>
            </div>
        `;

        this.overlay.appendChild(this.panel);
        document.body.appendChild(this.overlay);

        // Bind Events
        this.panel.querySelector('.close-btn').addEventListener('click', () => this.hide());
        this.panel.querySelector('#create-persona-btn').addEventListener('click', () => this.openEdit());
        const importBtn = this.panel.querySelector('#import-card-btn');
        this.importInput = this.panel.querySelector('#persona-card-import');
        if (importBtn && this.importInput) {
            importBtn.addEventListener('click', () => {
                this.showImportModal();
            });
            this.importInput.addEventListener('change', () => this.handleCardImport());
        }
        this.panel.querySelector('#edit-back-btn').addEventListener('click', () => this.closeEdit());
        this.panel.querySelector('#edit-avatar-preview').addEventListener('click', () => this.changeAvatar());
        this.panel.querySelector('#edit-avatar-btn').addEventListener('click', () => this.changeAvatar());
        this.panel.querySelector('#save-persona-btn').addEventListener('click', () => this.saveEdit());
        this.panel.querySelector('#delete-persona-btn').addEventListener('click', () => this.deleteCurrent());
        this.panel.querySelector('#edit-position').addEventListener('change', () => this.updateInjectionUi());
        bindCustomSelectButton({
            buttonEl: this.panel.querySelector('#edit-position-btn'),
            selectEl: this.panel.querySelector('#edit-position'),
            fallback: '插入位置',
        });
        bindCustomSelectButton({
            buttonEl: this.panel.querySelector('#edit-role-btn'),
            selectEl: this.panel.querySelector('#edit-role'),
            fallback: '注入角色',
        });

    }

    ensureImportModal() {
        if (this.importOverlay) return;
        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay persona-import-overlay';
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.38);
            z-index: 22040;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing: border-box;
            align-items:center;
            justify-content:center;
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideImportModal();
        });

        const modal = document.createElement('div');
        modal.className = 'app-themed-panel persona-import-panel';
        modal.style.cssText = `
            width: min(92vw, 420px);
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 10px 40px rgba(0,0,0,0.18);
            max-height: min(84vh, 560px);
        `;
        modal.addEventListener('click', (e) => e.stopPropagation());

        modal.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px 14px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:800;">导入角色卡</div>
                <button id="persona-import-close" style="margin-left:auto; width:36px; height:36px; border:none; background:transparent; font-size:20px; border-radius:10px; cursor:pointer;">×</button>
            </div>
            <div style="padding:14px; display:flex; flex-direction:column; gap:12px;">
                <div>
                    <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:6px;">本地文件</div>
                    <button id="persona-import-file" style="width:100%; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; font-size:14px;">选择文件（PNG / JSON）</button>
                </div>
                <div style="border-top:1px dashed var(--app-border-default); padding-top:12px;">
                    <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:6px;">链接导入</div>
                    <input id="persona-import-url" type="url" placeholder="粘贴 PNG/JSON 链接" style="width:100%; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; box-sizing:border-box;">
                    <button id="persona-import-url-btn" style="margin-top:8px; width:100%; padding:9px 12px; border:none; border-radius:10px; background:#0f172a; color:var(--app-text-inverse); cursor:pointer; font-size:14px;">导入链接</button>
                </div>
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        this.importOverlay = overlay;
        this.importModal = modal;
        this.importUrlInput = modal.querySelector('#persona-import-url');
        this.importUrlBtn = modal.querySelector('#persona-import-url-btn');
        this.importFileBtn = modal.querySelector('#persona-import-file');
        this.importCloseBtn = modal.querySelector('#persona-import-close');

        this.importCloseBtn?.addEventListener('click', () => this.hideImportModal());
        this.importFileBtn?.addEventListener('click', () => {
            if (!this.importInput) return;
            this.importInput.value = '';
            this.importInput.click();
        });
        if (this.importUrlInput && this.importUrlBtn) {
            const syncBtn = () => {
                const has = String(this.importUrlInput?.value || '').trim().length > 0;
                this.importUrlBtn.disabled = !has;
                this.importUrlBtn.style.opacity = has ? '1' : '0.6';
                this.importUrlBtn.style.cursor = has ? 'pointer' : 'not-allowed';
            };
            this.importUrlInput.addEventListener('input', syncBtn);
            this.importUrlInput.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    this.handleCardImportUrl();
                }
            });
            syncBtn();
        }
        this.importUrlBtn?.addEventListener('click', () => this.handleCardImportUrl());
    }

    getCharacterCardName(card) {
        return getCharacterCardDisplayName(card, '角色卡');
    }

    showImportModal() {
        this.ensureImportModal();
        if (this.importUrlInput) this.importUrlInput.value = '';
        if (this.importUrlBtn) {
            this.importUrlBtn.disabled = true;
            this.importUrlBtn.style.opacity = '0.6';
            this.importUrlBtn.style.cursor = 'not-allowed';
            this.importUrlBtn.textContent = '导入链接';
        }
        if (this.importOverlay) this.importOverlay.style.display = 'flex';
    }

    hideImportModal() {
        if (this.importOverlay) this.importOverlay.style.display = 'none';
    }

    ensureBulkModal() {
        if (this.bulkModal) return;
        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay persona-bulk-overlay';
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.38);
            z-index: 22050;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing: border-box;
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideBulkModal();
        });

        const panel = document.createElement('div');
        panel.className = 'app-themed-panel persona-bulk-panel';
        panel.style.cssText = `
            width: min(96vw, 520px);
            height: min(86vh, 720px);
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 10px 40px rgba(0,0,0,0.18);
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());

        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--app-surface-page); border-bottom:1px solid var(--app-border-default);">
                <button id="persona-bulk-back" style="width:44px; height:44px; border:none; background:transparent; border-radius:12px; font-size:22px; display:flex; align-items:center; justify-content:center; cursor:pointer;">←</button>
                <div style="font-weight:900;">批量绑定角色卡</div>
                <div id="persona-bulk-meta" style="margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            </div>

            <div style="padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06);">
                <div id="persona-bulk-search-box" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:1px solid rgba(0,0,0,0.10); border-radius:14px; background:var(--app-surface-card);">
                    <input id="persona-bulk-search" type="text" placeholder="搜索联系人/群组..." style="flex:1; border:none; outline:none; font-size:14px; background:transparent;">
                    <button id="persona-bulk-clear" type="button" aria-label="清除搜索" style="display:none; width:32px; height:32px; border:none; border-radius:10px; background:var(--app-surface-hover); cursor:pointer;">×</button>
                </div>
                <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
                    <button id="persona-bulk-select-all" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer;">全选</button>
                    <button id="persona-bulk-select-none" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer;">全不选</button>
                    <div id="persona-bulk-count" style="margin-left:auto; color:var(--app-text-muted); font-size:12px;"></div>
                </div>
            </div>

            <div id="persona-bulk-list" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px 12px;"></div>

            <div style="padding:12px; border-top:1px solid rgba(0,0,0,0.08); display:flex; gap:10px;">
                <button id="persona-bulk-cancel" style="flex:1; border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:12px; padding:12px; font-weight:700; cursor:pointer;">取消</button>
                <button id="persona-bulk-save" style="flex:2; border:none; background:#2563eb; color:var(--app-text-inverse); border-radius:12px; padding:12px; font-weight:900; cursor:pointer;">保存绑定</button>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const q = (sel) => panel.querySelector(sel);
        q('#persona-bulk-back')?.addEventListener('click', () => this.hideBulkModal());
        q('#persona-bulk-cancel')?.addEventListener('click', () => this.hideBulkModal());
        q('#persona-bulk-save')?.addEventListener('click', () => this.applyBulkModal());

        const searchEl = q('#persona-bulk-search');
        const clearEl = q('#persona-bulk-clear');
        const updateSearch = (val) => {
            if (!this.bulkState) return;
            this.bulkState.term = String(val || '');
            const has = this.bulkState.term.trim().length > 0;
            if (clearEl) clearEl.style.display = has ? 'block' : 'none';
            this.renderBulkList();
        };
        searchEl?.addEventListener('input', (e) => updateSearch(e.target.value));
        searchEl?.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                if (searchEl) searchEl.value = '';
                updateSearch('');
            }
        });
        clearEl?.addEventListener('click', () => {
            if (searchEl) searchEl.value = '';
            updateSearch('');
            searchEl?.focus?.();
        });
        q('#persona-bulk-select-all')?.addEventListener('click', () => this.bulkSelectAll(true));
        q('#persona-bulk-select-none')?.addEventListener('click', () => this.bulkSelectAll(false));

        this.bulkModal = { overlay, panel };
    }

    hideBulkModal() {
        if (!this.bulkModal) return;
        this.bulkModal.overlay.style.display = 'none';
        this.bulkState = null;
    }

    getBulkSessions() {
        const ids = new Set();
        try {
            (this.contactsStore?.listContacts?.() || []).forEach((c) => {
                if (c?.id) ids.add(String(c.id));
            });
        } catch {}
        try {
            (this.chatStore?.listSessions?.() || []).forEach((id) => ids.add(String(id)));
        } catch {}
        return [...ids].filter(Boolean);
    }

    openBulkModal(personaId) {
        if (!this.chatStore) {
            window.toastr?.warning?.('当前环境不支持会话绑定（缺少 chatStore）');
            return;
        }
        this.ensureBulkModal();
        const p = this.store.get(personaId);
        if (!p) return;

        // Ensure contacts include all sessions (best-effort)
        try { this.contactsStore?.ensureFromSessions?.(this.chatStore.listSessions?.() || [], { defaultAvatar: '' }); } catch {}

        const sessionIds = this.getBulkSessions();
        const bound = new Set();
        sessionIds.forEach((sid) => {
            const lock = this.chatStore.getPersonaLock?.(sid);
            if (lock && String(lock) === String(personaId)) bound.add(String(sid));
        });

        this.bulkState = {
            personaId: String(personaId),
            personaName: this.getCharacterCardName(p) || personaId,
            term: '',
            sessionIds,
            selected: new Set(bound),
        };

        const metaEl = this.bulkModal.panel.querySelector('#persona-bulk-meta');
        if (metaEl) metaEl.textContent = `角色卡：${this.bulkState.personaName}`;

        this.renderBulkList();
        this.bulkModal.overlay.style.display = 'block';
        this.bulkModal.panel.querySelector('#persona-bulk-search')?.focus?.();
    }

    bulkSelectAll(next) {
        if (!this.bulkState) return;
        const want = Boolean(next);
        if (want) this.bulkState.sessionIds.forEach((id) => this.bulkState.selected.add(String(id)));
        else this.bulkState.selected.clear();
        this.renderBulkList();
    }

    renderBulkList() {
        if (!this.bulkModal || !this.bulkState) return;
        const listEl = this.bulkModal.panel.querySelector('#persona-bulk-list');
        const countEl = this.bulkModal.panel.querySelector('#persona-bulk-count');
        if (!listEl) return;

        const term = String(this.bulkState.term || '').trim().toLowerCase();
        const items = this.bulkState.sessionIds
            .map((id) => {
                const c = this.contactsStore?.getContact?.(id) || null;
                const name = String(c?.name || id).trim();
                const avatar = String(c?.avatar || '').trim();
                const isGroup = Boolean(c?.isGroup) || String(id).startsWith('group:');
                return { id: String(id), name, avatar, isGroup };
            })
            .filter((it) => {
                if (!term) return true;
                const hay = `${it.name} ${it.id}`.toLowerCase();
                return hay.includes(term);
            })
            .sort((a, b) => {
                // Prefer groups first, then name
                const ga = a.isGroup ? 0 : 1;
                const gb = b.isGroup ? 0 : 1;
                if (ga !== gb) return ga - gb;
                return a.name.localeCompare(b.name);
            });

        listEl.innerHTML = '';
        if (!items.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:18px 10px; color:var(--app-text-muted); text-align:center;';
            empty.textContent = '未找到匹配的联系人/群组';
            listEl.appendChild(empty);
        } else {
            items.forEach((it) => {
                const checked = this.bulkState.selected.has(it.id);
                const row = document.createElement('div');
                row.style.cssText = `
                    display:flex; align-items:center; gap:10px;
                    padding:10px 10px;
                    border: 1px solid rgba(0,0,0,0.06);
                    border-radius: 12px;
                    margin-bottom: 8px;
                    background: ${checked ? 'rgba(37,99,235,0.06)' : 'var(--app-surface-card)'};
                `;
                const avatarUrl = it.avatar || getDefaultAppIcon();
                row.innerHTML = `
                    <input class="persona-bulk-check" type="checkbox" ${checked ? 'checked' : ''} style="width:18px; height:18px;">
                    <img src="${avatarUrl}" alt="" style="width:36px; height:36px; border-radius:12px; object-fit:cover; background:var(--app-surface-hover);">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:800; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            ${it.name}${it.isGroup ? ' · 群组' : ''}
                        </div>
                        <div style="color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${it.id}</div>
                    </div>
                `;
                const checkbox = row.querySelector('.persona-bulk-check');
                const toggle = () => {
                    const next = !this.bulkState.selected.has(it.id);
                    if (next) this.bulkState.selected.add(it.id);
                    else this.bulkState.selected.delete(it.id);
                    this.renderBulkList();
                };
                row.addEventListener('click', (e) => {
                    if (e.target === checkbox) return;
                    toggle();
                });
                checkbox?.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggle();
                });
                listEl.appendChild(row);
            });
        }
        if (countEl) countEl.textContent = `已选 ${this.bulkState.selected.size} / ${this.bulkState.sessionIds.length}`;
    }

    applyBulkModal() {
        if (!this.bulkState || !this.chatStore) return;
        const personaId = this.bulkState.personaId;
        const selected = this.bulkState.selected;
        const ids = this.bulkState.sessionIds;

        let changed = 0;
        ids.forEach((sid) => {
            const id = String(sid);
            const want = selected.has(id);
            const cur = String(this.chatStore.getPersonaLock?.(id) || '');
            if (want) {
                if (cur !== personaId) {
                    this.chatStore.setPersonaLock?.(id, personaId);
                    changed++;
                }
            } else {
                if (cur === personaId) {
                    this.chatStore.clearPersonaLock?.(id);
                    changed++;
                }
            }
        });

        window.toastr?.success?.(`已应用 ${changed} 项绑定变更`);
        this.hideBulkModal();
        this.renderList();
        if (this.onPersonaChanged) this.onPersonaChanged();
    }

    updateInjectionUi() {
        const posEl = this.panel?.querySelector?.('#edit-position');
        const wrap = this.panel?.querySelector?.('#edit-depth-wrap');
        if (!posEl || !wrap) return;
        const pos = Number(posEl.value);
        // SillyTavern: AT_DEPTH=4 shows depth/role controls
        wrap.style.display = (pos === 4) ? 'flex' : 'none';
    }

    getCurrentSessionId() {
        try {
            return this.getSessionId ? String(this.getSessionId() || '').trim() : '';
        } catch {
            return '';
        }
    }

    getSessionLockPersonaId(sessionId) {
        try {
            if (!this.chatStore || !sessionId) return '';
            const lockId = this.chatStore.getPersonaLock?.(sessionId);
            return lockId ? String(lockId) : '';
        } catch {
            return '';
        }
    }

    setSessionLockPersonaId(sessionId, personaId) {
        try {
            if (!this.chatStore || !sessionId) return false;
            const pid = String(personaId || '').trim();
            if (!pid) return false;
            this.chatStore.setPersonaLock?.(sessionId, pid);
            return true;
        } catch {
            return false;
        }
    }

    clearSessionLockPersonaId(sessionId) {
        try {
            if (!this.chatStore || !sessionId) return false;
            this.chatStore.clearPersonaLock?.(sessionId);
            return true;
        } catch {
            return false;
        }
    }

    renderSessionLockBar() {
        const bar = this.panel?.querySelector?.('#persona-session-lock-bar');
        if (!bar) return;
        const sessionId = this.getCurrentSessionId();
        if (!sessionId || !this.chatStore) {
            bar.style.display = 'none';
            bar.innerHTML = '';
            return;
        }
        const lockPersonaId = this.getSessionLockPersonaId(sessionId);
        const lockedPersona = lockPersonaId ? this.store.get(lockPersonaId) : null;
        const lockedName = this.getCharacterCardName(lockedPersona) || lockPersonaId || '';

        bar.style.display = 'block';
        bar.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:800; color:var(--app-text-primary); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">当前会话：${sessionId}</div>
                    <div style="color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${lockPersonaId ? `已锁定角色卡：${lockedName}` : '未锁定（使用全局角色卡）'}
                    </div>
                </div>
                ${lockPersonaId ? `<button id="persona-unlock-btn" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;">解除锁定</button>` : ''}
            </div>
        `;
        bar.querySelector('#persona-unlock-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearSessionLockPersonaId(sessionId);
            this.renderList();
            if (this.onPersonaChanged) this.onPersonaChanged();
        });
    }

    async show() {
        await this.store.ready;
        this.ensureUI();
        this.renderList();
        this.overlay.style.display = 'flex';
        // Center overlay
        this.overlay.style.justifyContent = 'center';
        this.overlay.style.alignItems = 'center';
    }

    hide() {
        closeCustomSelectMenu();
        if (this.overlay) this.overlay.style.display = 'none';
        this.closeEdit();
    }

    renderList() {
        this.renderSessionLockBar();
        const listEl = this.panel.querySelector('#persona-list-container');
        listEl.innerHTML = '';
        const personas = this.store.getAll();
        const activeId = this.store.activeId;
        const sessionId = this.getCurrentSessionId();
        const lockPersonaId = sessionId ? this.getSessionLockPersonaId(sessionId) : '';

        personas.forEach(p => {
            const item = document.createElement('div');
            item.style.cssText = `
                display: flex; align-items: center; gap: 10px; padding: 12px;
                border-bottom: 1px solid var(--app-border-subtle); cursor: pointer;
                background: ${p.id === activeId ? '#f0f9ff' : 'var(--app-surface-card)'};
                border-radius: 8px; margin-bottom: 5px;
                border: 1px solid ${p.id === activeId ? '#bae6fd' : 'transparent'};
            `;

            const avatarUrl = p.avatar || getDefaultAppIcon(); // Default user avatar
            const isLockedForSession = lockPersonaId && p.id === lockPersonaId;
            const cardName = this.getCharacterCardName(p);
            const subtitle = p.description || '未设置角色描述';

            item.innerHTML = `
                <div style="position: relative;">
                    <img src="${avatarUrl}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: var(--app-surface-hover);">
                    ${p.id === activeId ? '<div style="position: absolute; bottom: 0; right: 0; width: 14px; height: 14px; background: #007bff; border-radius: 50%; border: 2px solid var(--app-surface-card);"></div>' : ''}
                    ${isLockedForSession ? '<div title="此会话已锁定" style="position:absolute; top:-4px; right:-4px; width:18px; height:18px; background:#0f172a; color:var(--app-text-inverse); border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:11px; border:2px solid var(--app-surface-card);">🔒</div>' : ''}
                </div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: bold; color: var(--app-text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${cardName}</div>
                    <div style="font-size: 12px; color: var(--app-text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${subtitle}</div>
                </div>
                <button class="edit-btn" style="
                    padding: 8px; border: none; background: transparent; color: var(--app-text-muted); cursor: pointer;
                    font-size: 16px;
                ">✎</button>
            `;

            // Click item to switch
            item.addEventListener('click', async (e) => {
                // Ignore if clicked edit button
                if (e.target.closest('.edit-btn')) return;
                await this.store.setActive(p.id);
                this.renderList();
                if (this.onPersonaChanged) this.onPersonaChanged();
            });

            // Click edit button
            item.querySelector('.edit-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                this.openEdit(p.id);
            });

            listEl.appendChild(item);
        });
    }

    openEdit(id = null) {
        this.editingId = id;
        const view = this.panel.querySelector('#persona-edit-view');
        const nameInput = this.panel.querySelector('#edit-name');
        const descInput = this.panel.querySelector('#edit-desc');
        const posEl = this.panel.querySelector('#edit-position');
        const depthEl = this.panel.querySelector('#edit-depth');
        const roleEl = this.panel.querySelector('#edit-role');
        const posBtn = this.panel.querySelector('#edit-position-btn');
        const roleBtn = this.panel.querySelector('#edit-role-btn');
        const deleteBtn = this.panel.querySelector('#delete-persona-btn');
        const title = view.querySelector('span');

        if (id) {
            const p = this.store.get(id);
            if (!p) return;
            nameInput.value = this.getCharacterCardName(p);
            descInput.value = p.description || '';
            if (posEl) posEl.value = String(Number.isFinite(Number(p.position)) ? Number(p.position) : 0);
            if (depthEl) depthEl.value = String(Number.isFinite(Number(p.depth)) ? Math.max(0, Math.trunc(Number(p.depth))) : 2);
            if (roleEl) roleEl.value = String(Number.isFinite(Number(p.role)) ? Math.max(0, Math.min(2, Math.trunc(Number(p.role)))) : 0);
            this.updateAvatarPreview(p.avatar);
            deleteBtn.style.display = 'block';
            title.textContent = '编辑角色卡';
            
            // Disable delete if it's the only one
            if (this.store.getAll().length <= 1) {
                deleteBtn.style.display = 'none';
            }
        } else {
            nameInput.value = '新角色卡';
            descInput.value = '';
            if (posEl) posEl.value = '0';
            if (depthEl) depthEl.value = '2';
            if (roleEl) roleEl.value = '0';
            this.updateAvatarPreview('');
            deleteBtn.style.display = 'none';
            title.textContent = '新建角色卡';
        }

        refreshCustomSelectButton(posBtn, posEl, '插入位置');
        refreshCustomSelectButton(roleBtn, roleEl, '注入角色');
        this.updateInjectionUi();

        view.style.display = 'flex';
        // Animation
        view.style.opacity = '0';
        view.style.transform = 'translateY(20px)';
        requestAnimationFrame(() => {
            view.style.transition = 'all 0.2s ease-out';
            view.style.opacity = '1';
            view.style.transform = 'translateY(0)';
        });
    }

    closeEdit() {
        closeCustomSelectMenu();
        const view = this.panel.querySelector('#persona-edit-view');
        view.style.display = 'none';
        this.editingId = null;
    }

    updateAvatarPreview(url) {
        const div = this.panel.querySelector('#edit-avatar-preview');
        // If no URL, use default image for preview context
        const safeUrl = url || getDefaultAppIcon();
        div.style.backgroundImage = `url("${safeUrl}")`;
        div.dataset.url = url || '';
    }

    async changeAvatar() {
        // Use MediaPicker to pick image
        const useFile = await appConfirm({
            title: '头像来源',
            message: '使用本地图片文件吗？',
            confirmText: '本地文件',
            cancelText: '使用 URL',
        });
        if (useFile) {
            await this.mediaPicker.pickFile('image');
        } else {
            await this.mediaPicker.pickUrl('请输入头像地址', getDefaultAppIcon());
        }
    }

    async handleCardImport() {
        const file = this.importInput?.files?.[0];
        if (!file) return;
        try {
            await this.cardImporter.importFromFile(file);
            this.renderList();
            this.hideImportModal();
        } catch (err) {
            const msg = err?.message || '导入失败';
            window.toastr?.error?.(msg);
        }
    }

    async handleCardImportUrl() {
        const url = String(this.importUrlInput?.value || '').trim();
        if (!url) return;
        if (this.importUrlBtn) {
            this.importUrlBtn.disabled = true;
            this.importUrlBtn.textContent = '导入中...';
        }
        try {
            await this.cardImporter.importFromUrl(url);
            this.renderList();
            this.hideImportModal();
        } catch (err) {
            const msg = err?.message || '链接导入失败';
            window.toastr?.error?.(msg);
        } finally {
            if (this.importUrlBtn) {
                this.importUrlBtn.disabled = false;
                this.importUrlBtn.textContent = '导入链接';
            }
        }
    }

    async saveEdit() {
        const name = this.panel.querySelector('#edit-name').value.trim();
        const description = this.panel.querySelector('#edit-desc').value;
        const avatar = this.panel.querySelector('#edit-avatar-preview').dataset.url || '';
        const position = Number(this.panel.querySelector('#edit-position')?.value ?? 0);
        const depth = Math.max(0, Math.trunc(Number(this.panel.querySelector('#edit-depth')?.value ?? 2) || 0));
        const role = Math.max(0, Math.min(2, Math.trunc(Number(this.panel.querySelector('#edit-role')?.value ?? 0) || 0)));

        if (!name) {
            alert('请输入角色卡名称');
            return;
        }

        const applySourcePatch = (existing = null) => {
            const source = { ...getCharacterCardSource(existing) };
            if (getCharacterCardDisplayName(existing, '') || source.type === 'character_card') {
                source.characterName = name;
            }
            return Object.keys(source).length ? source : null;
        };

        if (this.editingId) {
            const current = this.store.get(this.editingId);
            await this.store.update(this.editingId, { name, description, avatar, position, depth, role, source: applySourcePatch(current) });
        } else {
            const newP = await this.store.create({ name, description, avatar, position, depth, role, source: applySourcePatch(null) });
            this.store.setActive(newP.id); // Auto switch to new
        }

        this.closeEdit();
        this.renderList();
        if (this.onPersonaChanged) this.onPersonaChanged();
    }

    async deleteCurrent() {
        if (!this.editingId) return;
        const deleteId = String(this.editingId || '').trim();
        const persona = this.store.get(deleteId);
        const options = await this.promptDeleteOptions(persona);
        if (!options?.confirm) return;

        const success = await this.store.delete(deleteId);
        if (success) {
            try {
                await this.onPersonaChanged?.();
            } catch {}
            try {
                await deletePersonaCard(window.appBridge, deleteId);
            } catch {}
            try {
                await this.cleanupPersonaBindings(persona, options);
            } catch {}
            try {
                await this.cleanupPersonaData(persona, { remainingPersonas: this.store.getAll?.() || [] });
            } catch {}
            this.closeEdit();
            this.renderList();
        } else {
            alert('无法删除（至少保留一个角色卡）');
        }
    }

    async promptDeleteOptions(persona) {
        const source = (persona && typeof persona === 'object' && persona.source && typeof persona.source === 'object')
            ? persona.source
            : {};
        const worldId = String(source.worldbookId || '').trim();
        const regexSetId = String(source.regexSetId || '').trim();
        const scriptStore = await waitForScriptStoreReady(window.appBridge);
        let scriptCount = 0;
        try {
            if (scriptStore?.getScripts) {
                scriptCount = (scriptStore.getScripts('character', persona?.id || '') || []).length;
            }
        } catch {}
        const hasWorld = Boolean(worldId);
        const hasRegex = Boolean(regexSetId);
        const hasScripts = scriptCount > 0;
        const preciseScopeCleanup = appSettings.get().personaBindContacts !== false;

        if (!hasWorld && !hasRegex && !hasScripts && preciseScopeCleanup) {
            const ok = await appConfirm({ title: '删除角色卡', message: '确定要删除此角色卡吗？', danger: true });
            return { confirm: ok, deleteWorld: false, deleteRegex: false, deleteScripts: false };
        }

        const worldLabel = hasWorld ? worldId : '';
        let regexLabel = hasRegex ? regexSetId : '';
        try {
            await waitForRegexStoreReady(window.appBridge);
            const set = getRegexLocalSet(window.appBridge, regexSetId);
            if (set?.name) regexLabel = set.name;
        } catch {}
        let worldName = worldLabel;
        try {
            const data = await window.appBridge?.getWorldInfo?.(worldId);
            if (data?.name) worldName = data.name;
        } catch {}
        const sharedCleanupNote = preciseScopeCleanup ? '' : `
            <div style="margin-top:12px; padding:10px 12px; border-radius:10px; background:#fff7ed; color:#9a3412; font-size:12px; line-height:1.5;">
                当前联系人未按角色隔离。本次会清理角色卡文件、绑定资源、该角色的 RP 会话，以及可识别的旧残留 scope；不会删除共享聊天或共享联系人数据。
            </div>
        `;

        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.className = 'app-confirm-overlay';
            overlay.style.display = 'block';
            overlay.addEventListener('click', () => cleanup(false));

            const modal = document.createElement('div');
            modal.className = 'app-confirm-modal is-danger';
            modal.style.display = 'block';
            modal.innerHTML = `
                <div class="app-confirm-header">
                    <div class="app-confirm-title">删除角色卡</div>
                    <button type="button" class="app-confirm-close" aria-label="关闭">×</button>
                </div>
                <div class="app-confirm-body" style="text-align:left;">
                    <div style="margin-bottom:10px;">确定要删除此角色卡吗？</div>
                    <div style="display:flex; flex-direction:column; gap:8px; font-size:13px;">
                        ${hasWorld ? `
                            <label style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="persona-del-world" checked>
                                <span>删除绑定世界书（${worldName}）</span>
                            </label>
                        ` : ''}
                        ${hasRegex ? `
                            <label style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="persona-del-regex" checked>
                                <span>删除绑定正则（${regexLabel}）</span>
                            </label>
                        ` : ''}
                        ${hasScripts ? `
                            <label style="display:flex; align-items:center; gap:8px;">
                                <input type="checkbox" id="persona-del-scripts" checked>
                                <span>删除绑定脚本（${scriptCount} 条）</span>
                            </label>
                        ` : ''}
                    </div>
                    ${sharedCleanupNote}
                </div>
                <div class="app-confirm-actions">
                    <button type="button" class="app-confirm-btn app-confirm-cancel">取消</button>
                    <button type="button" class="app-confirm-btn app-confirm-ok" data-variant="danger">删除</button>
                </div>
            `;
            modal.addEventListener('click', (event) => event.stopPropagation());

            const closeBtn = modal.querySelector('.app-confirm-close');
            const cancelBtn = modal.querySelector('.app-confirm-cancel');
            const okBtn = modal.querySelector('.app-confirm-ok');
            const worldBox = modal.querySelector('#persona-del-world');
            const regexBox = modal.querySelector('#persona-del-regex');
            const scriptBox = modal.querySelector('#persona-del-scripts');
            if (worldBox) worldBox.checked = true;
            if (regexBox) regexBox.checked = true;
            if (scriptBox) scriptBox.checked = true;

            const cleanup = (confirm) => {
                overlay.remove();
                modal.remove();
                resolve({
                    confirm,
                    deleteWorld: confirm && hasWorld ? Boolean(worldBox?.checked) : false,
                    deleteRegex: confirm && hasRegex ? Boolean(regexBox?.checked) : false,
                    deleteScripts: confirm && hasScripts ? Boolean(scriptBox?.checked) : false,
                });
            };

            closeBtn?.addEventListener('click', () => cleanup(false));
            cancelBtn?.addEventListener('click', () => cleanup(false));
            okBtn?.addEventListener('click', () => cleanup(true));

            document.body.appendChild(overlay);
            document.body.appendChild(modal);
            requestAnimationFrame(() => okBtn?.focus());
        });
    }

    cleanupScopedLocalStorage(scopes = []) {
        const scopeList = Array.isArray(scopes)
            ? scopes.map(scope => String(scope || '').trim()).filter(Boolean)
            : [];
        if (!scopeList.length) return;
        const scopedKeys = [
            'contacts_store_v1',
            'contact_groups_v1',
            'chat_store_v1',
            'moments_store_v1',
            'moment_summary_store_v1',
            'rp_session_v1',
            'world_session_map_v1',
            'global_world_id_v1',
            'world_global_settings_v1',
        ];
        try {
            scopeList.forEach((scope) => {
                scopedKeys.forEach((base) => {
                    localStorage.removeItem(`${base}__${scope}`);
                });
            });
        } catch {}
    }

    collectScopedLocalStorageCandidates(keepPersonaIds = [], explicitDeleteIds = []) {
        const scopedKeys = [
            'contacts_store_v1',
            'contact_groups_v1',
            'chat_store_v1',
            'moments_store_v1',
            'moment_summary_store_v1',
            'rp_session_v1',
            'world_session_map_v1',
            'global_world_id_v1',
            'world_global_settings_v1',
        ];
        const keepSet = new Set(
            (Array.isArray(keepPersonaIds) ? keepPersonaIds : [])
                .map(id => String(id || '').trim())
                .filter(Boolean),
        );
        const explicitSet = new Set(
            (Array.isArray(explicitDeleteIds) ? explicitDeleteIds : [])
                .map(id => String(id || '').trim())
                .filter(Boolean),
        );
        const scopes = new Set();
        try {
            for (let i = 0; i < localStorage.length; i += 1) {
                const key = String(localStorage.key(i) || '').trim();
                if (!key) continue;
                scopedKeys.forEach((base) => {
                    const prefix = `${base}__`;
                    if (!key.startsWith(prefix)) return;
                    const scope = String(key.slice(prefix.length) || '').trim();
                    if (!scope || keepSet.has(scope)) return;
                    if (explicitSet.has(scope) || scope.startsWith('persona_')) {
                        scopes.add(scope);
                    }
                });
            }
        } catch {}
        return Array.from(scopes);
    }

    async cleanupPersonaData(persona, { remainingPersonas = [] } = {}) {
        const personaId = String(persona?.id || '').trim();
        if (!personaId) return;

        this.cleanupSharedPersonaArtifacts(personaId);

        const keepPersonaIds = (Array.isArray(remainingPersonas) ? remainingPersonas : [])
            .map(item => String(item?.id || '').trim())
            .filter(Boolean);
        let deletedScopes = [];
        try {
            const result = await cleanupPersonaScopedData(window.appBridge, keepPersonaIds, [personaId]);
            deletedScopes = Array.isArray(result?.deletedScopes)
                ? result.deletedScopes.map(scope => String(scope || '').trim()).filter(Boolean)
                : [];
        } catch {}

        const localOnlyScopes = this.collectScopedLocalStorageCandidates(keepPersonaIds, [personaId]);
        if (localOnlyScopes.length) {
            deletedScopes = Array.from(new Set([...(deletedScopes || []), ...localOnlyScopes]));
        }

        if (!deletedScopes.length && personaId.startsWith('persona_')) {
            deletedScopes = [personaId];
        }
        this.cleanupScopedLocalStorage(deletedScopes);
    }

    cleanupSharedPersonaArtifacts(personaId) {
        const pid = String(personaId || '').trim();
        if (!pid) return;
        const rpSessionId = `rp:${pid}`;
        try {
            this.chatStore?.delete?.(rpSessionId);
        } catch {}
        try {
            const sessionIds = this.chatStore?.listSessions?.() || [];
            sessionIds.forEach((sessionId) => {
                const lockId = String(this.chatStore?.getPersonaLock?.(sessionId) || '').trim();
                if (lockId === pid) {
                    this.chatStore?.clearPersonaLock?.(sessionId);
                }
            });
        } catch {}
        try {
            deleteWorldSessionMapEntry(window.appBridge, rpSessionId);
        } catch {}
    }

    async cleanupPersonaBindings(persona, options) {
        if (!persona || typeof persona !== 'object' || !options) return;
        const source = (persona.source && typeof persona.source === 'object') ? persona.source : {};
        const worldId = String(source.worldbookId || '').trim();
        const regexSetId = String(source.regexSetId || '').trim();
        if (options.deleteWorld && worldId) {
            try {
                await window.appBridge?.deleteWorldInfo?.(worldId);
            } catch {}
        }
        if (options.deleteRegex && regexSetId) {
            try {
                await waitForRegexStoreReady(window.appBridge);
                await removeRegexLocalSet(window.appBridge, regexSetId);
            } catch {}
        }
        if (options.deleteScripts) {
            try {
                const scriptStore = await waitForScriptStoreReady(window.appBridge);
                await scriptStore?.setScripts?.('character', persona.id, []);
            } catch {}
        }
    }
}
