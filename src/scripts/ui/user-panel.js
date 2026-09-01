import { MediaPicker } from './media-picker.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { appConfirm } from './app-confirm.js';
import { bindBackdropActivation } from './backdrop-activation-utils.js';
import { getCharacterCardBoundUserId, getCharacterCardDisplayName, getCharacterCardSource } from '../utils/character-card-display.js';
import { getDefaultAppIcon } from '../utils/default-icon.js';
import { bindCustomSelectButton, closeCustomSelectMenu, refreshCustomSelectButton } from './custom-select.js';
import { translateUiText } from '../i18n/index.js';

const DEFAULT_USER_BUBBLE_COLOR = '#E8F0FE';
const DEFAULT_USER_TEXT_COLOR = '#1F2937'; // theme-audit-ignore: light-mode default token
const DEFAULT_DARK_USER_BUBBLE_COLOR = '#2F3C52';
const DEFAULT_DARK_USER_TEXT_COLOR = '#F8FAFC';
const USER_BUBBLE_COLOR_SWATCHES = ['#2F3C52', '#214B4A', '#4A344F', '#475569', '#c9c9c9', '#f59e0b', '#dc2626', '#2563eb', '#10b981']; // theme-audit-ignore: curated swatch palette
const USER_TEXT_COLOR_SWATCHES = ['#ffffff', '#111827', '#4b5563', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#b45309', '#db2777']; // theme-audit-ignore: curated swatch palette

const normalizeHexColor = (value, fallback = DEFAULT_USER_BUBBLE_COLOR) => {
    const raw = String(value || '').trim();
    return /^#[0-9A-F]{6}$/i.test(raw) ? raw : fallback;
};

const isDarkThemeMode = () => String(document?.body?.dataset?.themeMode || '').trim().toLowerCase() === 'dark';

const isLegacyUserDefaultColor = (value, kind = 'bubble') => {
    const raw = String(value || '').trim().toLowerCase();
    return kind === 'text'
        ? raw === DEFAULT_USER_TEXT_COLOR.toLowerCase()
        : raw === DEFAULT_USER_BUBBLE_COLOR.toLowerCase();
};

const getThemeAwareUserDefaults = () => (
    isDarkThemeMode()
        ? {
            bubbleColor: DEFAULT_DARK_USER_BUBBLE_COLOR,
            textColor: DEFAULT_DARK_USER_TEXT_COLOR,
        }
        : {
            bubbleColor: DEFAULT_USER_BUBBLE_COLOR,
            textColor: DEFAULT_USER_TEXT_COLOR,
        }
);

const getEffectiveUserBubbleColor = (value) => {
    const defaults = getThemeAwareUserDefaults();
    const raw = String(value || '').trim();
    if (isDarkThemeMode() && isLegacyUserDefaultColor(raw, 'bubble')) return defaults.bubbleColor;
    return normalizeHexColor(raw, defaults.bubbleColor);
};

const getEffectiveUserTextColor = (value) => {
    const defaults = getThemeAwareUserDefaults();
    const raw = String(value || '').trim();
    if (!raw) return defaults.textColor;
    if (isDarkThemeMode() && isLegacyUserDefaultColor(raw, 'text')) return defaults.textColor;
    return normalizeHexColor(raw, defaults.textColor);
};

const escapeHtml = (value = '') => String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export class UserPanel {
    constructor({ userStore, personaStore = null, onUserChanged } = {}) {
        this.store = userStore;
        this.personaStore = personaStore;
        this.onUserChanged = onUserChanged;
        this.overlay = null;
        this.panel = null;
        this.editingId = null;
        this.bindingModal = null;
        this.bindingState = null;
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
            },
        });
    }

    ensureUI() {
        if (this.overlay) return;

        this.overlay = document.createElement('div');
        this.overlay.className = 'panel-overlay app-themed-overlay user-panel-overlay';
        this.overlay.style.cssText = `
            display:none;
            position:fixed;
            inset:0;
            z-index:21020;
            background:rgba(0,0,0,0.38);
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing:border-box;
            justify-content:center;
            align-items:center;
        `;
        bindBackdropActivation(this.overlay, {
            onActivate: () => this.hide(),
        });

        this.panel = document.createElement('div');
        this.panel.className = 'panel-content app-themed-panel user-panel-shell';
        this.panel.style.cssText = `
            position:relative;
            display:flex;
            flex-direction:column;
            width:min(94vw, 420px);
            height:min(82vh, 640px);
            max-height:calc(100% - 8px);
            background:var(--app-surface-card);
            border-radius:12px;
            overflow:hidden;
            box-shadow:0 8px 32px rgba(0,0,0,0.2);
        `;

        this.panel.innerHTML = `
            <div class="panel-header" style="padding:15px; border-bottom:1px solid var(--app-border-subtle); display:flex; justify-content:space-between; align-items:center; background:var(--app-surface-subtle);">
                <span style="font-weight:bold; font-size:16px;">👤 用户管理</span>
                <button class="close-btn" style="border:none; background:transparent; font-size:20px; cursor:pointer; color:var(--app-text-secondary);">×</button>
            </div>
            <div id="user-list-container" style="flex:1; overflow-y:auto; padding:10px;"></div>
            <div class="panel-footer" style="padding:15px; border-top:1px solid var(--app-border-subtle); background:var(--app-surface-card); text-align:center;">
                <button id="create-user-btn" data-maid-guide-target="create-user" style="
                    width:100%;
                    background:#007bff;
                    color:var(--app-text-inverse);
                    border:none;
                    padding:10px 16px;
                    border-radius:18px;
                    font-size:13px;
                    cursor:pointer;
                    box-shadow:0 2px 5px rgba(0,123,255,0.3);
                ">+ 新建用户</button>
            </div>
            <div id="user-edit-view" style="
                display:none;
                position:absolute;
                top:0;
                left:0;
                width:100%;
                height:100%;
                background:var(--app-surface-card);
                z-index:10;
                flex-direction:column;
            ">
                <div style="padding:12px 12px; border-bottom:1px solid var(--app-border-subtle); display:flex; align-items:center; gap:8px; background:var(--app-surface-subtle);">
                    <button id="edit-back-btn" aria-label="返回" style="
                        width:44px;
                        height:44px;
                        border:none;
                        background:transparent;
                        font-size:22px;
                        cursor:pointer;
                        display:flex;
                        align-items:center;
                        justify-content:center;
                        border-radius:12px;
                    ">←</button>
                    <span style="font-weight:bold; font-size:16px;">编辑用户</span>
                </div>
                <div style="flex:1; overflow-y:auto; padding:20px;">
                    <div style="text-align:center; margin-bottom:20px;">
                        <div id="edit-avatar-preview" style="
                            width:80px;
                            height:80px;
                            border-radius:50%;
                            background-color:var(--app-surface-hover);
                            margin:0 auto 10px;
                            background-size:cover;
                            background-position:center;
                            border:2px solid var(--app-surface-card);
                            box-shadow:0 2px 8px rgba(0,0,0,0.1);
                            cursor:pointer;
                        "></div>
                        <button id="edit-avatar-btn" style="font-size:12px; padding:4px 10px; background:var(--app-surface-hover); border:none; border-radius:10px; color:var(--app-text-primary);">更换头像</button>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:12px; color:var(--app-text-secondary); margin-bottom:5px;">名称 ({{user}})</label>
                        <input type="text" id="edit-name" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:8px; box-sizing:border-box;">
                    </div>
                    <div style="margin-bottom:15px;">
                        <label style="display:block; font-size:12px; color:var(--app-text-secondary); margin-bottom:5px;">用户气泡颜色</label>
                        <div class="chat-setting-color-field">
                            <div class="chat-setting-color-inputs" style="display:flex; align-items:center; gap:10px;">
                                <input type="text" id="edit-bubble-color-input" value="${DEFAULT_USER_BUBBLE_COLOR}" style="flex:1; padding:10px; border:1px solid var(--app-border-default); border-radius:8px; box-sizing:border-box;">
                                <button type="button" id="edit-bubble-color" class="color-picker" aria-label="用户气泡颜色快速切换"></button>
                            </div>
                            <div id="edit-bubble-color-swatches" class="chat-setting-color-swatches" aria-label="用户气泡颜色快速切换"></div>
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label class="has-help" data-help="仅影响“我”的气泡字体颜色" style="display:block; font-size:12px; color:var(--app-text-secondary); margin-bottom:5px;">用户字体颜色</label>
                        <div class="chat-setting-color-field">
                            <div class="chat-setting-color-inputs" style="display:flex; align-items:center; gap:10px;">
                                <input type="text" id="edit-text-color-input" value="${DEFAULT_USER_TEXT_COLOR}" style="flex:1; padding:10px; border:1px solid var(--app-border-default); border-radius:8px; box-sizing:border-box;">
                                <button type="button" id="edit-text-color" class="color-picker" aria-label="用户字体颜色快速切换"></button>
                            </div>
                            <div id="edit-text-color-swatches" class="chat-setting-color-swatches" aria-label="用户字体颜色快速切换"></div>
                        </div>
                    </div>
                    <div style="margin-bottom:15px;">
                        <label class="has-help" data-help="注入到 System Prompt 或 Character Card 中" style="display:block; font-size:12px; color:var(--app-text-secondary); margin-bottom:5px;">
                            用户人设 ({{persona}})
                        </label>
                        <textarea id="edit-desc" style="
                            width:100%;
                            height:120px;
                            padding:10px;
                            border:1px solid var(--app-border-default);
                            border-radius:8px;
                            resize:none;
                            box-sizing:border-box;
                            font-family:inherit;
                        " placeholder="例如：我是一个富有冒险精神的旅行者..."></textarea>
                    </div>
                    <div style="margin-bottom:15px; padding:12px; border:1px solid rgba(0,0,0,0.06); border-radius:10px; background:rgba(248,250,252,0.8);">
                        <div style="font-size:12px; font-weight:700; color:var(--app-text-secondary); margin-bottom:8px;">注入设置（参考 SillyTavern）</div>
                        <div style="margin-bottom:10px;">
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
                    </div>
                    <button id="delete-user-btn" style="width:100%; padding:12px; background:#fee2e2; color:#dc2626; border:none; border-radius:8px; margin-top:20px; cursor:pointer;">删除此用户</button>
                </div>
                <div style="padding:15px; border-top:1px solid var(--app-border-subtle); background:var(--app-surface-card);">
                    <button id="save-user-btn" style="width:100%; padding:12px; background:#007bff; color:var(--app-text-inverse); border:none; border-radius:8px; font-weight:bold; cursor:pointer;">保存</button>
                </div>
            </div>
        `;

        this.overlay.appendChild(this.panel);
        document.body.appendChild(this.overlay);

        this.panel.querySelector('.close-btn')?.addEventListener('click', () => this.hide());
        this.panel.querySelector('#create-user-btn')?.addEventListener('click', () => this.openEdit());
        this.panel.querySelector('#edit-back-btn')?.addEventListener('click', () => this.closeEdit());
        this.panel.querySelector('#edit-avatar-preview')?.addEventListener('click', () => this.changeAvatar());
        this.panel.querySelector('#edit-avatar-btn')?.addEventListener('click', () => this.changeAvatar());
        this.panel.querySelector('#save-user-btn')?.addEventListener('click', () => this.saveEdit());
        this.panel.querySelector('#delete-user-btn')?.addEventListener('click', () => this.deleteCurrent());
        this.panel.querySelector('#edit-position')?.addEventListener('change', () => this.updateInjectionUi());
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

        const bubbleInput = this.panel.querySelector('#edit-bubble-color-input');
        const bubblePicker = this.panel.querySelector('#edit-bubble-color');
        const textInput = this.panel.querySelector('#edit-text-color-input');
        const textPicker = this.panel.querySelector('#edit-text-color');
        this.renderBubbleColorSwatches();
        this.renderTextColorSwatches();
        bubblePicker?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleBubbleColorSwatches();
        });
        textPicker?.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            this.toggleTextColorSwatches();
        });
        bubbleInput?.addEventListener('input', (event) => {
            this.setBubbleColorValue(String(event.target?.value || '').trim());
        });
        textInput?.addEventListener('input', (event) => {
            this.setTextColorValue(String(event.target?.value || '').trim());
        });
        this.panel.addEventListener('click', (event) => {
            if (!event.target.closest('#edit-bubble-color') && !event.target.closest('#edit-bubble-color-swatches')) {
                this.closeBubbleColorSwatches();
            }
            if (!event.target.closest('#edit-text-color') && !event.target.closest('#edit-text-color-swatches')) {
                this.closeTextColorSwatches();
            }
        });
    }

    setBubbleColorValue(value) {
        const color = normalizeHexColor(value);
        const bubbleInput = this.panel?.querySelector?.('#edit-bubble-color-input');
        const bubblePicker = this.panel?.querySelector?.('#edit-bubble-color');
        if (bubbleInput) bubbleInput.value = color;
        if (bubblePicker) {
            bubblePicker.dataset.color = color;
            bubblePicker.style.setProperty('--color-picker-bg', color);
        }
        this.panel?.querySelectorAll?.('#edit-bubble-color-swatches .chat-setting-color-swatch')?.forEach?.((btn) => {
            btn.classList.toggle('is-active', String(btn.dataset.color || '').toLowerCase() === color.toLowerCase());
        });
        return color;
    }

    closeBubbleColorSwatches() {
        this.panel?.querySelector?.('#edit-bubble-color-swatches')?.classList?.remove('is-open');
    }

    toggleBubbleColorSwatches(force = null) {
        const container = this.panel?.querySelector?.('#edit-bubble-color-swatches');
        if (!container) return;
        const willOpen = force == null ? !container.classList.contains('is-open') : Boolean(force);
        this.closeTextColorSwatches();
        container.classList.toggle('is-open', willOpen);
    }

    renderBubbleColorSwatches() {
        const container = this.panel?.querySelector?.('#edit-bubble-color-swatches');
        if (!container) return;
        container.innerHTML = '';
        USER_BUBBLE_COLOR_SWATCHES.forEach((color) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chat-setting-color-swatch';
            btn.dataset.color = color;
            btn.title = color;
            btn.setAttribute('aria-label', `用户气泡颜色 ${color}`);
            btn.style.setProperty('--chat-swatch-bg', color);
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.setBubbleColorValue(color);
                this.closeBubbleColorSwatches();
            });
            container.appendChild(btn);
        });
        this.setBubbleColorValue(this.panel?.querySelector?.('#edit-bubble-color-input')?.value || DEFAULT_USER_BUBBLE_COLOR);
    }

    setTextColorValue(value) {
        const color = normalizeHexColor(value, getThemeAwareUserDefaults().textColor);
        const textInput = this.panel?.querySelector?.('#edit-text-color-input');
        const textPicker = this.panel?.querySelector?.('#edit-text-color');
        if (textInput) textInput.value = color;
        if (textPicker) {
            textPicker.dataset.color = color;
            textPicker.style.setProperty('--color-picker-bg', color);
        }
        this.panel?.querySelectorAll?.('#edit-text-color-swatches .chat-setting-color-swatch')?.forEach?.((btn) => {
            btn.classList.toggle('is-active', String(btn.dataset.color || '').toLowerCase() === color.toLowerCase());
        });
        return color;
    }

    closeTextColorSwatches() {
        this.panel?.querySelector?.('#edit-text-color-swatches')?.classList?.remove('is-open');
    }

    toggleTextColorSwatches(force = null) {
        const container = this.panel?.querySelector?.('#edit-text-color-swatches');
        if (!container) return;
        const willOpen = force == null ? !container.classList.contains('is-open') : Boolean(force);
        this.closeBubbleColorSwatches();
        container.classList.toggle('is-open', willOpen);
    }

    renderTextColorSwatches() {
        const container = this.panel?.querySelector?.('#edit-text-color-swatches');
        if (!container) return;
        container.innerHTML = '';
        USER_TEXT_COLOR_SWATCHES.forEach((color) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chat-setting-color-swatch';
            btn.dataset.color = color;
            btn.title = color;
            btn.setAttribute('aria-label', `用户字体颜色 ${color}`);
            btn.style.setProperty('--chat-swatch-bg', color);
            btn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                this.setTextColorValue(color);
                this.closeTextColorSwatches();
            });
            container.appendChild(btn);
        });
        this.setTextColorValue(this.panel?.querySelector?.('#edit-text-color-input')?.value || getThemeAwareUserDefaults().textColor);
    }

    updateInjectionUi() {
        const posEl = this.panel?.querySelector?.('#edit-position');
        const wrap = this.panel?.querySelector?.('#edit-depth-wrap');
        if (!posEl || !wrap) return;
        wrap.style.display = Number(posEl.value) === 4 ? 'flex' : 'none';
    }

    updateAvatarPreview(url) {
        const div = this.panel?.querySelector?.('#edit-avatar-preview');
        if (!div) return;
        const safeUrl = url || getDefaultAppIcon();
        div.style.backgroundImage = `url("${safeUrl}")`;
        div.dataset.url = url || '';
    }

    async changeAvatar() {
        const useFile = await appConfirm({
            title: '头像来源',
            message: '使用本地图片文件吗？',
            confirmText: '本地文件',
            cancelText: '使用 URL',
        });
        if (useFile) {
            await this.mediaPicker.pickFile('image');
            return;
        }
        await this.mediaPicker.pickUrl('请输入头像地址', getDefaultAppIcon());
    }

    async show() {
        await this.store.ready;
        try {
            await this.personaStore?.ready;
        } catch {}
        this.ensureUI();
        this.renderList();
        this.overlay.style.display = 'flex';
    }

    hide() {
        closeCustomSelectMenu();
        if (this.overlay) this.overlay.style.display = 'none';
        this.closeEdit();
    }

    getCharacterCards() {
        return Array.isArray(this.personaStore?.getAll?.()) ? this.personaStore.getAll() : [];
    }

    getBoundCharacterCards(userId = '') {
        const uid = String(userId || '').trim();
        if (!uid) return [];
        return this.getCharacterCards().filter(card => getCharacterCardBoundUserId(card) === uid);
    }

    getBoundCharacterSummary(userId = '') {
        const cards = this.getBoundCharacterCards(userId);
        if (!cards.length) return '未绑定角色卡';
        const names = cards.slice(0, 2).map(card => getCharacterCardDisplayName(card, '角色卡'));
        const label = names.join('、');
        return cards.length > 2 ? `绑定角色卡：${label} 等 ${cards.length} 张` : `绑定角色卡：${label}`;
    }

    ensureBindingModal() {
        if (this.bindingModal) return;
        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay user-binding-overlay';
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.38);
            z-index: 22050;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing: border-box;
        `;
        bindBackdropActivation(overlay, {
            onActivate: () => this.hideBindingModal(),
        });

        const panel = document.createElement('div');
        panel.className = 'app-themed-panel user-binding-panel';
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
                <button id="user-binding-back" style="width:44px; height:44px; border:none; background:transparent; border-radius:12px; font-size:22px; display:flex; align-items:center; justify-content:center; cursor:pointer;">←</button>
                <div style="font-weight:900;">绑定角色卡</div>
                <div id="user-binding-meta" style="margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            </div>

            <div style="padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06);">
                <div id="user-binding-search-box" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:1px solid rgba(0,0,0,0.10); border-radius:14px; background:var(--app-surface-card);">
                    <input id="user-binding-search" type="text" placeholder="搜索角色卡..." style="flex:1; border:none; outline:none; font-size:14px; background:transparent;">
                    <button id="user-binding-clear" type="button" aria-label="清除搜索" style="display:none; width:32px; height:32px; border:none; border-radius:10px; background:var(--app-surface-hover); cursor:pointer;">×</button>
                </div>
                <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
                    <button id="user-binding-select-all" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer;">全选</button>
                    <button id="user-binding-select-none" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer;">全不选</button>
                    <div id="user-binding-count" style="margin-left:auto; color:var(--app-text-muted); font-size:12px;"></div>
                </div>
            </div>

            <div id="user-binding-list" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px 12px;"></div>

            <div style="padding:12px; border-top:1px solid rgba(0,0,0,0.08); display:flex; gap:10px;">
                <button id="user-binding-cancel" style="flex:1; border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:12px; padding:12px; font-weight:700; cursor:pointer;">取消</button>
                <button id="user-binding-save" style="flex:2; border:none; background:#2563eb; color:var(--app-text-inverse); border-radius:12px; padding:12px; font-weight:900; cursor:pointer;">保存绑定</button>
            </div>
        `;
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const q = (sel) => panel.querySelector(sel);
        q('#user-binding-back')?.addEventListener('click', () => this.hideBindingModal());
        q('#user-binding-cancel')?.addEventListener('click', () => this.hideBindingModal());
        q('#user-binding-save')?.addEventListener('click', () => this.applyBindingModal());

        const searchEl = q('#user-binding-search');
        const clearEl = q('#user-binding-clear');
        const updateSearch = (val) => {
            if (!this.bindingState) return;
            this.bindingState.term = String(val || '');
            const has = this.bindingState.term.trim().length > 0;
            if (clearEl) clearEl.style.display = has ? 'block' : 'none';
            this.renderBindingList();
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
        q('#user-binding-select-all')?.addEventListener('click', () => this.toggleBindingSelection(true));
        q('#user-binding-select-none')?.addEventListener('click', () => this.toggleBindingSelection(false));

        this.bindingModal = { overlay, panel };
    }

    hideBindingModal() {
        if (!this.bindingModal) return;
        this.bindingModal.overlay.style.display = 'none';
        this.bindingState = null;
    }

    openBindingModal(userId) {
        const uid = String(userId || '').trim();
        const user = uid ? this.store?.get?.(uid) : null;
        if (!uid || !user) return;
        this.ensureBindingModal();
        this.bindingState = {
            userId: uid,
            userName: String(user?.name || '').trim() || '我',
            term: '',
            selected: new Set(this.getBoundCharacterCards(uid).map(card => String(card?.id || '').trim()).filter(Boolean)),
        };
        const metaEl = this.bindingModal.panel.querySelector('#user-binding-meta');
        const searchEl = this.bindingModal.panel.querySelector('#user-binding-search');
        const clearEl = this.bindingModal.panel.querySelector('#user-binding-clear');
        if (metaEl) {
            metaEl.dataset.i18nSkip = '';
            metaEl.textContent = `${translateUiText('用户')}：${this.bindingState.userName}`;
        }
        if (searchEl) searchEl.value = '';
        if (clearEl) clearEl.style.display = 'none';
        this.renderBindingList();
        this.bindingModal.overlay.style.display = 'block';
        searchEl?.focus?.();
    }

    toggleBindingSelection(next) {
        if (!this.bindingState) return;
        const want = Boolean(next);
        const cards = this.getCharacterCards();
        if (want) cards.forEach(card => {
            const cardId = String(card?.id || '').trim();
            if (cardId) this.bindingState.selected.add(cardId);
        });
        else this.bindingState.selected.clear();
        this.renderBindingList();
    }

    renderBindingList() {
        if (!this.bindingModal || !this.bindingState) return;
        const listEl = this.bindingModal.panel.querySelector('#user-binding-list');
        const countEl = this.bindingModal.panel.querySelector('#user-binding-count');
        if (!listEl) return;
        const term = String(this.bindingState.term || '').trim().toLowerCase();
        const userId = this.bindingState.userId;
        const cards = this.getCharacterCards()
            .map(card => ({
                card,
                id: String(card?.id || '').trim(),
                name: getCharacterCardDisplayName(card, '角色卡'),
                avatar: String(card?.avatar || '').trim() || getDefaultAppIcon(),
            }))
            .filter(item => item.id)
            .filter(item => !term || `${item.name} ${item.id}`.toLowerCase().includes(term))
            .sort((a, b) => a.name.localeCompare(b.name));
        if (countEl) countEl.textContent = `${translateUiText('已选')} ${this.bindingState.selected.size} / ${this.getCharacterCards().length}`;
        listEl.innerHTML = '';
        if (!cards.length) {
            listEl.innerHTML = '<div style="padding:18px 10px; color:var(--app-text-muted); text-align:center;">未找到匹配的角色卡</div>';
            return;
        }
        cards.forEach((item) => {
            const checked = this.bindingState.selected.has(item.id);
            const boundUserId = getCharacterCardBoundUserId(item.card);
            const boundUser = boundUserId ? this.store?.get?.(boundUserId) : null;
            let subtitle = '未绑定';
            if (checked) subtitle = '保存后切换此角色卡会自动切到当前用户';
            else if (boundUserId && boundUserId !== userId) subtitle = `当前绑定：${String(boundUser?.name || '').trim() || '用户'}`;
            const row = document.createElement('div');
            row.style.cssText = `
                display:flex; align-items:center; gap:10px;
                padding:10px;
                border:1px solid ${checked ? 'rgba(37,99,235,0.22)' : 'rgba(0,0,0,0.08)'};
                border-radius:12px;
                margin-bottom:8px;
                background:${checked ? 'rgba(37,99,235,0.06)' : 'var(--app-surface-card)'};
                cursor:pointer;
            `;
            row.innerHTML = `
                <input class="user-binding-check" type="checkbox" ${checked ? 'checked' : ''} style="width:18px; height:18px;">
                <img src="${escapeHtml(item.avatar)}" alt="" style="width:36px; height:36px; border-radius:12px; object-fit:cover; background:var(--app-surface-hover);">
                <div style="flex:1; min-width:0;">
                    <div data-i18n-skip style="font-weight:800; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(translateUiText(item.name))}</div>
                    <div data-i18n-skip style="font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(translateUiText(subtitle))}</div>
                </div>
            `;
            const toggle = () => {
                if (!this.bindingState) return;
                if (this.bindingState.selected.has(item.id)) this.bindingState.selected.delete(item.id);
                else this.bindingState.selected.add(item.id);
                this.renderBindingList();
            };
            row.addEventListener('click', (event) => {
                if (event.target instanceof HTMLInputElement) return;
                toggle();
            });
            row.querySelector('.user-binding-check')?.addEventListener('click', (event) => {
                event.stopPropagation();
                toggle();
            });
            listEl.appendChild(row);
        });
    }

    renderList() {
        const listEl = this.panel?.querySelector?.('#user-list-container');
        if (!listEl) return;
        listEl.innerHTML = '';
        const users = this.store.getAll();
        const activeId = this.store.activeId;

        users.forEach((user) => {
            const item = document.createElement('div');
            item.style.cssText = `
                display:flex;
                align-items:center;
                gap:10px;
                padding:12px;
                border-bottom:1px solid var(--app-border-subtle);
                cursor:pointer;
                background:${user.id === activeId ? '#f0f9ff' : 'var(--app-surface-card)'};
                border-radius:8px;
                margin-bottom:5px;
                border:1px solid ${user.id === activeId ? '#bae6fd' : 'transparent'};
            `;
            const avatarUrl = user.avatar || getDefaultAppIcon();
            item.innerHTML = `
                <div style="position:relative;">
                    <img src="${avatarUrl}" style="width:40px; height:40px; border-radius:50%; object-fit:cover; background:var(--app-surface-hover);">
                    ${user.id === activeId ? '<div style="position:absolute; bottom:0; right:0; width:14px; height:14px; background:#007bff; border-radius:50%; border:2px solid var(--app-surface-card);"></div>' : ''}
                </div>
                <div style="flex:1; min-width:0;">
                    <div data-i18n-skip style="font-weight:bold; color:var(--app-text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${user.name || '我'}</div>
                    <div style="font-size:12px; color:var(--app-text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.getBoundCharacterSummary(user.id)}</div>
                </div>
                <button class="bind-btn" title="绑定角色卡" style="padding:8px; border:none; background:transparent; color:${this.getBoundCharacterCards(user.id).length ? '#d4a100' : 'var(--app-text-muted)'}; cursor:pointer; font-size:16px;">🔒</button>
                <button class="edit-btn" style="padding:8px; border:none; background:transparent; color:var(--app-text-muted); cursor:pointer; font-size:16px;">✎</button>
            `;

            item.addEventListener('click', async (event) => {
                if (event.target.closest('.edit-btn') || event.target.closest('.bind-btn')) return;
                await this.store.setActive(user.id);
                await Promise.resolve(this.onUserChanged?.({ reason: 'switch', affectsActiveCharacter: false, bindingChanged: false }));
                this.renderList();
            });

            item.querySelector('.bind-btn')?.addEventListener('click', (event) => {
                event.stopPropagation();
                this.openBindingModal(user.id);
            });
            item.querySelector('.edit-btn')?.addEventListener('click', (event) => {
                event.stopPropagation();
                this.openEdit(user.id);
            });

            listEl.appendChild(item);
        });
    }

    openEdit(id = null) {
        this.editingId = id;
        const view = this.panel?.querySelector?.('#user-edit-view');
        if (!view) return;
        const nameInput = this.panel.querySelector('#edit-name');
        const descInput = this.panel.querySelector('#edit-desc');
        const posEl = this.panel.querySelector('#edit-position');
        const depthEl = this.panel.querySelector('#edit-depth');
        const roleEl = this.panel.querySelector('#edit-role');
        const posBtn = this.panel.querySelector('#edit-position-btn');
        const roleBtn = this.panel.querySelector('#edit-role-btn');
        const bubbleInput = this.panel.querySelector('#edit-bubble-color-input');
        const bubblePicker = this.panel.querySelector('#edit-bubble-color');
        const deleteBtn = this.panel.querySelector('#delete-user-btn');
        const title = view.querySelector('span');

        if (id) {
            const user = this.store.get(id);
            if (!user) return;
            nameInput.value = user.name || '';
            descInput.value = user.description || '';
            if (posEl) posEl.value = String(Number.isFinite(Number(user.position)) ? Number(user.position) : 0);
            if (depthEl) depthEl.value = String(Number.isFinite(Number(user.depth)) ? Math.max(0, Math.trunc(Number(user.depth))) : 2);
            if (roleEl) roleEl.value = String(Number.isFinite(Number(user.role)) ? Math.max(0, Math.min(2, Math.trunc(Number(user.role)))) : 0);
            const bubble = getEffectiveUserBubbleColor(user.userBubbleColor);
            const text = getEffectiveUserTextColor(user.userTextColor);
            this.setBubbleColorValue(bubble);
            this.setTextColorValue(text);
            this.updateAvatarPreview(user.avatar);
            if (deleteBtn) deleteBtn.style.display = this.store.getAll().length <= 1 ? 'none' : 'block';
            if (title) title.textContent = '编辑用户';
        } else {
            const defaults = getThemeAwareUserDefaults();
            nameInput.value = '我';
            descInput.value = '';
            if (posEl) posEl.value = '0';
            if (depthEl) depthEl.value = '2';
            if (roleEl) roleEl.value = '0';
            this.setBubbleColorValue(defaults.bubbleColor);
            this.setTextColorValue(defaults.textColor);
            this.updateAvatarPreview('');
            if (deleteBtn) deleteBtn.style.display = 'none';
            if (title) title.textContent = '新建用户';
        }

        refreshCustomSelectButton(posBtn, posEl, '插入位置');
        refreshCustomSelectButton(roleBtn, roleEl, '注入角色');
        this.updateInjectionUi();
        view.style.display = 'flex';
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
        const view = this.panel?.querySelector?.('#user-edit-view');
        if (view) view.style.display = 'none';
        this.editingId = null;
    }

    async applyCharacterBindings(userId, selectedIds = []) {
        const uid = String(userId || '').trim();
        if (!uid || !this.personaStore?.update) return { changed: 0, affectsActiveCharacter: false };
        const selected = new Set(Array.from(selectedIds || []).map(id => String(id || '').trim()).filter(Boolean));
        const cards = this.getCharacterCards();
        const activeCharacterId = String(this.personaStore?.getActive?.()?.id || '').trim();
        let changed = 0;
        let affectsActiveCharacter = false;
        for (const card of cards) {
            const cardId = String(card?.id || '').trim();
            if (!cardId) continue;
            const source = { ...getCharacterCardSource(card) };
            const currentUserId = getCharacterCardBoundUserId(card);
            let nextUserId = currentUserId;
            if (selected.has(cardId)) nextUserId = uid;
            else if (currentUserId === uid) nextUserId = '';
            if (nextUserId === currentUserId) continue;
            if (nextUserId) source.boundUserId = nextUserId;
            else delete source.boundUserId;
            await this.personaStore.update(cardId, { source: Object.keys(source).length ? source : null });
            changed += 1;
            if (cardId === activeCharacterId) affectsActiveCharacter = true;
        }
        return { changed, affectsActiveCharacter };
    }

    async applyBindingModal() {
        if (!this.bindingState) return;
        const bindingResult = await this.applyCharacterBindings(this.bindingState.userId, this.bindingState.selected);
        this.hideBindingModal();
        await Promise.resolve(this.onUserChanged?.({
            reason: 'bind',
            bindingChanged: bindingResult.changed > 0,
            affectsActiveCharacter: bindingResult.affectsActiveCharacter,
        }));
        this.renderList();
    }

    async clearCharacterBindingsForUser(userId) {
        const uid = String(userId || '').trim();
        if (!uid || !this.personaStore?.update) return { changed: 0, affectsActiveCharacter: false };
        const cards = this.getBoundCharacterCards(uid);
        const activeCharacterId = String(this.personaStore?.getActive?.()?.id || '').trim();
        let changed = 0;
        let affectsActiveCharacter = false;
        for (const card of cards) {
            const cardId = String(card?.id || '').trim();
            if (!cardId) continue;
            const source = { ...getCharacterCardSource(card) };
            delete source.boundUserId;
            await this.personaStore.update(cardId, { source: Object.keys(source).length ? source : null });
            changed += 1;
            if (cardId === activeCharacterId) affectsActiveCharacter = true;
        }
        return { changed, affectsActiveCharacter };
    }

    async saveEdit() {
        const name = this.panel?.querySelector?.('#edit-name')?.value.trim();
        const description = this.panel?.querySelector?.('#edit-desc')?.value || '';
        const avatar = this.panel?.querySelector?.('#edit-avatar-preview')?.dataset?.url || '';
        const position = Number(this.panel?.querySelector?.('#edit-position')?.value ?? 0);
        const depth = Math.max(0, Math.trunc(Number(this.panel?.querySelector?.('#edit-depth')?.value ?? 2) || 0));
        const role = Math.max(0, Math.min(2, Math.trunc(Number(this.panel?.querySelector?.('#edit-role')?.value ?? 0) || 0)));
        const bubbleColor = normalizeHexColor(this.panel?.querySelector?.('#edit-bubble-color-input')?.value, getThemeAwareUserDefaults().bubbleColor);
        const textColor = normalizeHexColor(this.panel?.querySelector?.('#edit-text-color-input')?.value, getThemeAwareUserDefaults().textColor);

        if (!name) {
            alert('请输入用户名称');
            return;
        }

        if (this.editingId) {
            await this.store.update(this.editingId, { name, description, avatar, position, depth, role, userBubbleColor: bubbleColor, userTextColor: textColor });
        } else {
            const created = await this.store.create({ name, description, avatar, position, depth, role, userBubbleColor: bubbleColor, userTextColor: textColor });
            await this.store.setActive(created.id);
        }

        this.closeEdit();
        await Promise.resolve(this.onUserChanged?.({
            reason: 'save',
            bindingChanged: false,
            affectsActiveCharacter: false,
        }));
        this.renderList();
    }

    async deleteCurrent() {
        if (!this.editingId) return;
        const deletingUserId = String(this.editingId || '').trim();
        const ok = await appConfirm({
            title: '删除用户',
            message: '确定要删除此用户吗？',
            danger: true,
        });
        if (!ok) return;
        const success = await this.store.delete(this.editingId);
        if (!success) {
            alert('无法删除（至少保留一个用户）');
            return;
        }
        const bindingResult = await this.clearCharacterBindingsForUser(deletingUserId);
        this.closeEdit();
        await Promise.resolve(this.onUserChanged?.({
            reason: 'delete',
            bindingChanged: bindingResult.changed > 0,
            affectsActiveCharacter: bindingResult.affectsActiveCharacter,
        }));
        this.renderList();
    }
}
