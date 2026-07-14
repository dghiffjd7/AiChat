/**
 * Regex panel (Global / Character / Preset)
 * - Global rules always apply
 * - Character sets apply when their bound world book is active
 * - Preset sets apply when their bound preset is active
 */
import { RegexStore, isLocalRegexSetAutoActive, regex_placement } from '../storage/regex-store.js';
import { logger } from '../utils/logger.js';
import { appConfirm } from './app-confirm.js';
import { bindCustomSelectButton, closeCustomSelectMenu } from './custom-select.js';
import { getPresetStore } from './preset-store-runtime-utils.js';
import {
    REGEX_CUSTOM_PROMPT_PRESET_LABEL,
    buildRegexCustomPromptPresetBind,
    buildRegexCustomPromptPresetBindSummary,
    getRegexCustomPromptPresetBindIds,
    listRegexCustomPromptPresetChoices,
} from './regex-preset-binding-utils.js';
import { getRegexContext } from './regex-store-runtime-utils.js';
import { listWorldIds } from './world-store-runtime-utils.js';
import {
    downloadJsonFile,
    flattenRegexImportRules,
    genRegexId,
    getRegexImportSetName,
    normalizeRegexScript,
    parseRegexImportText,
    pickJsonFileText,
} from '../utils/regex-transfer.js';

const deepClone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const placementLabels = {
    [regex_placement.USER_INPUT]: '用户输入',
    [regex_placement.AI_OUTPUT]: 'AI输出',
    [regex_placement.SLASH_COMMAND]: 'Slash',
    [regex_placement.WORLD_INFO]: '世界书',
    [regex_placement.REASONING]: '推理',
};

const PRESET_TYPES = [
    { id: 'sysprompt', label: '系统提示词' },
    { id: 'context', label: '上下文模板' },
    { id: 'instruct', label: 'Instruct 模板' },
    { id: 'openai', label: '自定义提示词预设' },
    { id: 'reasoning', label: '推理格式' },
];

const PANEL_HEADER_STYLE = 'padding:14px 16px; border-bottom:1px solid var(--app-border-subtle); background:var(--app-surface-panel); display:flex; align-items:center; justify-content:space-between; gap:10px;';
const PANEL_SUBHEADER_STYLE = 'padding:10px 16px; border-bottom:1px solid var(--app-border-subtle); background:var(--app-surface-card); display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
const RULE_CARD_STYLE = 'border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); overflow:hidden;';
const RULE_HEADER_STYLE = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-subtle); cursor:pointer;';
const SECTION_BOX_STYLE = 'flex:1; min-width: 260px; border:1px solid var(--app-border-subtle); border-radius:8px; padding:10px; background:var(--app-surface-subtle);';
const DANGER_BUTTON_STYLE = 'padding:6px 10px; border:1px solid rgba(239,68,68,0.35); border-radius:8px; background:var(--app-surface-card); color:#f87171; cursor:pointer; font-size:12px;';
const REGEX_PANEL_STYLE_ID = 'regex-panel-runtime-style';

