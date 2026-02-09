/**
 * 世界书编辑弹窗（参考 SillyTavern World Info 设计）
 * - 双栏：左侧条目列表，右侧条目编辑
 * - 支持新增/复制/删除条目与保存
 * - 保存时保留 ST 字段，并兼容旧字段命名
 */

import { LLMClient } from '../api/client.js';
import { ConfigManager } from '../storage/config.js';
import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';

const DEFAULT_DEPTH = 4;
const DEFAULT_WEIGHT = 100;

const SELECTIVE_LOGIC_OPTIONS = [
    { value: 0, label: 'AND 任一（匹配任一关键词）' },
    { value: 1, label: 'NOT 全部（不匹配全部关键词）' },
    { value: 2, label: 'NOT 任一（不匹配任一关键词）' },
    { value: 3, label: 'AND 全部（匹配全部关键词）' },
];

const POSITION_OPTIONS = [
    { value: 0, label: '↑Char（角色前）' },
    { value: 1, label: '↓Char（角色后）' },
    { value: 2, label: '↑AT（作者备注前）' },
    { value: 3, label: '↓AT（作者备注后）' },
    { value: 4, label: '@Depth（按深度插入）' },
    { value: 5, label: '↑EM（例子前）' },
    { value: 6, label: '↓EM（例子后）' },
];

const ROLE_OPTIONS = [
    { value: 0, label: 'system' },
    { value: 1, label: 'user' },
    { value: 2, label: 'assistant' },
];

const WORLD_AI_INPUT_KEY = 'world_ai_input_v1';
const WORLD_AI_TEMPLATE_KEY = 'world_ai_template_v1';
const WORLD_AI_TEMPLATE = `
name: ""
english_name: ""
gender: ""
background: ""
appearance: ""
personality:
  mbti: ""
  traits: ""
dialogue_examples:
  note: "仅供参考，勿完全按照其输出"
  examples:
    - ""
    - ""
    - ""
`.trim();

const deepClone = (obj) => {
    try {
        return structuredClone(obj);
    } catch {
        return JSON.parse(JSON.stringify(obj || {}));
    }
};

const hasTauriRuntime = () => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || g?.__TAURI_INVOKE__);
};

const isAndroid = () => {
    try {
        return /android/i.test(navigator.userAgent || '');
    } catch {
        return false;
    }
};

const buildJsonDataUrl = (payload) => {
    const json = JSON.stringify(payload, null, 2);
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return `data:application/json;base64,${btoa(binary)}`;
};

const toNumber = (val, def) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : def;
};

const canUseApiConfig = config => {
    const cfg = config || {};
    const hasKey = typeof cfg.apiKey === 'string' && cfg.apiKey.trim().length > 0;
    const hasVertexSa =
        cfg.provider === 'vertexai' &&
        typeof cfg.vertexaiServiceAccount === 'string' &&
        cfg.vertexaiServiceAccount.trim().length > 0;
    return hasKey || hasVertexSa;
};

const normalizeArray = (val) => {
    if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
    if (typeof val === 'string') {
        return val.split(/[,，\n\r]/).map(s => s.trim()).filter(Boolean);
    }
    return [];
};

const stripCodeFence = (text) => {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const withoutStart = raw.replace(/^```(?:yaml)?\s*/i, '');
    return withoutStart.replace(/```\s*$/i, '').trim();
};

const loadWorldAiInput = () => {
    try {
        return String(localStorage.getItem(WORLD_AI_INPUT_KEY) || '');
    } catch {
        return '';
    }
};

const saveWorldAiInput = (value) => {
    try {
        localStorage.setItem(WORLD_AI_INPUT_KEY, String(value || ''));
    } catch {}
};

const loadWorldAiTemplate = () => {
    try {
        const stored = String(localStorage.getItem(WORLD_AI_TEMPLATE_KEY) || '').trim();
        return stored || WORLD_AI_TEMPLATE;
    } catch {
        return WORLD_AI_TEMPLATE;
    }
};

const saveWorldAiTemplate = (value) => {
    try {
        const trimmed = String(value || '').trim();
        localStorage.setItem(WORLD_AI_TEMPLATE_KEY, trimmed || WORLD_AI_TEMPLATE);
    } catch {}
};

const buildWorldAiMessages = (template, inputText) => {
    const trimmedTemplate = String(template || '').trim();
    const trimmedInput = String(inputText || '').trim();
    const userContent = [
        '请根据模板与用户输入生成完整的「角色世界书条目」。',
        '要求：',
        '- 仅输出 YAML，不要解释，不要代码块，不要附加标题。',
        '- YAML 结构必须与模板一致；内容尽量充实，未知的可以写“未说明”。',
        '- 英文名使用英文；对话范例需明确“仅供参考，勿完全按照其输出”。',
        '',
        '<template>',
        trimmedTemplate || '(空模板)',
        '</template>',
        '',
        '<input>',
        trimmedInput || '(未提供)',
        '</input>',
    ].join('\n');
    return [{ role: 'user', content: userContent }];
};

const buildWorldAiContinueMessages = (template, inputText, draft) => {
    const trimmedTemplate = String(template || '').trim();
    const trimmedInput = String(inputText || '').trim();
    const trimmedDraft = String(draft || '').trim();
    const userContent = [
        '请在模板约束下，结合用户输入，对已有草稿进行补全与润色。',
        '要求：',
        '- 仅输出 YAML，不要解释，不要代码块，不要附加标题。',
        '- YAML 结构必须与模板一致；不要丢失草稿里已经明确的设定。',
        '- 对话范例需明确“仅供参考，勿完全按照其输出”。',
        '',
        '<template>',
        trimmedTemplate || '(空模板)',
        '</template>',
        '',
        '<input>',
        trimmedInput || '(未提供)',
        '</input>',
        '',
        '<draft>',
        trimmedDraft || '(空草稿)',
        '</draft>',
    ].join('\n');
    return [{ role: 'user', content: userContent }];
};

const normalizeEntry = (entry = {}, index = 0) => {
    const e = { ...entry };

    e.id = e.id ?? (Number.isInteger(e.uid) ? String(e.uid) : `entry-${index}`);
    if (e.uid == null && /^\d+$/.test(e.id)) {
        e.uid = Number(e.id);
    }

    const comment = e.comment ?? e.title ?? '';
    e.comment = comment;
    e.title = comment;

    const key = normalizeArray(e.key ?? e.triggers);
    const keysecondary = normalizeArray(e.keysecondary ?? e.secondary);
    e.key = key;
    e.triggers = key;
    e.keysecondary = keysecondary;
    e.secondary = keysecondary;
    e.scope = [];

    const order = toNumber(e.order ?? e.priority, 100);
    e.order = order;
    e.priority = order;

    e.depth = toNumber(e.depth, DEFAULT_DEPTH);
    e.position = toNumber(e.position, 0);
    e.role = toNumber(e.role, 0);

    e.disable = Boolean(e.disable);
    e.constant = Boolean(e.constant);
    e.selective = e.selective !== false;
    // 三态灯逻辑：红灯（禁用）优先，其次蓝灯；避免出现红/蓝/绿同时选中。
    if (e.disable) {
        e.constant = false;
        e.selective = false;
    } else if (e.constant) {
        e.selective = false;
    }
    e.selectiveLogic = toNumber(e.selectiveLogic, 0);

    // 概率：旧格式可能是 0-1 的 ratio
    const rawProb = e.probability;
    const probPercent = typeof rawProb === 'number'
        ? (rawProb <= 1 ? Math.round(rawProb * 100) : Math.round(rawProb))
        : 100;
    e.probability = probPercent;
    e.useProbability = e.useProbability !== false;

    e.ignoreBudget = Boolean(e.ignoreBudget);
    e.excludeRecursion = Boolean(e.excludeRecursion);
    e.preventRecursion = Boolean(e.preventRecursion);
    e.vectorized = Boolean(e.vectorized);
    e.addMemo = Boolean(e.addMemo);

    e.matchPersonaDescription = Boolean(e.matchPersonaDescription);
    e.matchCharacterDescription = Boolean(e.matchCharacterDescription);
    e.matchCharacterPersonality = Boolean(e.matchCharacterPersonality);
    e.matchCharacterDepthPrompt = Boolean(e.matchCharacterDepthPrompt);
    e.matchScenario = Boolean(e.matchScenario);
    e.matchCreatorNotes = Boolean(e.matchCreatorNotes);

    e.group = e.group ?? '';
    e.groupOverride = Boolean(e.groupOverride);
    e.groupWeight = toNumber(e.groupWeight, DEFAULT_WEIGHT);

    e.scanDepth = e.scanDepth ?? null;
    e.caseSensitive = e.caseSensitive ?? null;
    e.matchWholeWords = e.matchWholeWords ?? null;
    e.useGroupScoring = e.useGroupScoring ?? null;

    e.automationId = e.automationId ?? '';
    e.sticky = e.sticky ?? null;
    e.cooldown = e.cooldown ?? null;
    e.delay = e.delay ?? null;
    e.delayUntilRecursion = toNumber(e.delayUntilRecursion, 0);

    e.content = e.content ?? '';
    return e;
};

const createDefaultEntry = (index = 0) => normalizeEntry({ constant: true, selective: false }, index);

const positionLabel = (pos = 0, role = 0, depth = DEFAULT_DEPTH) => {
    switch (Number(pos)) {
        case 0: return '↑Char';
        case 1: return '↓Char';
        case 2: return '↑AT';
        case 3: return '↓AT';
        case 4: return `@D${depth}/${ROLE_OPTIONS.find(r => r.value === role)?.label || 'system'}`;
        case 5: return '↑EM';
        case 6: return '↓EM';
        default: return String(pos);
    }
};

export class WorldEditorModal {
    constructor({ onSaved } = {}) {
        this.overlay = null;
        this.modal = null;
        this.entriesListEl = null;
        this.editorEl = null;
        this.nameInputEl = null;
        this.saveBtn = null;
        this.addBtn = null;
        this.worldName = '';
        this.originalName = '';
        this.data = { name: '', entries: [] };
        this.currentIndex = 0;
        this.onSaved = onSaved;
        this.aiOverlay = null;
        this.aiModal = null;
        this.aiInputEl = null;
        this.aiTemplateEl = null;
        this.aiStatusEl = null;
        this.aiGenerateBtn = null;
        this.aiContinueBtn = null;
        this.aiCloseBtn = null;
        this.aiBusy = false;
        this.aiRequestId = 0;
        this.aiPendingEntryId = '';
        this.aiTargetEntryId = '';
        this.chatConfigManager = new ConfigManager();
        this.batchMode = false;
        this.selectedEntries = new Set();
        this.batchToggleBtn = null;
        this.batchBarEl = null;
        this.batchCountEl = null;
        this.batchSelectAllBtn = null;
        this.batchClearBtn = null;
        this.batchCreateBtn = null;
        this.batchCreateAllBtn = null;
        this.manageBtn = null;
        this.manageOverlay = null;
        this.manageModal = null;
        this.manageCountEl = null;
        this.manageSelectAllBtn = null;
        this.manageClearBtn = null;
        this.manageCreateSelectedBtn = null;
        this.manageDeleteBtn = null;
        this.manageMoveUpBtn = null;
        this.manageMoveDownBtn = null;
        this.manageMoveTopBtn = null;
        this.manageMoveBottomBtn = null;
        this.manageListEl = null;
        this.chatNameOverlay = null;
        this.chatNameModal = null;
        this.chatNameInputEl = null;
        this.chatNameResolve = null;
        this.chatNameKeyHandler = null;
        this.refMode = false;
        this.refLocalEntries = null;
        this.refSyncTimer = null;
        this.refSyncDelay = 900;
        this.refSyncInFlight = false;
        this.refSyncPending = false;
        this.entrySearchTerm = '';
        this.entryPageSize = 5;
        this.entryPageIndex = 0;
        this.entrySearchEl = null;
        this.entryPageSizeEl = null;
        this.entryPagePrevBtn = null;
        this.entryPageNextBtn = null;
        this.entryPageIndicatorEl = null;
        this.entryDotsEl = null;
        this.entryPageScrollLock = false;
        this.entryTotalPages = 1;
    }