const ensureRegexPanelStyles = () => {
    if (typeof document === 'undefined') return;
    if (document.getElementById(REGEX_PANEL_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = REGEX_PANEL_STYLE_ID;
    style.textContent = `
        #regex-panel .regex-tab {
            border: none;
            background: transparent;
            padding: 8px 12px;
            border-radius: 8px;
            cursor: pointer;
            font-size: 13px;
            color: var(--app-text-secondary);
            font-weight: 700;
        }
        #regex-panel .regex-tab.is-active {
            background: var(--app-border-default);
            color: var(--app-text-primary);
            font-weight: 900;
        }
        #regex-panel .regex-btn {
            padding: 8px 10px;
            border: 1px solid var(--app-border-default);
            border-radius: 8px;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            cursor: pointer;
            font-size: 13px;
            font-weight: 700;
            white-space: nowrap;
        }
        #regex-panel .regex-btn-primary {
            border: none;
            background: #019aff;
            color: var(--app-text-inverse);
        }
        #regex-panel .regex-btn-danger {
            border-color: rgba(239,68,68,0.35);
            color: #f87171;
        }
        #regex-panel .regex-workbench {
            display: grid;
            grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
            gap: 14px;
            align-items: start;
        }
        #regex-panel .regex-side-panel {
            display: flex;
            flex-direction: column;
            gap: 10px;
            min-width: 0;
        }
        #regex-panel .regex-scope-top {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        #regex-panel .regex-scope-title-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
        }
        #regex-panel .regex-scope-title {
            min-width: 0;
            color: var(--app-text-primary);
            font-weight: 900;
        }
        #regex-panel .regex-action-row {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
        }
        #regex-panel .regex-editor-panel {
            min-width: 0;
            contain: paint;
        }
        #regex-panel .regex-editor-panel.is-entering {
            animation: regex-editor-in 160ms ease-out;
        }
        #regex-panel .regex-search-input {
            width: 100%;
            box-sizing: border-box;
            padding: 9px 10px;
            border: 1px solid var(--app-border-default);
            border-radius: 8px;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            font-size: 13px;
        }
        #regex-panel .regex-filter-row {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
        }
        #regex-panel .regex-filter-chip {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            border: 1px solid var(--app-border-subtle);
            border-radius: 999px;
            background: var(--app-surface-card);
            color: var(--app-text-secondary);
            cursor: pointer;
            padding: 5px 9px;
            font-size: 12px;
            font-weight: 800;
        }
        #regex-panel .regex-filter-chip.is-active {
            border-color: var(--app-border-strong, var(--app-border-default));
            background: var(--app-border-default);
            color: var(--app-text-primary);
        }
        #regex-panel .regex-filter-dot {
            width: 7px;
            height: 7px;
            border-radius: 999px;
            background: var(--regex-filter-color, currentColor);
            box-shadow: 0 0 0 3px var(--regex-filter-glow, rgba(148,163,184,0.16));
            flex: 0 0 auto;
        }
        #regex-panel .regex-filter-count {
            min-width: 1ch;
            text-align: right;
        }
        #regex-panel .regex-set-list {
            border: 1px solid var(--app-border-default);
            border-radius: 8px;
            overflow: hidden;
            background: var(--app-surface-card);
            contain: layout paint;
        }
        #regex-panel .regex-set-row {
            width: 100%;
            min-height: 54px;
            text-align: left;
            padding: 10px;
            border: none;
            border-bottom: 1px solid var(--app-border-subtle);
            cursor: pointer;
            display: grid;
            grid-template-columns: minmax(0, 1fr);
            gap: 10px;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            box-sizing: border-box;
            transition: background-color 140ms ease, opacity 140ms ease, transform 140ms ease;
        }
        #regex-panel .regex-set-row:last-child {
            border-bottom: none;
        }
        #regex-panel .regex-set-row.is-active {
            background: var(--app-surface-subtle);
            box-shadow: inset 3px 0 0 var(--regex-state-color, #10b981);
        }
        #regex-panel .regex-set-row.is-muted {
            opacity: 0.68;
        }
        #regex-panel .regex-set-row.is-dimmed {
            opacity: 0.52;
        }
        #regex-panel .regex-set-row.is-selected {
            background: var(--app-surface-subtle);
            box-shadow: inset 3px 0 0 #019aff;
            opacity: 1;
        }
        #regex-panel .regex-set-row.is-batch {
            grid-template-columns: 22px minmax(0, 1fr);
        }
        #regex-panel .regex-set-row:hover {
            background: var(--app-surface-subtle);
        }
        #regex-panel .regex-set-row:focus-visible {
            outline: 2px solid #019aff;
            outline-offset: -2px;
        }
        #regex-panel .regex-set-check {
            align-self: center;
            width: 16px;
            height: 16px;
        }
        #regex-panel .regex-set-row-main {
            min-width: 0;
            display: flex;
            flex-direction: column;
            gap: 3px;
        }
        #regex-panel .regex-set-heading {
            min-width: 0;
            display: flex;
            align-items: center;
            gap: 7px;
        }
        #regex-panel .regex-status-dot {
            width: 8px;
            height: 8px;
            border-radius: 999px;
            flex: 0 0 auto;
            background: var(--regex-state-color, var(--app-text-muted));
            box-shadow: 0 0 0 3px var(--regex-state-glow, rgba(148,163,184,0.18));
        }
        #regex-panel .regex-set-title {
            min-width: 0;
            color: var(--app-text-primary);
            font-weight: 900;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #regex-panel .regex-set-row.is-muted .regex-set-title,
        #regex-panel .regex-set-row.is-dimmed .regex-set-title {
            color: var(--app-text-secondary);
            font-weight: 800;
        }
        #regex-panel .regex-set-meta {
            color: var(--app-text-muted);
            font-size: 12px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #regex-panel .regex-batch-bar {
            border: 1px solid var(--app-border-subtle);
            border-radius: 8px;
            background: var(--app-surface-subtle);
            padding: 8px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        #regex-panel .regex-batch-title {
            color: var(--app-text-secondary);
            font-size: 12px;
            font-weight: 800;
        }
        #regex-panel .regex-batch-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        #regex-panel .regex-btn-compact {
            padding: 6px 8px;
            font-size: 12px;
        }
        #regex-panel .regex-editor-head {
            border: 1px solid var(--app-border-default);
            border-radius: 8px;
            padding: 12px;
            background: var(--app-surface-card);
            display: flex;
            flex-direction: column;
            gap: 10px;
        }
        #regex-panel .regex-editor-title-row {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
        }
        #regex-panel .regex-editor-title {
            color: var(--app-text-primary);
            font-size: 16px;
            font-weight: 900;
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        #regex-panel .regex-editor-sub {
            margin-top: 4px;
            color: var(--app-text-muted);
            font-size: 12px;
        }
        #regex-panel .regex-editor-actions {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        #regex-panel .regex-editor-meta-row {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
            align-items: center;
        }
        #regex-panel .regex-inline-toggle {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--app-text-secondary);
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
        }
        #regex-panel .regex-rules-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
        }
        .regex-preset-bind-modal .app-confirm-body {
            display: flex;
            flex-direction: column;
            gap: 10px;
            text-align: left;
        }
        .regex-preset-bind-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            flex-wrap: wrap;
            color: var(--app-text-secondary);
            font-size: 12px;
        }
        .regex-preset-bind-quick {
            display: flex;
            align-items: center;
            gap: 6px;
            flex-wrap: wrap;
        }
        .regex-preset-bind-quick button {
            border: 1px solid var(--app-border-subtle);
            border-radius: 8px;
            background: var(--app-surface-card);
            color: var(--app-text-secondary);
            cursor: pointer;
            padding: 5px 8px;
            font-size: 12px;
            font-weight: 800;
        }
        .regex-preset-bind-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
            max-height: min(52vh, 420px);
            overflow: auto;
            padding-right: 2px;
        }
        .regex-preset-bind-item {
            display: grid;
            grid-template-columns: 20px minmax(0, 1fr);
            gap: 8px;
            align-items: center;
            border: 1px solid var(--app-border-subtle);
            border-radius: 8px;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            cursor: pointer;
            padding: 9px 10px;
        }
        .regex-preset-bind-item.is-selected {
            border-color: var(--app-border-strong, var(--app-border-default));
            background: var(--app-surface-subtle);
        }
        .regex-preset-bind-item input {
            width: 16px;
            height: 16px;
        }
        .regex-preset-bind-name {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            font-size: 13px;
            font-weight: 800;
        }
        @keyframes regex-editor-in {
            from {
                opacity: 0.72;
                transform: translateY(4px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        @media (max-width: 760px) {
            #regex-panel .regex-workbench {
                grid-template-columns: 1fr;
            }
            #regex-panel .regex-action-row {
                grid-template-columns: 1fr;
            }
        }
        @media (prefers-reduced-motion: reduce) {
            #regex-panel .regex-editor-panel.is-entering {
                animation: none;
            }
            #regex-panel .regex-set-row {
                transition: none;
            }
        }
    `;
    document.head.appendChild(style);
};

export class RegexPanel {
    constructor({ store = null, presetStore = null } = {}) {
        this.store = store || new RegexStore();
        const bridge = typeof window !== 'undefined' ? window.appBridge : null;
        this.presetStore = presetStore || getPresetStore(bridge);
        this.element = null;
        this.overlay = null;
        this.activeTab = 'global'; // global | character | preset
        this.activeCharSetId = null;
        this.activePresetSetId = null;
        this.localSetFilters = { world: 'all', preset: 'all' };
        this.localSetSearch = { world: '', preset: '' };
        this.localSetSearchTimer = null;
        this.pendingSearchFocusScope = '';
        this.batchMode = { world: false, preset: false };
        this.batchSelection = { world: new Set(), preset: new Set() };
        this.pendingEditorAnimation = false;
        this.statusEl = null;
    }

    async show() {
        await this.store.ready;
        if (!this.element) this.createUI();
        await this.refreshAll();
        this.overlay.style.display = 'block';
        this.element.style.display = 'flex';
    }

    hide() {
        closeCustomSelectMenu();
        clearTimeout(this.localSetSearchTimer);
        if (this.element) this.element.style.display = 'none';
        if (this.overlay) this.overlay.style.display = 'none';
    }

    createUI() {
        ensureRegexPanelStyles();
        this.overlay = document.createElement('div');
        this.overlay.id = 'regex-overlay';
        this.overlay.className = 'app-themed-overlay regex-panel-overlay';
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.element = document.createElement('div');
        this.element.id = 'regex-panel';
        this.element.className = 'app-themed-panel regex-panel-shell';
        this.element.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:var(--app-surface-card); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            flex-direction:column;
            overflow:hidden;
        `;
        this.element.onclick = (e) => e.stopPropagation();

        this.element.innerHTML = `
            <div style="${PANEL_HEADER_STYLE}">
                <div style="min-width:0;">
                    <div class="has-help" data-help="按规则替换输入/输出文本；全局始终生效，角色/预设按绑定对象生效" style="font-weight:800; color:var(--app-text-primary);">正规表达式</div>
                </div>
                <button id="regex-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>

            <div style="${PANEL_SUBHEADER_STYLE}">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="regex-tab" data-tab="global">全局</button>
                    <button class="regex-tab" data-tab="character">角色</button>
                    <button class="regex-tab" data-tab="preset">预设</button>
                </div>
                <div id="regex-tools" style="display:flex; gap:8px; flex-wrap:wrap;"></div>
            </div>

            <div id="regex-scroll" style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div id="regex-body"></div>
                <div id="regex-status" style="display:none; margin-top:12px; padding:10px; border-radius:10px; font-size:13px;"></div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.element);

        this.statusEl = this.element.querySelector('#regex-status');
        this.element.querySelector('#regex-close').onclick = () => this.hide();
        this.element.querySelectorAll('.regex-tab').forEach(btn => {
            btn.addEventListener('click', async () => {
                this.activeTab = btn.dataset.tab || 'global';
                await this.refreshAll();
            });
        });
    }

    setActiveTabStyles() {
        this.element?.querySelectorAll('.regex-tab')?.forEach(btn => {
            const isActive = btn.dataset.tab === this.activeTab;
            btn.classList.toggle('is-active', isActive);
        });
    }

    showStatus(message, type = 'info') {
        const el = this.statusEl;
        if (!el) return;
        const colors = {
            success: { bg: 'rgba(16,185,129,0.16)', fg: '#bbf7d0' },
            error: { bg: 'rgba(239,68,68,0.16)', fg: '#fecaca' },
            info: { bg: 'rgba(59,130,246,0.16)', fg: '#bfdbfe' }
        };
        const c = colors[type] || colors.info;
        el.style.display = 'block';
        el.style.background = c.bg;
        el.style.color = c.fg;
        el.textContent = message;
        setTimeout(() => { try { el.style.display = 'none'; } catch {} }, 2200);
    }

    renderRuleCard(rule) {
        const r = normalizeRegexScript(rule);
        const card = document.createElement('div');
        card.className = 'regex-rule';
        card.dataset.ruleId = r.id;
        card.dataset.collapsed = 'true';
        card.style.cssText = RULE_CARD_STYLE;

        const header = document.createElement('div');
        header.className = 're-header';
        header.style.cssText = RULE_HEADER_STYLE;

        const left = document.createElement('div');
        left.style.cssText = 'display:flex; align-items:center; gap:10px; min-width:0;';
        left.innerHTML = `
            <div class="re-toggle" style="font-size:16px; color:var(--app-text-muted); user-select:none; width:18px;">▸</div>
            <div style="min-width:0;">
                <div class="re-title" style="font-weight:800; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <div class="re-sub" style="color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            </div>
        `;
        header.appendChild(left);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end;';
        const enabledWrap = document.createElement('label');
        enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:var(--app-text-secondary); cursor:pointer;';
        enabledWrap.innerHTML = `<input type="checkbox" class="re-enabled" style="width:16px; height:16px;">启用`;
        right.appendChild(enabledWrap);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 're-del';
        del.textContent = '删除';
        del.style.cssText = DANGER_BUTTON_STYLE;
        right.appendChild(del);
        header.appendChild(right);

        const body = document.createElement('div');
        body.className = 're-body';
        body.style.cssText = 'display:none; padding:12px; gap:10px;';

        body.innerHTML = `
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width: 220px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">脚本名称</div>
                    <input class="re-name" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px;">
                </div>
                <div style="flex:1; min-width: 280px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">Find Regex</div>
                    <input class="re-find" spellcheck="false" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                </div>
            </div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                <div style="flex:1; min-width: 260px;">
                    <div class="has-help" data-help="支持 {{match}}、$1/$2…、$&lt;name&gt;。" style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">Replace With</div>
                    <textarea class="re-repl" rows="3" spellcheck="false" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;"></textarea>
                </div>
                <div style="flex:1; min-width: 260px;">
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">Trim Out（每行一个）</div>
                    <textarea class="re-trim" rows="3" spellcheck="false" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px;"></textarea>
                </div>
            </div>

            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:12px;">
                <div style="${SECTION_BOX_STYLE}">
                    <div style="font-weight:800; color:var(--app-text-primary); margin-bottom:8px;">影响条目（Affects）</div>
                    <div style="display:flex; gap:12px; flex-wrap:wrap; color:var(--app-text-secondary); font-size:13px;">
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="1">用户输入</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="2">AI输出</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="3">Slash</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="5">世界书</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="6">推理</label>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; align-items:center;">
                        <div class="has-help" data-help="0=最后一条，1=倒数第二条…" style="font-size:13px; color:var(--app-text-secondary); font-weight:700;">深度</div>
                        <input class="re-min-depth" type="number" min="-1" max="9999" placeholder="Min" style="width:120px; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                        <input class="re-max-depth" type="number" min="0" max="9999" placeholder="Max" style="width:120px; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    </div>
                </div>

                <div style="${SECTION_BOX_STYLE}">
                    <div style="font-weight:800; color:var(--app-text-primary); margin-bottom:8px;">其他选项</div>
                    <div style="display:flex; flex-direction:column; gap:8px; color:var(--app-text-secondary); font-size:13px;">
                        <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-disabled">停用（Disabled）</label>
                        <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-run-on-edit">编辑消息时执行（Run On Edit）</label>
                        <label style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            <span style="font-weight:700;">Find Regex 宏</span>
                            <select class="re-substitute" style="display:none;">
                                <option value="0">不替换</option>
                                <option value="1">替换（raw）</option>
                                <option value="2">替换（escaped）</option>
                            </select>
                            <button type="button" class="world-app-select-btn re-substitute-btn" style="min-width:170px;">
                                <span class="pp-custom-select-label" data-custom-select-label>不替换</span>
                                <span class="world-app-select-btn-chevron">▾</span>
                            </button>
                        </label>
                        <div style="margin-top:6px;">
                            <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">暂时性（Ephemerality）</div>
                            <label style="display:flex; gap:8px; align-items:center; cursor:pointer; margin-bottom:6px;">
                                <input type="checkbox" class="re-md-only">仅影响聊天显示（不改存档）
                            </label>
                            <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
                                <input type="checkbox" class="re-prompt-only">仅影响发送给 LLM 的 prompt（不改存档）
                            </label>
                            <div style="color:var(--app-text-muted); font-size:12px; margin-top:6px;">两者都不勾选：将直接修改聊天存档内容（不可逆）。</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const enabledInput = enabledWrap.querySelector('input');
        enabledInput.checked = !r.disabled;
        body.querySelector('.re-name').value = r.scriptName || '';
        body.querySelector('.re-find').value = r.findRegex || '';
        body.querySelector('.re-repl').value = r.replaceString ?? '';
        body.querySelector('.re-trim').value = (Array.isArray(r.trimStrings) ? r.trimStrings.join('\n') : '');
        body.querySelector('.re-disabled').checked = Boolean(r.disabled);
        body.querySelector('.re-run-on-edit').checked = Boolean(r.runOnEdit);
        body.querySelector('.re-md-only').checked = Boolean(r.markdownOnly);
        body.querySelector('.re-prompt-only').checked = Boolean(r.promptOnly);
        body.querySelector('.re-substitute').value = String(Number(r.substituteRegex ?? 0));
        bindCustomSelectButton({
            buttonEl: body.querySelector('.re-substitute-btn'),
            selectEl: body.querySelector('.re-substitute'),
            fallback: '不替换',
        });
        body.querySelector('.re-min-depth').value = (r.minDepth === null || r.minDepth === undefined || Number.isNaN(Number(r.minDepth))) ? '' : String(Number(r.minDepth));
        body.querySelector('.re-max-depth').value = (r.maxDepth === null || r.maxDepth === undefined || Number.isNaN(Number(r.maxDepth))) ? '' : String(Number(r.maxDepth));
        const placeSet = new Set((Array.isArray(r.placement) ? r.placement : []).map((n) => Number(n)).filter(Number.isFinite));
        body.querySelectorAll('.re-place').forEach((cb) => {
            cb.checked = placeSet.has(Number(cb.value));
        });

        const updateHeader = () => {
            const name = body.querySelector('.re-name')?.value?.trim();
            const find = body.querySelector('.re-find')?.value?.trim();
            const disabled = body.querySelector('.re-disabled')?.checked === true;
            const mdOnly = body.querySelector('.re-md-only')?.checked === true;
            const prOnly = body.querySelector('.re-prompt-only')?.checked === true;
            const placements = Array.from(body.querySelectorAll('.re-place')).filter(x => x.checked).map(x => Number(x.value)).filter(Number.isFinite);
            const title = name || (find ? `${find.slice(0, 36)}${find.length > 36 ? '…' : ''}` : '未命名正则');
            const affects = placements.length ? placements.map(p => placementLabels[p] || String(p)).join(' / ') : '未选择';
            const epi = `${mdOnly ? '显示' : ''}${mdOnly && prOnly ? '+' : ''}${prOnly ? 'Prompt' : ''}`;
            const sub = `${affects}${epi ? ` · ${epi}` : ''}${disabled ? ' · Disabled' : ''}`;
            left.querySelector('.re-title').textContent = title;
            left.querySelector('.re-sub').textContent = sub;
            enabledInput.checked = !disabled;
            card.style.opacity = disabled ? '0.62' : '';
        };
        updateHeader();

        const setCollapsed = (collapsed) => {
            card.dataset.collapsed = collapsed ? 'true' : 'false';
            header.querySelector('.re-toggle').textContent = collapsed ? '▸' : '▾';
            body.style.display = collapsed ? 'none' : 'block';
        };
        setCollapsed(true);

        header.addEventListener('click', () => {
            const collapsed = card.dataset.collapsed === 'true';
            setCollapsed(!collapsed);
        });
        // prevent toggle when interacting with controls
        card.querySelectorAll('input,select,button').forEach(el => {
            el.addEventListener('click', (e) => e.stopPropagation());
        });
        enabledInput.addEventListener('change', () => {
            body.querySelector('.re-disabled').checked = !enabledInput.checked;
            updateHeader();
        });
        body.querySelectorAll('input,select,textarea').forEach(el => el.addEventListener('input', updateHeader));

        card.appendChild(header);
        card.appendChild(body);
        return card;
    }

    collectRules(container) {
        const rules = [];
        container.querySelectorAll('.regex-rule').forEach(el => {
            const id = el.dataset.ruleId || genRegexId('re');
            const placement = Array.from(el.querySelectorAll('.re-place'))
                .filter(cb => cb.checked)
                .map(cb => Number(cb.value))
                .filter(Number.isFinite);
            const minDepthRaw = el.querySelector('.re-min-depth')?.value;
            const maxDepthRaw = el.querySelector('.re-max-depth')?.value;
            rules.push(normalizeRegexScript({
                id,
                scriptName: el.querySelector('.re-name')?.value || '',
                findRegex: el.querySelector('.re-find')?.value || '',
                replaceString: el.querySelector('.re-repl')?.value ?? '',
                trimStrings: String(el.querySelector('.re-trim')?.value || '').split('\n').map(s => s.trim()).filter(Boolean),
                placement,
                disabled: el.querySelector('.re-disabled')?.checked === true,
                markdownOnly: el.querySelector('.re-md-only')?.checked === true,
                promptOnly: el.querySelector('.re-prompt-only')?.checked === true,
                runOnEdit: el.querySelector('.re-run-on-edit')?.checked === true,
                substituteRegex: Number(el.querySelector('.re-substitute')?.value ?? 0),
                minDepth: (minDepthRaw === '' || minDepthRaw === null || minDepthRaw === undefined) ? null : Number(minDepthRaw),
                maxDepth: (maxDepthRaw === '' || maxDepthRaw === null || maxDepthRaw === undefined) ? null : Number(maxDepthRaw),
            }));
        });
        return rules;
    }

    async refreshAll() {
        await this.store.ready;
        if (!this.element) return;
        this.setActiveTabStyles();
        const tools = this.element.querySelector('#regex-tools');
        const body = this.element.querySelector('#regex-body');
        if (!tools || !body) return;
        tools.innerHTML = '';
        body.innerHTML = '';

        if (this.activeTab === 'global') {
            body.appendChild(this.renderGlobal());
        } else if (this.activeTab === 'character') {
            body.appendChild(this.renderScoped('world'));
        } else if (this.activeTab === 'preset') {
            body.appendChild(this.renderScoped('preset'));
        }
    }

    renderGlobal() {
        const g = this.store.getGlobal();
        const stats = this.getRuleStats(g.rules);
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

        const head = document.createElement('div');
        head.className = 'regex-editor-head';
        head.innerHTML = `
            <div class="regex-editor-title-row">
                <div style="min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                        <span class="regex-status-dot" style="--regex-state-color:${g.enabled !== false ? '#10b981' : '#ef4444'}; --regex-state-glow:${g.enabled !== false ? 'rgba(16,185,129,0.28)' : 'rgba(239,68,68,0.22)'}; --regex-state-bg:${g.enabled !== false ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'};"></span>
                        <div class="regex-editor-title">全局正则</div>
                    </div>
                    <div class="regex-editor-sub">${stats.enabled}/${stats.total} 条规则启用 · ${stats.placementText}</div>
                </div>
                <div class="regex-editor-actions">
                    <button type="button" id="re-global-import" class="regex-btn">导入</button>
                    <button type="button" id="re-global-export" class="regex-btn">导出</button>
                    <button type="button" id="re-global-add" class="regex-btn">＋ 新增规则</button>
                    <button type="button" id="re-global-save" class="regex-btn regex-btn-primary">保存</button>
                </div>
            </div>
            <div class="regex-editor-meta-row">
                <label class="regex-inline-toggle has-help" data-help="全局规则始终参与匹配；关闭后全部全局规则都不会执行。" data-help-mode="press">
                    <input id="re-global-enabled" type="checkbox" style="width:16px; height:16px;">
                    启用全局正则
                </label>
            </div>
        `;
        head.querySelector('#re-global-enabled').checked = g.enabled !== false;
        wrap.appendChild(head);

        const list = document.createElement('div');
        list.id = 're-global-list';
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
        (Array.isArray(g.rules) ? g.rules : []).forEach(r => list.appendChild(this.renderRuleCard(r)));
        wrap.appendChild(list);

        head.querySelector('#re-global-add').onclick = () => {
            list.appendChild(this.renderRuleCard({
                placement: [regex_placement.USER_INPUT],
                markdownOnly: true,
                runOnEdit: true,
                disabled: false,
            }));
        };
        head.querySelector('#re-global-import').onclick = async () => {
            try {
                const text = await pickJsonFileText();
                if (!text) return;
                const parsed = parseRegexImportText(text);
                const rules = flattenRegexImportRules(parsed);
                if (!rules.length) { this.showStatus('未找到可导入的正则规则', 'info'); return; }
                rules.forEach(r => list.appendChild(this.renderRuleCard(r)));
                this.showStatus(`已导入 ${rules.length} 条规则（请点保存确认）`, 'success');
            } catch (err) {
                logger.error('导入正则失败', err);
                this.showStatus(err.message || '导入失败', 'error');
            }
        };
        head.querySelector('#re-global-export').onclick = async () => {
            try {
                const rules = this.collectRules(list);
                if (!rules.length) { this.showStatus('没有可导出的规则', 'info'); return; }
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const result = await downloadJsonFile({ version: 1, type: 'regex-rules', scope: 'global', rules }, `regex-global-${ts}.json`);
                if (result?.cancelled) return;
                this.showStatus(`已导出 ${rules.length} 条规则`, 'success');
            } catch (err) {
                logger.error('导出正则失败', err);
                this.showStatus(err.message || '导出失败', 'error');
            }
        };
        list.addEventListener('click', (e) => {
            const del = e.target.closest('.re-del');
            if (!del) return;
            const card = del.closest('.regex-rule');
            if (card) card.remove();
        });
        head.querySelector('#re-global-save').onclick = async () => {
            try {
                const enabled = head.querySelector('#re-global-enabled')?.checked !== false;
                const rules = this.collectRules(list);
                await this.store.setGlobal({ enabled, rules });
                this.showStatus('已保存全局正则', 'success');
                window.dispatchEvent(new CustomEvent('regex-changed'));
            } catch (err) {
                logger.error('保存全局正则失败', err);
                this.showStatus(err.message || '保存失败', 'error');
            }
        };

        return wrap;
    }

    getActiveSetIdForScope(scope) {
        return scope === 'world' ? this.activeCharSetId : this.activePresetSetId;
    }

    setActiveSetIdForScope(scope, id) {
        if (scope === 'world') this.activeCharSetId = id;
        else this.activePresetSetId = id;
    }

    getActiveRegexContext() {
        return getRegexContext(window.appBridge);
    }

    formatBind(bind) {
        if (!bind) return '';
        if (bind.type === 'world') return `绑定世界书：${bind.worldId || ''}`;
        if (bind.type === 'preset') {
            const ptLabel = PRESET_TYPES.find(t => t.id === bind.presetType)?.label || bind.presetType || '';
            const summary = buildRegexCustomPromptPresetBindSummary(bind, this.presetStore);
            if (summary) return `绑定预设：${summary}`;
            const presetIds = Array.from(new Set([
                ...(Array.isArray(bind.presetIds) ? bind.presetIds : []),
                bind.presetId,
            ].map(id => String(id || '').trim()).filter(Boolean)));
            const presets = this.presetStore?.list?.(bind.presetType) || [];
            const presetNames = presetIds.map(id => {
                const preset = Array.isArray(presets)
                    ? presets.find(p => String(p.id || '') === id)
                    : null;
                return String(preset?.name || id).trim() || id;
            });
            return `绑定预设：${ptLabel} / ${presetNames.join('、') || '未选择'}`;
        }
        return '绑定：未知';
    }

    getSetDisplayName(setObj) {
        const s = setObj && typeof setObj === 'object' ? setObj : {};
        return getRegexImportSetName(s.name, s.rules, s.id || '未命名正则');
    }

    getRuleStats(rules = []) {
        const normalized = (Array.isArray(rules) ? rules : []).map(rule => normalizeRegexScript(rule));
        const enabled = normalized.filter(rule => !rule.disabled).length;
        const placements = [];
        const seen = new Set();
        normalized.forEach(rule => {
            (Array.isArray(rule.placement) ? rule.placement : []).forEach(value => {
                const key = Number(value);
                if (!Number.isFinite(key) || seen.has(key)) return;
                seen.add(key);
                placements.push(key);
            });
        });
        return {
            total: normalized.length,
            enabled,
            disabled: Math.max(0, normalized.length - enabled),
            placements,
            placementText: placements.length
                ? placements.map(p => placementLabels[p] || String(p)).join(' / ')
                : '未设置影响条目',
        };
    }

    getLocalSetVisualState(setObj, context = null) {
        const s = setObj && typeof setObj === 'object' ? setObj : {};
        if (s.manualEnabled === false) {
            return {
                kind: 'disabled',
                label: '手动停用',
                reason: '集合开关已关闭',
                color: '#ef4444',
                glow: 'rgba(239,68,68,0.22)',
                bg: 'rgba(239,68,68,0.1)',
                opacity: '0.58',
            };
        }
        if (!s.bind) {
            return {
                kind: 'unbound',
                label: '未绑定',
                color: '#94a3b8', // theme-audit-ignore: semantic status color
                reason: '需要绑定对象才会自动生效',
                glow: 'rgba(148,163,184,0.18)',
                bg: 'rgba(148,163,184,0.1)',
                opacity: '0.72',
            };
        }
        const activeContext = context ?? this.getActiveRegexContext();
        if (isLocalRegexSetAutoActive(s, activeContext)) {
            return {
                kind: 'active',
                label: '当前生效',
                color: '#10b981',
                reason: '当前聊天命中绑定对象',
                glow: 'rgba(16,185,129,0.28)',
                bg: 'rgba(16,185,129,0.1)',
                opacity: '1',
            };
        }
        return {
            kind: 'inactive',
            label: '当前未生效',
            color: '#f59e0b',
            reason: '等待切换到绑定对象',
            glow: 'rgba(245,158,11,0.22)',
            bg: 'rgba(245,158,11,0.1)',
            opacity: '0.86',
        };
    }

    getLocalSetStatusCounts(sets = [], context = null) {
        const counts = { all: sets.length, active: 0, inactive: 0, disabled: 0, unbound: 0 };
        sets.forEach(setObj => {
            const kind = this.getLocalSetVisualState(setObj, context).kind;
            if (Object.prototype.hasOwnProperty.call(counts, kind)) counts[kind] += 1;
        });
        return counts;
    }

    getLocalSetSortRank(setObj, context = null) {
        const rankByKind = { active: 0, inactive: 1, unbound: 2, disabled: 3 };
        return rankByKind[this.getLocalSetVisualState(setObj, context).kind] ?? 4;
    }

    sortLocalSetsForScope(sets = [], context = null) {
        return [...sets].sort((a, b) => {
            const rankDiff = this.getLocalSetSortRank(a, context) - this.getLocalSetSortRank(b, context);
            if (rankDiff !== 0) return rankDiff;
            const timeDiff = Number(b?.updatedAt || 0) - Number(a?.updatedAt || 0);
            if (timeDiff !== 0) return timeDiff;
            return this.getSetDisplayName(a).localeCompare(this.getSetDisplayName(b), 'zh-Hans');
        });
    }

    getBatchSelection(scope) {
        this.batchSelection ||= { world: new Set(), preset: new Set() };
        if (!(this.batchSelection[scope] instanceof Set)) this.batchSelection[scope] = new Set();
        return this.batchSelection[scope];
    }

    pruneBatchSelection(scope, validIds = []) {
        const valid = new Set(validIds.filter(Boolean));
        const selection = this.getBatchSelection(scope);
        Array.from(selection).forEach(id => {
            if (!valid.has(id)) selection.delete(id);
        });
    }

    getSelectedLocalSets(scope) {
        return Array.from(this.getBatchSelection(scope))
            .map(id => this.store.getLocalSet(id))
            .filter(Boolean);
    }

    async applyBatchEnable(scope, enabled) {
        const sets = this.getSelectedLocalSets(scope);
        if (!sets.length) { this.showStatus('请先选择正则集合', 'info'); return; }
        for (const setObj of sets) {
            await this.store.upsertLocalSet({
                id: setObj.id,
                name: setObj.name || this.getSetDisplayName(setObj),
                enabled,
                bind: setObj.bind,
                rules: setObj.rules || [],
            });
        }
        await this.refreshAll();
        this.showStatus(enabled ? '已批量启用' : '已批量停用', 'success');
        window.dispatchEvent(new CustomEvent('regex-changed'));
    }

    async applyBatchBind(scope) {
        const sets = this.getSelectedLocalSets(scope);
        if (!sets.length) { this.showStatus('请先选择正则集合', 'info'); return; }
        const bind = scope === 'world'
            ? await this.pickWorld()
            : await this.pickPreset();
        if (!bind) { this.showStatus('已取消绑定', 'info'); return; }
        for (const setObj of sets) {
            await this.store.upsertLocalSet({
                id: setObj.id,
                name: setObj.name || this.getSetDisplayName(setObj),
                enabled: setObj.manualEnabled !== false,
                bind,
                rules: setObj.rules || [],
            });
        }
        await this.refreshAll();
        this.showStatus('已批量绑定', 'success');
        window.dispatchEvent(new CustomEvent('regex-changed'));
    }

    async applyBatchUnbind(scope) {
        const sets = this.getSelectedLocalSets(scope);
        if (!sets.length) { this.showStatus('请先选择正则集合', 'info'); return; }
        for (const setObj of sets) {
            await this.store.upsertLocalSet({
                id: setObj.id,
                name: setObj.name || this.getSetDisplayName(setObj),
                enabled: setObj.manualEnabled !== false,
                bind: null,
                rules: setObj.rules || [],
            });
        }
        await this.refreshAll();
        this.showStatus('已解除绑定', 'success');
        window.dispatchEvent(new CustomEvent('regex-changed'));
    }

    async applyBatchDelete(scope) {
        const sets = this.getSelectedLocalSets(scope);
        if (!sets.length) { this.showStatus('请先选择正则集合', 'info'); return; }
        const names = sets.slice(0, 4).map(s => this.getSetDisplayName(s)).join('、');
        const more = sets.length > 4 ? ` 等 ${sets.length} 个` : '';
        const ok = await appConfirm({
            title: '批量删除正则',
            message: `删除 ${sets.length} 个正则集合：${names}${more}？`,
            danger: true,
        });
        if (!ok) return;
        for (const setObj of sets) {
            await this.store.removeLocalSet(setObj.id);
            if (this.activeCharSetId === setObj.id) this.activeCharSetId = null;
            if (this.activePresetSetId === setObj.id) this.activePresetSetId = null;
            this.getBatchSelection('world').delete(setObj.id);
            this.getBatchSelection('preset').delete(setObj.id);
        }
        await this.refreshAll();
        this.showStatus('已批量删除', 'success');
        window.dispatchEvent(new CustomEvent('regex-changed'));
    }

    async deleteLocalSet(scope, id) {
        if (!id) return;
        const setObj = this.store.getLocalSet(id);
        if (!setObj) return;
        const scopeLabel = scope === 'world' ? '角色' : '预设';
        const ok = await appConfirm({
            title: '删除正则',
            message: `删除${scopeLabel}正则「${this.getSetDisplayName(setObj) || id}」？`,
            danger: true,
        });
        if (!ok) return;
        await this.store.removeLocalSet(id);
        if (this.activeCharSetId === id) this.activeCharSetId = null;
        if (this.activePresetSetId === id) this.activePresetSetId = null;
        this.getBatchSelection('world').delete(id);
        this.getBatchSelection('preset').delete(id);
        await this.refreshAll();
        this.showStatus('已删除', 'success');
        window.dispatchEvent(new CustomEvent('regex-changed'));
    }

    matchesLocalSetFilter(setObj, scope, context = null) {
        const filter = this.localSetFilters?.[scope] || 'all';
        const query = String(this.localSetSearch?.[scope] || '').trim().toLowerCase();
        const visual = this.getLocalSetVisualState(setObj, context);
        if (filter !== 'all' && visual.kind !== filter) return false;
        if (!query) return true;
        const stats = this.getRuleStats(setObj?.rules);
        const haystack = [
            this.getSetDisplayName(setObj),
            setObj?.name,
            setObj?.id,
            this.formatBind(setObj?.bind),
            visual.label,
            visual.reason,
            stats.placementText,
        ].join('\n').toLowerCase();
        return haystack.includes(query);
    }

    renderScopedSetItem(setObj, { activeId, scope, batchMode = false, selected = false, context = null }) {
        const item = document.createElement('div');
        const s = setObj && typeof setObj === 'object' ? setObj : {};
        const isActive = s.id === activeId;
        const visual = this.getLocalSetVisualState(s, context);
        const name = this.getSetDisplayName(s);
        const stats = this.getRuleStats(s.rules);
        const muted = visual.kind !== 'active';
        const dimmed = visual.kind === 'disabled' || visual.kind === 'unbound';
        item.title = name;
        item.setAttribute('aria-label', `${name}，${visual.label}`);
        item.setAttribute('role', 'button');
        item.tabIndex = 0;
        item.className = [
            'regex-set-row',
            isActive ? 'is-active' : '',
            muted ? 'is-muted' : '',
            dimmed ? 'is-dimmed' : '',
            batchMode ? 'is-batch' : '',
            selected ? 'is-selected' : '',
        ].filter(Boolean).join(' ');
        item.style.setProperty('--regex-state-color', visual.color);
        item.style.setProperty('--regex-state-glow', visual.glow);
        item.style.setProperty('--regex-state-bg', visual.bg);

        if (batchMode) {
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.className = 'regex-set-check';
            check.checked = selected;
            check.setAttribute('aria-label', `选择 ${name}`);
            check.onclick = (e) => e.stopPropagation();
            check.onchange = async (e) => {
                e.stopPropagation();
                const selection = this.getBatchSelection(scope);
                if (check.checked) selection.add(s.id);
                else selection.delete(s.id);
                await this.refreshAll();
            };
            item.appendChild(check);
        }

        const main = document.createElement('span');
        main.className = 'regex-set-row-main';
        const heading = document.createElement('span');
        heading.className = 'regex-set-heading';
        const dot = document.createElement('span');
        dot.className = 'regex-status-dot';
        const title = document.createElement('span');
        title.className = 'regex-set-title';
        title.textContent = name;
        heading.appendChild(dot);
        heading.appendChild(title);

        const meta = document.createElement('span');
        meta.className = 'regex-set-meta';
        meta.textContent = stats.total ? `${stats.enabled}/${stats.total} 条启用` : '暂无规则';
        main.appendChild(heading);
        main.appendChild(meta);

        item.appendChild(main);
        const activateOrSelect = async () => {
            if (batchMode) {
                const selection = this.getBatchSelection(scope);
                if (selection.has(s.id)) selection.delete(s.id);
                else selection.add(s.id);
                await this.refreshAll();
                return;
            }
            if (s.id !== activeId) this.pendingEditorAnimation = true;
            this.setActiveSetIdForScope(scope, s.id);
            await this.refreshAll();
        };
        item.onclick = activateOrSelect;
        item.onkeydown = async (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            e.preventDefault();
            await activateOrSelect();
        };
        return item;
    }

    renderScoped(scope) {
        const scopeLabel = scope === 'world' ? '角色' : '预设';
        const wrap = document.createElement('div');
        wrap.className = 'regex-workbench';

        const left = document.createElement('div');
        left.className = 'regex-side-panel';

        const allSets = this.store.listLocalSets();
        const sets = allSets.filter(s => s.bind?.type === scope);
        const unboundSets = allSets.filter(s => !s.bind);
        const activeContext = this.getActiveRegexContext();
        const baseSets = this.sortLocalSetsForScope([...sets, ...unboundSets], activeContext);
        const visibleSets = baseSets.filter(s => this.matchesLocalSetFilter(s, scope, activeContext));
        const counts = this.getLocalSetStatusCounts(baseSets, activeContext);
        this.pruneBatchSelection(scope, baseSets.map(s => s.id));
        const isBatchMode = Boolean(this.batchMode?.[scope]);
        const selection = this.getBatchSelection(scope);
        const selectedCount = selection.size;

        const top = document.createElement('div');
        top.className = 'regex-scope-top';
        top.innerHTML = `
            <div class="regex-scope-title-row">
                <div class="regex-scope-title">${scopeLabel}正则集合</div>
            </div>
            <div class="regex-action-row">
                <button type="button" id="re-scoped-new" class="regex-btn regex-btn-primary">＋ 新建</button>
                <button type="button" id="re-scoped-import" class="regex-btn">导入</button>
                <button type="button" id="re-scoped-batch" class="regex-btn ${isBatchMode ? 'regex-btn-primary' : ''}">${isBatchMode ? '退出批量' : '批量管理'}</button>
            </div>
        `;

        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'regex-search-input';
        search.placeholder = `搜索${scopeLabel}正则、绑定对象或影响条目`;
        search.value = this.localSetSearch[scope] || '';

        const filterRow = document.createElement('div');
        filterRow.className = 'regex-filter-row';
        [
            { id: 'all', label: `全部 ${counts.all}`, ariaLabel: `全部 ${counts.all}` },
            { id: 'active', count: counts.active, ariaLabel: `生效 ${counts.active}`, color: '#10b981', glow: 'rgba(16,185,129,0.28)' },
            { id: 'inactive', count: counts.inactive, ariaLabel: `未生效 ${counts.inactive}`, color: '#f59e0b', glow: 'rgba(245,158,11,0.22)' },
            { id: 'disabled', count: counts.disabled, ariaLabel: `停用 ${counts.disabled}`, color: '#ef4444', glow: 'rgba(239,68,68,0.22)' },
            { id: 'unbound', count: counts.unbound, ariaLabel: `未绑定 ${counts.unbound}`, color: '#94a3b8', glow: 'rgba(148,163,184,0.18)' },
        ].forEach(({ id, label, count, ariaLabel, color, glow }) => {
            const chip = document.createElement('button');
            chip.type = 'button';
            chip.className = `regex-filter-chip ${this.localSetFilters[scope] === id ? 'is-active' : ''}`.trim();
            chip.setAttribute('aria-label', ariaLabel);
            if (color) {
                const dot = document.createElement('span');
                dot.className = 'regex-filter-dot';
                dot.style.setProperty('--regex-filter-color', color);
                dot.style.setProperty('--regex-filter-glow', glow);
                const countEl = document.createElement('span');
                countEl.className = 'regex-filter-count';
                countEl.textContent = String(count);
                chip.appendChild(dot);
                chip.appendChild(countEl);
            } else {
                chip.textContent = label;
            }
            chip.onclick = async () => {
                this.localSetFilters[scope] = id;
                await this.refreshAll();
            };
            filterRow.appendChild(chip);
        });

        const batchBar = document.createElement('div');
        batchBar.className = 'regex-batch-bar';
        batchBar.innerHTML = `
            <div class="regex-batch-title">已选 ${selectedCount} 个集合</div>
            <div class="regex-batch-actions">
                <button type="button" id="re-batch-select" class="regex-btn regex-btn-compact">全选当前列表</button>
                <button type="button" id="re-batch-clear" class="regex-btn regex-btn-compact">清空</button>
                <button type="button" id="re-batch-enable" class="regex-btn regex-btn-compact">启用</button>
                <button type="button" id="re-batch-disable" class="regex-btn regex-btn-compact">停用</button>
                <button type="button" id="re-batch-bind" class="regex-btn regex-btn-compact">绑定/换绑</button>
                <button type="button" id="re-batch-unbind" class="regex-btn regex-btn-compact">解除绑定</button>
                <button type="button" id="re-batch-delete" class="regex-btn regex-btn-danger regex-btn-compact">删除</button>
            </div>
        `;

        const setlistEl = document.createElement('div');
        setlistEl.id = 're-scoped-setlist';
        setlistEl.className = 'regex-set-list';

        left.appendChild(top);
        left.appendChild(search);
        left.appendChild(filterRow);
        if (isBatchMode) left.appendChild(batchBar);
        left.appendChild(setlistEl);

        const editorEl = document.createElement('div');
        editorEl.id = 're-scoped-editor';

        const right = document.createElement('div');
        right.className = 'regex-editor-panel';
        right.appendChild(editorEl);

        wrap.appendChild(left);
        wrap.appendChild(right);

        let activeId = this.getActiveSetIdForScope(scope);
        if (!activeId || !visibleSets.find(s => s.id === activeId)) {
            activeId = visibleSets[0]?.id || baseSets[0]?.id || null;
            this.setActiveSetIdForScope(scope, activeId);
        }

        const setlist = setlistEl;
        const editor = editorEl;

        const renderSetList = () => {
            setlist.innerHTML = '';
            if (!baseSets.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:12px; color:var(--app-text-muted); text-align:center;';
                empty.textContent = `暂无${scopeLabel}正则集合`;
                setlist.appendChild(empty);
                return;
            }
            if (!visibleSets.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:12px; color:var(--app-text-muted); text-align:center;';
                empty.textContent = '没有符合当前筛选的正则集合';
                setlist.appendChild(empty);
                return;
            }
            visibleSets.forEach(s => {
                setlist.appendChild(this.renderScopedSetItem(s, {
                    activeId,
                    scope,
                    batchMode: isBatchMode,
                    selected: selection.has(s.id),
                    context: activeContext,
                }));
            });
        };
        renderSetList();

        const setObj = activeId ? this.store.getLocalSet(activeId) : null;
        editor.innerHTML = '';
        editor.appendChild(this.renderScopedEditor(setObj, scope));
        if (this.pendingEditorAnimation) {
            this.pendingEditorAnimation = false;
            right.classList.add('is-entering');
            setTimeout(() => {
                try { right.classList.remove('is-entering'); } catch {}
            }, 220);
        }

        if (this.pendingSearchFocusScope === scope) {
            this.pendingSearchFocusScope = '';
            requestAnimationFrame(() => {
                try {
                    search.focus();
                    const end = String(search.value || '').length;
                    search.setSelectionRange(end, end);
                } catch {}
            });
        }

        search.oninput = () => {
            this.localSetSearch[scope] = search.value || '';
            clearTimeout(this.localSetSearchTimer);
            this.localSetSearchTimer = setTimeout(async () => {
                this.pendingSearchFocusScope = scope;
                await this.refreshAll();
            }, 120);
        };

        top.querySelector('#re-scoped-new').onclick = async () => {
            const name = prompt(`新建${scopeLabel}正则名称`, '新正则');
            if (!name) return;
            const bind = scope === 'world'
                ? await this.pickWorld()
                : await this.pickPreset();
            if (!bind) { this.showStatus('已取消绑定', 'info'); return; }
            const id = await this.store.upsertLocalSet({ name, enabled: true, bind, rules: [] });
            this.setActiveSetIdForScope(scope, id);
            this.pendingEditorAnimation = true;
            await this.refreshAll();
            this.showStatus('已新建', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };
        top.querySelector('#re-scoped-import').onclick = async () => {
            try {
                const text = await pickJsonFileText();
                if (!text) return;
                const parsed = parseRegexImportText(text);
                const importedSets = parsed.sets?.length
                    ? parsed.sets
                    : [{ name: getRegexImportSetName(parsed.name, parsed.rules, ''), enabled: true, rules: parsed.rules || [] }];
                const validSets = importedSets.filter(s => Array.isArray(s?.rules) && s.rules.length);
                if (!validSets.length) { this.showStatus('未找到可导入的正则规则', 'info'); return; }
                const bind = scope === 'world'
                    ? await this.pickWorld()
                    : await this.pickPreset();
                if (!bind) { this.showStatus('已取消绑定', 'info'); return; }
                let lastId = '';
                for (const s of validSets) {
                    lastId = await this.store.upsertLocalSet({
                        name: getRegexImportSetName(s.name, s.rules, `导入正则 ${new Date().toLocaleString()}`),
                        enabled: s.enabled !== false,
                        bind,
                        rules: s.rules,
                    });
                }
                if (lastId) this.setActiveSetIdForScope(scope, lastId);
                this.pendingEditorAnimation = true;
                await this.refreshAll();
                const count = validSets.reduce((sum, s) => sum + (Array.isArray(s.rules) ? s.rules.length : 0), 0);
                this.showStatus(`已导入 ${validSets.length} 组 / ${count} 条规则`, 'success');
                window.dispatchEvent(new CustomEvent('regex-changed'));
            } catch (err) {
                logger.error(`导入${scopeLabel}正则失败`, err);
                this.showStatus(err.message || '导入失败', 'error');
            }
        };
        top.querySelector('#re-scoped-batch').onclick = async () => {
            this.batchMode[scope] = !this.batchMode[scope];
            if (!this.batchMode[scope]) this.getBatchSelection(scope).clear();
            await this.refreshAll();
        };
        if (isBatchMode) {
            batchBar.querySelector('#re-batch-select').onclick = async () => {
                const next = this.getBatchSelection(scope);
                visibleSets.forEach(s => { if (s.id) next.add(s.id); });
                await this.refreshAll();
            };
            batchBar.querySelector('#re-batch-clear').onclick = async () => {
                this.getBatchSelection(scope).clear();
                await this.refreshAll();
            };
            batchBar.querySelector('#re-batch-enable').onclick = () => this.applyBatchEnable(scope, true);
            batchBar.querySelector('#re-batch-disable').onclick = () => this.applyBatchEnable(scope, false);
            batchBar.querySelector('#re-batch-bind').onclick = () => this.applyBatchBind(scope);
            batchBar.querySelector('#re-batch-unbind').onclick = () => this.applyBatchUnbind(scope);
            batchBar.querySelector('#re-batch-delete').onclick = () => this.applyBatchDelete(scope);
        }

        return wrap;
    }

    async pickWorld() {
        const list = await listWorldIds(window.appBridge);
        if (!list.length) return null;
        const name = prompt(`选择绑定的世界书（输入名称）：\n${list.join('\n')}`, list[0]);
        if (!name || !list.includes(name)) return null;
        return { type: 'world', worldId: name };
    }

    openPresetMultiSelect(choices = [], selectedIds = []) {
        if (typeof document === 'undefined') return Promise.resolve(null);
        const list = Array.isArray(choices) ? choices : [];
        const validIds = new Set(list.map(item => String(item?.id || '').trim()).filter(Boolean));
        const selected = new Set(
            (Array.isArray(selectedIds) ? selectedIds : [selectedIds])
                .map(id => String(id || '').trim())
                .filter(id => id && validIds.has(id)),
        );

        return new Promise((resolve) => {
            let settled = false;
            const overlay = document.createElement('div');
            overlay.className = 'app-confirm-overlay';
            overlay.style.display = 'block';

            const modal = document.createElement('div');
            modal.className = 'app-confirm-modal is-choice regex-preset-bind-modal';
            modal.style.display = 'flex';
            modal.innerHTML = `
                <div class="app-confirm-header">
                    <div class="app-confirm-title">绑定预设</div>
                    <button type="button" class="app-confirm-close" aria-label="关闭">×</button>
                </div>
                <div class="app-confirm-body">
                    <div class="regex-preset-bind-toolbar">
                        <span class="regex-preset-bind-count"></span>
                        <span class="regex-preset-bind-quick">
                            <button type="button" data-action="select-all">全选</button>
                            <button type="button" data-action="clear">清空</button>
                        </span>
                    </div>
                    <div class="regex-preset-bind-list"></div>
                </div>
                <div class="app-confirm-actions">
                    <button type="button" class="app-confirm-btn app-confirm-cancel">取消</button>
                    <button type="button" class="app-confirm-btn app-confirm-ok">确定</button>
                </div>
            `;
            modal.addEventListener('click', event => event.stopPropagation());

            const countEl = modal.querySelector('.regex-preset-bind-count');
            const listEl = modal.querySelector('.regex-preset-bind-list');
            const okBtn = modal.querySelector('.app-confirm-ok');

            const cleanup = (result) => {
                if (settled) return;
                settled = true;
                document.removeEventListener('keydown', onKeyDown);
                overlay.remove();
                modal.remove();
                resolve(result);
            };
            const updateState = () => {
                if (countEl) countEl.textContent = `已选 ${selected.size} / ${list.length}`;
                if (okBtn) {
                    okBtn.disabled = selected.size === 0;
                    okBtn.style.opacity = selected.size === 0 ? '0.55' : '';
                    okBtn.style.cursor = selected.size === 0 ? 'not-allowed' : '';
                }
            };
            const renderList = () => {
                if (!listEl) return;
                listEl.innerHTML = '';
                list.forEach((item) => {
                    const id = String(item?.id || '').trim();
                    if (!id) return;
                    const label = document.createElement('label');
                    label.className = 'regex-preset-bind-item';
                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.checked = selected.has(id);
                    label.classList.toggle('is-selected', checkbox.checked);
                    checkbox.addEventListener('change', () => {
                        if (checkbox.checked) selected.add(id);
                        else selected.delete(id);
                        label.classList.toggle('is-selected', checkbox.checked);
                        updateState();
                    });
                    const name = document.createElement('span');
                    name.className = 'regex-preset-bind-name';
                    name.textContent = item.name || id;
                    label.appendChild(checkbox);
                    label.appendChild(name);
                    listEl.appendChild(label);
                });
            };
            const onKeyDown = (event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                cleanup(null);
            };

            overlay.addEventListener('click', () => cleanup(null));
            modal.querySelector('.app-confirm-close')?.addEventListener('click', () => cleanup(null));
            modal.querySelector('.app-confirm-cancel')?.addEventListener('click', () => cleanup(null));
            okBtn?.addEventListener('click', () => {
                if (!selected.size) return;
                cleanup(buildRegexCustomPromptPresetBind(Array.from(selected)));
            });
            modal.querySelector('[data-action="select-all"]')?.addEventListener('click', () => {
                list.forEach(item => {
                    const id = String(item?.id || '').trim();
                    if (id) selected.add(id);
                });
                renderList();
                updateState();
            });
            modal.querySelector('[data-action="clear"]')?.addEventListener('click', () => {
                selected.clear();
                renderList();
                updateState();
            });

            renderList();
            updateState();
            document.body.appendChild(overlay);
            document.body.appendChild(modal);
            document.addEventListener('keydown', onKeyDown);
            requestAnimationFrame(() => {
                const firstChecked = listEl?.querySelector?.('input:checked');
                const firstInput = firstChecked || listEl?.querySelector?.('input');
                firstInput?.focus?.();
            });
        });
    }

    async pickPreset(currentBind = null) {
        await this.presetStore?.ready;
        const presets = listRegexCustomPromptPresetChoices(this.presetStore);
        if (!presets.length) {
            this.showStatus(`${REGEX_CUSTOM_PROMPT_PRESET_LABEL}无可用预设`, 'info');
            return null;
        }
        const validIds = new Set(presets.map(p => p.id));
        const selectedIds = getRegexCustomPromptPresetBindIds(currentBind).filter(id => validIds.has(id));
        const activeId = String(this.presetStore?.getActiveId?.('openai') || '').trim();
        if (!selectedIds.length && validIds.has(activeId)) selectedIds.push(activeId);
        if (!selectedIds.length) selectedIds.push(presets[0].id);
        return this.openPresetMultiSelect(presets, selectedIds);
    }

    renderScopedEditor(setObj, scope) {
        const scopeLabel = scope === 'world' ? '角色' : '预设';
        const s = setObj ? deepClone(setObj) : null;
        if (!s) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:12px; color:var(--app-text-muted);';
            empty.textContent = `请选择或新建一个${scopeLabel}正则集合`;
            return empty;
        }

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; flex-direction:column; gap:12px;';
        const bindText = s.bind ? this.formatBind(s.bind) : '未绑定';
        const displayName = this.getSetDisplayName(s);
        const visual = this.getLocalSetVisualState(s);
        const stats = this.getRuleStats(s.rules);

        const head = document.createElement('div');
        head.className = 'regex-editor-head';
        head.style.setProperty('--regex-state-color', visual.color);
        head.style.setProperty('--regex-state-glow', visual.glow);
        head.style.setProperty('--regex-state-bg', visual.bg);

        const row1 = document.createElement('div');
        row1.className = 'regex-editor-title-row';

        const infoCol = document.createElement('div');
        infoCol.style.cssText = 'flex:1; min-width:220px;';
        const titleLine = document.createElement('div');
        titleLine.style.cssText = 'display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap;';
        const dot = document.createElement('span');
        dot.className = 'regex-status-dot';
        const titleDiv = document.createElement('div');
        titleDiv.className = 'regex-editor-title';
        titleDiv.textContent = displayName;
        titleLine.appendChild(dot);
        titleLine.appendChild(titleDiv);
        const subDiv = document.createElement('div');
        subDiv.className = 'regex-editor-sub';
        subDiv.textContent = `${stats.enabled}/${stats.total} 条规则启用 · ${stats.placementText}`;
        const stateDiv = document.createElement('div');
        stateDiv.className = 'regex-editor-sub';
        stateDiv.textContent = bindText;
        infoCol.appendChild(titleLine);
        infoCol.appendChild(subDiv);
        infoCol.appendChild(stateDiv);

        const btnCol = document.createElement('div');
        btnCol.className = 'regex-editor-actions';
        const btnExport = document.createElement('button');
        btnExport.type = 'button';
        btnExport.textContent = '导出';
        btnExport.className = 'regex-btn';
        const btnRename = document.createElement('button');
        btnRename.type = 'button';
        btnRename.textContent = '✎ 重命名';
        btnRename.className = 'regex-btn';
        const btnDelete = document.createElement('button');
        btnDelete.type = 'button';
        btnDelete.textContent = '删除';
        btnDelete.className = 'regex-btn regex-btn-danger';
        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.textContent = '保存';
        btnSave.className = 'regex-btn regex-btn-primary';
        btnCol.appendChild(btnExport);
        btnCol.appendChild(btnRename);
        btnCol.appendChild(btnDelete);
        btnCol.appendChild(btnSave);

        row1.appendChild(infoCol);
        row1.appendChild(btnCol);

        const row2 = document.createElement('div');
        row2.className = 'regex-editor-meta-row';

        const enabledLabel = document.createElement('label');
        enabledLabel.className = 'regex-inline-toggle';
        const enabledEl = document.createElement('input');
        enabledEl.type = 'checkbox';
        enabledEl.style.cssText = 'width:16px; height:16px;';
        enabledEl.checked = s.manualEnabled !== false;
        enabledLabel.appendChild(enabledEl);
        enabledLabel.appendChild(document.createTextNode('启用集合'));

        const bindDiv = document.createElement('div');
        bindDiv.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; align-items:center;';
        const btnRebind = document.createElement('button');
        btnRebind.type = 'button';
        btnRebind.textContent = '换绑';
        btnRebind.className = 'regex-btn';
        bindDiv.appendChild(btnRebind);

        row2.appendChild(enabledLabel);
        row2.appendChild(bindDiv);

        head.appendChild(row1);
        head.appendChild(row2);
        wrap.appendChild(head);

        // --- rebind handler ---
        btnRebind.onclick = async () => {
            const newBind = scope === 'world'
                ? await this.pickWorld()
                : await this.pickPreset(s.bind);
            if (!newBind) return;
            s.bind = newBind;
            await this.store.upsertLocalSet({ ...s });
            await this.refreshAll();
            this.showStatus('已换绑', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };

        const rulesHeader = document.createElement('div');
        rulesHeader.className = 'regex-rules-head';
        const rulesTitle = document.createElement('div');
        rulesTitle.style.cssText = 'font-weight:900; color:var(--app-text-primary);';
        rulesTitle.textContent = `规则 ${stats.total}`;
        const btnAdd = document.createElement('button');
        btnAdd.type = 'button';
        btnAdd.textContent = '＋ 新增规则';
        btnAdd.className = 'regex-btn';
        rulesHeader.appendChild(rulesTitle);
        rulesHeader.appendChild(btnAdd);
        wrap.appendChild(rulesHeader);

        const list = document.createElement('div');
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
        (Array.isArray(s.rules) ? s.rules : []).forEach(r => list.appendChild(this.renderRuleCard(r)));
        wrap.appendChild(list);

        btnAdd.onclick = () => {
            list.appendChild(this.renderRuleCard({
                placement: [regex_placement.USER_INPUT],
                markdownOnly: true,
                runOnEdit: true,
                disabled: false,
            }));
        };
        list.addEventListener('click', (e) => {
            const del = e.target.closest('.re-del');
            if (!del) return;
            const card = del.closest('.regex-rule');
            if (card) card.remove();
        });

        btnExport.onclick = async () => {
            try {
                const rules = this.collectRules(list);
                if (!rules.length) { this.showStatus('没有可导出的规则', 'info'); return; }
                const safeName = (displayName || scopeLabel).replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
                const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                const result = await downloadJsonFile({ version: 1, type: 'regex-rules', scope, name: s.name, rules }, `regex-${safeName}-${ts}.json`);
                if (result?.cancelled) return;
                this.showStatus(`已导出 ${rules.length} 条规则`, 'success');
            } catch (err) {
                logger.error(`导出${scopeLabel}正则失败`, err);
                this.showStatus(err.message || '导出失败', 'error');
            }
        };
        btnRename.onclick = async () => {
            const name = prompt(`重命名${scopeLabel}正则`, displayName || `${scopeLabel}正则`);
            if (!name) return;
            s.name = name;
            await this.store.upsertLocalSet({ ...s, name });
            await this.refreshAll();
            this.showStatus('已重命名', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };
        btnDelete.onclick = () => this.deleteLocalSet(scope, s.id);

        btnSave.onclick = async () => {
            try {
                const enabled = enabledEl.checked !== false;
                const rules = this.collectRules(list);
                const nextName = getRegexImportSetName(s.name, rules, displayName || `${scopeLabel}正则`);
                await this.store.upsertLocalSet({ id: s.id, name: nextName, enabled, bind: s.bind, rules });
                this.showStatus(`已保存${scopeLabel}正则`, 'success');
                window.dispatchEvent(new CustomEvent('regex-changed'));
            } catch (err) {
                logger.error(`保存${scopeLabel}正则失败`, err);
                this.showStatus(err.message || '保存失败', 'error');
            }
        };

        return wrap;
    }
}