    async show(name, data) {
        if (!this.modal) {
            this.createUI();
        }
        this.worldName = name;
        this.originalName = name;
        this.data = deepClone(data || { name, entries: [] });
        if (!Array.isArray(this.data.entries)) this.data.entries = [];
        const hasRefs = Array.isArray(this.data.refs) && this.data.refs.length > 0;
        const hasEntries = this.data.entries.length > 0;
        this.refMode = hasRefs && !hasEntries;
        this.refLocalEntries = hasEntries ? null : this.data.entries.slice();
        if (this.refMode) {
            try {
                const resolved = await this.resolveRefEntriesForDisplay(this.data.refs);
                this.data.entries = Array.isArray(resolved) ? resolved : [];
            } catch (err) {
                logger.warn('读取引用世界书失败', err);
                this.data.entries = [];
            }
        }
        this.data.entries = this.data.entries.map((e, i) => normalizeEntry(e, i));
        if (!this.data.entries.length && !this.refMode) {
            this.data.entries.push(createDefaultEntry(0));
        }
        this.batchMode = false;
        this.selectedEntries.clear();
        this.entrySearchTerm = '';
        this.entryPageIndex = 0;
        this.updateBatchBar();
        if (this.nameInputEl) {
            const displayName = String(this.data?.name || name || '').trim();
            this.nameInputEl.value = displayName || '';
        }
        if (this.entrySearchEl) this.entrySearchEl.value = '';
        this.currentIndex = 0;
        this.renderList();
        this.selectEntry(0);
        this.updateRefModeUI();
        this.overlay.style.display = 'block';
        this.modal.style.display = 'block';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.modal) this.modal.style.display = 'none';
        this.hideManageModal();
        this.hideAiModal();
        if (this.refSyncTimer) {
            clearTimeout(this.refSyncTimer);
            this.refSyncTimer = null;
        }
    }

    updateRefModeUI() {
        const disabled = Boolean(this.refMode);
        const applyState = (btn) => {
            if (!btn) return;
            btn.disabled = disabled;
            btn.style.opacity = disabled ? '0.6' : '';
            btn.style.cursor = disabled ? 'not-allowed' : '';
        };
        applyState(this.addBtn);
        applyState(this.manageBtn);
        if (this.nameInputEl) {
            this.nameInputEl.disabled = disabled;
            this.nameInputEl.style.opacity = disabled ? '0.6' : '';
        }
    }

    scheduleRefSync() {
        if (!this.refMode) return;
        if (this.refSyncTimer) clearTimeout(this.refSyncTimer);
        this.refSyncTimer = setTimeout(() => this.flushRefSync(), this.refSyncDelay);
    }

    async flushRefSync() {
        if (!this.refMode) return;
        if (this.refSyncInFlight) {
            this.refSyncPending = true;
            return;
        }
        this.refSyncInFlight = true;
        try {
            await this.saveRefEdits({ showToast: false });
        } finally {
            this.refSyncInFlight = false;
            if (this.refSyncPending) {
                this.refSyncPending = false;
                this.scheduleRefSync();
            }
        }
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'world-editor-overlay';
        this.overlay.className = 'popup-overlay';
        this.overlay.style.display = 'none';
        // Ensure editor sits above world management panel
        this.overlay.style.position = 'fixed';
        this.overlay.style.inset = '0';
        this.overlay.style.background = 'rgba(0,0,0,0.45)';
        this.overlay.style.zIndex = '22000';
        this.overlay.onclick = () => this.hide();

        this.modal = document.createElement('div');
        this.modal.id = 'world-editor-modal';
        this.modal.className = 'world-editor-popup';
        this.modal.style.display = 'none';
        this.modal.style.position = 'fixed';
        this.modal.style.top = '50%';
        this.modal.style.left = '50%';
        this.modal.style.transform = 'translate(-50%, -50%)';
        this.modal.style.zIndex = '23000';
        this.modal.onclick = (e) => e.stopPropagation();

        this.modal.innerHTML = `
            <div class="world-editor-header">
                <div class="world-editor-title">
                    <span style="margin-right:6px;">世界书</span>
                    <input id="world-editor-name" type="text" placeholder="名称" style="font-weight:700; font-size:14px; color:#111827; border:1px solid #e2e8f0; border-radius:8px; padding:4px 8px; min-width:140px; max-width:260px;">
                </div>
                <div class="world-editor-actions">
                    <button id="world-editor-save">保存</button>
                    <button id="world-editor-export">导出</button>
                    <button id="world-editor-manage">管理</button>
                    <button id="world-editor-close" class="world-editor-close">×</button>
                </div>
            </div>
            <div class="world-editor-body">
                <div class="world-entries-column">
                    <div class="world-entries-toolbar">
                        <button id="world-entry-add">＋ 新条目</button>
                        <div class="world-entries-search">
                            <input id="world-entry-search" type="search" placeholder="搜索条目">
                        </div>
                        <div class="world-entries-pager">
                            <span class="world-entries-pager-label">每页</span>
                            <input id="world-entry-page-size" type="number" min="1" max="200" step="1" list="world-entry-page-sizes" value="5">
                            <datalist id="world-entry-page-sizes">
                                <option value="5"></option>
                                <option value="10"></option>
                                <option value="50"></option>
                                <option value="100"></option>
                            </datalist>
                        </div>
                    </div>
                    <ul id="world-entries-list" class="world-entries-list"></ul>
                    <div id="world-entry-dots" class="world-entries-dots"></div>
                </div>
                <div id="world-entry-editor" class="world-entry-editor"></div>
            </div>
        `;

        this.entriesListEl = this.modal.querySelector('#world-entries-list');
        this.editorEl = this.modal.querySelector('#world-entry-editor');
        this.nameInputEl = this.modal.querySelector('#world-editor-name');
        this.saveBtn = this.modal.querySelector('#world-editor-save');
        this.addBtn = this.modal.querySelector('#world-entry-add');
        this.exportBtn = this.modal.querySelector('#world-editor-export');
        this.manageBtn = this.modal.querySelector('#world-editor-manage');
        this.entrySearchEl = this.modal.querySelector('#world-entry-search');
        this.entryPageSizeEl = this.modal.querySelector('#world-entry-page-size');
        this.entryPagePrevBtn = this.modal.querySelector('#world-entry-page-prev');
        this.entryPageNextBtn = this.modal.querySelector('#world-entry-page-next');
        this.entryPageIndicatorEl = this.modal.querySelector('#world-entry-page-indicator');
        this.entryDotsEl = this.modal.querySelector('#world-entry-dots');

        this.modal.querySelector('#world-editor-close').onclick = () => this.hide();
        this.saveBtn.onclick = () => this.saveWorld();
        if (this.exportBtn) this.exportBtn.onclick = () => this.exportWorld();
        this.addBtn.onclick = () => this.addEntry();
        if (this.manageBtn) this.manageBtn.onclick = () => this.showManageModal();
        if (this.entrySearchEl) {
            this.entrySearchEl.addEventListener('input', () => {
                this.entrySearchTerm = String(this.entrySearchEl.value || '');
                this.entryPageIndex = 0;
                this.renderList();
            });
        }
        if (this.entryPageSizeEl) {
            this.entryPageSizeEl.addEventListener('input', () => {
                const raw = Number(this.entryPageSizeEl.value);
                if (!Number.isFinite(raw)) return;
                const next = Math.max(1, Math.min(200, Math.trunc(raw)));
                this.entryPageSize = next;
                this.entryPageSizeEl.value = String(next);
                this.entryPageIndex = 0;
                this.renderList();
            });
        }
        if (this.entriesListEl) {
            this.entriesListEl.addEventListener('scroll', () => {
                if (this.entryPageScrollLock) return;
                const width = this.entriesListEl.clientWidth || 1;
                const idx = Math.round(this.entriesListEl.scrollLeft / width);
                if (idx !== this.entryPageIndex) {
                    this.entryPageIndex = idx;
                    this.updateEntryPageIndicator();
                }
            });
        }

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.modal);
        this.createAiModal();
        this.createManageModal();
    }

    createAiModal() {
        if (this.aiModal) return;
        this.aiOverlay = document.createElement('div');
        this.aiOverlay.className = 'world-ai-overlay';
        this.aiOverlay.style.display = 'none';
        this.aiOverlay.addEventListener('click', () => this.hideAiModal());

        this.aiModal = document.createElement('div');
        this.aiModal.className = 'world-ai-modal';
        this.aiModal.style.display = 'none';
        this.aiModal.innerHTML = `
            <div class="world-ai-header">
                <div>
                    <div class="world-ai-title">AI 生成角色世界书</div>
                    <div class="world-ai-subtitle">输入人物设定，自动生成 YAML 条目</div>
                </div>
                <button type="button" class="world-ai-close" aria-label="关闭">×</button>
            </div>
            <div class="world-ai-body">
                <label class="world-ai-label">人物设定</label>
                <textarea id="world-ai-input" class="world-ai-textarea" placeholder="例如：名字、性别、背景、外貌、性格、说话习惯、关系等"></textarea>
                <div class="world-ai-hint">生成过程中可关闭此窗，完成后自动写入内容并保存。</div>

                <label class="world-ai-label">生成模板</label>
                <textarea id="world-ai-template" class="world-ai-textarea world-ai-template" placeholder="可编辑模板（建议保留字段结构）"></textarea>

                <div class="world-ai-actions">
                    <button type="button" class="world-ai-btn ghost" id="world-ai-cancel">关闭</button>
                    <button type="button" class="world-ai-btn" id="world-ai-continue">继续</button>
                    <button type="button" class="world-ai-btn primary" id="world-ai-generate">生成</button>
                </div>
                <div class="world-ai-status" id="world-ai-status"></div>
            </div>
        `;
        this.aiModal.addEventListener('click', (e) => e.stopPropagation());

        this.aiInputEl = this.aiModal.querySelector('#world-ai-input');
        this.aiTemplateEl = this.aiModal.querySelector('#world-ai-template');
        this.aiStatusEl = this.aiModal.querySelector('#world-ai-status');
        this.aiGenerateBtn = this.aiModal.querySelector('#world-ai-generate');
        this.aiContinueBtn = this.aiModal.querySelector('#world-ai-continue');
        this.aiCloseBtn = this.aiModal.querySelector('.world-ai-close');
        const cancelBtn = this.aiModal.querySelector('#world-ai-cancel');

        if (this.aiInputEl) {
            this.aiInputEl.value = loadWorldAiInput();
            this.aiInputEl.addEventListener('input', () => saveWorldAiInput(this.aiInputEl.value));
        }
        if (this.aiTemplateEl) {
            this.aiTemplateEl.value = loadWorldAiTemplate();
            this.aiTemplateEl.addEventListener('input', () => saveWorldAiTemplate(this.aiTemplateEl.value));
        }

        if (this.aiGenerateBtn) this.aiGenerateBtn.onclick = () => this.handleAiGenerate();
        if (this.aiContinueBtn) this.aiContinueBtn.onclick = () => this.handleAiContinue();
        if (this.aiCloseBtn) this.aiCloseBtn.onclick = () => this.hideAiModal();
        if (cancelBtn) cancelBtn.onclick = () => this.hideAiModal();

        document.body.appendChild(this.aiOverlay);
        document.body.appendChild(this.aiModal);
    }

    showAiModal(entry) {
        if (!entry) return;
        if (!this.aiModal) this.createAiModal();
        this.aiTargetEntryId = String(entry.id || '');
        if (this.aiTemplateEl && !String(this.aiTemplateEl.value || '').trim()) {
            this.aiTemplateEl.value = loadWorldAiTemplate();
        }
        this.setAiStatus('');
        this.aiOverlay.style.display = 'block';
        this.aiModal.style.display = 'block';
    }

    hideAiModal() {
        if (this.aiOverlay) this.aiOverlay.style.display = 'none';
        if (this.aiModal) this.aiModal.style.display = 'none';
    }

    createChatNameModal() {
        if (this.chatNameModal) return;
        this.chatNameOverlay = document.createElement('div');
        this.chatNameOverlay.className = 'world-chatname-overlay';
        this.chatNameOverlay.style.display = 'none';
        this.chatNameOverlay.addEventListener('click', () => this.closeChatNameModal(''));

        this.chatNameModal = document.createElement('div');
        this.chatNameModal.className = 'world-chatname-modal';
        this.chatNameModal.style.display = 'none';
        this.chatNameModal.innerHTML = `
            <div class="world-chatname-header">
                <div class="world-chatname-title">创建聊天室</div>
                <button type="button" class="world-chatname-close" aria-label="关闭">×</button>
            </div>
            <div class="world-chatname-body">
                <label class="world-chatname-label" for="world-chatname-input">聊天室名称</label>
                <input id="world-chatname-input" class="world-chatname-input" type="text" value="">
                <div class="world-chatname-hint">名称可修改，默认使用选中条目的名称</div>
            </div>
            <div class="world-chatname-actions">
                <button type="button" class="world-chatname-btn ghost" id="world-chatname-cancel">取消</button>
                <button type="button" class="world-chatname-btn primary" id="world-chatname-ok">创建</button>
            </div>
        `;
        this.chatNameModal.addEventListener('click', (e) => e.stopPropagation());

        this.chatNameInputEl = this.chatNameModal.querySelector('#world-chatname-input');
        const closeBtn = this.chatNameModal.querySelector('.world-chatname-close');
        const cancelBtn = this.chatNameModal.querySelector('#world-chatname-cancel');
        const okBtn = this.chatNameModal.querySelector('#world-chatname-ok');

        closeBtn?.addEventListener('click', () => this.closeChatNameModal(''));
        cancelBtn?.addEventListener('click', () => this.closeChatNameModal(''));
        okBtn?.addEventListener('click', () => this.submitChatNameModal());

        this.chatNameInputEl?.addEventListener('focus', () => {
            if (!this.chatNameInputEl) return;
            if (this.chatNameInputEl.classList.contains('is-placeholder')) {
                this.chatNameInputEl.value = '';
                this.chatNameInputEl.classList.remove('is-placeholder');
            }
        });
        this.chatNameInputEl?.addEventListener('blur', () => this.restoreChatNamePlaceholder());

        document.body.appendChild(this.chatNameOverlay);
        document.body.appendChild(this.chatNameModal);
    }

    openChatNameModal(defaultName) {
        if (!this.chatNameModal) this.createChatNameModal();
        if (!this.chatNameOverlay || !this.chatNameModal || !this.chatNameInputEl) return Promise.resolve('');
        const defaultText = String(defaultName || '').trim();
        this.chatNameInputEl.dataset.defaultName = defaultText;
        this.chatNameInputEl.value = defaultText;
        this.chatNameInputEl.classList.toggle('is-placeholder', Boolean(defaultText));
        this.chatNameOverlay.style.display = 'block';
        this.chatNameModal.style.display = 'block';

        if (this.chatNameKeyHandler) {
            document.removeEventListener('keydown', this.chatNameKeyHandler);
        }
        this.chatNameKeyHandler = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.closeChatNameModal('');
            } else if (event.key === 'Enter') {
                event.preventDefault();
                this.submitChatNameModal();
            }
        };
        document.addEventListener('keydown', this.chatNameKeyHandler);

        return new Promise((resolve) => {
            this.chatNameResolve = resolve;
        });
    }

    restoreChatNamePlaceholder() {
        if (!this.chatNameInputEl) return;
        const text = String(this.chatNameInputEl.value || '').trim();
        if (!text) {
            const fallback = String(this.chatNameInputEl.dataset?.defaultName || '').trim();
            this.chatNameInputEl.value = fallback;
            this.chatNameInputEl.classList.toggle('is-placeholder', Boolean(fallback));
        } else {
            this.chatNameInputEl.classList.remove('is-placeholder');
        }
    }

    submitChatNameModal() {
        if (!this.chatNameInputEl) return;
        const isPlaceholder = this.chatNameInputEl.classList.contains('is-placeholder');
        const raw = String(this.chatNameInputEl.value || '').trim();
        const fallback = String(this.chatNameInputEl.dataset?.defaultName || '').trim();
        const value = (isPlaceholder || !raw) ? fallback : raw;
        this.closeChatNameModal(value);
    }

    closeChatNameModal(value) {
        if (this.chatNameOverlay) this.chatNameOverlay.style.display = 'none';
        if (this.chatNameModal) this.chatNameModal.style.display = 'none';
        if (this.chatNameKeyHandler) {
            document.removeEventListener('keydown', this.chatNameKeyHandler);
            this.chatNameKeyHandler = null;
        }
        if (this.chatNameResolve) {
            const resolve = this.chatNameResolve;
            this.chatNameResolve = null;
            resolve(String(value || ''));
        }
    }

    createManageModal() {
        if (this.manageModal) return;
        this.manageOverlay = document.createElement('div');
        this.manageOverlay.className = 'world-manage-overlay';
        this.manageOverlay.style.display = 'none';
        this.manageOverlay.addEventListener('click', () => this.hideManageModal());

        this.manageModal = document.createElement('div');
        this.manageModal.className = 'world-manage-modal';
        this.manageModal.style.display = 'none';
        this.manageModal.innerHTML = `
            <div class="world-manage-header">
                <div>
                    <div class="world-manage-title">条目管理</div>
                    <div class="world-manage-subtitle">批量操作、创建聊天室、删除与移动</div>
                </div>
                <button type="button" class="world-manage-close" aria-label="关闭">×</button>
            </div>
            <div class="world-manage-body">
                <div class="world-manage-toolbar">
                    <div class="world-manage-label">条目列表</div>
                    <div id="world-manage-count" class="world-manage-count">已选 0</div>
                    <div class="world-manage-actions">
                        <button type="button" class="world-manage-link" id="world-manage-selectall">全选</button>
                        <button type="button" class="world-manage-link" id="world-manage-clear">清空</button>
                        <span class="world-manage-sep"></span>
                        <button type="button" class="world-manage-link" id="world-manage-create-selected">创建聊天室</button>
                        <span class="world-manage-sep"></span>
                        <button type="button" class="world-manage-icon" id="world-manage-move-top" aria-label="置顶">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 4h14v2H5z"></path>
                                <path d="M12 7l-5 5h3v6h4v-6h3z"></path>
                            </svg>
                        </button>
                        <button type="button" class="world-manage-icon" id="world-manage-move-up" aria-label="上移">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6l-6 6h4v6h4v-6h4z"></path></svg>
                        </button>
                        <button type="button" class="world-manage-icon" id="world-manage-move-down" aria-label="下移">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 18l6-6h-4V6h-4v6H6z"></path></svg>
                        </button>
                        <button type="button" class="world-manage-icon" id="world-manage-move-bottom" aria-label="置底">
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                <path d="M5 18h14v2H5z"></path>
                                <path d="M12 17l5-5h-3V6h-4v6H7z"></path>
                            </svg>
                        </button>
                        <button type="button" class="world-manage-link danger" id="world-manage-delete">删除</button>
                    </div>
                </div>
                <div id="world-manage-list" class="world-manage-list"></div>
            </div>
            <div class="world-manage-footer">
                <button type="button" class="world-manage-btn primary" id="world-manage-close-btn">完成</button>
            </div>
        `;
        this.manageModal.addEventListener('click', (e) => e.stopPropagation());
        this.manageModal.querySelector('.world-manage-close')?.addEventListener('click', () => this.hideManageModal());
        this.manageModal.querySelector('#world-manage-close-btn')?.addEventListener('click', () => this.hideManageModal());

        this.manageCountEl = this.manageModal.querySelector('#world-manage-count');
        this.manageSelectAllBtn = this.manageModal.querySelector('#world-manage-selectall');
        this.manageClearBtn = this.manageModal.querySelector('#world-manage-clear');
        this.manageCreateSelectedBtn = this.manageModal.querySelector('#world-manage-create-selected');
        this.manageDeleteBtn = this.manageModal.querySelector('#world-manage-delete');
        this.manageMoveUpBtn = this.manageModal.querySelector('#world-manage-move-up');
        this.manageMoveDownBtn = this.manageModal.querySelector('#world-manage-move-down');
        this.manageMoveTopBtn = this.manageModal.querySelector('#world-manage-move-top');
        this.manageMoveBottomBtn = this.manageModal.querySelector('#world-manage-move-bottom');
        this.manageListEl = this.manageModal.querySelector('#world-manage-list');

        this.manageSelectAllBtn?.addEventListener('click', () => {
            this.selectAllEntries();
        });
        this.manageClearBtn?.addEventListener('click', () => this.clearSelection());
        this.manageCreateSelectedBtn?.addEventListener('click', () => this.createChatFromSelection());
        this.manageDeleteBtn?.addEventListener('click', () => this.deleteSelectedEntries());
        this.manageMoveUpBtn?.addEventListener('click', () => this.moveSelectedEntries(-1));
        this.manageMoveDownBtn?.addEventListener('click', () => this.moveSelectedEntries(1));
        this.manageMoveTopBtn?.addEventListener('click', () => this.moveSelectedToEdge('top'));
        this.manageMoveBottomBtn?.addEventListener('click', () => this.moveSelectedToEdge('bottom'));

        document.body.appendChild(this.manageOverlay);
        document.body.appendChild(this.manageModal);
    }

    showManageModal() {
        if (!this.manageModal) this.createManageModal();
        this.updateManageState();
        if (this.manageOverlay) this.manageOverlay.style.display = 'block';
        if (this.manageModal) this.manageModal.style.display = 'block';
    }

    hideManageModal() {
        if (this.manageOverlay) this.manageOverlay.style.display = 'none';
        if (this.manageModal) this.manageModal.style.display = 'none';
    }

    setAiStatus(message, tone = '') {
        if (!this.aiStatusEl) return;
        this.aiStatusEl.textContent = message || '';
        if (tone) {
            this.aiStatusEl.setAttribute('data-tone', tone);
        } else {
            this.aiStatusEl.removeAttribute('data-tone');
        }
    }

    setAiBusy(isBusy, entryId = '') {
        this.aiBusy = Boolean(isBusy);
        if (this.aiGenerateBtn) this.aiGenerateBtn.disabled = this.aiBusy;
        if (this.aiContinueBtn) this.aiContinueBtn.disabled = this.aiBusy;
        if (this.aiBusy && entryId) {
            this.aiPendingEntryId = String(entryId);
        } else if (!this.aiBusy) {
            this.aiPendingEntryId = '';
        }
        this.renderEditor();
    }

    async ensureChatConfigReady() {
        const config = await this.chatConfigManager.load();
        if (!canUseApiConfig(config)) {
            window.toastr?.warning?.('请先配置聊天模型 API');
            return null;
        }
        return config;
    }

    resolveEntryById(entryId) {
        const targetId = String(entryId || '');
        const idx = this.data.entries.findIndex(e => String(e.id || '') === targetId);
        if (idx < 0) return { idx: -1, entry: null };
        return { idx, entry: this.data.entries[idx] };
    }

    getEntryContentForAi(entryId) {
        const { idx, entry } = this.resolveEntryById(entryId);
        if (!entry || idx < 0) return '';
        if (this.currentIndex === idx) {
            const textarea = this.editorEl?.querySelector('#we-content');
            const live = String(textarea?.value || '').trim();
            if (live) return live;
        }
        return String(entry.content || '').trim();
    }

    applyAiContentToEntry(entryId, content) {
        const { idx, entry } = this.resolveEntryById(entryId);
        if (idx < 0) {
            window.toastr?.warning?.('目标条目不存在，未写入内容');
            return false;
        }
        entry.content = content;
        if (this.currentIndex === idx) {
            const textarea = this.editorEl?.querySelector('#we-content');
            if (textarea) textarea.value = content;
        }
        this.scheduleRefSync();
        return true;
    }

    async runWorldAi({ mode = 'generate' } = {}) {
        if (this.aiBusy) {
            window.toastr?.warning?.('AI 生成中，请稍后');
            return;
        }
        const inputText = String(this.aiInputEl?.value || '').trim();
        if (!inputText) {
            window.toastr?.warning?.('请先输入人物设定');
            return;
        }
        const config = await this.ensureChatConfigReady();
        if (!config) return;
        const entryId = this.aiTargetEntryId || String(this.data.entries[this.currentIndex]?.id || '');
        if (!entryId) {
            window.toastr?.warning?.('未找到可写入的条目');
            return;
        }
        const template = String(this.aiTemplateEl?.value || WORLD_AI_TEMPLATE || '').trim();
        if (!template) {
            window.toastr?.warning?.('模板不能为空');
            return;
        }
        const draft = this.getEntryContentForAi(entryId);
        if (mode === 'continue' && !draft) {
            window.toastr?.warning?.('当前内容为空，无法继续');
            return;
        }
        const requestId = ++this.aiRequestId;
        this.setAiBusy(true, entryId);
        const loadingText = mode === 'continue' ? '正在继续补全角色条目...' : '正在生成角色条目...';
        this.setAiStatus(loadingText, 'loading');
        try {
            const client = new LLMClient(config);
            const messages = mode === 'continue'
                ? buildWorldAiContinueMessages(template, inputText, draft)
                : buildWorldAiMessages(template, inputText);
            const output = await client.chat(messages, { temperature: 0.6 });
            if (requestId !== this.aiRequestId) return;
            const yaml = stripCodeFence(output);
            if (!yaml) throw new Error('AI 未返回内容');
            const applied = this.applyAiContentToEntry(entryId, yaml);
            if (!applied) {
                this.setAiStatus('生成成功，但未找到条目写入', 'error');
                return;
            }
            const saved = await this.saveWorldSilently({ showToast: false });
            if (saved) {
                const successText = mode === 'continue' ? '补全完成，已写入内容并保存' : '生成完成，已写入内容并保存';
                this.setAiStatus(successText, 'success');
                window.toastr?.success?.(mode === 'continue' ? 'AI 补全已写入并保存' : 'AI 生成已写入并保存');
            } else {
                this.setAiStatus('生成完成，但自动保存失败', 'error');
                window.toastr?.warning?.(mode === 'continue' ? 'AI 已补全，但自动保存失败' : 'AI 已生成，但自动保存失败');
            }
        } catch (err) {
            logger.error(mode === 'continue' ? 'AI 补全世界书失败' : 'AI 生成世界书失败', err);
            this.setAiStatus(`生成失败：${err?.message || '未知错误'}`, 'error');
            window.toastr?.error?.(mode === 'continue' ? 'AI 补全失败' : 'AI 生成失败');
        } finally {
            if (requestId === this.aiRequestId) {
                this.setAiBusy(false);
            }
        }
    }

    async handleAiGenerate() {
        return this.runWorldAi({ mode: 'generate' });
    }

    async handleAiContinue() {
        return this.runWorldAi({ mode: 'continue' });
    }

    getEntryId(entry, idx = 0) {
        const raw = entry && typeof entry === 'object' ? entry : {};
        const id = raw.id ?? raw.uid ?? `entry-${idx}`;
        return String(id || '').trim();
    }

    getEntryDisplayName(entry, idx = 0) {
        const raw = entry && typeof entry === 'object' ? entry : {};
        const title = String(raw.comment || raw.title || '').trim();
        return title || `条目 ${idx + 1}`;
    }

    toggleBatchMode(force = null) {
        this.batchMode = force === null ? !this.batchMode : Boolean(force);
        if (!this.batchMode) {
            this.selectedEntries.clear();
        }
        this.updateBatchBar();
        this.renderList();
    }

    syncSelectedEntries() {
        const existing = new Set(this.data.entries.map((entry, idx) => this.getEntryId(entry, idx)));
        const next = new Set();
        this.selectedEntries.forEach((id) => {
            if (existing.has(id)) next.add(id);
        });
        this.selectedEntries = next;
    }

    updateBatchBar() {
        this.syncSelectedEntries();
        const count = this.selectedEntries.size;
        if (this.batchBarEl) {
            this.batchBarEl.style.display = this.batchMode ? 'flex' : 'none';
            if (this.batchCountEl) this.batchCountEl.textContent = `已选 ${count}`;
            if (this.batchCreateBtn) this.batchCreateBtn.disabled = count === 0;
        }
        this.updateManageState();
    }

    updateManageState() {
        this.syncSelectedEntries();
        const count = this.selectedEntries.size;
        if (this.manageCountEl) this.manageCountEl.textContent = `已选 ${count}`;
        const disableBatchActions = count === 0;
        if (this.manageCreateSelectedBtn) this.manageCreateSelectedBtn.disabled = disableBatchActions;
        if (this.manageDeleteBtn) this.manageDeleteBtn.disabled = disableBatchActions;
        if (this.manageMoveUpBtn) this.manageMoveUpBtn.disabled = disableBatchActions;
        if (this.manageMoveDownBtn) this.manageMoveDownBtn.disabled = disableBatchActions;
        if (this.manageMoveTopBtn) this.manageMoveTopBtn.disabled = disableBatchActions;
        if (this.manageMoveBottomBtn) this.manageMoveBottomBtn.disabled = disableBatchActions;
        this.renderManageList();
    }

    renderManageList() {
        if (!this.manageListEl) return;
        this.manageListEl.innerHTML = '';
        const compact = (text, max = 52) => {
            const raw = String(text || '').replace(/\s+/g, ' ').trim();
            if (!raw) return '';
            return raw.length > max ? `${raw.slice(0, max)}…` : raw;
        };
        this.data.entries.forEach((entry, idx) => {
            const entryId = this.getEntryId(entry, idx);
            const title = this.getEntryDisplayName(entry, idx);
            const content = compact(entry.content, 48);
            const isSelected = this.selectedEntries.has(entryId);
            const isActive = idx === this.currentIndex;
            const item = document.createElement('div');
            item.className = `world-manage-item${isActive ? ' active' : ''}${isSelected ? ' is-selected' : ''}`;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'world-manage-check';
            checkbox.checked = isSelected;
            checkbox.addEventListener('click', (event) => {
                event.stopPropagation();
                this.toggleEntrySelection(entryId);
            });
            item.appendChild(checkbox);

            const main = document.createElement('div');
            main.className = 'world-manage-item-main';
            const titleEl = document.createElement('div');
            titleEl.className = 'world-manage-item-title';
            titleEl.textContent = title;
            const subEl = document.createElement('div');
            subEl.className = 'world-manage-item-sub';
            subEl.textContent = content || '';
            main.appendChild(titleEl);
            main.appendChild(subEl);
            item.appendChild(main);

            item.addEventListener('click', () => {
                this.currentIndex = idx;
                this.toggleEntrySelection(entryId);
                this.renderEditor();
            });

            this.manageListEl.appendChild(item);
        });
    }

    toggleEntrySelection(entryId) {
        const id = String(entryId || '').trim();
        if (!id) return;
        if (this.selectedEntries.has(id)) this.selectedEntries.delete(id);
        else this.selectedEntries.add(id);
        this.updateBatchBar();
        this.renderList();
    }

    selectAllEntries() {
        this.selectedEntries = new Set(this.data.entries.map((entry, idx) => this.getEntryId(entry, idx)).filter(Boolean));
        this.updateBatchBar();
        this.renderList();
    }

    clearSelection() {
        this.selectedEntries.clear();
        this.updateBatchBar();
        this.renderList();
    }

    getSelectedEntries() {
        const selected = this.selectedEntries;
        return this.data.entries.filter((entry, idx) => selected.has(this.getEntryId(entry, idx)));
    }

    async createChatFromSelection() {
        if (!this.selectedEntries.size) {
            window.toastr?.info?.('请先选择条目');
            return;
        }
        const selected = this.getSelectedEntries();
        const firstEntry = selected[0] || null;
        const firstIdx = firstEntry ? this.data.entries.findIndex(e => this.getEntryId(e) === this.getEntryId(firstEntry)) : -1;
        const defaultName = firstEntry ? this.getEntryDisplayName(firstEntry, Math.max(0, firstIdx)) : '新聊天室';
        const name = await this.openChatNameModal(defaultName);
        if (!name || !String(name).trim()) return;
        await this.createChatFromEntries(selected, { name });
        this.clearSelection();
        this.updateBatchBar();
    }

    async createChatFromAllEntries() {
        const name = prompt('输入聊天室名称（将引用整本世界书）', this.worldName || '新聊天室');
        if (!name || !String(name).trim()) return;
        await this.createChatFromEntries(this.data.entries, { name, includeAll: true });
    }

    deleteSelectedEntries() {
        if (!this.selectedEntries.size) {
            window.toastr?.info?.('请先选择条目');
            return;
        }
        const count = this.selectedEntries.size;
        const ok = window.confirm(`确定删除已选 ${count} 个条目？此操作不可撤销。`);
        if (!ok) return;
        const selected = new Set(this.selectedEntries);
        const currentId = this.getEntryId(this.data.entries[this.currentIndex], this.currentIndex);
        this.data.entries = this.data.entries.filter((entry, idx) => !selected.has(this.getEntryId(entry, idx)));
        if (!this.data.entries.length) this.data.entries.push(createDefaultEntry(0));
        this.selectedEntries.clear();
        this.batchMode = false;
        this.currentIndex = Math.max(0, this.data.entries.findIndex((entry, idx) => this.getEntryId(entry, idx) === currentId));
        if (this.currentIndex < 0) this.currentIndex = 0;
        this.renderList();
        this.renderEditor();
    }

    moveSelectedEntries(direction = 0) {
        if (!this.selectedEntries.size) {
            window.toastr?.info?.('请先选择条目');
            return;
        }
        if (!direction) return;
        const selected = new Set(this.selectedEntries);
        const currentId = this.getEntryId(this.data.entries[this.currentIndex], this.currentIndex);
        const entries = this.data.entries;
        if (direction < 0) {
            for (let i = 1; i < entries.length; i += 1) {
                const id = this.getEntryId(entries[i], i);
                const prevId = this.getEntryId(entries[i - 1], i - 1);
                if (selected.has(id) && !selected.has(prevId)) {
                    const tmp = entries[i - 1];
                    entries[i - 1] = entries[i];
                    entries[i] = tmp;
                }
            }
        } else {
            for (let i = entries.length - 2; i >= 0; i -= 1) {
                const id = this.getEntryId(entries[i], i);
                const nextId = this.getEntryId(entries[i + 1], i + 1);
                if (selected.has(id) && !selected.has(nextId)) {
                    const tmp = entries[i + 1];
                    entries[i + 1] = entries[i];
                    entries[i] = tmp;
                }
            }
        }
        this.currentIndex = Math.max(0, entries.findIndex((entry, idx) => this.getEntryId(entry, idx) === currentId));
        if (this.currentIndex < 0) this.currentIndex = 0;
        this.renderList();
        this.renderEditor();
    }

    moveSelectedToEdge(target = 'top') {
        if (!this.selectedEntries.size) {
            window.toastr?.info?.('请先选择条目');
            return;
        }
        const selected = new Set(this.selectedEntries);
        const currentId = this.getEntryId(this.data.entries[this.currentIndex], this.currentIndex);
        const entries = this.data.entries;
        const selectedEntries = entries.filter((entry, idx) => selected.has(this.getEntryId(entry, idx)));
        const rest = entries.filter((entry, idx) => !selected.has(this.getEntryId(entry, idx)));
        this.data.entries = target === 'bottom' ? [...rest, ...selectedEntries] : [...selectedEntries, ...rest];
        this.currentIndex = Math.max(0, this.data.entries.findIndex((entry, idx) => this.getEntryId(entry, idx) === currentId));
        if (this.currentIndex < 0) this.currentIndex = 0;
        this.renderList();
        this.renderEditor();
    }

    renderList() {
        if (!this.entriesListEl) return;
        this.updateBatchBar();
        this.entriesListEl.innerHTML = '';
        const searchTerm = this.getEntrySearchTerm();
        const filtered = this.getFilteredEntries(searchTerm);

        const rawSize = Number(this.entryPageSize);
        const pageSize = Math.max(1, Math.min(200, Number.isFinite(rawSize) ? Math.trunc(rawSize) : 5));
        this.entryPageSize = pageSize;
        if (this.entryPageSizeEl) this.entryPageSizeEl.value = String(pageSize);

        const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
        this.entryTotalPages = totalPages;

        this.entryPageIndex = Math.min(Math.max(0, this.entryPageIndex), totalPages - 1);

        const buildEntryItem = (entry, i) => {
            const entryId = this.getEntryId(entry, i);
            const isSelected = this.selectedEntries.has(entryId);
            const item = document.createElement('div');
            item.className = `world-entry-item ${i === this.currentIndex ? 'active' : ''}`;
            if (this.batchMode && isSelected) item.classList.add('is-selected');

            const lights = document.createElement('div');
            lights.className = 'world-entry-lights';
            const green = document.createElement('span');
            const greenState = entry.disable ? 'red' : (entry.selective && !entry.constant ? 'green' : '');
            green.className = `world-entry-light ${greenState}`;
            const blue = document.createElement('span');
            blue.className = `world-entry-light ${entry.constant ? 'blue' : ''}`;
            lights.appendChild(green);
            lights.appendChild(blue);

            const main = document.createElement('div');
            main.className = 'world-entry-main';
            const title = document.createElement('div');
            title.className = 'world-entry-title';
            title.textContent = entry.comment || `（无标题 ${i + 1}）`;
            const meta = document.createElement('div');
            meta.className = 'world-entry-meta';
            const pos = positionLabel(entry.position, entry.role, entry.depth);
            meta.innerHTML = `
                <span>${pos}</span>
                <span>D${entry.depth}</span>
                <span>O${entry.order}</span>
                <span>${entry.useProbability ? `${entry.probability}%` : '100%'}</span>
            `;
            main.appendChild(title);
            main.appendChild(meta);

            if (this.batchMode) {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.className = 'world-entry-select';
                checkbox.checked = isSelected;
                checkbox.addEventListener('click', (event) => {
                    event.stopPropagation();
                    this.toggleEntrySelection(entryId);
                });
                item.appendChild(checkbox);
            }
            item.appendChild(lights);
            item.appendChild(main);
            item.onclick = () => this.selectEntry(i);
            return item;
        };

        if (!filtered.length) {
            const pageEl = document.createElement('li');
            pageEl.className = 'world-entry-page';
            const list = document.createElement('div');
            list.className = 'world-entry-page-list';
            const empty = document.createElement('div');
            empty.className = 'world-entry-empty';
            empty.textContent = searchTerm ? '没有匹配的条目' : '（无条目）';
            list.appendChild(empty);
            pageEl.appendChild(list);
            this.entriesListEl.appendChild(pageEl);
            this.updateEntryPageIndicator();
            requestAnimationFrame(() => this.scrollEntryListToPage());
            return;
        }

        for (let page = 0; page < totalPages; page += 1) {
            const pageEl = document.createElement('li');
            pageEl.className = 'world-entry-page';
            const list = document.createElement('div');
            list.className = 'world-entry-page-list';
            const start = page * pageSize;
            const end = Math.min(start + pageSize, filtered.length);
            for (let idx = start; idx < end; idx += 1) {
                const { entry, idx: originalIndex } = filtered[idx];
                list.appendChild(buildEntryItem(entry, originalIndex));
            }
            pageEl.appendChild(list);
            this.entriesListEl.appendChild(pageEl);
        }
        this.updateEntryPageIndicator();
        requestAnimationFrame(() => this.scrollEntryListToPage());
    }

    getEntrySearchTerm() {
        return String(this.entrySearchTerm || '').trim().toLowerCase();
    }

    getFilteredEntries(searchTerm = this.getEntrySearchTerm()) {
        return this.data.entries
            .map((entry, idx) => ({ entry, idx }))
            .filter(({ entry }) => {
                if (!searchTerm) return true;
                const parts = [];
                if (entry?.comment) parts.push(entry.comment);
                if (entry?.content) parts.push(entry.content);
                if (Array.isArray(entry?.key)) parts.push(entry.key.join(' '));
                if (!Array.isArray(entry?.key) && entry?.key) parts.push(entry.key);
                if (Array.isArray(entry?.keysecondary)) parts.push(entry.keysecondary.join(' '));
                if (!Array.isArray(entry?.keysecondary) && entry?.keysecondary) parts.push(entry.keysecondary);
                if (entry?.id) parts.push(entry.id);
                const haystack = parts.join(' ').toLowerCase();
                return haystack.includes(searchTerm);
            });
    }

    updateEntryPageIndicator() {
        const total = Math.max(1, this.entryTotalPages || 1);
        const current = Math.min(Math.max(0, this.entryPageIndex), total - 1);
        if (this.entryPageIndicatorEl) this.entryPageIndicatorEl.textContent = `${current + 1}/${total}`;
        if (this.entryPagePrevBtn) this.entryPagePrevBtn.disabled = current <= 0;
        if (this.entryPageNextBtn) this.entryPageNextBtn.disabled = current >= total - 1;
        if (this.entryDotsEl) {
            this.entryDotsEl.innerHTML = '';
            if (total <= 1) {
                this.entryDotsEl.style.display = 'none';
                return;
            }
            this.entryDotsEl.style.display = 'flex';
            for (let i = 0; i < total; i += 1) {
                const dot = document.createElement('button');
                dot.type = 'button';
                dot.className = `world-entries-dot${i === current ? ' active' : ''}`;
                dot.setAttribute('aria-label', `第 ${i + 1} 页`);
                dot.addEventListener('click', () => {
                    this.entryPageIndex = i;
                    this.renderList();
                });
                this.entryDotsEl.appendChild(dot);
            }
        }
    }

    scrollEntryListToPage() {
        if (!this.entriesListEl) return;
        const width = this.entriesListEl.clientWidth;
        if (!width) return;
        const target = Math.round(width * this.entryPageIndex);
        this.entryPageScrollLock = true;
        this.entriesListEl.scrollTo({ left: target, behavior: 'auto' });
        window.setTimeout(() => {
            this.entryPageScrollLock = false;
        }, 120);
    }

    selectEntry(index) {
        this.currentIndex = Math.max(0, Math.min(index, this.data.entries.length - 1));
        const filtered = this.getFilteredEntries();
        const currentPos = filtered.findIndex(item => item.idx === this.currentIndex);
        if (currentPos >= 0) {
            const rawSize = Number(this.entryPageSize);
            const pageSize = Math.max(1, Math.min(200, Number.isFinite(rawSize) ? Math.trunc(rawSize) : 5));
            this.entryPageIndex = Math.floor(currentPos / pageSize);
        }
        this.renderList();
        this.renderEditor();
    }

    renderEditor() {
        if (!this.editorEl) return;
        const entry = this.data.entries[this.currentIndex];
        if (!entry) {
            this.editorEl.innerHTML = '<div style="color:#888;">（无条目）</div>';
            return;
        }

        const buildOptions = (opts, selected) =>
            opts.map(o => `<option value="${o.value}" ${Number(selected) === o.value ? 'selected' : ''}>${o.label}</option>`).join('');

        const aiBusy = this.aiBusy && String(entry.id || '') === String(this.aiPendingEntryId || '');
        this.editorEl.innerHTML = `
            <div class="world-entry-form">
                <label>标题 / Memo</label>
                <input type="text" id="we-comment" value="${entry.comment || ''}" placeholder="条目标题（可选）">

                <div class="world-entry-label-row">
                    <label for="we-content">内容</label>
                    <button type="button" class="world-ai-trigger" id="we-ai-generate" ${aiBusy ? 'disabled' : ''}>${aiBusy ? '生成中...' : 'AI生成'}</button>
                </div>
                <textarea id="we-content" placeholder="条目内容">${entry.content || ''}</textarea>

                <div class="world-entry-row">
                    <div class="col">
                        <label>主触发关键词（key）</label>
                        <textarea id="we-key" placeholder="用逗号或换行分隔">${(entry.key || []).join(', ')}</textarea>
                    </div>
                    <div class="col">
                        <label>副触发关键词（keysecondary）</label>
                        <textarea id="we-keysecondary" placeholder="用逗号或换行分隔">${(entry.keysecondary || []).join(', ')}</textarea>
                    </div>
                </div>
                <div class="world-entry-row">
                    <div class="col">
                        <label>位置（position）</label>
                        <select id="we-position">${buildOptions(POSITION_OPTIONS, entry.position)}</select>
                    </div>
                    <div class="col">
                        <label>深度（depth）</label>
                        <input type="number" id="we-depth" min="0" max="1000" value="${entry.depth}">
                    </div>
                    <div class="col">
                        <label>顺序 / Order</label>
                        <input type="number" id="we-order" min="-9999" max="9999" value="${entry.order}">
                    </div>
                </div>

                <div class="world-entry-row">
                    <div class="col">
                        <label>触发概率（Trigger %）</label>
                        <input type="number" id="we-probability" min="0" max="100" value="${entry.probability}">
                    </div>
                    <div class="col">
                        <label>&nbsp;</label>
                        <div class="world-entry-toggles">
                            <label><input type="checkbox" id="we-useProbability" ${entry.useProbability ? 'checked' : ''}> 启用概率</label>
                        </div>
                    </div>
                    <div class="col" id="we-role-wrap" style="${Number(entry.position) === 4 ? '' : 'display:none;'}">
                        <label>插入角色（role）</label>
                        <select id="we-role">${buildOptions(ROLE_OPTIONS, entry.role)}</select>
                    </div>
                </div>

                <div class="world-entry-section">
                    <label>状态（绿灯 / 蓝灯等）</label>
                    <div class="world-entry-toggles">
                        <label><input type="checkbox" id="we-disable" ${entry.disable ? 'checked' : ''}> 禁用（红灯）</label>
                        <label><input type="checkbox" id="we-constant" ${entry.constant ? 'checked' : ''}> 常驻（蓝灯）</label>
                        <label><input type="checkbox" id="we-selective" ${entry.selective ? 'checked' : ''}> 选择性触发（绿灯）</label>
                        <label><input type="checkbox" id="we-ignoreBudget" ${entry.ignoreBudget ? 'checked' : ''}> 忽略预算</label>
                        <label><input type="checkbox" id="we-excludeRecursion" ${entry.excludeRecursion ? 'checked' : ''}> 不参与递归</label>
                        <label><input type="checkbox" id="we-preventRecursion" ${entry.preventRecursion ? 'checked' : ''}> 阻止递归</label>
                    </div>

                    <label style="margin-top:8px;">选择性逻辑（Selective Logic）</label>
                    <select id="we-selectiveLogic">${buildOptions(SELECTIVE_LOGIC_OPTIONS, entry.selectiveLogic)}</select>
                </div>

                <div class="world-entry-section">
                    <label>匹配来源（Match）</label>
                    <div class="world-entry-toggles">
                        <label><input type="checkbox" id="we-matchPersonaDescription" ${entry.matchPersonaDescription ? 'checked' : ''}> Persona 描述</label>
                        <label><input type="checkbox" id="we-matchCharacterDescription" ${entry.matchCharacterDescription ? 'checked' : ''}> 角色描述</label>
                        <label><input type="checkbox" id="we-matchCharacterPersonality" ${entry.matchCharacterPersonality ? 'checked' : ''}> 角色性格</label>
                        <label><input type="checkbox" id="we-matchCharacterDepthPrompt" ${entry.matchCharacterDepthPrompt ? 'checked' : ''}> 角色深度提示</label>
                        <label><input type="checkbox" id="we-matchScenario" ${entry.matchScenario ? 'checked' : ''}> 场景</label>
                        <label><input type="checkbox" id="we-matchCreatorNotes" ${entry.matchCreatorNotes ? 'checked' : ''}> 作者注释</label>
                    </div>
                </div>

                <div class="world-entry-section">
                    <div class="world-entry-row">
                        <div class="col">
                            <label>纳入组（group）</label>
                            <input type="text" id="we-group" value="${entry.group || ''}" placeholder="逗号分隔多个组">
                        </div>
                        <div class="col">
                            <label>组权重（groupWeight）</label>
                            <input type="number" id="we-groupWeight" min="0" max="9999" value="${entry.groupWeight}">
                        </div>
                    </div>
                    <div class="world-entry-toggles" style="margin-top:6px;">
                        <label><input type="checkbox" id="we-groupOverride" ${entry.groupOverride ? 'checked' : ''}> 允许覆盖同组</label>
                        <label><input type="checkbox" id="we-caseSensitive" ${entry.caseSensitive ? 'checked' : ''}> 区分大小写（覆盖）</label>
                        <label><input type="checkbox" id="we-matchWholeWords" ${entry.matchWholeWords ? 'checked' : ''}> 全词匹配（覆盖）</label>
                        <label><input type="checkbox" id="we-useGroupScoring" ${entry.useGroupScoring ? 'checked' : ''}> 组打分（覆盖）</label>
                    </div>
                    <label style="margin-top:6px;">扫描深度覆盖（scanDepth，可空）</label>
                    <input type="number" id="we-scanDepth" min="0" max="1000" value="${entry.scanDepth ?? ''}" placeholder="留空使用全局设置">
                </div>

                <div class="world-entry-actions">
                    <button id="we-duplicate">复制条目</button>
                    <button id="we-delete">删除条目</button>
                </div>
            </div>
        `;

        const q = (sel) => this.editorEl.querySelector(sel);
        const markRefDirty = () => {
            if (this.refMode) this.scheduleRefSync();
        };
        const bindInput = (sel, key, map = (v) => v) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('input', () => {
                entry[key] = map(el.value);
                if (key === 'comment') this.renderList();
                markRefDirty();
            });
        };
        const bindNumber = (sel, key, def, min, max) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('input', () => {
                let v = toNumber(el.value, def);
                if (min != null) v = Math.max(min, v);
                if (max != null) v = Math.min(max, v);
                entry[key] = v;
                if (key === 'order' || key === 'depth' || key === 'position') this.renderList();
                markRefDirty();
            });
        };
        const bindCheck = (sel, key) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('change', () => {
                entry[key] = el.checked;
                this.renderList();
                markRefDirty();
            });
        };

        bindInput('#we-comment', 'comment', (v) => v);
        bindInput('#we-content', 'content', (v) => v);
        bindInput('#we-key', 'key', (v) => normalizeArray(v));
        bindInput('#we-keysecondary', 'keysecondary', (v) => normalizeArray(v));

        bindNumber('#we-depth', 'depth', DEFAULT_DEPTH, 0, 1000);
        bindNumber('#we-order', 'order', 100, -9999, 9999);
        bindNumber('#we-probability', 'probability', 100, 0, 100);
        bindNumber('#we-groupWeight', 'groupWeight', DEFAULT_WEIGHT, 0, 9999);
        bindNumber('#we-delayUntilRecursion', 'delayUntilRecursion', 0, 0, 9999);

        const posEl = q('#we-position');
        if (posEl) {
            posEl.addEventListener('change', () => {
                entry.position = toNumber(posEl.value, 0);
                const roleWrap = q('#we-role-wrap');
                if (roleWrap) roleWrap.style.display = Number(entry.position) === 4 ? '' : 'none';
                this.renderList();
                markRefDirty();
            });
        }

        const roleEl = q('#we-role');
        if (roleEl) {
            roleEl.addEventListener('change', () => {
                entry.role = toNumber(roleEl.value, 0);
                this.renderList();
                markRefDirty();
            });
        }

        const logicEl = q('#we-selectiveLogic');
        if (logicEl) {
            logicEl.addEventListener('change', () => {
                entry.selectiveLogic = toNumber(logicEl.value, 0);
                markRefDirty();
            });
        }

        // 覆盖类字段：checkbox 表示 true；若取消则置 null（表示不覆盖）
        const bindOverrideCheck = (sel, key) => {
            const el = q(sel);
            if (!el) return;
            el.addEventListener('change', () => {
                entry[key] = el.checked ? true : null;
                markRefDirty();
            });
        };

        const disableEl = q('#we-disable');
        const constantEl = q('#we-constant');
        const selectiveEl = q('#we-selective');
        const syncLightChecks = () => {
            if (disableEl) disableEl.checked = Boolean(entry.disable);
            if (constantEl) constantEl.checked = Boolean(entry.constant);
            if (selectiveEl) selectiveEl.checked = Boolean(entry.selective);
        };
        const updateLightState = (type, checked) => {
            if (type === 'disable') {
                entry.disable = Boolean(checked);
                if (checked) {
                    entry.constant = false;
                    entry.selective = false;
                }
            } else if (type === 'constant') {
                entry.constant = Boolean(checked);
                if (checked) {
                    entry.disable = false;
                    entry.selective = false;
                }
            } else if (type === 'selective') {
                entry.selective = Boolean(checked);
                if (checked) {
                    entry.disable = false;
                    entry.constant = false;
                }
            }
            syncLightChecks();
            this.renderList();
            markRefDirty();
        };
        if (disableEl) disableEl.addEventListener('change', () => updateLightState('disable', disableEl.checked));
        if (constantEl) constantEl.addEventListener('change', () => updateLightState('constant', constantEl.checked));
        if (selectiveEl) selectiveEl.addEventListener('change', () => updateLightState('selective', selectiveEl.checked));
        syncLightChecks();

        bindCheck('#we-ignoreBudget', 'ignoreBudget');
        bindCheck('#we-excludeRecursion', 'excludeRecursion');
        bindCheck('#we-preventRecursion', 'preventRecursion');

        bindCheck('#we-matchPersonaDescription', 'matchPersonaDescription');
        bindCheck('#we-matchCharacterDescription', 'matchCharacterDescription');
        bindCheck('#we-matchCharacterPersonality', 'matchCharacterPersonality');
        bindCheck('#we-matchCharacterDepthPrompt', 'matchCharacterDepthPrompt');
        bindCheck('#we-matchScenario', 'matchScenario');
        bindCheck('#we-matchCreatorNotes', 'matchCreatorNotes');

        bindInput('#we-group', 'group', (v) => v);
        bindCheck('#we-groupOverride', 'groupOverride');

        bindOverrideCheck('#we-caseSensitive', 'caseSensitive');
        bindOverrideCheck('#we-matchWholeWords', 'matchWholeWords');
        bindOverrideCheck('#we-useGroupScoring', 'useGroupScoring');

        const scanDepthEl = q('#we-scanDepth');
        if (scanDepthEl) {
            scanDepthEl.addEventListener('input', () => {
                const v = scanDepthEl.value.trim();
                entry.scanDepth = v === '' ? null : toNumber(v, null);
                markRefDirty();
            });
        }

        bindCheck('#we-useProbability', 'useProbability');

        const dupBtn = q('#we-duplicate');
        if (dupBtn) {
            if (this.refMode) {
                dupBtn.disabled = true;
                dupBtn.style.opacity = '0.6';
                dupBtn.style.cursor = 'not-allowed';
            } else {
                dupBtn.onclick = () => this.duplicateEntry(this.currentIndex);
            }
        }
        const delBtn = q('#we-delete');
        if (delBtn) {
            if (this.refMode) {
                delBtn.disabled = true;
                delBtn.style.opacity = '0.6';
                delBtn.style.cursor = 'not-allowed';
            } else {
                delBtn.onclick = () => this.deleteEntry(this.currentIndex);
            }
        }
        const aiBtn = q('#we-ai-generate');
        if (aiBtn) aiBtn.onclick = () => this.showAiModal(entry);
    }

    addEntry() {
        const newEntry = createDefaultEntry(this.data.entries.length);
        newEntry.id = `entry-${Date.now()}`;
        this.data.entries.unshift(newEntry);
        this.selectEntry(0);
    }

    duplicateEntry(index) {
        const base = this.data.entries[index];
        if (!base) return;
        const copy = normalizeEntry(deepClone(base), this.data.entries.length);
        copy.id = `entry-${Date.now()}`;
        copy.comment = `${copy.comment || 'entry'}（复制）`;
        this.data.entries.splice(index + 1, 0, copy);
        this.selectEntry(index + 1);
    }

    deleteEntry(index) {
        if (this.data.entries.length <= 1) {
            window.toastr?.warning('至少保留一个条目');
            return;
        }
        this.data.entries.splice(index, 1);
        this.selectEntry(Math.max(0, index - 1));
    }

    ensureUniqueSessionId(baseName, contactsStore) {
        const name = String(baseName || '').trim() || '新聊天室';
        let sessionId = name;
        let idx = 1;
        while (contactsStore.getContact(sessionId)) {
            sessionId = `${name}_${idx}`;
            idx += 1;
        }
        return { sessionId, name };
    }

    async ensureUniqueWorldbookId(baseName, { allowUnicode = false } = {}) {
        const sanitize = (value, fallback = 'worldbook') => {
            const raw = String(value || '').trim();
            if (allowUnicode) return raw || fallback;
            const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 48);
            return cleaned || fallback;
        };
        const worldStore = window.appBridge?.worldStore;
        try {
            await worldStore?.ready;
        } catch {}
        const base = sanitize(baseName, 'worldbook');
        if (!worldStore?.load?.(base)) return base;
        let idx = 1;
        while (idx < 9999) {
            const next = `${base}_${idx}`;
            if (!worldStore?.load?.(next)) return next;
            idx += 1;
        }
        return `${base}_${Date.now()}`;
    }

    buildWorldRefs(entries = [], { includeAll = false } = {}) {
        const sourceWorldId = String(this.worldName || '').trim();
        if (!sourceWorldId) return [];
        if (includeAll) {
            return [{ sourceId: sourceWorldId, includeAll: true }];
        }
        const list = Array.isArray(entries) ? entries : [];
        const refs = [];
        const seen = new Set();
        list.forEach((entry, idx) => {
            const entryId = this.getEntryId(entry, idx);
            if (!entryId || seen.has(entryId)) return;
            seen.add(entryId);
            refs.push({ sourceId: sourceWorldId, entryId });
        });
        return refs;
    }

    async resolveRefEntriesForDisplay(refs = []) {
        const list = Array.isArray(refs) ? refs : [];
        if (!list.length) return [];
        const results = [];
        const cache = new Map();
        for (const raw of list) {
            const ref = raw && typeof raw === 'object' ? raw : {};
            const sourceId = String(ref.sourceId || ref.worldId || ref.source || '').trim();
            if (!sourceId) continue;
            if (!cache.has(sourceId)) {
                let sourceData = null;
                try {
                    sourceData = await window.appBridge?.getWorldInfo?.(sourceId);
                } catch {}
                cache.set(sourceId, sourceData || null);
            }
            const sourceData = cache.get(sourceId);
            const sourceEntries = Array.isArray(sourceData?.entries) ? sourceData.entries : [];
            if (!sourceEntries.length) continue;
            const entryIdRaw = String(ref.entryId || ref.entry || '').trim();
            const entryIds = Array.isArray(ref.entryIds)
                ? ref.entryIds.map(val => String(val || '').trim()).filter(Boolean)
                : [];
            const includeAll = ref.includeAll === true || ref.all === true || entryIdRaw === '*' || entryIds.includes('*');
            let picked = sourceEntries;
            if (!includeAll) {
                const idSet = new Set(entryIds);
                if (entryIdRaw) idSet.add(entryIdRaw);
                picked = idSet.size
                    ? sourceEntries.filter(entry => idSet.has(String(entry?.id ?? entry?.uid ?? '').trim()))
                    : [];
            }
            picked.forEach((entry, idx) => {
                if (!entry) return;
                const entryId = String(entry?.id ?? entry?.uid ?? `entry-${idx}`).trim();
                results.push({ ...entry, _refSourceId: sourceId, _refEntryId: entryId });
            });
        }
        return results;
    }

    async createChatFromEntries(entries, { name = '', includeAll = false } = {}) {
        const list = Array.isArray(entries) ? entries.filter(Boolean) : [];
        if (!list.length) {
            window.toastr?.warning?.('未选择任何条目');
            return;
        }
        const contactsStore = window.appBridge?.contactsStore;
        const chatStore = window.appBridge?.chatStore;
        if (!contactsStore || !chatStore) {
            window.toastr?.warning?.('联系人/会话尚未就绪');
            return;
        }
        const baseName = String(name || '').trim() || String(list[0]?.comment || list[0]?.title || '新聊天室').trim() || '新聊天室';
        const { sessionId, name: resolvedName } = this.ensureUniqueSessionId(baseName, contactsStore);
        contactsStore.upsertContact({
            id: sessionId,
            name: resolvedName,
            avatar: '',
            isGroup: false,
            addedAt: Date.now(),
            description: '',
            source: 'world_entry',
            isUserCreated: true,
        });
        if (typeof chatStore._ensureSession === 'function') {
            chatStore._ensureSession(sessionId);
            const settings = chatStore.getSessionSettings?.(sessionId) || {};
            chatStore.setSessionSettings?.(sessionId, { ...settings, sharedVariables: true, sharedMemory: true });
            chatStore._persist?.();
        }
        window.dispatchEvent(new CustomEvent('contacts-updated', { detail: { id: sessionId, source: 'world_entry' } }));
        list.forEach((entry) => {
            const splitTo = Array.isArray(entry.splitTo) ? entry.splitTo.slice() : [];
            if (!splitTo.includes(sessionId)) splitTo.push(sessionId);
            entry.splitTo = splitTo;
        });
        const refs = this.buildWorldRefs(list, { includeAll });
        if (refs.length) {
            const worldName = resolvedName;
            const worldId = await this.ensureUniqueWorldbookId(worldName, { allowUnicode: true });
            const payload = {
                name: worldName,
                entries: [],
                refs,
                source: 'world_entry',
            };
            await window.appBridge?.saveWorldInfo?.(worldId, payload);
            window.appBridge?.bindWorldToSession?.(sessionId, worldId, { silent: true });
        } else {
            window.toastr?.warning?.('未能创建引用世界书，请稍后重试');
        }
        this.renderList();
        this.renderEditor();
        this.saveWorldSilently?.({ showToast: false });
        window.toastr?.success?.(`已创建聊天室：${resolvedName}`);
    }

    async createChatFromEntry(entry) {
        if (!entry) return;
        await this.createChatFromEntries([entry], { name: entry.comment || entry.title || '' });
    }

    prepareForSave(nameOverride = this.worldName) {
        const sourceEntries = this.refMode ? (this.refLocalEntries || []) : this.data.entries;
        const entries = sourceEntries.map((entry, i) => {
            const e = normalizeEntry(entry, i);
            // 兼容旧命名
            e.title = e.comment;
            e.triggers = e.key;
            e.secondary = e.keysecondary;
            e.priority = e.order;
            return e;
        });
        return { ...(this.data || {}), name: nameOverride, entries };
    }

    async saveRefEdits({ showToast = true } = {}) {
        try {
            const list = Array.isArray(this.data?.entries) ? this.data.entries : [];
            if (!list.length) {
                if (showToast) window.toastr?.warning?.('没有可同步的条目');
                return false;
            }
            const updatesBySource = new Map();
            list.forEach((entry, idx) => {
                const sourceId = String(entry?._refSourceId || '').trim();
                if (!sourceId) return;
                const targetId = String(entry?._refEntryId ?? entry?.id ?? entry?.uid ?? '').trim();
                const fallbackIndex = Number.isFinite(Number(entry?._refEntryIndex)) ? Number(entry._refEntryIndex) : idx;
                const cleaned = normalizeEntry(deepClone(entry), idx);
                delete cleaned._refSourceId;
                delete cleaned._refWorldId;
                delete cleaned._refEntryId;
                delete cleaned._refEntryIndex;
                if (targetId) cleaned.id = targetId;
                if (cleaned.uid == null && /^\d+$/.test(cleaned.id)) cleaned.uid = Number(cleaned.id);
                if (!updatesBySource.has(sourceId)) updatesBySource.set(sourceId, []);
                updatesBySource.get(sourceId).push({ targetId, fallbackIndex, data: cleaned });
            });
            if (!updatesBySource.size) {
                if (showToast) window.toastr?.warning?.('未找到可同步的来源世界书');
                return false;
            }
            const updatedSources = [];
            let updatedCount = 0;
            let failedCount = 0;
            for (const [sourceId, updates] of updatesBySource.entries()) {
                let sourceData = null;
                try {
                    sourceData = await window.appBridge?.getWorldInfo?.(sourceId);
                } catch {}
                if (!sourceData || !Array.isArray(sourceData.entries)) {
                    failedCount += updates.length;
                    continue;
                }
                const nextEntries = sourceData.entries.map((item) => ({ ...item }));
                let localUpdated = 0;
                updates.forEach(({ targetId, fallbackIndex, data }) => {
                    let idx = -1;
                    if (targetId) {
                        idx = nextEntries.findIndex(item => String(item?.id ?? item?.uid ?? '').trim() === targetId);
                    }
                    if (idx < 0 && Number.isFinite(fallbackIndex) && fallbackIndex >= 0 && fallbackIndex < nextEntries.length) {
                        idx = fallbackIndex;
                    }
                    if (idx < 0) return;
                    nextEntries[idx] = { ...nextEntries[idx], ...data };
                    localUpdated += 1;
                });
                if (localUpdated > 0) {
                    await window.appBridge?.saveWorldInfo?.(sourceId, { ...sourceData, entries: nextEntries });
                    updatedCount += localUpdated;
                    updatedSources.push(sourceId);
                }
            }
            if (showToast) {
                if (updatedCount > 0) {
                    const labels = updatedSources.length ? `（${updatedSources.join('、')}）` : '';
                    window.toastr?.success?.(`已同步到来源世界书${labels}`);
                } else {
                    window.toastr?.warning?.('未找到可同步的条目');
                }
                if (failedCount > 0) {
                    window.toastr?.warning?.('部分来源世界书不可用，已跳过');
                }
            }
            return updatedCount > 0;
        } catch (err) {
            logger.error('同步引用世界书失败', err);
            if (showToast) window.toastr?.error?.('同步失败，请检查控制台');
            return false;
        }
    }

    sanitizeExportName(name, fallback = 'worldbook') {
        const raw = String(name || '').trim();
        const safe = raw.replace(/[\\/:*?"<>|]+/g, '_').trim();
        return safe || fallback;
    }

    async pickSavePath(defaultName) {
        if (isAndroid()) {
            return { path: '', cancelled: false, fallback: true };
        }
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const result = await save({
                defaultPath: defaultName,
                filters: [{ name: 'JSON', extensions: ['json'] }],
            });
            if (!result) return { path: '', cancelled: true, fallback: false };
            return { path: result, cancelled: false, fallback: false };
        } catch (err) {
            logger.warn('世界书导出：保存对话框不可用', err);
            return { path: '', cancelled: false, fallback: true };
        }
    }

    async exportWorld() {
        try {
            const nextName = String(this.nameInputEl?.value || '').trim();
            if (!nextName) {
                window.toastr?.warning('名称不能为空');
                return;
            }
            const payload = this.prepareForSave(nextName);

            // 追加绑定正则集合（便于导入时自动带上）
            try {
                await window.appBridge?.regex?.ready;
                const sets = window.appBridge?.regex?.listLocalSets?.() || [];
                const bound = sets
                    .filter(s => s?.bind?.type === 'world' && s.bind.worldId === nextName)
                    .map(s => ({ name: s.name, enabled: s.enabled !== false, rules: s.rules || [] }));
                if (bound.length) payload.boundRegexSets = bound;
            } catch {}

            const baseName = String(nextName || '').trim() || 'worldbook';
            const filename = baseName.toLowerCase().endsWith('.json')
                ? baseName
                : `${baseName}.json`;

            if (!hasTauriRuntime()) {
                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                window.toastr?.success(`已导出：${filename}`);
                return;
            }

            const pick = await this.pickSavePath(filename);
            if (pick.cancelled) return;
            const dataUrl = buildJsonDataUrl(payload);
            const resp = pick.fallback
                ? await safeInvoke('export_attachment', { dataUrl, fileName: filename })
                : await safeInvoke('export_attachment', { dataUrl, fileName: filename, path: pick.path });
            const savedPath = String(resp?.path || '').trim();
            if (savedPath) {
                window.toastr?.success(`已导出：${savedPath}`);
            } else {
                window.toastr?.success(`已导出：${filename}`);
            }
        } catch (err) {
            logger.error('导出世界书失败', err);
            window.toastr?.error('导出失败');
        }
    }

    async saveWorld() {
        try {
            if (this.refMode) {
                const ok = await this.saveRefEdits({ showToast: true });
                if (ok) this.onSaved?.(this.worldName, this.data);
                this.hide();
                return;
            }
            const nextName = String(this.nameInputEl?.value || '').trim();
            if (!nextName) {
                window.toastr?.warning('名称不能为空');
                return;
            }
            const payload = this.prepareForSave(nextName);
            if (nextName !== this.worldName) {
                const existing = await window.appBridge.listWorlds?.();
                if (Array.isArray(existing) && existing.includes(nextName)) {
                    window.toastr?.warning('名称已存在，请换一个');
                    return;
                }
                await window.appBridge.renameWorldInfo?.(this.worldName, nextName, payload);
                this.worldName = nextName;
            } else {
                await window.appBridge.saveWorldInfo(this.worldName, payload);
            }
            window.toastr?.success(`世界书已保存：${this.worldName}`);
            this.onSaved?.(this.worldName, payload);
            this.hide();
        } catch (err) {
            logger.error('保存世界书失败', err);
            window.toastr?.error('保存失败，请检查控制台');
        }
    }

    async saveWorldSilently({ showToast = true } = {}) {
        try {
            if (this.refMode) {
                const ok = await this.saveRefEdits({ showToast });
                if (ok) this.onSaved?.(this.worldName, this.data);
                return ok;
            }
            const nextName = String(this.nameInputEl?.value || '').trim();
            if (!nextName) {
                if (showToast) window.toastr?.warning?.('名称不能为空');
                return false;
            }
            const payload = this.prepareForSave(nextName);
            if (nextName !== this.worldName) {
                const existing = await window.appBridge.listWorlds?.();
                if (Array.isArray(existing) && existing.includes(nextName)) {
                    if (showToast) window.toastr?.warning?.('名称已存在，无法自动保存');
                    return false;
                }
                await window.appBridge.renameWorldInfo?.(this.worldName, nextName, payload);
                this.worldName = nextName;
            } else {
                await window.appBridge.saveWorldInfo(this.worldName, payload);
            }
            this.onSaved?.(this.worldName, payload);
            if (showToast) window.toastr?.success?.(`世界书已保存：${this.worldName}`);
            return true;
        } catch (err) {
            logger.error('自动保存世界书失败', err);
            if (showToast) window.toastr?.error?.('自动保存失败');
            return false;
        }
    }
}
