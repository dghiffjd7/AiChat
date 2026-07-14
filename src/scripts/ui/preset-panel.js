/**
 * Preset panel
 * - Fixed preset manager at the top
 * - Root page lists preset categories as navigation items
 * - Tapping a category pushes into a dedicated detail page
 */

import { PresetStore } from '../storage/preset-store.js';
import { appSettings } from '../storage/app-settings.js';
import { getReasoningCapability, getReasoningSamplerPolicy, normalizeReasoningEffort } from '../api/model-capabilities.js';
import { LLMClient } from '../api/client.js';
import { canInitClient } from '../api/client-config-utils.js';
import { logger } from '../utils/logger.js';
import { pickSavePath as pickNativeSavePath } from '../utils/save-dialog.js';
import { safeInvoke } from '../utils/tauri.js';
import { appConfirm, appChoice } from './app-confirm.js';
import { buildScriptAuthorizationMessage } from './script-authorization-utils.js';
import { createDragGhost } from './drag-ghost-utils.js';
import {
    REGEX_CUSTOM_PROMPT_PRESET_TYPE,
    resolveImportedRegexPresetBindTarget,
} from './regex-preset-binding-utils.js';
import {
    getActiveConfigProfile,
    getActiveConfigProfileId,
    getBridgeConfig,
    syncChatRuntimeConfigToBridge,
} from './config-runtime-utils.js';
import {
    listRegexLocalSets,
    removeRegexLocalSet,
    upsertRegexLocalSet,
    waitForRegexStoreReady,
} from './regex-store-runtime-utils.js';
import { getRegexImportSetName } from '../utils/regex-transfer.js';
import { getPresetStore } from './preset-store-runtime-utils.js';
import { waitForScriptStoreReady } from './script-runtime-utils.js';
/* Section definitions — order matters for rendering */
const SECTIONS = [
    { id: 'openai',       storeType: 'openai',    label: '生成参数',        primary: true },
    { id: 'custom',       storeType: 'openai',    label: '自定义提示词区块', primary: true },
    { id: 'sysprompt',    storeType: 'sysprompt',  label: '系统提示词' },
    { id: 'context',      storeType: 'context',    label: '上下文模板' },
    { id: 'instruct',     storeType: 'instruct',   label: 'Instruct 模板' },
    { id: 'reasoning',    storeType: 'reasoning',  label: '推理格式' },
];

const EXT_PROMPT_TYPES = {
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
    SYSTEM_DEPTH_1: 3,
    BEFORE_LATEST_USER: 4,
    AFTER_LATEST_USER: 5,
};

const EXT_PROMPT_ROLES = {
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
};

const OPENAI_KNOWN_BLOCKS = {
    main: { label: 'Main Prompt', marker: false },
    nsfw: { label: 'Auxiliary Prompt', marker: false },
    dialogueExamples: { label: 'Chat Examples', marker: true },
    jailbreak: { label: 'Post-History Instructions', marker: false },
    chatHistory: { label: 'Chat History', marker: true },
    worldInfoAfter: { label: 'World Info (after)', marker: true },
    worldInfoBefore: { label: 'World Info (before)', marker: true },
    enhanceDefinitions: { label: 'Enhance Definitions', marker: false },
    charDescription: { label: 'Char Description', marker: true },
    charPersonality: { label: 'Char Personality', marker: true },
    scenario: { label: 'Scenario', marker: true },
    personaDescription: { label: 'Persona Description', marker: true },
};

const roleIdToName = (role) => {
    const r = String(role || '').toLowerCase();
    if (r === 'system' || r === 'user' || r === 'assistant') return r;
    return 'system';
};

const roleNameToId = (name) => {
    const r = String(name || '').toLowerCase();
    if (r === 'user') return EXT_PROMPT_ROLES.USER;
    if (r === 'assistant') return EXT_PROMPT_ROLES.ASSISTANT;
    return EXT_PROMPT_ROLES.SYSTEM;
};

const deepClone = (v) => {
    try { return structuredClone(v); } catch { return JSON.parse(JSON.stringify(v)); }
};

const getNum = (val, fallback) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : fallback;
};

const getInt = (val, fallback) => {
    const n = Number(val);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
};

const setValue = (el, val) => { if (el) el.value = (val ?? '').toString(); };
const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
}[ch]));

const REASONING_EFFORT_LABELS = Object.freeze({
    auto: '自动',
    minimal: '极低',
    low: '低',
    medium: '中',
    high: '高',
    xhigh: '极高',
    max: '最大',
});

/* ── icons ── */
const chevronRightSvg = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;"><polyline points="9 6 15 12 9 18"/></svg>`;
const chevronLeftSvg = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;"><polyline points="15 6 9 12 15 18"/></svg>`;
const panelIconSvg = (body) => `<svg class="pp-nav-item-icon-svg" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const SECTION_ICONS = Object.freeze({
    openai: panelIconSvg('<path d="M4 7h16"/><path d="M7 12h10"/><path d="M10 17h4"/><circle cx="7" cy="7" r="2"/><circle cx="17" cy="12" r="2"/><circle cx="12" cy="17" r="2"/>'),
    custom: panelIconSvg('<path d="M8 7 4 12l4 5"/><path d="m16 7 4 5-4 5"/><path d="m14 4-4 16"/>'),
    sysprompt: panelIconSvg('<path d="M5 4h14v16H5z"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/>'),
    chatprompts: panelIconSvg('<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"/><path d="M8 9h8"/><path d="M8 13h5"/>'),
    context: panelIconSvg('<path d="M4 6h16"/><path d="M4 12h16"/><path d="M4 18h16"/><path d="M8 6v12"/>'),
    instruct: panelIconSvg('<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>'),
    reasoning: panelIconSvg('<path d="M12 3a6 6 0 0 0-4 10.5V16h8v-2.5A6 6 0 0 0 12 3Z"/><path d="M9 20h6"/><path d="M10 16h4"/>'),
});

/* ── CSS ── */
const PANEL_CSS = `
#preset-panel *,
#preset-panel *::before,
#preset-panel *::after { box-sizing: border-box; }

#preset-panel {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: var(--app-text-primary);
    --pp-panel-margin: 10px;
    --pp-footer-height: 58px;
}

/* 电脑版：面板不再全出血铺满，居中封顶（left/right 固定 + max-width + margin:auto 即居中） */
@media (min-width: 900px) and (pointer: fine) {
    #preset-panel {
        max-width: 860px;
        margin: 0 auto;
    }
}

/* ── header ── */
.pp-header {
    padding: 14px 16px;
    border-bottom: 1px solid var(--app-border-default);
    background: color-mix(in srgb, var(--app-surface-card) 90%, var(--app-surface-subtle));
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}
.pp-header-title {
    font-weight: 800;
    color: var(--app-text-primary);
    font-size: 16px;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.pp-header-sub { color: var(--app-text-muted); font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pp-header-actions button {
    border: 1px solid var(--app-border-default); background: var(--app-surface-card); padding: 6px 10px;
    border-radius: 10px; cursor: pointer; font-size: 12px; color: var(--app-text-secondary);
    transition: transform 120ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}
.pp-header-actions button:hover,
.pp-manager-btn:hover,
.pp-binding-btn:hover,
.pp-footer button:hover,
.pp-back-btn:hover,
.pp-nav-item:hover {
    border-color: rgba(37,99,235,0.30);
    box-shadow: 0 6px 16px rgba(15,23,42,0.07);
}
.pp-header-actions button:active,
.pp-manager-btn:active,
.pp-binding-btn:active,
.pp-footer button:active {
    transform: translateY(1px);
    box-shadow: none;
}
.pp-header-actions button:focus-visible,
.pp-manager-btn:focus-visible,
.pp-binding-btn:focus-visible,
.pp-footer button:focus-visible,
.pp-back-btn:focus-visible,
.pp-nav-item:focus-visible,
.pp-input:focus-visible,
.pp-textarea:focus-visible,
.pp-switch input:focus-visible + .pp-switch-track {
    outline: 2px solid rgba(37,99,235,0.34);
    outline-offset: 2px;
}
.pp-close {
    border: none !important; background: transparent !important;
    font-size: 22px !important; color: var(--app-text-primary) !important; padding: 4px 6px !important;
}

/* ── body shell ── */
.pp-shell {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--app-surface-card);
}

.pp-manager {
    padding: 12px 16px 14px;
    border-bottom: 1px solid var(--app-border-default);
    background: color-mix(in srgb, var(--app-surface-card) 92%, var(--app-surface-subtle));
    flex-shrink: 0;
}
.pp-manager-card {
    border: 1px solid rgba(37,99,235,0.18);
    border-radius: 16px;
    background: var(--app-surface-card);
    box-shadow: 0 8px 24px rgba(15,23,42,0.07);
    padding: 12px;
}
.pp-manager-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
    margin-bottom: 10px;
}
.pp-manager-title { font-size: 14px; font-weight: 800; color: var(--app-text-primary); }
.pp-manager-sub {
    margin-top: 4px;
    font-size: 12px;
    color: var(--app-text-muted);
    line-height: 1.45;
}
.pp-manager-context {
    margin-top: 8px;
    padding: 8px 10px;
    border-radius: 12px;
    background: var(--app-surface-subtle);
    border: 1px solid rgba(59,130,246,0.12);
    font-size: 12px;
    color: var(--app-text-secondary);
    line-height: 1.5;
}
.pp-manager-context strong {
    color: var(--app-text-primary);
}
.pp-enabled-chip {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    border-radius: 999px;
    background: var(--app-surface-subtle);
    border: 1px solid rgba(59,130,246,0.12);
}
.pp-enabled-chip.pp-readonly {
    background: rgba(248,250,252,0.98);
    border-color: rgba(148,163,184,0.28);
}
.pp-enabled-text {
    font-size: 12px;
    font-weight: 700;
    color: #1e40af;
}
.pp-enabled-chip.pp-readonly .pp-enabled-text {
    color: var(--app-text-muted);
}
.pp-switch {
    position: relative;
    display: inline-flex;
    width: 42px;
    height: 24px;
    flex-shrink: 0;
}
.pp-switch input {
    position: absolute;
    inset: 0;
    opacity: 0;
    margin: 0;
    cursor: pointer;
}
.pp-switch input:disabled {
    cursor: default;
}
.pp-switch-track {
    width: 100%;
    height: 100%;
    border-radius: 999px;
    background: var(--app-border-strong);
    transition: background 180ms ease;
    position: relative;
}
.pp-switch-track::after {
    content: '';
    position: absolute;
    top: 3px;
    left: 3px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--app-surface-card);
    box-shadow: 0 1px 2px rgba(15,23,42,0.18);
    transition: transform 180ms ease;
}
.pp-switch input:checked + .pp-switch-track {
    background: #3b82f6;
}
.pp-switch input:checked + .pp-switch-track::after {
    transform: translateX(18px);
}
.pp-switch input:disabled + .pp-switch-track {
    opacity: 0.72;
}
.pp-enabled-chip.pp-readonly .pp-switch-track {
    background: #d1d5db;
}
.pp-enabled-chip.pp-readonly .pp-switch input:checked + .pp-switch-track {
    background: var(--app-border-strong);
}
.pp-enabled-chip.pp-readonly .pp-switch-track::after {
    background: var(--app-surface-subtle);
    box-shadow: 0 1px 2px rgba(100,116,139,0.22);
}
.pp-manager-select-row {
    display: flex;
    align-items: stretch;
    gap: 10px;
    flex-wrap: wrap;
}
.pp-manager-select-wrap {
    flex: 1 1 220px;
    min-width: 0;
}
.pp-manager-label {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    font-weight: 700;
    color: var(--app-text-secondary);
}
.pp-manager-select {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    min-height: 42px;
    padding: 10px 12px;
    border: 1px solid var(--app-border-strong);
    border-radius: 12px;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    font-size: 14px;
}
.pp-manager-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
    margin-top: 10px;
}
.pp-manager-btn {
    appearance: none;
    -webkit-appearance: none;
    min-height: 36px;
    padding: 8px 12px;
    border: 1px solid #dbe2ea;
    border-radius: 10px;
    background: var(--app-surface-card);
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: transform 120ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}
.pp-manager-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.pp-manager-btn.pp-danger {
    border-color: #fecaca;
    background: #fff5f5;
    color: #b91c1c;
}

/* ── nav pages ── */
.pp-nav-shell {
    flex: 1 1 0;
    min-height: 0;
    overflow: hidden;
    position: relative;
}
.pp-pages {
    position: relative;
    width: 100%;
    height: 100%;
    display: block;
}
.pp-page {
    position: absolute;
    inset: 0;
    width: 100%;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transition: opacity 120ms ease, transform 120ms ease;
    transform: translateY(4px);
}
.pp-pages[data-view="root"] .pp-page[data-panel-page="root"],
.pp-pages[data-view="detail"] .pp-page[data-panel-page="detail"],
.pp-pages[data-view="bindings"] .pp-page[data-panel-page="bindings"],
.pp-pages[data-view="block"] .pp-page[data-panel-page="block"] {
    opacity: 1;
    visibility: visible;
    pointer-events: auto;
    transform: translateY(0);
}

/* 区块拖拽中：原卡变虚线占位（悬浮幽灵由 drag-ghost-utils 跟随指针） */
.pp-block.pp-block-dragging {
    opacity: 0.4;
    border-style: dashed;
    border-color: var(--app-accent-primary);
    background: color-mix(in srgb, var(--app-accent-primary) 6%, var(--app-surface-card));
}

/* 三级区块编辑页：隐藏上方「预设方案」区，给提示词编辑让出最大空间 */
#preset-panel[data-view="block"] .pp-manager {
    display: none;
}

/* 区块搜索：范围切换（全部/标题/正文）与命中样式 */
.pp-search-scope {
    display: inline-flex;
    border: 1px solid var(--app-border-default);
    border-radius: 10px;
    overflow: hidden;
}
.pp-search-scope button {
    padding: 6px 10px;
    border: none;
    background: var(--app-surface-subtle);
    color: var(--app-text-secondary);
    font-size: 12px;
    cursor: pointer;
}
.pp-search-scope button + button {
    border-left: 1px solid var(--app-border-default);
}
.pp-search-scope button.is-active {
    background: var(--app-accent-soft, rgba(25, 154, 255, 0.14));
    color: var(--app-accent-strong, var(--app-accent-primary));
    font-weight: 700;
}
.pp-block-title.pp-hit-title {
    color: var(--app-accent-strong, var(--app-accent-primary));
}
.pp-block-hit {
    padding: 6px 12px 10px;
    font-size: 12px;
    color: var(--app-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
/* 搜索过滤中隐藏拖拽柄：过滤视图下重排易误跨隐藏区块 */
#openai-blocks[data-filtering="1"] .pp-block-drag {
    display: none;
}
.pp-page-scroll {
    flex: 1 1 0;
    min-height: 0;
    overflow-y: auto;
    padding: 12px 16px 16px;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
}
.pp-detail-topbar {
    padding: 10px 16px 0;
    flex-shrink: 0;
}
.pp-back-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: none;
    background: transparent;
    color: var(--app-text-link);
    font-size: 14px;
    font-weight: 700;
    padding: 6px 2px;
    cursor: pointer;
}
.pp-back-btn svg { width: 16px; height: 16px; }
.pp-detail-heading {
    margin-top: 8px;
    margin-bottom: 2px;
    font-size: 18px;
    font-weight: 800;
    color: var(--app-text-primary);
    line-height: 1.2;
}
.pp-detail-subheading {
    font-size: 12px;
    color: var(--app-text-muted);
    line-height: 1.45;
}

/* ── root list ── */
.pp-nav-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.pp-nav-item {
    appearance: none;
    -webkit-appearance: none;
    width: 100%;
    border: 1px solid var(--app-border-default);
    border-radius: 14px;
    background: var(--app-surface-card);
    padding: 14px 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    text-align: left;
    cursor: pointer;
    box-shadow: 0 4px 18px rgba(15,23,42,0.045);
    transition: transform 120ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}
.pp-nav-item:active {
    transform: scale(0.995);
}
.pp-nav-item-left {
    min-width: 0;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 4px 10px;
    align-items: center;
}
.pp-nav-item-icon {
    grid-row: 1 / span 2;
    width: 34px;
    height: 34px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(37,99,235,0.16);
    border-radius: 11px;
    background: rgba(37,99,235,0.09);
    color: #1d4ed8;
    flex-shrink: 0;
}
.pp-nav-item-icon-svg {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
}
.pp-nav-item-title {
    font-size: 15px;
    font-weight: 800;
    color: var(--app-text-primary);
    line-height: 1.35;
}
.pp-nav-item-sub {
    grid-column: 2;
    font-size: 12px;
    color: var(--app-text-muted);
    line-height: 1.45;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.pp-nav-item.pp-disabled .pp-nav-item-title,
.pp-nav-item.pp-disabled .pp-nav-item-sub {
    color: var(--app-text-muted);
}
.pp-nav-item.pp-disabled .pp-nav-item-icon {
    color: var(--app-text-muted);
    border-color: var(--app-border-default);
    background: var(--app-surface-hover);
}
.pp-nav-item-arrow {
    width: 30px;
    height: 30px;
    border-radius: 10px;
    background: var(--app-surface-subtle);
    color: var(--app-text-muted);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

/* ── binding page ── */
.pp-binding-stack {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.pp-binding-card {
    border: 1px solid var(--app-border-default);
    border-radius: 14px;
    background: var(--app-surface-card);
    box-shadow: 0 4px 18px rgba(15,23,42,0.04);
    padding: 12px;
}
.pp-binding-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}
.pp-binding-card-title {
    font-size: 14px;
    font-weight: 800;
    color: var(--app-text-primary);
    line-height: 1.35;
}
.pp-binding-card-sub {
    margin-top: 4px;
    font-size: 12px;
    color: var(--app-text-muted);
    line-height: 1.5;
}
.pp-binding-chip {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    padding: 0 10px;
    border-radius: 999px;
    background: #eff6ff;
    color: #1d4ed8;
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
}
.pp-binding-actions {
    margin-top: 10px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
.pp-binding-btn {
    appearance: none;
    -webkit-appearance: none;
    min-height: 34px;
    padding: 8px 12px;
    border-radius: 10px;
    border: 1px solid #dbe2ea;
    background: var(--app-surface-card);
    color: var(--app-text-secondary);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
}
.pp-binding-btn.is-primary {
    background: #eff6ff;
    border-color: #bfdbfe;
    color: #1d4ed8;
}
.pp-binding-btn.is-muted {
    background: var(--app-surface-subtle);
    color: var(--app-text-muted);
}
.pp-binding-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
}
.pp-binding-list {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.pp-binding-item {
    border: 1px solid var(--app-border-default);
    border-radius: 12px;
    background: var(--app-surface-subtle);
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}
.pp-binding-item-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}
.pp-binding-item-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--app-text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.pp-binding-item-sub {
    font-size: 12px;
    color: var(--app-text-muted);
    line-height: 1.45;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.pp-binding-empty {
    padding: 12px;
    border: 1px dashed var(--app-border-strong);
    border-radius: 14px;
    background: var(--app-surface-subtle);
    font-size: 12px;
    color: var(--app-text-muted);
    line-height: 1.5;
}

/* ── form helpers ── */
.pp-field-label { font-weight: 700; color: var(--app-text-primary); margin-bottom: 6px; font-size: 13px; }
.pp-textarea {
    width: 100%; min-height: 140px; resize: vertical;
    border: 1px solid var(--app-border-default); border-radius: 11px; padding: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 12px; line-height: 1.45;
    background: var(--app-surface-card); color: var(--app-text-primary); box-sizing: border-box;
}
.pp-input {
    width: 100%; padding: 10px; border: 1px solid var(--app-border-default);
    border-radius: 11px; font-size: 14px; background: var(--app-surface-card); color: var(--app-text-primary);
    transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.pp-input:focus,
.pp-textarea:focus {
    border-color: rgba(37,99,235,0.42);
    box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
    outline: none;
}
.pp-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.pp-row > div { flex: 1; min-width: 140px; }
.pp-flags { margin-top: 10px; display: flex; gap: 12px; flex-wrap: wrap; }
.pp-flags label {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: var(--app-text-secondary); cursor: pointer;
}
.pp-flags input[type="checkbox"] { width: 16px; height: 16px; }
.pp-reasoning-card {
    margin-top: 12px;
    border: 1px solid rgba(37,99,235,0.18);
    border-radius: 14px;
    background: color-mix(in srgb, var(--app-surface-card) 90%, rgba(37,99,235,0.10));
    padding: 12px;
}

/* ── openai blocks ── */
.pp-block {
    border: 1px solid var(--app-border-default); border-radius: 14px;
    background: var(--app-surface-card); overflow: hidden;
    box-shadow: 0 4px 16px rgba(15,23,42,0.045);
    transition: transform 120ms ease, border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
}
.pp-block:hover {
    border-color: rgba(37,99,235,0.24);
    box-shadow: 0 8px 22px rgba(15,23,42,0.08);
}
.pp-block.is-jump-target {
    border-color: rgba(14,165,233,0.38);
    background: rgba(14,165,233,0.05);
    box-shadow: 0 0 0 3px rgba(14,165,233,0.12);
}
.pp-block-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 11px 12px; background: color-mix(in srgb, var(--app-surface-card) 90%, var(--app-surface-subtle));
    cursor: pointer; user-select: none;
}
.pp-block-left { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; }
.pp-block-toggle {
    width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: var(--app-surface-subtle);
    color: var(--app-text-muted);
    font-size: 14px;
    user-select: none;
    flex-shrink: 0;
}
.pp-block-drag { font-size: 16px; color: var(--app-text-muted); cursor: grab; user-select: none; }
.pp-block-main { min-width: 0; display: flex; flex-direction: column; gap: 5px; }
.pp-block-title { font-weight: 800; color: var(--app-text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-block-sub { color: var(--app-text-muted); font-size: 12px; }
.pp-block-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}
.pp-meta-chip {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 4px 8px;
    border-radius: 999px;
    border: 1px solid transparent;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    white-space: nowrap;
}
.pp-meta-chip.is-scope {
    background: rgba(59,130,246,0.10);
    border-color: rgba(59,130,246,0.16);
    color: #1d4ed8;
}
.pp-meta-chip.is-placement {
    background: rgba(148,163,184,0.12);
    border-color: rgba(148,163,184,0.2);
    color: var(--app-text-secondary);
}
.pp-meta-chip.is-dynamic {
    background: rgba(245,158,11,0.12);
    border-color: rgba(245,158,11,0.2);
    color: #b45309;
}
.pp-meta-chip.is-replace {
    background: rgba(244,63,94,0.10);
    border-color: rgba(244,63,94,0.18);
    color: #be123c;
}
.pp-block-right { display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
.pp-block-body { padding: 12px; display: none; flex-direction: column; gap: 10px; }
.pp-block.pp-block-disabled { opacity: 0.66; background: var(--app-surface-hover); }
.pp-block.pp-block-disabled .pp-block-header { background: var(--app-border-default); }

/* ── status ── */
.pp-status {
    display: none; padding: 10px 16px;
    font-size: 13px;
    flex-shrink: 0;
}

/* ── footer ── */
.pp-footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    padding: 12px 16px; border-top: 1px solid var(--app-border-default);
    flex-shrink: 0;
}

/* ── header fixed ── */
.pp-header { flex-shrink: 0; }
.pp-footer button {
    padding: 10px 18px; border-radius: 10px; cursor: pointer; font-size: 14px;
    transition: transform 120ms ease, border-color 160ms ease, background 160ms ease, box-shadow 160ms ease;
}
.pp-btn-cancel { border: 1px solid var(--app-border-default); background: var(--app-surface-subtle); color: var(--app-text-secondary); }
.pp-btn-save { border: none; background: #3b82f6; color: var(--app-text-inverse); font-weight: 700; }
.pp-btn-save:active { background: #2563eb; }

@media (max-width: 520px), (max-height: 720px) {
    #preset-panel {
        --pp-panel-margin: 6px;
        --pp-footer-height: 50px;
        top: calc(var(--pp-panel-margin) + env(safe-area-inset-top, 0px)) !important;
        left: calc(var(--pp-panel-margin) + env(safe-area-inset-left, 0px)) !important;
        right: calc(var(--pp-panel-margin) + env(safe-area-inset-right, 0px)) !important;
        height: calc(var(--app-visual-height, 100dvh) - var(--pp-panel-margin) - var(--pp-panel-margin) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
        max-height: calc(var(--app-visual-height, 100dvh) - var(--pp-panel-margin) - var(--pp-panel-margin) - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)) !important;
        border-radius: 10px !important;
    }
    .pp-header {
        padding: 8px 10px;
        min-height: 44px;
        gap: 8px;
    }
    .pp-header-title {
        font-size: 15px;
    }
    .pp-header-sub {
        display: none;
    }
    .pp-header-actions {
        gap: 4px;
    }
    .pp-header-actions button {
        min-height: 32px;
        padding: 4px 7px;
        border-radius: 8px;
    }
    .pp-close {
        font-size: 20px !important;
        padding: 2px 4px !important;
    }
    .pp-manager {
        padding: 8px 10px;
    }
    .pp-manager-card {
        padding: 9px 10px;
        border-radius: 12px;
        box-shadow: none;
    }
    .pp-manager-head {
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
    }
    .pp-manager-title {
        font-size: 13px;
    }
    .pp-manager-sub,
    .pp-manager-context {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pp-manager-sub {
        margin-top: 2px;
        line-height: 1.3;
    }
    .pp-manager-context {
        margin-top: 4px;
        padding: 0;
        border: 0 !important;
        background: transparent !important;
        line-height: 1.35;
    }
    body[data-theme-mode='dark'] #preset-panel .pp-manager-context {
        border: 0 !important;
        background: transparent !important;
    }
    .pp-enabled-chip {
        gap: 6px;
        padding: 4px 8px;
    }
    .pp-enabled-text {
        font-size: 11px;
    }
    .pp-switch {
        width: 38px;
        height: 22px;
    }
    .pp-switch-track::after {
        top: 3px;
        left: 3px;
        width: 16px;
        height: 16px;
    }
    .pp-switch input:checked + .pp-switch-track::after {
        transform: translateX(16px);
    }
    .pp-manager-select-row {
        gap: 6px;
    }
    .pp-manager-select-wrap {
        flex-basis: 100%;
    }
    .pp-manager-label {
        display: none;
    }
    .pp-manager-select {
        min-height: 38px;
        padding: 8px 10px;
        border-radius: 10px;
        font-size: 13px;
    }
    .pp-manager-actions {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 6px;
        margin-top: 6px;
    }
    .pp-manager-btn {
        min-height: 32px;
        padding: 6px 4px;
        border-radius: 8px;
        font-size: 11px;
    }
    .pp-detail-topbar {
        padding: 8px 10px 0;
    }
    .pp-back-btn {
        padding: 3px 0;
        font-size: 13px;
    }
    .pp-detail-heading {
        margin-top: 4px;
        font-size: 16px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pp-detail-subheading {
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .pp-nav-list {
        gap: 8px;
    }
    .pp-nav-item {
        min-height: 52px;
        padding: 10px 12px;
        border-radius: 12px;
    }
    .pp-nav-item-left {
        gap: 3px 8px;
    }
    .pp-nav-item-icon {
        width: 30px;
        height: 30px;
        border-radius: 10px;
    }
    .pp-nav-item-title {
        font-size: 14px;
    }
    .pp-nav-item-arrow {
        width: 26px;
        height: 26px;
        border-radius: 8px;
    }
    .pp-page-scroll {
        padding: 8px 10px max(12px, env(safe-area-inset-bottom, 0px));
    }
    .pp-block-header {
        padding: 8px 10px;
    }
    .pp-block-body {
        padding: 8px 10px;
        gap: 8px;
    }
    .pp-row {
        gap: 8px;
        margin-top: 8px;
    }
    .pp-row > div {
        min-width: 128px;
    }
    .pp-input {
        padding: 8px;
        font-size: 13px;
    }
    .pp-textarea {
        min-height: 118px;
        padding: 8px;
    }
    .pp-footer {
        min-height: var(--pp-footer-height);
        padding: 6px 10px calc(6px + env(safe-area-inset-bottom, 0px));
        gap: 8px;
        justify-content: stretch;
    }
    .pp-footer button {
        flex: 1 1 0;
        min-height: 36px;
        padding: 7px 14px;
        border-radius: 9px;
    }
}

@media (max-width: 380px) {
    .pp-manager-actions {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}

body[data-theme-mode='dark'] #preset-panel .pp-nav-item-icon {
    color: #8ecbff;
    border-color: rgba(121, 192, 255, 0.24);
    background: rgba(121, 192, 255, 0.10);
}

body[data-theme-mode='dark'] #preset-panel .pp-manager-card,
body[data-theme-mode='dark'] #preset-panel .pp-block,
body[data-theme-mode='dark'] #preset-panel .pp-binding-card {
    box-shadow: 0 8px 24px rgba(0,0,0,0.24);
}

@media (prefers-reduced-motion: reduce) {
    #preset-panel .pp-page,
    #preset-panel .pp-header-actions button,
    #preset-panel .pp-manager-btn,
    #preset-panel .pp-binding-btn,
    #preset-panel .pp-footer button,
    #preset-panel .pp-nav-item,
    #preset-panel .pp-block,
    #preset-panel .pp-input,
    #preset-panel .pp-textarea {
        transition: none !important;
        transform: none !important;
    }
}

`;

export class PresetPanel {
    constructor({ store = null } = {}) {
        const bridge = typeof window !== 'undefined' ? window.appBridge : null;
        this.store = store || getPresetStore(bridge) || new PresetStore();
        this.element = null;
        this.overlayElement = null;
        this.statusEl = null;
        this.managerEl = null;
        this.pagesEl = null;
        this.rootListEl = null;
        this.detailTitleEl = null;
        this.detailSubtitleEl = null;
        this.detailEditorEl = null;
        this.detailScrollEl = null;
        this.bindingTitleEl = null;
        this.bindingSubtitleEl = null;
        this.bindingEditorEl = null;
        this.bindingScrollEl = null;
        this.currentSectionId = null;
        this.currentPage = 'root';
        this.bindingStoreType = '';
        this.bindingPresetId = '';
        this.pendingOpenOptions = null;
        this.drafts = new Map();
        this.customSelectMenuEl = null;
        this.customSelectMenuCleanup = null;
        this.customSelectMenuAnchor = null;
        this.runtimeContext = {
            chatStore: null,
            contactsStore: null,
            personaStore: null,
            configPanel: null,
            getUiMode: null,
        };
    }

    setRuntimeContext(context = {}) {
        this.runtimeContext.chatStore = context.chatStore || this.runtimeContext.chatStore || null;
        this.runtimeContext.contactsStore = context.contactsStore || this.runtimeContext.contactsStore || null;
        this.runtimeContext.personaStore = context.personaStore || this.runtimeContext.personaStore || null;
        this.runtimeContext.configPanel = context.configPanel || this.runtimeContext.configPanel || null;
        this.runtimeContext.showScenePromptPreview = typeof context.showScenePromptPreview === 'function'
            ? context.showScenePromptPreview
            : this.runtimeContext.showScenePromptPreview;
        this.runtimeContext.getUiMode = typeof context.getUiMode === 'function'
            ? context.getUiMode
            : this.runtimeContext.getUiMode;
    }

    getCurrentPresetContext() {
        const sessionId = String(this.runtimeContext.chatStore?.getCurrent?.() || '').trim();
        const uiMode = typeof this.runtimeContext.getUiMode === 'function'
            ? this.runtimeContext.getUiMode()
            : (sessionId.startsWith('rp:') ? 'rp' : 'chat');
        return {
            sessionId,
            uiMode: String(uiMode || '').trim().toLowerCase() === 'rp' ? 'rp' : 'chat',
        };
    }

    getTypeLabel(type) {
        const hit = SECTIONS.find(t => t.id === type);
        return hit?.label || String(type || '');
    }

    getBoundProfileForPreset(preset) {
        const bridge = window.appBridge;
        const draft = this.runtimeContext.configPanel?.getDraftConfig?.({ tab: 'chat' }) || null;
        if (!bridge) return draft;
        const activeId = getActiveConfigProfileId(bridge);
        const profile = getActiveConfigProfile(bridge) || getBridgeConfig(bridge) || null;
        if (!draft) return profile;
        return {
            ...(profile || {}),
            ...draft,
            id: profile?.id || activeId || '',
            name: profile?.name || '当前聊天配置草稿',
        };
    }

    getReasoningCapabilityForPreset(preset) {
        const profile = this.getBoundProfileForPreset(preset) || {};
        const requestReasoning = preset?.request_reasoning === true;
        return {
            provider: String(profile?.provider || '').trim(),
            model: String(profile?.model || '').trim(),
            baseUrl: String(profile?.baseUrl || '').trim(),
            capability: getReasoningCapability({
                provider: profile?.provider,
                model: profile?.model,
                baseUrl: profile?.baseUrl,
            }),
            samplerPolicy: getReasoningSamplerPolicy({
                provider: profile?.provider,
                model: profile?.model,
                baseUrl: profile?.baseUrl,
                requestReasoning,
            }),
        };
    }

    getResolvedPresetInfo(storeType, context = null) {
        return this.store.getResolvedActive(storeType, context || this.getCurrentPresetContext());
    }

    getPresetNameById(storeType, presetId = '') {
        const sid = String(presetId || '').trim();
        if (!sid) return '';
        const list = this.store.list(storeType);
        const hit = list.find((item) => String(item.id || '') === sid);
        return String(hit?.name || sid);
    }

    getBindingSourceLabel(source, mode = 'chat') {
        if (source === 'session') return '会话绑定';
        if (source === 'mode') {
            if (mode === 'rp') return '创意写作默认';
            if (mode === 'moments') return '动态任务默认';
            return '聊天对话默认';
        }
        return '全局默认';
    }

    describeResolvedPreset(storeType, context = null) {
        const resolved = this.getResolvedPresetInfo(storeType, context);
        const name = String(resolved?.preset?.name || this.getPresetNameById(storeType, resolved?.presetId) || '').trim();
        if (!name) return '';
        return `${name} · ${this.getBindingSourceLabel(resolved?.source, resolved?.mode)}`;
    }

    buildPresetBindingSessionEntries() {
        const chatStore = this.runtimeContext.chatStore;
        const contactsStore = this.runtimeContext.contactsStore;
        const personaStore = this.runtimeContext.personaStore;
        const sessionIds = Array.isArray(chatStore?.listSessions?.()) ? chatStore.listSessions() : [];
        return sessionIds.map((sid) => {
            const sessionId = String(sid || '').trim();
            if (!sessionId) return null;
            const isRp = sessionId.startsWith('rp:');
            const contact = contactsStore?.getContact?.(sessionId) || null;
            const personaId = isRp ? sessionId.slice(3) : '';
            const persona = personaId ? personaStore?.get?.(personaId) : null;
            const name = (() => {
                if (isRp) {
                    return String(persona?.name || persona?.title || personaId || sessionId).trim() || sessionId;
                }
                return String(contact?.name || sessionId).trim() || sessionId;
            })();
            const meta = (() => {
                if (isRp) return '创意写作';
                if (contact?.isGroup) return '群聊';
                return '聊天室';
            })();
            return {
                id: sessionId,
                name,
                meta,
                group: isRp ? 'rp' : 'chat',
            };
        }).filter(Boolean);
    }

    ensureCustomSelectMenu() {
        if (this.customSelectMenuEl) return this.customSelectMenuEl;
        const menu = document.createElement('div');
        menu.className = 'world-app-select-menu';
        menu.style.display = 'none';
        menu.addEventListener('click', (e) => e.stopPropagation());
        document.body.appendChild(menu);
        this.customSelectMenuEl = menu;
        return menu;
    }

    closeCustomSelectMenu() {
        if (typeof this.customSelectMenuCleanup === 'function') {
            try { this.customSelectMenuCleanup(); } catch {}
        }
        this.customSelectMenuCleanup = null;
        this.customSelectMenuAnchor = null;
        if (this.customSelectMenuEl) {
            this.customSelectMenuEl.style.display = 'none';
            this.customSelectMenuEl.innerHTML = '';
        }
    }

    openCustomSelectMenu({ anchorEl, options = [], currentValue = '', onSelect = null } = {}) {
        if (!anchorEl) return;
        const isSameAnchorOpen =
            this.customSelectMenuAnchor === anchorEl &&
            this.customSelectMenuEl &&
            this.customSelectMenuEl.style.display !== 'none';
        if (isSameAnchorOpen) {
            this.closeCustomSelectMenu();
            return;
        }
        const menu = this.ensureCustomSelectMenu();
        const current = String(currentValue ?? '').trim();
        const opts = Array.isArray(options) ? options : [];
        menu.innerHTML = opts.map((opt) => {
            const value = String(opt?.value ?? '');
            const label = escapeHtml(String(opt?.label ?? value));
            const selected = value === current;
            return `
                <button type="button" class="world-app-select-item ${selected ? 'is-selected' : ''}" data-value="${value.replace(/"/g, '&quot;')}">
                    <span class="world-app-select-item-label">${label}</span>
                    <span class="world-app-select-item-check">${selected ? '✓' : ''}</span>
                </button>
            `;
        }).join('');

        menu.querySelectorAll('.world-app-select-item').forEach((item) => {
            item.addEventListener('click', () => {
                const value = String(item.dataset.value ?? '');
                if (typeof onSelect === 'function') onSelect(value);
                this.closeCustomSelectMenu();
            });
        });

        menu.style.display = 'block';
        menu.style.visibility = 'hidden';
        menu.style.minWidth = `${Math.max(170, Math.round(anchorEl.getBoundingClientRect().width))}px`;
        menu.style.left = '0px';
        menu.style.top = '0px';

        const anchorRect = anchorEl.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const gap = 6;
        let left = anchorRect.left;
        let top = anchorRect.bottom + gap;
        if (left + menuRect.width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - menuRect.width - 8);
        }
        if (top + menuRect.height > window.innerHeight - 8) {
            top = Math.max(8, anchorRect.top - menuRect.height - gap);
        }
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
        menu.style.visibility = 'visible';

        const onDocClick = (ev) => {
            const target = ev?.target;
            if (!target) return;
            if (menu.contains(target) || anchorEl.contains(target)) return;
            this.closeCustomSelectMenu();
        };
        const onResize = () => this.closeCustomSelectMenu();
        const onScroll = (ev) => {
            const target = ev?.target;
            if (target && (menu.contains(target) || anchorEl.contains(target))) return;
            this.closeCustomSelectMenu();
        };
        document.addEventListener('mousedown', onDocClick, true);
        document.addEventListener('touchstart', onDocClick, true);
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll, true);
        this.customSelectMenuCleanup = () => {
            document.removeEventListener('mousedown', onDocClick, true);
            document.removeEventListener('touchstart', onDocClick, true);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
        };
        this.customSelectMenuAnchor = anchorEl;
    }

    refreshCustomSelect(selectOrId, root = null) {
        const scope = root || this.element || document;
        const select = typeof selectOrId === 'string'
            ? scope.querySelector(`#${selectOrId}`)
            : selectOrId;
        if (!select) return;
        const button = scope.querySelector(`[data-select-id="${select.id}"]`);
        if (!button) return;
        const labelEl = button.querySelector('.pp-custom-select-label');
        const current = Array.from(select.options || []).find((opt) => opt.value === select.value) || select.options?.[select.selectedIndex] || null;
        if (labelEl) {
            labelEl.textContent = current?.textContent?.trim() || button.dataset.placeholder || '请选择';
        }
    }

    bindCustomSelect(selectId, root = null) {
        const scope = root || this.element || document;
        const select = scope.querySelector(`#${selectId}`);
        const button = scope.querySelector(`[data-select-id="${selectId}"]`);
        if (!select || !button || button.dataset.bound === 'true') return;

        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
            if (button.disabled) return;
            const options = Array.from(select.options || []).map((opt) => ({
                value: opt.value,
                label: opt.textContent || opt.value,
            }));
            this.openCustomSelectMenu({
                anchorEl: button,
                options,
                currentValue: select.value,
                onSelect: (value) => {
                    if (select.value !== value) {
                        select.value = value;
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        this.refreshCustomSelect(select, scope);
                    }
                },
            });
        });

        select.addEventListener('change', () => this.refreshCustomSelect(select, scope));
        this.refreshCustomSelect(select, scope);
    }

    wrapSelectWithCustomUI(select, placeholder = '请选择') {
        if (!select || !select.id) return select;
        select.style.display = 'none';
        const wrap = document.createElement('div');
        wrap.style.width = '100%';
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'world-app-select-btn';
        button.dataset.selectId = select.id;
        button.innerHTML = `
            <span class="pp-custom-select-label">${placeholder}</span>
            <span class="world-app-select-btn-chevron">▾</span>
        `;
        wrap.appendChild(select);
        wrap.appendChild(button);
        return wrap;
    }

    async applyBoundConfigIfAny(context = null, { onlyIfBoundOverride = false } = {}) {
        const resolved = context
            ? this.store.getResolvedActive('openai', context)
            : this.store.getResolvedActive('openai', {});
        if (onlyIfBoundOverride && resolved?.source === 'global') return;
        const preset = resolved?.preset || {};
        const sessionId = String(context?.sessionId || '').trim();
        const sessionProfileId = sessionId ? this.store.getSessionProfileId('openai', sessionId) : null;
        const rawModeForProfile = String(context?.uiMode || '').trim().toLowerCase();
        const modeForProfile = rawModeForProfile === 'moments'
            ? 'moments'
            : (sessionId?.startsWith('rp:') ? 'rp' : (rawModeForProfile === 'rp' ? 'rp' : 'chat'));
        const modeProfileId = this.store.getModeProfileId?.('openai', modeForProfile) || null;
        const boundId = sessionProfileId || modeProfileId;
        if (!boundId) return;
        const bridge = window.appBridge;
        if (!bridge?.setActiveConfigProfile) return;
        const currentId = bridge.getActiveConfigProfileId?.();
        if (currentId && currentId === boundId) return;
        try {
            const runtime = await bridge.setActiveConfigProfile(boundId);
            const cfg = runtime || bridge.getConfig?.() || {};
            if (bridge) {
                syncChatRuntimeConfigToBridge({
                    bridge,
                    runtime: cfg,
                    canInitClient,
                    createClient: config => new LLMClient(config),
                });
            }
            window.dispatchEvent(new CustomEvent('preset-bound-config-applied', { detail: { profileId: boundId } }));
        } catch (err) {
            logger.warn('应用预设绑定的 API 配置失败', err);
        }
    }

    async applyBoundConfigForCurrentContext(options = {}) {
        return this.applyBoundConfigIfAny(this.getCurrentPresetContext(), options);
    }

    async show(options = {}) {
        await this.store.ready;
        if (!this.element) this.createUI();
        const opts = options && typeof options === 'object' ? options : {};
        this.pendingOpenOptions = opts;
        const requestedSection = String(opts.section || opts.sectionId || '').trim();
        const section = requestedSection ? this.getSectionById(requestedSection) : null;
        this.currentSectionId = section ? section.id : null;
        this.currentPage = section ? 'detail' : 'root';
        this.bindingStoreType = '';
        this.bindingPresetId = '';
        this.renderAllSections();
        this.setPageView(this.currentPage);
        if (section && this.detailScrollEl) this.detailScrollEl.scrollTop = 0;
        this.element.style.display = 'flex';
        this.overlayElement.style.display = 'block';
    }

    hide() {
        this.closeCustomSelectMenu();
        if (this.element) this.element.style.display = 'none';
        if (this.overlayElement) this.overlayElement.style.display = 'none';
    }

    /* ════════════════════════════════════════
       UI scaffold
       ════════════════════════════════════════ */
    createUI() {
        /* overlay */
        this.overlayElement = document.createElement('div');
        this.overlayElement.id = 'preset-overlay';
        this.overlayElement.style.cssText = `display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index: 20000;`;
        this.overlayElement.onclick = () => this.hide();

        /* panel */
        this.element = document.createElement('div');
        this.element.id = 'preset-panel';
        this.element.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            bottom: auto;
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(var(--app-visual-height, 100dvh) - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            max-height: calc(var(--app-visual-height, 100dvh) - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            box-sizing: border-box;
            background:var(--app-surface-card); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index: 21000; flex-direction: column; overflow: hidden;
        `;
        this.element.onclick = (e) => e.stopPropagation();

        /* single innerHTML write — avoids innerHTML += serialization issues */
        this.element.innerHTML = `
            <style>${PANEL_CSS}</style>
            <div class="pp-header">
                <div style="min-width:0;">
                    <div class="pp-header-title has-help" data-help="选择/编辑提示词与生成参数">预设（Preset）</div>
                </div>
                <div class="pp-header-actions">
                    <button id="preset-import">导入</button>
                    <button id="preset-export">导出</button>
                    <button class="pp-close" id="preset-close">&times;</button>
                </div>
            </div>
            <div class="pp-shell">
                <div class="pp-manager" id="preset-manager"></div>
                <div class="pp-nav-shell">
                    <div class="pp-pages" id="preset-pages" data-view="root">
                        <section class="pp-page" data-panel-page="root">
                            <div class="pp-page-scroll">
                                <div class="pp-nav-list" id="preset-root-list"></div>
                            </div>
                        </section>
                        <section class="pp-page" data-panel-page="detail">
                            <div class="pp-detail-topbar">
                                <button type="button" class="pp-back-btn" id="preset-back">
                                    ${chevronLeftSvg}
                                    <span>返回</span>
                                </button>
                                <div class="pp-detail-heading" id="preset-detail-title"></div>
                                <div class="pp-detail-subheading" id="preset-detail-subtitle"></div>
                            </div>
                            <div class="pp-page-scroll" id="preset-detail-scroll">
                                <div class="pp-section-editor" id="preset-detail-editor"></div>
                            </div>
                        </section>
                        <section class="pp-page" data-panel-page="bindings">
                            <div class="pp-detail-topbar">
                                <button type="button" class="pp-back-btn" id="preset-binding-back">
                                    ${chevronLeftSvg}
                                    <span>返回</span>
                                </button>
                                <div class="pp-detail-heading" id="preset-binding-title"></div>
                                <div class="pp-detail-subheading" id="preset-binding-subtitle"></div>
                            </div>
                            <div class="pp-page-scroll" id="preset-binding-scroll">
                                <div class="pp-section-editor" id="preset-binding-editor"></div>
                            </div>
                        </section>
                        <section class="pp-page" data-panel-page="block">
                            <div class="pp-detail-topbar">
                                <button type="button" class="pp-back-btn" id="preset-block-back">
                                    ${chevronLeftSvg}
                                    <span>返回</span>
                                </button>
                                <div class="pp-detail-heading" id="preset-block-title"></div>
                                <div class="pp-detail-subheading" id="preset-block-subtitle"></div>
                            </div>
                            <div class="pp-page-scroll" id="preset-block-scroll">
                                <div class="pp-section-editor" id="preset-block-editor"></div>
                            </div>
                        </section>
                    </div>
                </div>
            </div>
            <div class="pp-status" id="preset-status"></div>
            <div class="pp-footer">
                <button class="pp-btn-cancel" id="preset-cancel">取消</button>
                <button class="pp-btn-save" id="preset-save">保存</button>
            </div>
        `;

        document.body.appendChild(this.overlayElement);
        document.body.appendChild(this.element);

        this.statusEl = this.element.querySelector('#preset-status');
        this.managerEl = this.element.querySelector('#preset-manager');
        this.pagesEl = this.element.querySelector('#preset-pages');
        this.rootListEl = this.element.querySelector('#preset-root-list');
        this.detailTitleEl = this.element.querySelector('#preset-detail-title');
        this.detailSubtitleEl = this.element.querySelector('#preset-detail-subtitle');
        this.detailEditorEl = this.element.querySelector('#preset-detail-editor');
        this.detailScrollEl = this.element.querySelector('#preset-detail-scroll');
        this.bindingTitleEl = this.element.querySelector('#preset-binding-title');
        this.bindingSubtitleEl = this.element.querySelector('#preset-binding-subtitle');
        this.bindingEditorEl = this.element.querySelector('#preset-binding-editor');
        this.bindingScrollEl = this.element.querySelector('#preset-binding-scroll');
        this.blockTitleEl = this.element.querySelector('#preset-block-title');
        this.blockSubtitleEl = this.element.querySelector('#preset-block-subtitle');
        this.blockEditorEl = this.element.querySelector('#preset-block-editor');
        this.element.querySelector('#preset-close').onclick = () => this.hide();
        this.element.querySelector('#preset-cancel').onclick = () => this.hide();
        this.element.querySelector('#preset-save').onclick = () => this.onSave();
        this.element.querySelector('#preset-back').onclick = () => this.showRootPage();
        this.element.querySelector('#preset-binding-back').onclick = () => this.showDetailPage();
        this.element.querySelector('#preset-block-back').onclick = () => this.showDetailPage();

        /* hidden file input for import */
        const importInput = document.createElement('input');
        importInput.type = 'file';
        importInput.accept = '.json,application/json';
        importInput.style.display = 'none';
        importInput.id = 'preset-import-file';
        this.element.appendChild(importInput);

        this.element.querySelector('#preset-import').onclick = () => {
            importInput.value = '';
            importInput.click();
        };
        importInput.onchange = async () => {
            const file = importInput.files?.[0];
            if (file) await this.importFromFile(file);
        };
        this.element.querySelector('#preset-export').onclick = () => this.exportCurrent();

        const refreshForChatConfig = (event) => {
            if (event?.detail?.tab && event.detail.tab !== 'chat') return;
            if (this.element?.style.display === 'none') return;
            this.captureCurrentDetailDraft();
            this.renderAllSections();
        };
        window.addEventListener('config-profile-changed', refreshForChatConfig);
        window.addEventListener('config-draft-changed', refreshForChatConfig);
    }

    /* ════════════════════════════════════════
       Render shell pages
       ════════════════════════════════════════ */
    renderAllSections() {
        if (!this.element) return;
        this.renderManager();
        this.renderMainList();
        // 区块编辑页绑定的卡片会在重建后失效，回退到所属 section 的 detail 页
        if (this.currentPage === 'block') this.currentPage = 'detail';
        if (this.currentSectionId) {
            const sec = this.getSectionById(this.currentSectionId);
            if (sec) {
                this.renderDetailSection(sec);
                if (this.currentPage === 'bindings') this.renderBindingSection(sec);
                else this.clearBindingSection();
            }
            else this.currentSectionId = null;
        }
        if (!this.currentSectionId) {
            this.clearDetailSection();
            this.clearBindingSection();
        }
        this.setPageView(this.currentPage);
    }

    getSectionById(id) {
        return SECTIONS.find((sec) => sec.id === id) || null;
    }

    getDefaultContextSection() {
        return this.getSectionById('openai') || SECTIONS[0] || null;
    }

    getCurrentContextSection() {
        return this.getSectionById(this.currentSectionId) || this.getDefaultContextSection();
    }

    getStoreTypeSectionsLabel(storeType) {
        return SECTIONS
            .filter((sec) => sec.storeType === storeType)
            .map((sec) => sec.label)
            .join(' / ');
    }

    getActivePresetSnapshot(storeType) {
        const presetId = this.store.getActiveId(storeType);
        const key = this.getDraftKey(storeType, presetId);
        if (key && this.drafts.has(key)) return deepClone(this.drafts.get(key));
        return this.store.getActive(storeType) || {};
    }

    isEnabledToggleReadonly(storeType) {
        return storeType === 'instruct' || storeType === 'reasoning';
    }

    getSectionBadge(sec) {
        const p = this.getActivePresetSnapshot(sec.storeType) || {};
        if (sec.id === 'openai') {
            const t = p.temperature ?? 1;
            const tp = p.top_p ?? 0.98;
            const reasoning = p.request_reasoning === true
                ? ` · 推理 ${REASONING_EFFORT_LABELS[normalizeReasoningEffort(p.reasoning_effort, 'high')] || '高'}`
                : '';
            return `temp ${t} · top_p ${tp}${reasoning}`;
        }
        if (sec.id === 'custom') {
            const prompts = Array.isArray(p.prompts) ? p.prompts : [];
            return `${prompts.length} 区块`;
        }
        const name = p?.name || this.store.getActive(sec.storeType)?.name;
        return name || '';
    }

    renderManager() {
        if (!this.managerEl) return;
        const sec = this.getCurrentContextSection();
        if (!sec) return;
        const storeType = sec.storeType;
        const presets = this.store.list(storeType);
        const activeId = this.store.getActiveId(storeType);
        const enabledReadonly = this.isEnabledToggleReadonly(storeType);
        const effectiveText = this.describeResolvedPreset(storeType);

        this.managerEl.innerHTML = `
            <div class="pp-manager-card">
                <div class="pp-manager-head">
                    <div style="min-width:0;">
                        <div class="pp-manager-title">预设方案</div>
                        <div class="pp-manager-sub">当前分类：${this.getStoreTypeSectionsLabel(storeType) || sec.label}</div>
                        <div class="pp-manager-context"><strong>当前会话实际使用：</strong>${escapeHtml(effectiveText || '未启用')}</div>
                    </div>
                    <div class="pp-enabled-chip ${enabledReadonly ? 'pp-readonly' : ''}">
                        <span class="pp-enabled-text">启用</span>
                        <label class="pp-switch">
                            <input type="checkbox" id="preset-manager-enabled">
                            <span class="pp-switch-track"></span>
                        </label>
                    </div>
                </div>
                <div class="pp-manager-select-row">
                    <div class="pp-manager-select-wrap">
                        <label class="pp-manager-label" for="preset-manager-select">当前预设</label>
                        <select class="pp-manager-select" id="preset-manager-select" style="display:none;"></select>
                        <button type="button" class="world-app-select-btn" data-select-id="preset-manager-select">
                            <span class="pp-custom-select-label">请选择</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                </div>
                <div class="pp-manager-actions">
                    <button type="button" class="pp-manager-btn" id="preset-manager-new">新建</button>
                    <button type="button" class="pp-manager-btn" id="preset-manager-rename">重命名</button>
                    <button type="button" class="pp-manager-btn" id="preset-manager-bindings">使用位置</button>
                    <button type="button" class="pp-manager-btn pp-danger" id="preset-manager-delete">删除</button>
                </div>
            </div>
        `;

        const select = this.managerEl.querySelector('#preset-manager-select');
        const enabledCb = this.managerEl.querySelector('#preset-manager-enabled');
        const renameBtn = this.managerEl.querySelector('#preset-manager-rename');
        const bindingsBtn = this.managerEl.querySelector('#preset-manager-bindings');
        const deleteBtn = this.managerEl.querySelector('#preset-manager-delete');

        presets.forEach((preset) => {
            const opt = document.createElement('option');
            opt.value = preset.id;
            opt.textContent = preset.name || preset.id;
            select.appendChild(opt);
        });
        select.disabled = presets.length === 0;
        if (activeId) select.value = activeId;
        enabledCb.checked = this.store.getEnabled(storeType);
        enabledCb.disabled = enabledReadonly;
        renameBtn.disabled = !activeId;
        bindingsBtn.disabled = !activeId;
        deleteBtn.disabled = !activeId;

        select.onchange = async () => {
            this.captureCurrentDetailDraft();
            await this.store.setActive(storeType, select.value);
            this.renderAllSections();
            window.dispatchEvent(new CustomEvent('preset-changed'));
        };
        this.bindCustomSelect('preset-manager-select', this.managerEl);

        if (!enabledReadonly) {
            enabledCb.onchange = async () => {
                await this.store.setEnabled(storeType, !!enabledCb.checked);
                this.renderAllSections();
                this.showStatus('已更新启用状态', 'success');
                window.dispatchEvent(new CustomEvent('preset-changed'));
            };
        }

        this.managerEl.querySelector('#preset-manager-new').onclick = () => this.onNewForStoreType(storeType);
        renameBtn.onclick = () => this.onRenameForStoreType(storeType);
        bindingsBtn.onclick = () => this.openBindingsPage(storeType, activeId);
        deleteBtn.onclick = () => this.onDeleteForStoreType(storeType);
    }

    renderMainList() {
        if (!this.rootListEl) return;
        this.rootListEl.innerHTML = '';
        for (const sec of SECTIONS) {
            this.rootListEl.appendChild(this.buildSectionListItem(sec));
        }
    }

    buildSectionListItem(sec) {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = `pp-nav-item ${this.store.getEnabled(sec.storeType) ? '' : 'pp-disabled'}`.trim();
        item.innerHTML = `
            <div class="pp-nav-item-left">
                <span class="pp-nav-item-icon">${SECTION_ICONS[sec.id] || SECTION_ICONS.custom}</span>
                <div class="pp-nav-item-title">${sec.label}</div>
                <div class="pp-nav-item-sub">${this.getSectionBadge(sec) || '进入后编辑该分类内容'}</div>
            </div>
            <span class="pp-nav-item-arrow">${chevronRightSvg}</span>
        `;
        item.addEventListener('click', () => this.openSection(sec.id));
        return item;
    }

    openSection(sectionId) {
        const sec = this.getSectionById(sectionId);
        if (!sec) return;
        this.captureCurrentDetailDraft();
        this.currentSectionId = sec.id;
        this.currentPage = 'detail';
        this.renderAllSections();
        this.setPageView('detail');
        if (this.detailScrollEl) this.detailScrollEl.scrollTop = 0;
    }

    openBindingsPage(storeType, presetId = '') {
        const st = String(storeType || '').trim();
        const section = SECTIONS.find((item) => item.storeType === st) || this.getCurrentContextSection();
        if (!section) return;
        const nextPresetId = String(presetId || this.store.getActiveId(st) || '').trim();
        this.captureCurrentDetailDraft();
        this.currentSectionId = section.id;
        this.currentPage = 'bindings';
        this.bindingStoreType = st;
        this.bindingPresetId = nextPresetId;
        this.renderAllSections();
        this.setPageView('bindings');
        if (this.bindingScrollEl) this.bindingScrollEl.scrollTop = 0;
    }

    showRootPage({ capture = true } = {}) {
        if (capture) this.captureCurrentDetailDraft();
        this.currentSectionId = null;
        this.currentPage = 'root';
        this.bindingStoreType = '';
        this.bindingPresetId = '';
        this.renderAllSections();
        this.setPageView('root');
    }

    showDetailPage({ capture = true } = {}) {
        if (capture) this.captureCurrentDetailDraft();
        if (!this.currentSectionId) {
            this.showRootPage({ capture: false });
            return;
        }
        this.currentPage = 'detail';
        this.renderAllSections();
        this.setPageView('detail');
    }

    setPageView(view) {
        if (!this.pagesEl) return;
        const next = ['bindings', 'detail', 'block'].includes(view) ? view : 'root';
        this.pagesEl.dataset.view = next;
        if (this.element) this.element.dataset.view = next;
    }

    renderDetailSection(sec) {
        if (!this.detailEditorEl || !this.detailTitleEl || !this.detailSubtitleEl) return;
        this.detailTitleEl.textContent = sec.label;
        this.detailSubtitleEl.textContent = this.getSectionBadge(sec) || '编辑该分类中的具体内容';
        this.detailEditorEl.innerHTML = '';
        this.renderSectionEditor(sec, this.detailEditorEl);
    }

    clearDetailSection() {
        if (this.detailTitleEl) this.detailTitleEl.textContent = '';
        if (this.detailSubtitleEl) this.detailSubtitleEl.textContent = '';
        if (this.detailEditorEl) this.detailEditorEl.innerHTML = '';
    }

    renderBindingSection(sec) {
        if (!this.bindingEditorEl || !this.bindingTitleEl || !this.bindingSubtitleEl) return;
        const storeType = this.bindingStoreType || sec.storeType;
        const fallbackPresetId = String(this.store.getActiveId(storeType) || '').trim();
        const requestedPresetId = String(this.bindingPresetId || fallbackPresetId || '').trim();
        const preset = requestedPresetId
            ? (this.store.list(storeType).find((item) => String(item.id || '') === requestedPresetId) || null)
            : null;
        const presetId = String(preset?.id || fallbackPresetId || '').trim();
        this.bindingPresetId = presetId;
        this.bindingTitleEl.textContent = `${this.getStoreTypeSectionsLabel(storeType) || this.getTypeLabel(sec.id)} · 使用位置`;
        this.bindingSubtitleEl.textContent = preset?.name
            ? `为「${preset.name}」设定模式默认与会话覆盖；未设定时继续使用全局默认。`
            : '为当前预设设定模式默认与会话覆盖；未设定时继续使用全局默认。';
        this.bindingEditorEl.innerHTML = '';
        this.renderBindingEditor({
            storeType,
            presetId,
            presetName: String(preset?.name || presetId || '').trim(),
        }, this.bindingEditorEl);
    }

    clearBindingSection() {
        if (this.bindingTitleEl) this.bindingTitleEl.textContent = '';
        if (this.bindingSubtitleEl) this.bindingSubtitleEl.textContent = '';
        if (this.bindingEditorEl) this.bindingEditorEl.innerHTML = '';
    }

    captureCurrentDetailDraft() {
        if (!this.currentSectionId || !this.detailEditorEl || !this.detailEditorEl.children.length) return;
        const sec = this.getSectionById(this.currentSectionId);
        if (!sec) return;
        try {
            const storeType = sec.storeType;
            const presetId = this.store.getActiveId(storeType);
            const key = this.getDraftKey(storeType, presetId);
            if (!key) return;
            const base = this.drafts.has(key)
                ? this.drafts.get(key)
                : deepClone(this.store.getActive(storeType) || {});
            const next = this.collectSectionData(sec.id, this.detailEditorEl, base);
            this.drafts.set(key, next);
        } catch (err) {
            logger.debug('capture detail draft failed', sec.id, err);
        }
    }

    /* ════════════════════════════════════════
       Section editors
       ════════════════════════════════════════ */
    renderSectionEditor(sec, root) {
        const storeType = sec.storeType;
        const presetId = this.store.getActiveId(storeType);
        const key = this.getDraftKey(storeType, presetId);
        const p = (key && this.drafts.has(key)) ? this.drafts.get(key) : (this.store.getActive(storeType) || {});

        switch (sec.id) {
            case 'openai': root.appendChild(this.renderOpenAIParamsEditor(p)); break;
            case 'custom': root.appendChild(this.renderOpenAIBlocksEditor(p)); break;
            case 'sysprompt': root.appendChild(this.renderSyspromptEditor(p)); break;
            case 'chatprompts': root.appendChild(this.renderChatPromptsEditor(p)); break;
            case 'context': root.appendChild(this.renderContextEditor(p)); break;
            case 'instruct': root.appendChild(this.renderInstructEditor(p)); break;
            case 'reasoning': root.appendChild(this.renderReasoningEditor(p)); break;
        }
    }

    async commitBindingChange(task, message = '已更新使用位置') {
        try {
            await task();
            this.renderAllSections();
            this.showStatus(message, 'success');
            window.dispatchEvent(new CustomEvent('preset-changed'));
        } catch (err) {
            logger.warn('更新预设使用位置失败', err);
            this.showStatus(err?.message || '更新使用位置失败', 'error');
        }
    }

    renderBindingEditor({ storeType, presetId, presetName }, root) {
        const wrap = document.createElement('div');
        wrap.className = 'pp-binding-stack';

        const currentContext = this.getCurrentPresetContext();
        const currentSessionId = String(currentContext?.sessionId || '').trim();
        const currentSessionResolved = currentSessionId
            ? this.store.getResolvedActive(storeType, currentContext)
            : null;
        const modeBindings = this.store.getBindings(storeType);
        const sessionEntries = this.buildPresetBindingSessionEntries();

        const makeCard = ({ title, subtitle, chip = '', actions = [] } = {}) => {
            const card = document.createElement('div');
            card.className = 'pp-binding-card';

            const head = document.createElement('div');
            head.className = 'pp-binding-card-head';

            const main = document.createElement('div');
            const titleEl = document.createElement('div');
            titleEl.className = 'pp-binding-card-title';
            titleEl.textContent = title || '';
            main.appendChild(titleEl);

            if (subtitle) {
                const subEl = document.createElement('div');
                subEl.className = 'pp-binding-card-sub';
                subEl.textContent = subtitle;
                main.appendChild(subEl);
            }
            head.appendChild(main);

            if (chip) {
                const chipEl = document.createElement('div');
                chipEl.className = 'pp-binding-chip';
                chipEl.textContent = chip;
                head.appendChild(chipEl);
            }

            card.appendChild(head);

            if (actions.length) {
                const actionsWrap = document.createElement('div');
                actionsWrap.className = 'pp-binding-actions';
                actions.forEach((cfg) => {
                    const btn = document.createElement('button');
                    btn.type = 'button';
                    btn.className = `pp-binding-btn ${cfg.tone ? `is-${cfg.tone}` : ''}`.trim();
                    btn.textContent = cfg.label || '';
                    btn.disabled = cfg.disabled === true;
                    if (typeof cfg.onClick === 'function') {
                        btn.addEventListener('click', cfg.onClick);
                    }
                    actionsWrap.appendChild(btn);
                });
                card.appendChild(actionsWrap);
            }

            return card;
        };

        wrap.appendChild(makeCard({
            title: '全局默认',
            subtitle: '顶部“当前预设”就是这个分类的全局默认。未设置模式默认和会话覆盖时，会继续沿用这里。',
            chip: presetName || '当前预设',
        }));

        if (currentSessionId) {
            const currentSessionEntry = sessionEntries.find((item) => item.id === currentSessionId) || null;
            const currentBoundId = this.store.getSessionBindingId(storeType, currentSessionId);
            const currentIsBound = currentBoundId === presetId;
            const currentLabel = currentSessionEntry?.name || currentSessionId;
            const resolvedName = String(currentSessionResolved?.preset?.name || this.getPresetNameById(storeType, currentSessionResolved?.presetId) || '').trim();
            const resolvedSource = this.getBindingSourceLabel(currentSessionResolved?.source, currentSessionResolved?.mode);
            wrap.appendChild(makeCard({
                title: `当前会话：${currentLabel}`,
                subtitle: currentIsBound
                    ? '当前预设已绑定到这个会话。'
                    : `当前使用：${resolvedName || '未设置'}（${resolvedSource}）`,
                chip: currentSessionEntry?.meta || '当前',
                actions: currentIsBound
                    ? [{
                        label: '取消当前会话绑定',
                        tone: 'muted',
                        onClick: () => this.commitBindingChange(
                            () => this.store.clearSessionBinding(storeType, currentSessionId),
                        ),
                    }]
                    : [{
                        label: '绑定当前预设到此会话',
                        tone: 'primary',
                        onClick: () => this.commitBindingChange(
                            () => this.store.setSessionBinding(storeType, currentSessionId, presetId),
                        ),
                    }],
            }));
        }

        const buildModeCard = (mode, label) => {
            const boundId = String(modeBindings?.modes?.[mode] || '').trim();
            const isCurrent = boundId === presetId;
            const boundName = boundId ? this.getPresetNameById(storeType, boundId) : '';
            return makeCard({
                title: `${label}默认`,
                subtitle: isCurrent
                    ? '当前预设已设为这个界面的默认预设。'
                    : (boundName
                        ? `当前默认：${boundName}`
                        : '未单独设置时，将回退到全局默认。'),
                chip: label,
                actions: isCurrent
                    ? [{
                        label: '取消默认绑定',
                        tone: 'muted',
                        onClick: () => this.commitBindingChange(
                            () => this.store.clearModeBinding(storeType, mode),
                        ),
                    }]
                    : [{
                        label: `设为${label}默认`,
                        tone: 'primary',
                        onClick: () => this.commitBindingChange(
                            () => this.store.setModeBinding(storeType, mode, presetId),
                        ),
                    }],
            });
        };

        wrap.appendChild(buildModeCard('chat', '聊天对话'));
        wrap.appendChild(buildModeCard('rp', '创意写作'));
        wrap.appendChild(buildModeCard('moments', '动态任务'));

        const renderSessionSummary = (group, title) => {
            const items = sessionEntries.filter((item) => item.group === group);
            const boundItems = items.filter((item) => this.store.getSessionBindingId(storeType, item.id) === presetId);
            const card = document.createElement('div');
            card.className = 'pp-binding-card';
            const head = document.createElement('div');
            head.className = 'pp-binding-card-head';
            head.innerHTML = `
                <div>
                    <div class="pp-binding-card-title">${title}</div>
                    <div class="pp-binding-card-sub">${boundItems.length
                        ? `已绑定 ${boundItems.length} 个会话：${boundItems.map((i) => i.name).join('、')}`
                        : '暂无会话绑定此预设'}</div>
                </div>
            `;
            card.appendChild(head);
            return card;
        };

        wrap.appendChild(renderSessionSummary('chat', '聊天对话会话'));
        wrap.appendChild(renderSessionSummary('rp', '创意写作会话'));

        const openConfigHint = document.createElement('div');
        openConfigHint.style.cssText = 'text-align:center; margin-top:12px;';
        const openConfigBtn = document.createElement('button');
        openConfigBtn.type = 'button';
        openConfigBtn.className = 'pp-binding-btn is-primary';
        openConfigBtn.style.cssText = 'padding:8px 20px;';
        openConfigBtn.textContent = '打开会话配置管理';
        openConfigBtn.addEventListener('click', () => {
            window.dispatchEvent(new CustomEvent('open-session-config'));
        });
        openConfigHint.appendChild(openConfigBtn);
        wrap.appendChild(openConfigHint);

        root.appendChild(wrap);
    }

    /* ── helpers ── */
    renderTextarea(label, id, value, placeholder = '', help = '') {
        const block = document.createElement('div');
        block.style.marginTop = '10px';
        const helpAttr = help ? ` class="pp-field-label has-help" data-help="${help}"` : ' class="pp-field-label"';
        block.innerHTML = `
            <div${helpAttr}>${label}</div>
            <textarea id="${id}" spellcheck="false" class="pp-textarea" placeholder="${placeholder}"></textarea>
        `;
        setValue(block.querySelector(`#${id}`), value || '');
        return block;
    }

    renderInputRow(fields) {
        const row = document.createElement('div');
        row.className = 'pp-row';
        fields.forEach(f => {
            const cell = document.createElement('div');
            const label = document.createElement('div');
            label.className = 'pp-field-label';
            label.textContent = f.label;
            cell.appendChild(label);
            cell.appendChild(f.el);
            row.appendChild(cell);
        });
        return row;
    }

    /* ── System prompt ── */
    renderSyspromptEditor(p) {
        const wrap = document.createElement('div');
        wrap.appendChild(this.renderTextarea('内容', 'sysprompt-content', p.content || '', 'Write {{char}}...'));
        wrap.appendChild(this.renderTextarea('Post-History Instructions（可选）', 'sysprompt-post', p.post_history || '', '（可留空）'));
        return wrap;
    }

    /* ── Chat prompts ── */
    renderChatPromptsEditor(p) {
        const wrap = document.createElement('div');
        const list = document.createElement('div');
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
        const focusOptions = this.pendingOpenOptions || {};
        const focusPromptId = String(focusOptions.promptId || '').trim();
        let focusTarget = null;

        const makePromptBlock = (cfg) => {
            const card = document.createElement('div');
            card.className = 'pp-block';
            card.dataset.collapsed = 'true';
            card.dataset.promptId = cfg.idPrefix;

            const isEnabled = p[cfg.enabledKey] !== false;
            if (!isEnabled) card.classList.add('pp-block-disabled');

            const header = document.createElement('div');
            header.className = 'pp-block-header';
            const left = document.createElement('div');
            left.className = 'pp-block-left';
            const toggle = document.createElement('div');
            toggle.className = 'pp-block-toggle';
            toggle.innerHTML = '&#9656;';
            left.appendChild(toggle);

            const main = document.createElement('div');
            main.className = 'pp-block-main';
            const title = document.createElement('div');
            title.className = 'pp-block-title';
            title.textContent = cfg.title;
            main.appendChild(title);

            const metaChips = Array.isArray(cfg.metaChips) ? cfg.metaChips.filter(Boolean) : [];
            if (metaChips.length) {
                const meta = document.createElement('div');
                meta.className = 'pp-block-meta';
                metaChips.forEach((chip) => {
                    const el = document.createElement('span');
                    const tone = String(chip?.tone || 'placement').trim();
                    el.className = `pp-meta-chip is-${tone}`;
                    el.textContent = String(chip?.label || '').trim();
                    if (!el.textContent) return;
                    meta.appendChild(el);
                });
                if (meta.childElementCount) {
                    main.appendChild(meta);
                }
            } else if (cfg.subtitle) {
                const subtitle = document.createElement('div');
                subtitle.className = 'pp-block-sub';
                subtitle.textContent = cfg.subtitle;
                main.appendChild(subtitle);
            }

            left.appendChild(main);
            header.appendChild(left);

            const right = document.createElement('div');
            right.className = 'pp-block-right';
            const enabledWrap = document.createElement('label');
            enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:var(--app-text-secondary); cursor:pointer;';
            enabledWrap.innerHTML = `<input id="${cfg.idPrefix}-enabled" type="checkbox" style="width:16px; height:16px;">启用`;
            const enabledInput = enabledWrap.querySelector('input');
            enabledInput.checked = isEnabled;
            enabledWrap.addEventListener('click', (e) => e.stopPropagation());
            enabledInput.addEventListener('change', () => {
                card.classList.toggle('pp-block-disabled', !enabledInput.checked);
            });
            right.appendChild(enabledWrap);
            header.appendChild(right);
            card.appendChild(header);

            const body = document.createElement('div');
            body.className = 'pp-block-body';

            const pos = document.createElement('select');
            pos.id = `${cfg.idPrefix}-position`;
            pos.className = 'pp-input';
            const opts = Array.isArray(cfg.positionOptions) && cfg.positionOptions.length
                ? cfg.positionOptions
                : [
                    { v: EXT_PROMPT_TYPES.IN_PROMPT, t: 'IN_PROMPT（main 末尾）' },
                    { v: EXT_PROMPT_TYPES.IN_CHAT, t: 'IN_CHAT（按 depth/role）' },
                    { v: EXT_PROMPT_TYPES.BEFORE_LATEST_USER, t: '最新输入前' },
                    { v: EXT_PROMPT_TYPES.AFTER_LATEST_USER, t: '最新输入后' },
                    { v: EXT_PROMPT_TYPES.BEFORE_PROMPT, t: 'BEFORE_PROMPT（main 开头）' },
                    { v: EXT_PROMPT_TYPES.NONE, t: 'NONE（不注入）' },
                ];
            pos.innerHTML = opts.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
            const fallbackPos = opts.some(o => o.v === EXT_PROMPT_TYPES.IN_PROMPT) ? EXT_PROMPT_TYPES.IN_PROMPT : opts[0]?.v;
            pos.value = String(p[cfg.positionKey] ?? fallbackPos);
            const posWrap = this.wrapSelectWithCustomUI(pos, '注入位置');

            const depth = document.createElement('input');
            depth.id = `${cfg.idPrefix}-depth`;
            depth.type = 'number'; depth.inputMode = 'numeric'; depth.min = '0';
            depth.className = 'pp-input';
            depth.value = String(p[cfg.depthKey] ?? cfg.defaultDepth);

            const role = document.createElement('select');
            role.id = `${cfg.idPrefix}-role`;
            role.className = 'pp-input';
            role.innerHTML = `
                <option value="${EXT_PROMPT_ROLES.SYSTEM}">SYSTEM</option>
                <option value="${EXT_PROMPT_ROLES.USER}">USER</option>
                <option value="${EXT_PROMPT_ROLES.ASSISTANT}">ASSISTANT</option>
            `;
            role.value = String(p[cfg.roleKey] ?? EXT_PROMPT_ROLES.SYSTEM);
            const roleWrap = this.wrapSelectWithCustomUI(role, '角色');

            if (cfg.showPlacementControls !== false && cfg.showDepthRole !== false) {
                const row = this.renderInputRow([
                    { label: '注入位置', el: posWrap },
                    { label: '深度（IN_CHAT）', el: depth },
                    { label: '角色（IN_CHAT）', el: roleWrap },
                ]);
                body.appendChild(row);
                this.bindCustomSelect(pos.id, row);
                this.bindCustomSelect(role.id, row);
            } else if (cfg.showPlacementControls !== false) {
                depth.disabled = true;
                const row = this.renderInputRow([
                    { label: '注入位置', el: posWrap },
                    { label: '深度（固定）', el: depth },
                    { label: '角色（固定）', el: roleWrap },
                ]);
                body.appendChild(row);
                this.bindCustomSelect(pos.id, row);
                this.bindCustomSelect(role.id, row);
            }

            body.appendChild(this.renderTextarea('规则内容', `${cfg.idPrefix}-rules`, p[cfg.rulesKey] || '', cfg.placeholder));
            card.appendChild(body);

            const setCollapsed = (collapsed) => {
                card.dataset.collapsed = collapsed ? 'true' : 'false';
                const toggle = header.querySelector('.pp-block-toggle');
                if (toggle) toggle.innerHTML = collapsed ? '&#9656;' : '&#9662;';
                body.style.display = collapsed ? 'none' : 'block';
            };
            header.addEventListener('click', () => setCollapsed(card.dataset.collapsed !== 'true'));
            const shouldFocus = focusPromptId === cfg.idPrefix;
            setCollapsed(!shouldFocus);
            if (shouldFocus) focusTarget = card;

            return card;
        };

        const fixedDepthOpts = [
            { v: EXT_PROMPT_TYPES.IN_CHAT, t: 'IN_CHAT / SYSTEM D1' },
            { v: EXT_PROMPT_TYPES.NONE, t: 'NONE（不注入）' },
        ];

        list.appendChild(makePromptBlock({
            idPrefix: 'phone-format-intro', title: '手机格式开头',
            enabledKey: 'phone_format_intro_enabled',
            rulesKey: 'phone_format_intro_rules',
            placeholder: '手机格式开头',
            showPlacementControls: false,
            metaChips: [
                { label: 'SYSTEM D0', tone: 'placement' },
                { label: '顺序 1/4', tone: 'placement' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'phone-format-chat', title: 'QQ聊天格式',
            enabledKey: 'phone_format_chat_enabled',
            rulesKey: 'phone_format_chat_rules',
            placeholder: 'QQ聊天格式说明',
            showPlacementControls: false,
            metaChips: [
                { label: 'SYSTEM D0', tone: 'placement' },
                { label: '表情包自动填充', tone: 'dynamic' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'phone-format-moment', title: 'QQ空间格式',
            enabledKey: 'phone_format_moment_enabled',
            rulesKey: 'phone_format_moment_rules',
            placeholder: 'QQ空间格式说明',
            showPlacementControls: false,
            metaChips: [
                { label: 'SYSTEM D0', tone: 'placement' },
                { label: '动态格式', tone: 'dynamic' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'phone-format-footer', title: '手机格式结尾',
            enabledKey: 'phone_format_footer_enabled',
            rulesKey: 'phone_format_footer_rules',
            placeholder: '手机格式结尾',
            showPlacementControls: false,
            metaChips: [
                { label: 'SYSTEM D0', tone: 'placement' },
                { label: '顺序 4/4', tone: 'placement' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'dialogue', title: '私聊提示词',
            enabledKey: 'dialogue_enabled', positionKey: 'dialogue_position',
            depthKey: 'dialogue_depth', roleKey: 'dialogue_role',
            rulesKey: 'dialogue_rules', defaultDepth: 1, placeholder: '私聊协议提示词',
            metaChips: [
                { label: '私聊', tone: 'scope' },
                { label: '位置可调', tone: 'placement' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'moment', title: '动态发布决策提示词',
            enabledKey: 'moment_create_enabled', positionKey: 'moment_create_position',
            depthKey: 'moment_create_depth', roleKey: 'moment_create_role',
            rulesKey: 'moment_create_rules', defaultDepth: 0, placeholder: '动态发布决策提示词',
            metaChips: [
                { label: '动态发布', tone: 'scope' },
                { label: '条件发送', tone: 'dynamic' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'moment-comment', title: '动态评论回复提示词',
            enabledKey: 'moment_comment_enabled', positionKey: 'moment_comment_position',
            depthKey: 'moment_comment_depth', roleKey: 'moment_comment_role',
            rulesKey: 'moment_comment_rules', defaultDepth: 0, placeholder: '动态评论回复规则',
            metaChips: [
                { label: '动态评论', tone: 'scope' },
                { label: '位置可调', tone: 'placement' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'moment-publish-comment', title: '发布后评论提示词',
            enabledKey: 'moment_publish_comment_enabled', positionKey: 'moment_publish_comment_position',
            depthKey: 'moment_publish_comment_depth', roleKey: 'moment_publish_comment_role',
            rulesKey: 'moment_publish_comment_rules', defaultDepth: 0, placeholder: '用户发布动态后的评论规则',
            metaChips: [
                { label: '发布后评论', tone: 'scope' },
                { label: '位置可调', tone: 'placement' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'auto-image-prompt', title: '自动标签生图提示词',
            enabledKey: 'auto_image_prompt_enabled', positionKey: 'auto_image_prompt_position',
            depthKey: 'auto_image_prompt_depth', roleKey: 'auto_image_prompt_role',
            rulesKey: 'auto_image_prompt_rules', defaultDepth: 0, placeholder: '自动标签生图提示词',
            metaChips: [
                { label: '生图', tone: 'scope' },
                { label: '通用设定', tone: 'dynamic' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'group', title: '群聊提示词',
            enabledKey: 'group_enabled', positionKey: 'group_position',
            depthKey: 'group_depth', roleKey: 'group_role',
            rulesKey: 'group_rules', defaultDepth: 1, placeholder: '群聊协议提示词',
            metaChips: [
                { label: '群聊', tone: 'scope' },
                { label: '位置可调', tone: 'placement' },
            ],
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'summary', title: '摘要提示词',
            enabledKey: 'summary_enabled', positionKey: 'summary_position',
            depthKey: 'summary_depth', roleKey: 'summary_role',
            rulesKey: 'summary_rules', defaultDepth: 1, placeholder: '摘要格式提示词',
            positionOptions: fixedDepthOpts, showDepthRole: false,
            metaChips: [
                { label: '摘要', tone: 'scope' },
                { label: '记忆模式替代', tone: 'replace' },
            ],
        }));

        // Default preset format reminder block (runtime-generated; legacy ds_format_* kept for import compatibility).
        {
            const card = document.createElement('div');
            card.className = 'pp-block';
            card.dataset.collapsed = 'true';
            card.dataset.promptId = 'ds-format';

            const header = document.createElement('div');
            header.className = 'pp-block-header';
            const left = document.createElement('div');
            left.className = 'pp-block-left';
            const toggle = document.createElement('div');
            toggle.className = 'pp-block-toggle';
            toggle.innerHTML = '&#9656;';
            left.appendChild(toggle);
            const main = document.createElement('div');
            main.className = 'pp-block-main';
            const title = document.createElement('div');
            title.className = 'pp-block-title';
            title.textContent = 'Default 格式提醒（自动）';
            main.appendChild(title);
            const meta = document.createElement('div');
            meta.className = 'pp-block-meta';
            [
                { label: 'Default', tone: 'scope' },
                { label: '自动生成', tone: 'dynamic' },
            ].forEach(chip => {
                const el = document.createElement('span');
                el.className = `pp-meta-chip is-${chip.tone}`;
                el.textContent = chip.label;
                meta.appendChild(el);
            });
            main.appendChild(meta);
            left.appendChild(main);
            header.appendChild(left);
            card.appendChild(header);

            const body = document.createElement('div');
            body.className = 'pp-block-body';
            const enabledInput = document.createElement('input');
            enabledInput.type = 'hidden';
            enabledInput.id = 'ds-format-enabled';
            enabledInput.checked = true;
            const rulesInput = document.createElement('textarea');
            rulesInput.id = 'ds-format-rules';
            rulesInput.style.display = 'none';
            rulesInput.value = p.ds_format_rules || '';
            body.appendChild(enabledInput);
            body.appendChild(rulesInput);
            const info = document.createElement('div');
            info.className = 'pp-help';
            info.style.cssText = 'margin-bottom:10px; color:var(--app-text-secondary); font-size:12px; line-height:1.6;';
            info.textContent = '运行时按当前场景生成格式提醒。';
            body.appendChild(info);
            const preview = document.createElement('pre');
            preview.className = 'pp-code-preview';
            preview.style.cssText = 'margin:0; padding:12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-hover); color:var(--app-text-primary); white-space:pre-wrap; font-size:12px; line-height:1.5;';
            preview.textContent = [
                '正在与XX私聊，请遵循私聊格式',
                '',
                '以下为格式输出顺序，请严格遵守',
                'MiPhone_start',
                'msg_start',
                'msg_end',
                'MiPhone_end',
                '<tableEdit>',
                '记忆表格内容',
                '</tableEdit>',
            ].join('\n');
            body.appendChild(preview);
            card.appendChild(body);

            const setCollapsed = (collapsed) => {
                card.dataset.collapsed = collapsed ? 'true' : 'false';
                const t = header.querySelector('.pp-block-toggle');
                if (t) t.innerHTML = collapsed ? '&#9656;' : '&#9662;';
                body.style.display = collapsed ? 'none' : 'block';
            };
            header.addEventListener('click', () => setCollapsed(card.dataset.collapsed !== 'true'));
            const shouldFocus = focusPromptId === 'ds-format';
            setCollapsed(!shouldFocus);
            if (shouldFocus) focusTarget = card;
            list.appendChild(card);
        }

        wrap.appendChild(list);
        if (focusTarget) {
            const focusBlock = () => {
                const reduceMotion = globalThis.window?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
                focusTarget.scrollIntoView?.({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' });
                focusTarget.classList.add('is-jump-target');
                globalThis.window?.setTimeout?.(() => {
                    focusTarget.classList.remove('is-jump-target');
                }, 1400);
                focusTarget.querySelector?.('.pp-block-body textarea:not([style*="display: none"]), .pp-block-body select, .pp-block-body input')?.focus?.({ preventScroll: true });
            };
            if (globalThis.window?.requestAnimationFrame) {
                globalThis.window.requestAnimationFrame(focusBlock);
            } else {
                focusBlock();
            }
        }
        return wrap;
    }

    /* ── Context ── */
    renderContextEditor(p) {
        const wrap = document.createElement('div');

        wrap.appendChild(this.renderTextarea('Story String', 'context-story', p.story_string || '', '{{#if description}}{{description}}{{/if}} ...', 'ST 的 story_string 模板，支持 {{#if}} 与变量'));

        const pos = document.createElement('select');
        pos.id = 'context-position'; pos.className = 'pp-input';
        pos.innerHTML = `
	            <option value="${EXT_PROMPT_TYPES.IN_PROMPT}">IN_PROMPT（main 末尾）</option>
	            <option value="${EXT_PROMPT_TYPES.IN_CHAT}">IN_CHAT（按 depth/role）</option>
	            <option value="${EXT_PROMPT_TYPES.BEFORE_LATEST_USER}">最新输入前</option>
	            <option value="${EXT_PROMPT_TYPES.AFTER_LATEST_USER}">最新输入后</option>
	            <option value="${EXT_PROMPT_TYPES.BEFORE_PROMPT}">BEFORE_PROMPT（main 开头）</option>
	            <option value="${EXT_PROMPT_TYPES.NONE}">NONE（不注入）</option>
        `;
        pos.value = String(p.story_string_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
        const posWrap = this.wrapSelectWithCustomUI(pos, '注入位置');

        const depth = document.createElement('input');
        depth.id = 'context-depth'; depth.type = 'number'; depth.inputMode = 'numeric'; depth.min = '0';
        depth.className = 'pp-input'; depth.value = String(p.story_string_depth ?? 1);

        const role = document.createElement('select');
        role.id = 'context-role'; role.className = 'pp-input';
        role.innerHTML = `
            <option value="${EXT_PROMPT_ROLES.SYSTEM}">SYSTEM</option>
            <option value="${EXT_PROMPT_ROLES.USER}">USER</option>
            <option value="${EXT_PROMPT_ROLES.ASSISTANT}">ASSISTANT</option>
        `;
        role.value = String(p.story_string_role ?? EXT_PROMPT_ROLES.SYSTEM);
        const roleWrap = this.wrapSelectWithCustomUI(role, '角色');

        const ctxRow = this.renderInputRow([
            { label: '注入位置', el: posWrap },
            { label: '深度（IN_CHAT）', el: depth },
            { label: '角色（IN_CHAT）', el: roleWrap },
        ]);
        wrap.appendChild(ctxRow);
        this.bindCustomSelect('context-position', ctxRow);
        this.bindCustomSelect('context-role', ctxRow);

        const exSep = document.createElement('input');
        exSep.id = 'context-example-sep'; exSep.type = 'text'; exSep.className = 'pp-input';
        exSep.value = p.example_separator ?? '';
        const chatStart = document.createElement('input');
        chatStart.id = 'context-chat-start'; chatStart.type = 'text'; chatStart.className = 'pp-input';
        chatStart.value = p.chat_start ?? '';
        wrap.appendChild(this.renderInputRow([
            { label: 'Example Separator', el: exSep },
            { label: 'Chat Start', el: chatStart },
        ]));

        const flags = document.createElement('div');
        flags.className = 'pp-flags';
        flags.innerHTML = `
            <label><input id="context-names-stop" type="checkbox">Names as stop strings</label>
            <label><input id="context-use-stop" type="checkbox">Use stop strings</label>
            <label><input id="context-trim" type="checkbox">Trim sentences</label>
            <label><input id="context-single" type="checkbox">Single line</label>
        `;
        flags.querySelector('#context-names-stop').checked = Boolean(p.names_as_stop_strings);
        flags.querySelector('#context-use-stop').checked = Boolean(p.use_stop_strings);
        flags.querySelector('#context-trim').checked = Boolean(p.trim_sentences);
        flags.querySelector('#context-single').checked = Boolean(p.single_line);
        wrap.appendChild(flags);

        return wrap;
    }

    /* ── Instruct ── */
    renderInstructEditor(p) {
        const wrap = document.createElement('div');
        const desc = document.createElement('div');
        desc.style.cssText = 'color:var(--app-text-muted); font-size:12px; margin-bottom:4px;';
        desc.textContent = '序列 / 包裹 / 宏（目前仅保存，暂未用于构建）';
        wrap.appendChild(desc);

        const make = (id, val) => { const el = document.createElement('input'); el.id = id; el.type = 'text'; el.className = 'pp-input'; el.value = val ?? ''; return el; };
        wrap.appendChild(this.renderInputRow([
            { label: 'Input sequence', el: make('ins-input-seq', p.input_sequence) },
            { label: 'Output sequence', el: make('ins-output-seq', p.output_sequence) },
        ]));
        wrap.appendChild(this.renderInputRow([
            { label: 'System sequence', el: make('ins-system-seq', p.system_sequence) },
            { label: 'Stop sequence', el: make('ins-stop-seq', p.stop_sequence) },
        ]));

        const flags = document.createElement('div');
        flags.className = 'pp-flags';
        flags.innerHTML = `
            <label><input id="ins-wrap" type="checkbox">Wrap</label>
            <label><input id="ins-macro" type="checkbox">Macro</label>
            <label><input id="ins-skip-examples" type="checkbox">Skip examples</label>
        `;
        flags.querySelector('#ins-wrap').checked = Boolean(p.wrap);
        flags.querySelector('#ins-macro').checked = Boolean(p.macro);
        flags.querySelector('#ins-skip-examples').checked = Boolean(p.skip_examples);
        wrap.appendChild(flags);

        return wrap;
    }

    /* ── Reasoning ── */
    renderReasoningEditor(p) {
        const wrap = document.createElement('div');
        const settings = appSettings.get();

        const flags = document.createElement('div');
        flags.className = 'pp-flags';
        flags.innerHTML = `
            <label><input id="reasoning-auto-parse" type="checkbox">自动解析推理</label>
            <label><input id="reasoning-auto-expand" type="checkbox">自动展开</label>
            <label><input id="reasoning-show-hidden" type="checkbox">显示隐藏推理</label>
            <label><input id="reasoning-add-prompts" type="checkbox">写回提示词</label>
        `;
        flags.querySelector('#reasoning-auto-parse').checked = settings.reasoningAutoParse === true;
        flags.querySelector('#reasoning-auto-expand').checked = settings.reasoningAutoExpand === true;
        flags.querySelector('#reasoning-show-hidden').checked = settings.reasoningShowHidden === true;
        flags.querySelector('#reasoning-add-prompts').checked = settings.reasoningAddToPrompts === true;

        const bindSetting = (el, key) => {
            if (!el) return;
            el.addEventListener('change', () => {
                appSettings.update({ [key]: el.checked === true });
                window.dispatchEvent(new CustomEvent('reasoning-settings-changed'));
            });
        };
        bindSetting(flags.querySelector('#reasoning-auto-parse'), 'reasoningAutoParse');
        bindSetting(flags.querySelector('#reasoning-auto-expand'), 'reasoningAutoExpand');
        bindSetting(flags.querySelector('#reasoning-show-hidden'), 'reasoningShowHidden');
        bindSetting(flags.querySelector('#reasoning-add-prompts'), 'reasoningAddToPrompts');
        wrap.appendChild(flags);

        const maxAdditions = document.createElement('input');
        maxAdditions.id = 'reasoning-max-additions';
        maxAdditions.type = 'number'; maxAdditions.min = '0'; maxAdditions.step = '1';
        maxAdditions.className = 'pp-input';
        maxAdditions.value = String(Number.isFinite(Number(settings.reasoningMaxAdditions)) ? settings.reasoningMaxAdditions : 1);
        maxAdditions.addEventListener('input', () => {
            const n = Math.trunc(Number(maxAdditions.value));
            const safe = Number.isFinite(n) ? Math.max(0, n) : 1;
            maxAdditions.value = String(safe);
            appSettings.update({ reasoningMaxAdditions: safe });
            window.dispatchEvent(new CustomEvent('reasoning-settings-changed'));
        });
        wrap.appendChild(this.renderInputRow([{ label: '写回上限（max additions）', el: maxAdditions }]));

        const makeCodeArea = (id, value, label) => {
            const box = document.createElement('div');
            box.style.marginTop = '10px';
            const lbl = document.createElement('div');
            lbl.className = 'pp-field-label'; lbl.textContent = label;
            const ta = document.createElement('textarea');
            ta.id = id; ta.spellcheck = false; ta.className = 'pp-textarea';
            ta.style.minHeight = '80px'; ta.value = value || '';
            box.appendChild(lbl); box.appendChild(ta);
            return box;
        };

        wrap.appendChild(makeCodeArea('reasoning-prefix', p.prefix || '', '推理前缀（prefix）'));
        wrap.appendChild(makeCodeArea('reasoning-suffix', p.suffix || '', '推理后缀（suffix）'));
        wrap.appendChild(makeCodeArea('reasoning-separator', p.separator || '', '推理分隔（separator）'));

        return wrap;
    }

    /* ── OpenAI Params ── */
    renderOpenAIParamsEditor(p) {
        const wrap = document.createElement('div');

        const maxContext = document.createElement('input');
        maxContext.id = 'gen-max-context'; maxContext.type = 'range';
        maxContext.min = '256'; maxContext.max = '200000'; maxContext.step = '256';
        maxContext.style.width = '100%';
        maxContext.value = String(p.openai_max_context ?? 131072);

        const maxContextNum = document.createElement('input');
        maxContextNum.id = 'gen-max-context-num'; maxContextNum.type = 'number'; maxContextNum.step = '1';
        maxContextNum.className = 'pp-input';
        maxContextNum.value = String(p.openai_max_context ?? 131072);

        const syncMaxContext = (val) => {
            const n = Number(val);
            if (!Number.isFinite(n)) return;
            const clamped = Math.max(0, Math.min(200000, Math.trunc(n)));
            maxContext.value = String(clamped);
            maxContextNum.value = String(clamped);
        };
        maxContext.addEventListener('input', () => syncMaxContext(maxContext.value));
        maxContextNum.addEventListener('input', () => syncMaxContext(maxContextNum.value));

        const make = (id, val, step) => {
            const el = document.createElement('input');
            el.id = id; el.type = 'number'; el.step = step || '0.01';
            el.className = 'pp-input'; el.value = String(val);
            return el;
        };

        const temperature = make('gen-temperature', p.temperature ?? 1);
        const topP = make('gen-top-p', p.top_p ?? 0.98);
        const topK = make('gen-top-k', p.top_k ?? 64, '1');
        const maxTokens = make('gen-max-tokens', p.openai_max_tokens ?? 8192, '1');
        const presence = make('gen-presence', p.presence_penalty ?? 0);
        const frequency = make('gen-frequency', p.frequency_penalty ?? 0);

        const ctxBlock = document.createElement('div');
        ctxBlock.style.marginTop = '4px';
        ctxBlock.innerHTML = `
            <div class="pp-field-label has-help" data-help="用于限制可用上下文窗口。">最大上下文长度（max_context）</div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <div style="flex:2; min-width:200px;" id="gen-max-context-range-wrap"></div>
                <div style="flex:1; min-width:140px;" id="gen-max-context-num-wrap"></div>
            </div>
        `;
        ctxBlock.querySelector('#gen-max-context-range-wrap').appendChild(maxContext);
        ctxBlock.querySelector('#gen-max-context-num-wrap').appendChild(maxContextNum);
        wrap.appendChild(ctxBlock);

        wrap.appendChild(this.renderInputRow([
            { label: 'temperature', el: temperature },
            { label: 'top_p', el: topP },
            { label: 'top_k', el: topK },
        ]));
        wrap.appendChild(this.renderInputRow([
            { label: 'max_output_tokens', el: maxTokens },
            { label: 'presence_penalty', el: presence },
            { label: 'frequency_penalty', el: frequency },
        ]));

        const { provider, model, baseUrl, capability, samplerPolicy } = this.getReasoningCapabilityForPreset(p);
        const normalizedReasoningEffort = normalizeReasoningEffort(p.reasoning_effort, 'high');
        const capabilityLabel = provider && model
            ? `${provider} / ${model}`
            : (provider || model || '未绑定可识别模型');

        if (capability.supported && capability.requestControl) {
            const reasoningCard = document.createElement('div');
            reasoningCard.className = 'pp-reasoning-card';
            const title = document.createElement('div');
            title.className = 'pp-field-label';
            title.textContent = '推理请求';
            reasoningCard.appendChild(title);

            const meta = document.createElement('div');
            meta.style.cssText = 'color:var(--app-text-muted); font-size:12px; margin-top:4px; line-height:1.5;';
            meta.textContent = `当前模型：${capabilityLabel}`;
            reasoningCard.appendChild(meta);

            const requestLabel = document.createElement('label');
            requestLabel.style.cssText = 'display:flex; gap:10px; align-items:flex-start; margin-top:10px; cursor:pointer;';
            const requestReasoning = document.createElement('input');
            requestReasoning.id = 'gen-request-reasoning';
            requestReasoning.type = 'checkbox';
            requestReasoning.checked = p.request_reasoning === true;
            requestReasoning.style.marginTop = '2px';
            requestLabel.appendChild(requestReasoning);

            const requestTextWrap = document.createElement('div');
            requestTextWrap.style.flex = '1';
            const requestText = document.createElement('div');
            requestText.style.cssText = 'font-weight:700; color:var(--app-text-primary);';
            requestText.textContent = '请求推理';
            requestText.className = 'has-help';
            requestText.setAttribute('data-help', '按当前模型的接口显式附加推理参数；关闭则不额外请求。');
            requestText.setAttribute('data-help-mode', 'press');
            requestTextWrap.appendChild(requestText);
            requestLabel.appendChild(requestTextWrap);
            reasoningCard.appendChild(requestLabel);

            let reasoningEffort = null;
            const effortWrap = document.createElement('div');
            effortWrap.style.marginTop = '10px';
            if (capability.effortControl) {
                const effortSelectWrap = document.createElement('div');
                effortSelectWrap.style.width = '100%';
                reasoningEffort = document.createElement('select');
                reasoningEffort.id = 'gen-reasoning-effort';
                reasoningEffort.style.display = 'none';
                capability.effortOptions.forEach((item) => {
                    const opt = document.createElement('option');
                    opt.value = item.value;
                    opt.textContent = item.label;
                    reasoningEffort.appendChild(opt);
                });
                reasoningEffort.value = capability.effortOptions.some((item) => item.value === normalizedReasoningEffort)
                    ? normalizedReasoningEffort
                    : (capability.effortOptions[0]?.value || 'high');
                const effortButton = document.createElement('button');
                effortButton.type = 'button';
                effortButton.className = 'world-app-select-btn';
                effortButton.dataset.selectId = 'gen-reasoning-effort';
                effortButton.style.marginTop = '2px';
                effortButton.innerHTML = `
                    <span class="pp-custom-select-label">请选择推理强度</span>
                    <span class="world-app-select-btn-chevron">▾</span>
                `;
                effortSelectWrap.appendChild(reasoningEffort);
                effortSelectWrap.appendChild(effortButton);
                effortWrap.appendChild(this.renderInputRow([
                    { label: '推理强度', el: effortSelectWrap },
                ]));
                this.bindCustomSelect('gen-reasoning-effort', effortWrap);
            }
            reasoningCard.appendChild(effortWrap);

            const reasoningHint = document.createElement('div');
            reasoningHint.style.cssText = 'color:var(--app-text-muted); font-size:12px; margin-top:10px; line-height:1.5;';
            reasoningCard.appendChild(reasoningHint);

            const samplingControls = {
                temperature,
                top_p: topP,
                top_k: topK,
            };

            const syncReasoningUi = () => {
                const effortButton = effortWrap.querySelector('[data-select-id="gen-reasoning-effort"]');
                if (reasoningEffort) reasoningEffort.disabled = requestReasoning.checked !== true;
                if (effortButton) effortButton.disabled = requestReasoning.checked !== true;
                const activeSamplerPolicy = getReasoningSamplerPolicy({
                    provider,
                    model,
                    baseUrl,
                    requestReasoning: requestReasoning.checked === true,
                });
                Object.entries(samplingControls).forEach(([field, el]) => {
                    if (!el) return;
                    el.disabled = activeSamplerPolicy.disabledFields.includes(field);
                });
                const disabledFieldLabels = [];
                if (activeSamplerPolicy.disabledFields.includes('temperature')) disabledFieldLabels.push('temperature');
                if (activeSamplerPolicy.disabledFields.includes('top_p')) disabledFieldLabels.push('top_p');
                if (activeSamplerPolicy.disabledFields.includes('top_k')) disabledFieldLabels.push('top_k');
                const disabledText = disabledFieldLabels.length
                    ? ` 已自动停用：${disabledFieldLabels.join(' / ')}。`
                    : '';
                reasoningHint.textContent = `${capability.hint || ''}${disabledText}`.trim();
            };
            requestReasoning.addEventListener('change', () => {
                if (
                    requestReasoning.checked === true &&
                    reasoningEffort &&
                    reasoningEffort.value === 'auto' &&
                    capability.effortOptions.some((item) => item.value === 'high')
                ) {
                    reasoningEffort.value = 'high';
                }
                syncReasoningUi();
            });
            Object.entries(samplingControls).forEach(([field, el]) => {
                if (!el) return;
                if (samplerPolicy.disabledFields.includes(field)) {
                    el.disabled = true;
                }
            });
            syncReasoningUi();
            wrap.appendChild(reasoningCard);
        }

        const viewHint = document.createElement('div');
        viewHint.style.cssText = 'color:var(--app-text-muted); font-size:12px; margin:10px 0 4px;';
        viewHint.textContent = '默认回复视角。聊天界面与创意写作界面分开保存；不额外增加聊天区按钮。';
        wrap.appendChild(viewHint);

        const makeTargetSelect = (id, value, fallback) => {
            const el = document.createElement('select');
            el.id = id;
            el.className = 'pp-input';
            el.innerHTML = `
                <option value="character">角色（{{char}}）</option>
                <option value="user">用户（{{user}}）</option>
            `;
            const next = String(value || '').trim().toLowerCase();
            el.value = next === 'user' ? 'user' : (String(fallback || '').trim().toLowerCase() === 'user' ? 'user' : 'character');
            return el;
        };

        const chatTarget = makeTargetSelect('gen-response-target-chat', p.response_target_chat, 'character');
        const chatTargetWrap = this.wrapSelectWithCustomUI(chatTarget, '回复视角');
        const rpTarget = makeTargetSelect('gen-response-target-rp', p.response_target_rp, 'user');
        const rpTargetWrap = this.wrapSelectWithCustomUI(rpTarget, '回复视角');
        const targetRow = this.renderInputRow([
            { label: '聊天界面回复视角', el: chatTargetWrap },
            { label: '创意写作界面回复视角', el: rpTargetWrap },
        ]);
        wrap.appendChild(targetRow);
        this.bindCustomSelect('gen-response-target-chat', targetRow);
        this.bindCustomSelect('gen-response-target-rp', targetRow);

        return wrap;
    }

    /* ── OpenAI Blocks (custom) ── */
    renderOpenAIBlocksEditor(p) {
        const wrap = document.createElement('div');

        const pickPromptOrderBlock = () => {
            const arr = Array.isArray(p.prompt_order) ? p.prompt_order : [];
            const byId = (id) => arr.find(b => b && typeof b === 'object' && String(b.character_id) === String(id));
            return byId(100001) || byId(100000) || arr[0] || null;
        };
        const prompts = Array.isArray(p.prompts) ? p.prompts : [];
        const promptById = new Map();
        prompts.forEach(pr => { if (pr?.identifier) promptById.set(pr.identifier, pr); });
        // 懒渲染数据载体：列表只建轻量卡（重型预设百余区块秒开），编辑草稿进 Map，
        // 保存时由 collectSectionData 合并（capture 总先于重渲染，render 起点清空防跨预设污染）。
        this.openaiBlockDrafts = new Map();
        this.openaiBlockBase = promptById;
        const orderBlock = pickPromptOrderBlock();
        const order = Array.isArray(orderBlock?.order) ? orderBlock.order : [];

        const blocks = order.length
            ? order.map(o => ({ identifier: o.identifier, enabled: o.enabled !== false }))
            : prompts.filter(pr => pr?.identifier).map(pr => ({ identifier: pr.identifier, enabled: true }));

        const headRow = document.createElement('div');
        headRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px; flex-wrap:wrap;';
        headRow.innerHTML = `
            <div style="color:var(--app-text-muted); font-size:12px;">点击区块进入编辑；按住 ☰ 拖动排序</div>
            <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                <span class="has-help" data-help="按当前会话与已保存的预设，构建最终发给模型的完整请求（只预览，不发送；未保存的修改不计入）。「创意写作」不含聊天格式等聊天专属注入；跨场景预览不携带当前会话历史。" style="font-size:12px; color:var(--app-text-secondary); font-weight:700;">请求预览</span>
                <button type="button" id="openai-preview-chat" style="padding:6px 10px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle); cursor:pointer; font-size:12px;">聊天</button>
                <button type="button" id="openai-preview-rp" style="padding:6px 10px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle); cursor:pointer; font-size:12px;">创意写作</button>
                <button type="button" id="openai-add-block" style="padding:6px 10px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; font-size:12px;">+ 新增区块</button>
            </div>
        `;
        const runScenePreview = async (mode) => {
            const fn = this.runtimeContext.showScenePromptPreview;
            if (typeof fn !== 'function') {
                window.toastr?.warning?.('请求预览暂不可用');
                return;
            }
            await fn(mode);
        };
        headRow.querySelector('#openai-preview-chat').onclick = () => runScenePreview('chat');
        headRow.querySelector('#openai-preview-rp').onclick = () => runScenePreview('rp');
        wrap.appendChild(headRow);

        // 搜索/过滤：可查标题与提示词正文；范围切换（全部/标题/正文）代替命中排序——
        // 区块顺序即注入顺序（数据），过滤保持原序不重排；搜索中隐藏拖拽柄防误排。
        const searchRow = document.createElement('div');
        searchRow.style.cssText = 'display:flex; align-items:center; gap:6px; margin-bottom:8px; flex-wrap:wrap;';
        searchRow.innerHTML = `
            <input type="search" id="openai-block-search" class="pp-input" placeholder="搜索区块标题 / 提示词正文…" style="flex:1; min-width:180px;">
            <div class="pp-search-scope" role="group" aria-label="搜索范围">
                <button type="button" data-scope="all" class="is-active">全部</button>
                <button type="button" data-scope="title">标题</button>
                <button type="button" data-scope="content">正文</button>
            </div>
        `;
        wrap.appendChild(searchRow);

        const list = document.createElement('div');
        list.id = 'openai-blocks';
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

        // 按住 ☰ 拖动排序（Pointer Events 鼠标/触摸通用）：克隆悬浮幽灵跟随指针，
        // 原卡变虚线占位实时挪动（落点一目了然）；边缘自动滚动；拖后抑制一次点击。
        const dragState = { suppressClick: false };
        const beginBlockDrag = (e, card) => {
            e.preventDefault();
            e.stopPropagation();
            const pid = e.pointerId;
            const scroller = list.closest('.pp-page-scroll') || list;
            const ghost = createDragGhost(card, e);
            card.classList.add('pp-block-dragging');
            const onMove = (ev) => {
                if (ev.pointerId !== pid) return;
                dragState.suppressClick = true;
                ghost?.move(ev);
                const y = ev.clientY;
                const sr = scroller.getBoundingClientRect();
                if (y < sr.top + 40) scroller.scrollTop -= 9;
                else if (y > sr.bottom - 40) scroller.scrollTop += 9;
                let before = null;
                for (const el of list.querySelectorAll('.openai-block')) {
                    if (el === card) continue;
                    const cr = el.getBoundingClientRect();
                    if (y < cr.top + cr.height / 2) { before = el; break; }
                }
                if (before) {
                    if (card.nextElementSibling !== before) list.insertBefore(card, before);
                } else if (list.lastElementChild !== card) {
                    list.appendChild(card);
                }
            };
            const onUp = (ev) => {
                if (ev.pointerId !== pid) return;
                document.removeEventListener('pointermove', onMove);
                document.removeEventListener('pointerup', onUp);
                document.removeEventListener('pointercancel', onUp);
                const finish = () => card.classList.remove('pp-block-dragging');
                if (ghost) ghost.settle(card.getBoundingClientRect(), finish);
                else finish();
                setTimeout(() => { dragState.suppressClick = false; }, 0);
            };
            document.addEventListener('pointermove', onMove);
            document.addEventListener('pointerup', onUp);
            document.addEventListener('pointercancel', onUp);
        };

        const makeBlockEl = ({ identifier, enabled }) => {
            const pr = promptById.get(identifier);
            const known = OPENAI_KNOWN_BLOCKS[identifier];
            const isMarker = Boolean(pr?.marker) || Boolean(known?.marker);
            const canEdit = !isMarker && (typeof pr?.content === 'string' || !pr);
            const title = pr?.name || known?.label || identifier;
            const roleName = roleIdToName(pr?.role || 'system');

            const card = document.createElement('div');
            card.className = `pp-block openai-block ${enabled === false ? 'pp-block-disabled' : ''}`;
            card.dataset.identifier = identifier;
            card.dataset.marker = isMarker ? 'true' : 'false';

            const header = document.createElement('div');
            header.className = 'pp-block-header';
            header.innerHTML = `
                <div class="pp-block-left">
                    <div class="pp-block-drag" aria-label="按住拖动排序">&#9776;</div>
                    <div style="min-width:0;">
                        <div class="pp-block-title">${title}</div>
                        <div class="pp-block-sub">${isMarker ? 'marker（自动填充）' : `role: ${roleName}`}</div>
                    </div>
                </div>
            `;

            const right = document.createElement('div');
            right.className = 'pp-block-right';
            const enabledWrap = document.createElement('label');
            enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:var(--app-text-secondary); cursor:pointer;';
            enabledWrap.innerHTML = `<input type="checkbox" class="block-enabled" style="width:16px; height:16px;">启用`;
            const enabledInput = enabledWrap.querySelector('input');
            enabledInput.checked = enabled !== false;
            enabledInput.addEventListener('click', (e) => e.stopPropagation());
            enabledInput.addEventListener('change', () => {
                card.classList.toggle('pp-block-disabled', !enabledInput.checked);
            });
            right.appendChild(enabledWrap);

            if (canEdit) {
                const del = document.createElement('button');
                del.type = 'button'; del.className = 'block-delete';
                del.textContent = '删除';
                del.style.cssText = 'padding:6px 10px; border:1px solid var(--app-danger-border, #fecaca); border-radius:10px; background:var(--app-danger-soft, #fee2e2); color:var(--app-danger-text, #b91c1c); cursor:pointer; font-size:12px;';
                del.onclick = async (e) => {
                    e.stopPropagation();
                    const ok = await appConfirm({ title: '删除区块', message: `删除区块「${identifier}」？`, danger: true });
                    if (ok) card.remove();
                };
                right.appendChild(del);
            }

            header.appendChild(right);
            card.appendChild(header);

            // 懒渲染：列表只有轻量头部卡，名称/role/正文等重内容进入编辑页时才按需构建（数据在 openaiBlockDrafts）

            // 点击卡片（非控件区）进入区块编辑页
            header.addEventListener('click', (e) => {
                if (dragState.suppressClick) return;
                if (e.target && (e.target.closest?.('.block-delete') || e.target.closest?.('label') || e.target.closest?.('.pp-block-drag'))) return;
                this.openOpenAIBlockEditor(card);
            });

            // 按住 ☰ 拖动排序（Pointer Events，鼠标/触摸通用；保存按 DOM 顺序）
            const handle = header.querySelector('.pp-block-drag');
            if (handle) {
                handle.style.touchAction = 'none';
                handle.style.cursor = 'grab';
                handle.addEventListener('pointerdown', (e) => beginBlockDrag(e, card));
            }

            return card;
        };

        blocks.forEach(b => { if (b?.identifier) list.appendChild(makeBlockEl(b)); });
        wrap.appendChild(list);

        const emptyHint = document.createElement('div');
        emptyHint.style.cssText = 'display:none; padding:14px; text-align:center; color:var(--app-text-muted); font-size:12px;';
        emptyHint.textContent = '没有匹配的区块';
        wrap.appendChild(emptyHint);

        const resolveBlockText = (identifier) => {
            const d = this.openaiBlockDrafts.get(identifier);
            const base = promptById.get(identifier);
            const known = OPENAI_KNOWN_BLOCKS[identifier];
            return {
                title: String(d?.name ?? base?.name ?? known?.label ?? identifier),
                content: String(d?.content ?? base?.content ?? ''),
            };
        };
        let filterScope = 'all';
        const searchInput = searchRow.querySelector('#openai-block-search');
        const applyFilter = () => {
            const q = String(searchInput.value || '').trim().toLowerCase();
            const filtering = q.length > 0;
            list.dataset.filtering = filtering ? '1' : '0';
            let hits = 0;
            list.querySelectorAll('.openai-block').forEach((card) => {
                card.querySelector('.pp-block-hit')?.remove();
                card.querySelector('.pp-block-title')?.classList.remove('pp-hit-title');
                if (!filtering) { card.style.display = ''; return; }
                const identifier = card.dataset.identifier || '';
                const { title, content } = resolveBlockText(identifier);
                const titleHit = (filterScope !== 'content')
                    && (title.toLowerCase().includes(q) || identifier.toLowerCase().includes(q));
                const contentIdx = (filterScope !== 'title') ? content.toLowerCase().indexOf(q) : -1;
                const hit = titleHit || contentIdx >= 0;
                card.style.display = hit ? '' : 'none';
                if (!hit) return;
                hits += 1;
                if (titleHit) card.querySelector('.pp-block-title')?.classList.add('pp-hit-title');
                if (contentIdx >= 0) {
                    const start = Math.max(0, contentIdx - 24);
                    const end = Math.min(content.length, contentIdx + q.length + 24);
                    const snippet = `${start > 0 ? '…' : ''}${content.slice(start, end)}${end < content.length ? '…' : ''}`;
                    const hitEl = document.createElement('div');
                    hitEl.className = 'pp-block-hit';
                    hitEl.textContent = `正文：${snippet.replace(/\s+/g, ' ')}`;
                    card.appendChild(hitEl);
                }
            });
            emptyHint.style.display = filtering && hits === 0 ? 'block' : 'none';
        };
        let filterTimer = null;
        searchInput.addEventListener('input', () => {
            if (filterTimer) clearTimeout(filterTimer);
            filterTimer = setTimeout(applyFilter, 150);
        });
        searchRow.querySelectorAll('.pp-search-scope button').forEach((btn) => {
            btn.onclick = () => {
                filterScope = btn.dataset.scope || 'all';
                searchRow.querySelectorAll('.pp-search-scope button').forEach(b => b.classList.toggle('is-active', b === btn));
                applyFilter();
            };
        });

        headRow.querySelector('#openai-add-block').onclick = () => {
            const identifier = prompt('区块 identifier（唯一）', `custom_${Date.now()}`);
            if (!identifier) return;
            if (list.querySelector(`.openai-block[data-identifier="${CSS.escape(identifier)}"]`)) {
                window.toastr?.warning?.('identifier 已存在');
                return;
            }
            const name = prompt('区块名称', identifier) || identifier;
            const role = (prompt('role: system/user/assistant', 'system') || 'system').toLowerCase();
            const content = prompt('区块内容（可稍后再改）', '') ?? '';
            promptById.set(identifier, { identifier, name, role, system_prompt: true, marker: false, content });
            // 新区块必须进草稿 Map，保存合并才不会丢
            this.openaiBlockDrafts.set(identifier, { name, role, system_prompt: true, content });
            list.appendChild(makeBlockEl({ identifier, enabled: true }));
        };

        return wrap;
    }

    /* 区块独立编辑页：点击列表中的区块进入；对卡内隐藏表单 write-through，保存/草稿链路不变 */
    openOpenAIBlockEditor(card) {
        if (!card || !this.blockEditorEl) return;
        const identifier = card.dataset.identifier || '';
        const isMarker = card.dataset.marker === 'true';
        const cardTitleEl = card.querySelector('.pp-block-title');
        const cardSubEl = card.querySelector('.pp-block-sub');
        if (this.blockTitleEl) this.blockTitleEl.textContent = cardTitleEl?.textContent || identifier;
        if (this.blockSubtitleEl) this.blockSubtitleEl.textContent = identifier;
        const host = this.blockEditorEl;
        host.innerHTML = '';
        const mkLabel = (text) => {
            const d = document.createElement('div');
            d.className = 'pp-field-label';
            d.textContent = text;
            return d;
        };
        if (isMarker) {
            const p = document.createElement('div');
            p.style.cssText = 'color:var(--app-text-muted); font-size:13px; line-height:1.7; padding:4px 2px;';
            p.textContent = '该区块为 marker：构建 prompt 时由系统自动填充内容（如世界书、聊天记录等），没有可编辑的正文。可在列表中启用/停用，或按住 ☰ 拖动调整插入顺序。';
            host.appendChild(p);
        } else {
            // 懒渲染：编辑草稿存 openaiBlockDrafts（首次进入时按需从预设数据播种），保存时统一合并
            if (!(this.openaiBlockDrafts instanceof Map)) this.openaiBlockDrafts = new Map();
            const base = this.openaiBlockBase?.get?.(identifier) || null;
            const known = OPENAI_KNOWN_BLOCKS[identifier];
            if (!this.openaiBlockDrafts.has(identifier)) {
                this.openaiBlockDrafts.set(identifier, {
                    name: String(base?.name || known?.label || identifier),
                    role: roleIdToName(base?.role || 'system'),
                    system_prompt: (typeof base?.system_prompt === 'boolean') ? base.system_prompt : true,
                    content: String(base?.content ?? ''),
                });
            }
            const draft = this.openaiBlockDrafts.get(identifier);

            const metaRow = document.createElement('div');
            metaRow.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap; margin-bottom:10px;';
            const nameCell = document.createElement('div');
            nameCell.style.cssText = 'flex:2; min-width:200px;';
            nameCell.appendChild(mkLabel('名称'));
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'pp-input';
            nameInput.placeholder = '区块名称';
            nameInput.value = draft.name || '';
            nameInput.addEventListener('input', () => {
                draft.name = nameInput.value;
                const next = nameInput.value || identifier;
                if (cardTitleEl) cardTitleEl.textContent = next;
                if (this.blockTitleEl) this.blockTitleEl.textContent = next;
            });
            nameCell.appendChild(nameInput);
            const roleCell = document.createElement('div');
            roleCell.style.cssText = 'flex:1; min-width:140px;';
            roleCell.appendChild(mkLabel('role'));
            const roleSel = document.createElement('select');
            roleSel.className = 'pp-input';
            roleSel.innerHTML = '<option value="system">system</option><option value="user">user</option><option value="assistant">assistant</option>';
            roleSel.value = draft.role || 'system';
            roleSel.addEventListener('change', () => {
                draft.role = roleSel.value;
                if (cardSubEl) cardSubEl.textContent = `role: ${roleSel.value}`;
            });
            roleCell.appendChild(roleSel);
            metaRow.appendChild(nameCell);
            metaRow.appendChild(roleCell);
            host.appendChild(metaRow);

            const sysWrap = document.createElement('label');
            sysWrap.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px; color:var(--app-text-secondary); cursor:pointer; margin-bottom:10px;';
            const sysChk = document.createElement('input');
            sysChk.type = 'checkbox';
            sysChk.style.cssText = 'width:16px; height:16px;';
            sysChk.checked = Boolean(draft.system_prompt);
            sysChk.addEventListener('change', () => { draft.system_prompt = sysChk.checked; });
            sysWrap.appendChild(sysChk);
            sysWrap.appendChild(document.createTextNode('system_prompt'));
            host.appendChild(sysWrap);

            host.appendChild(mkLabel('提示词正文'));
            const ta = document.createElement('textarea');
            ta.className = 'pp-textarea';
            ta.spellcheck = false;
            ta.style.cssText = 'width:100%; min-height: max(320px, calc(var(--app-visual-height, 100vh) - 420px)); resize: vertical;';
            ta.value = draft.content || '';
            ta.addEventListener('input', () => { draft.content = ta.value; });
            host.appendChild(ta);
        }
        this.currentPage = 'block';
        this.setPageView('block');
    }

    /* ════════════════════════════════════════
       Data collection & Save
       ════════════════════════════════════════ */
    getDraftKey(storeType, presetId) {
        const st = String(storeType || '').trim();
        const id = String(presetId || '').trim();
        if (!st || !id) return null;
        return `${st}:${id}`;
    }

    captureDraftsFromDOM() {
        if (!this.element) return;
        this.captureCurrentDetailDraft();
    }

    collectSectionData(sectionId, root, base) {
        const current = deepClone(base || {});

        if (sectionId === 'sysprompt') {
            current.content = root.querySelector('#sysprompt-content')?.value ?? '';
            current.post_history = root.querySelector('#sysprompt-post')?.value ?? '';
            return current;
        }

        if (sectionId === 'chatprompts') {
            if (!root.querySelector('#phone-format-intro-rules') && !root.querySelector('#dialogue-rules')) {
                return current;
            }
            current.phone_format_intro_enabled = Boolean(root.querySelector('#phone-format-intro-enabled')?.checked);
            current.phone_format_intro_rules = root.querySelector('#phone-format-intro-rules')?.value ?? '';
            current.phone_format_chat_enabled = Boolean(root.querySelector('#phone-format-chat-enabled')?.checked);
            current.phone_format_chat_rules = root.querySelector('#phone-format-chat-rules')?.value ?? '';
            current.phone_format_moment_enabled = Boolean(root.querySelector('#phone-format-moment-enabled')?.checked);
            current.phone_format_moment_rules = root.querySelector('#phone-format-moment-rules')?.value ?? '';
            current.phone_format_footer_enabled = Boolean(root.querySelector('#phone-format-footer-enabled')?.checked);
            current.phone_format_footer_rules = root.querySelector('#phone-format-footer-rules')?.value ?? '';
            current.dialogue_enabled = Boolean(root.querySelector('#dialogue-enabled')?.checked);
            current.dialogue_position = getInt(root.querySelector('#dialogue-position')?.value, current.dialogue_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.dialogue_depth = getInt(root.querySelector('#dialogue-depth')?.value, current.dialogue_depth ?? 1);
            current.dialogue_role = getInt(root.querySelector('#dialogue-role')?.value, current.dialogue_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.dialogue_rules = root.querySelector('#dialogue-rules')?.value ?? '';
            current.moment_create_enabled = Boolean(root.querySelector('#moment-enabled')?.checked);
            current.moment_create_position = getInt(root.querySelector('#moment-position')?.value, current.moment_create_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.moment_create_depth = getInt(root.querySelector('#moment-depth')?.value, current.moment_create_depth ?? 1);
            current.moment_create_role = getInt(root.querySelector('#moment-role')?.value, current.moment_create_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.moment_create_rules = root.querySelector('#moment-rules')?.value ?? '';
            current.moment_comment_enabled = Boolean(root.querySelector('#moment-comment-enabled')?.checked);
            current.moment_comment_position = getInt(root.querySelector('#moment-comment-position')?.value, current.moment_comment_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.moment_comment_depth = getInt(root.querySelector('#moment-comment-depth')?.value, current.moment_comment_depth ?? 0);
            current.moment_comment_role = getInt(root.querySelector('#moment-comment-role')?.value, current.moment_comment_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.moment_comment_rules = root.querySelector('#moment-comment-rules')?.value ?? '';
            current.moment_publish_comment_enabled = Boolean(root.querySelector('#moment-publish-comment-enabled')?.checked);
            current.moment_publish_comment_position = getInt(root.querySelector('#moment-publish-comment-position')?.value, current.moment_publish_comment_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.moment_publish_comment_depth = getInt(root.querySelector('#moment-publish-comment-depth')?.value, current.moment_publish_comment_depth ?? 0);
            current.moment_publish_comment_role = getInt(root.querySelector('#moment-publish-comment-role')?.value, current.moment_publish_comment_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.moment_publish_comment_rules = root.querySelector('#moment-publish-comment-rules')?.value ?? '';
            current.auto_image_prompt_enabled = Boolean(root.querySelector('#auto-image-prompt-enabled')?.checked);
            current.auto_image_prompt_position = getInt(root.querySelector('#auto-image-prompt-position')?.value, current.auto_image_prompt_position ?? EXT_PROMPT_TYPES.IN_CHAT);
            current.auto_image_prompt_depth = getInt(root.querySelector('#auto-image-prompt-depth')?.value, current.auto_image_prompt_depth ?? 0);
            current.auto_image_prompt_role = getInt(root.querySelector('#auto-image-prompt-role')?.value, current.auto_image_prompt_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.auto_image_prompt_rules = root.querySelector('#auto-image-prompt-rules')?.value ?? '';
            current.group_enabled = Boolean(root.querySelector('#group-enabled')?.checked);
            current.group_position = getInt(root.querySelector('#group-position')?.value, current.group_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.group_depth = getInt(root.querySelector('#group-depth')?.value, current.group_depth ?? 1);
            current.group_role = getInt(root.querySelector('#group-role')?.value, current.group_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.group_rules = root.querySelector('#group-rules')?.value ?? '';
            current.summary_enabled = Boolean(root.querySelector('#summary-enabled')?.checked);
            current.summary_position = getInt(root.querySelector('#summary-position')?.value, current.summary_position ?? EXT_PROMPT_TYPES.IN_CHAT);
            current.summary_rules = root.querySelector('#summary-rules')?.value ?? '';
            current.ds_format_enabled = Boolean(root.querySelector('#ds-format-enabled')?.checked);
            current.ds_format_rules = root.querySelector('#ds-format-rules')?.value ?? '';
            return current;
        }

        if (sectionId === 'context') {
            current.story_string = root.querySelector('#context-story')?.value ?? '';
            current.story_string_position = getInt(root.querySelector('#context-position')?.value, current.story_string_position ?? EXT_PROMPT_TYPES.IN_PROMPT);
            current.story_string_depth = getInt(root.querySelector('#context-depth')?.value, current.story_string_depth ?? 1);
            current.story_string_role = getInt(root.querySelector('#context-role')?.value, current.story_string_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.example_separator = root.querySelector('#context-example-sep')?.value ?? '';
            current.chat_start = root.querySelector('#context-chat-start')?.value ?? '';
            current.names_as_stop_strings = Boolean(root.querySelector('#context-names-stop')?.checked);
            current.use_stop_strings = Boolean(root.querySelector('#context-use-stop')?.checked);
            current.trim_sentences = Boolean(root.querySelector('#context-trim')?.checked);
            current.single_line = Boolean(root.querySelector('#context-single')?.checked);
            return current;
        }

        if (sectionId === 'instruct') {
            current.input_sequence = root.querySelector('#ins-input-seq')?.value ?? '';
            current.output_sequence = root.querySelector('#ins-output-seq')?.value ?? '';
            current.system_sequence = root.querySelector('#ins-system-seq')?.value ?? '';
            current.stop_sequence = root.querySelector('#ins-stop-seq')?.value ?? '';
            current.wrap = Boolean(root.querySelector('#ins-wrap')?.checked);
            current.macro = Boolean(root.querySelector('#ins-macro')?.checked);
            current.skip_examples = Boolean(root.querySelector('#ins-skip-examples')?.checked);
            return current;
        }

        if (sectionId === 'reasoning') {
            current.prefix = root.querySelector('#reasoning-prefix')?.value ?? '';
            current.suffix = root.querySelector('#reasoning-suffix')?.value ?? '';
            current.separator = root.querySelector('#reasoning-separator')?.value ?? '';
            return current;
        }

        if (sectionId === 'openai') {
            current.temperature = getNum(root.querySelector('#gen-temperature')?.value, current.temperature ?? 1);
            current.top_p = getNum(root.querySelector('#gen-top-p')?.value, current.top_p ?? 0.98);
            current.top_k = getInt(root.querySelector('#gen-top-k')?.value, current.top_k ?? 64);
            current.openai_max_context = getInt(root.querySelector('#gen-max-context-num')?.value ?? root.querySelector('#gen-max-context')?.value, current.openai_max_context ?? 131072);
            current.openai_max_tokens = getInt(root.querySelector('#gen-max-tokens')?.value, current.openai_max_tokens ?? 8192);
            current.presence_penalty = getNum(root.querySelector('#gen-presence')?.value, current.presence_penalty ?? 0);
            current.frequency_penalty = getNum(root.querySelector('#gen-frequency')?.value, current.frequency_penalty ?? 0);
            if (root.querySelector('#gen-request-reasoning')) {
                current.request_reasoning = Boolean(root.querySelector('#gen-request-reasoning')?.checked);
            }
            if (root.querySelector('#gen-reasoning-effort')) {
                current.reasoning_effort = normalizeReasoningEffort(root.querySelector('#gen-reasoning-effort')?.value, current.reasoning_effort ?? 'high');
            } else {
                current.reasoning_effort = normalizeReasoningEffort(current.reasoning_effort, 'high');
            }
            current.response_target_chat = root.querySelector('#gen-response-target-chat')?.value === 'user' ? 'user' : 'character';
            current.response_target_rp = root.querySelector('#gen-response-target-rp')?.value === 'character' ? 'character' : 'user';
            const memoryDataPositionEl = root.querySelector('#gen-memory-data-position');
            const memoryDataDepthEl = root.querySelector('#gen-memory-data-depth');
            const memoryGuidePositionEl = root.querySelector('#gen-memory-guide-position');
            const memoryGuideDepthEl = root.querySelector('#gen-memory-guide-depth');
            if (memoryDataPositionEl) current.memory_data_position = String(memoryDataPositionEl.value || '').trim().toLowerCase();
            if (memoryDataDepthEl) current.memory_data_depth = getInt(memoryDataDepthEl.value, current.memory_data_depth ?? 0);
            if (memoryGuidePositionEl) current.memory_guide_position = String(memoryGuidePositionEl.value || '').trim().toLowerCase();
            if (memoryGuideDepthEl) current.memory_guide_depth = getInt(memoryGuideDepthEl.value, current.memory_guide_depth ?? 0);
            delete current.boundProfileId;
            return current;
        }

        if (sectionId === 'custom') {
            const prompts = Array.isArray(current.prompts) ? current.prompts : [];
            const promptById = new Map();
            prompts.forEach(pr => { if (pr?.identifier) promptById.set(pr.identifier, pr); });

            // 懒渲染后区块编辑草稿在 openaiBlockDrafts（列表卡不再携带隐藏表单），此处合并
            const blockDrafts = this.openaiBlockDrafts instanceof Map ? this.openaiBlockDrafts : new Map();
            blockDrafts.forEach((draft, ident) => {
                if (!ident) return;
                const existing = promptById.get(ident) || { identifier: ident };
                promptById.set(ident, {
                    ...existing, identifier: ident,
                    name: (draft.name || existing.name || ident),
                    role: roleIdToName(draft.role || existing.role || 'system'),
                    system_prompt: typeof draft.system_prompt === 'boolean' ? draft.system_prompt : (existing.system_prompt ?? true),
                    marker: false, content: String(draft.content ?? existing.content ?? ''),
                });
            });

            const blockEls = Array.from(root.querySelectorAll('.openai-block'));
            const order = blockEls.map((el) => {
                const identifier = el.dataset.identifier || '';
                const enabled = el.querySelector('.block-enabled')?.checked !== false;
                return identifier ? { identifier, enabled } : null;
            }).filter(Boolean);

            order.forEach(({ identifier }) => {
                if (!identifier || promptById.has(identifier)) return;
                const known = OPENAI_KNOWN_BLOCKS[identifier];
                if (known?.marker) promptById.set(identifier, { identifier, name: known.label, system_prompt: true, marker: true });
            });

            current.prompts = Array.from(promptById.values());
            if (!Array.isArray(current.prompt_order)) current.prompt_order = [];
            current.prompt_order = [{ character_id: 100001, order }];
            delete current.boundProfileId;
            return current;
        }

        return current;
    }

    /* ════════════════════════════════════════
       Save / New / Rename / Delete
       ════════════════════════════════════════ */
    async onSave() {
        await this.store.ready;
        try {
            this.captureDraftsFromDOM();

            const toSave = [];
            for (const [key, data] of this.drafts.entries()) {
                const [storeType, presetId] = String(key).split(':');
                if (!storeType || !presetId) continue;
                const name = String(data?.name || '').trim() || presetId || '未命名';
                toSave.push({ storeType, presetId, name, data: { ...(data || {}), name } });
            }

            for (const st of ['sysprompt', 'context', 'instruct', 'openai', 'reasoning']) {
                const activeId = this.store.getActiveId(st);
                if (!activeId) continue;
                const key = this.getDraftKey(st, activeId);
                if (key && this.drafts.has(key)) continue;
                const data = deepClone(this.store.getActive(st) || {});
                const name = String(data?.name || '').trim() || activeId || '未命名';
                toSave.push({ storeType: st, presetId: activeId, name, data: { ...(data || {}), name } });
            }

            for (const item of toSave) {
                await this.store.upsert(item.storeType, { id: item.presetId, name: item.name, data: item.data });
            }

            this.renderAllSections();
            this.showStatus('保存成功', 'success');
            window.dispatchEvent(new CustomEvent('preset-changed'));
        } catch (err) {
            logger.error('保存预设失败', err);
            this.showStatus(err.message || '保存失败', 'error');
        }
    }

    async onNewForStoreType(storeType) {
        await this.store.ready;
        const name = prompt('新建预设名称', '新预设');
        if (!name) return;
        this.captureDraftsFromDOM();
        const base = this.getActivePresetSnapshot(storeType) || {};
        const data = { ...deepClone(base), name };
        const id = await this.store.upsert(storeType, { name, data });
        await this.store.setActive(storeType, id);
        for (const k of Array.from(this.drafts.keys())) {
            if (String(k).startsWith(`${storeType}:`)) this.drafts.delete(k);
        }
        this.renderAllSections();
        this.showStatus('已新建', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    async onRenameForStoreType(storeType) {
        await this.store.ready;
        const id = this.store.getActiveId(storeType);
        const current = this.getActivePresetSnapshot(storeType);
        if (!id || !current) return;
        this.captureDraftsFromDOM();
        const name = prompt('重命名预设', current.name || id);
        if (!name) return;
        await this.store.upsert(storeType, { id, name, data: { ...current, name } });
        const key = this.getDraftKey(storeType, id);
        if (key && this.drafts.has(key)) {
            const d = this.drafts.get(key) || {};
            d.name = name;
            this.drafts.set(key, d);
        }
        this.renderAllSections();
        this.showStatus('已重命名', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    async onDeleteForStoreType(storeType) {
        await this.store.ready;
        const id = this.store.getActiveId(storeType);
        if (!id) return;
        const ok = await appConfirm({ title: '删除预设', message: '删除该预设？此操作不可恢复。', danger: true });
        if (!ok) return;
        this.captureDraftsFromDOM();

        try {
            await waitForRegexStoreReady(window.appBridge);
            const sets = listRegexLocalSets(window.appBridge);
            const bound = sets.filter(s =>
                s?.bind?.type === 'preset' &&
                String(s.bind.presetType || '') === String(storeType) &&
                String(s.bind.presetId || '') === String(id)
            );
            if (bound.length) {
                const delRegex = await appConfirm({
                    title: '删除正则', danger: true,
                    message: `检测到该预设绑定了 ${bound.length} 组正则。是否一并删除？`,
                    confirmText: '一并删除', cancelText: '仅删除预设',
                });
                if (delRegex) {
                    for (const s of bound) {
                        const sid = String(s?.id || '').trim();
                        if (sid) await removeRegexLocalSet(window.appBridge, sid);
                    }
                    window.dispatchEvent(new CustomEvent('regex-changed'));
                }
            }
        } catch {}

        try {
            const scriptStore = await waitForScriptStoreReady(window.appBridge);
            const scripts = scriptStore?.getScripts?.('preset', id) || [];
            const scopeVariables = scriptStore?.getScopeVariables?.('preset', id) || {};
            if (Array.isArray(scripts) && scripts.length) {
                const delScripts = await appConfirm({
                    title: '删除脚本', danger: true,
                    message: `检测到该预设绑定了 ${scripts.length} 条脚本。是否一并删除？`,
                    confirmText: '一并删除', cancelText: '仅删除预设',
                });
                if (delScripts) {
                    if (typeof scriptStore.removeScope === 'function') {
                        await scriptStore.removeScope('preset', id);
                    } else {
                        await scriptStore.setScripts('preset', id, []);
                    }
                }
            } else if (Object.keys(scopeVariables).length && typeof scriptStore?.removeScope === 'function') {
                await scriptStore.removeScope('preset', id);
            }
        } catch {}

        await this.store.remove(storeType, id);
        const key = this.getDraftKey(storeType, id);
        if (key) this.drafts.delete(key);
        this.renderAllSections();
        this.showStatus('已删除', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    showStatus(message, type = 'info') {
        const el = this.statusEl;
        if (!el) return;
        const colors = {
            success: { bg: '#dcfce7', fg: '#166534' },
            error: { bg: '#fee2e2', fg: '#991b1b' },
            info: { bg: '#dbeafe', fg: '#1e40af' },
        };
        const c = colors[type] || colors.info;
        el.style.display = 'block';
        el.style.background = c.bg;
        el.style.color = c.fg;
        el.textContent = message;
        setTimeout(() => { el.style.display = 'none'; }, 3500);
    }

    /* ════════════════════════════════════════
       Import / Export (preserved from original)
       ════════════════════════════════════════ */
    detectPresetType(obj) {
        if (!obj || typeof obj !== 'object') return null;
        if (obj.presets && obj.active && obj.enabled) return 'store';
        if (typeof obj.story_string === 'string') return 'context';
        if (typeof obj.content === 'string' && ('post_history' in obj)) return 'sysprompt';
        if (typeof obj.input_sequence === 'string' || typeof obj.output_sequence === 'string') return 'instruct';
        if (typeof obj.prefix === 'string' && typeof obj.suffix === 'string' && typeof obj.separator === 'string') return 'reasoning';
        if ('temperature' in obj || 'top_p' in obj || 'temp_openai' in obj || 'top_p_openai' in obj ||
            'openai_max_context' in obj || 'openai_max_tokens' in obj || 'prompts' in obj || 'prompt_order' in obj) return 'openai';
        return null;
    }

    convertStRegexScriptsToRules(regexes = []) {
        const scripts = Array.isArray(regexes) ? regexes : [];
        return scripts.map((s) => {
            const findRegex = String(s?.findRegex || '').trim();
            if (!findRegex) return null;
            return {
                id: s?.id || undefined,
                scriptName: String(s?.scriptName || '').trim(),
                findRegex,
                replaceString: String(s?.replaceString ?? ''),
                trimStrings: Array.isArray(s?.trimStrings) ? s.trimStrings : [],
                placement: Array.isArray(s?.placement) ? s.placement : [],
                disabled: Boolean(s?.disabled),
                markdownOnly: Boolean(s?.markdownOnly),
                promptOnly: Boolean(s?.promptOnly),
                runOnEdit: Boolean(s?.runOnEdit),
                substituteRegex: Number(s?.substituteRegex ?? 0),
                minDepth: s?.minDepth ?? null,
                maxDepth: s?.maxDepth ?? null,
            };
        }).filter(Boolean);
    }

    extractPresetRegexScripts(obj) {
        const ext = obj?.extensions && typeof obj.extensions === 'object' ? obj.extensions : {};
        const list = [];
        const push = (val) => {
            if (!Array.isArray(val)) return;
            val.forEach((item) => {
                if (item && typeof item === 'object') list.push(item);
            });
        };
        push(ext.regex_scripts);
        push(ext.regexScripts);
        push(ext.regex);
        push(ext.regexes);
        return list;
    }

    extractPresetScripts(obj) {
        const out = [];
        const seen = new Set();
        const push = (val) => {
            if (!Array.isArray(val)) return;
            val.forEach((item) => {
                if (!item || typeof item !== 'object') return;
                const id = String(item?.id || '').trim();
                const name = String(item?.name || '').trim();
                const content = String(item?.content || '');
                const sig = id || `${name}\u0000${content}`;
                if (!sig || seen.has(sig)) return;
                seen.add(sig);
                out.push(deepClone(item));
            });
        };
        push(obj?.boundScripts);
        push(obj?.bound_scripts);
        const candidates = [
            obj?.tavern_helper,
            obj?.tavernHelper,
            obj?.tavern_helper_scripts,
            obj?.tavernHelperScripts,
            obj?.extensions?.tavern_helper,
            obj?.extensions?.tavernHelper,
            obj?.extensions?.tavern_helper_scripts,
            obj?.extensions?.tavernHelperScripts,
        ];
        candidates.forEach((raw) => {
            if (!raw || typeof raw !== 'object') return;
            const th = Array.isArray(raw) ? Object.fromEntries(raw) : raw;
            push(th?.scripts);
        });
        return out;
    }

    getRuleSignature(r) {
        const findRegex = String(r?.findRegex || '').trim();
        const replaceString = String(r?.replaceString ?? '');
        const trim = Array.isArray(r?.trimStrings) ? r.trimStrings.map(String).join('\n') : '';
        const placement = Array.isArray(r?.placement) ? r.placement.map(n => Number(n)).filter(Number.isFinite).sort((a, b) => a - b).join(',') : '';
        const disabled = r?.disabled ? '1' : '0';
        const markdownOnly = r?.markdownOnly ? '1' : '0';
        const promptOnly = r?.promptOnly ? '1' : '0';
        const runOnEdit = r?.runOnEdit ? '1' : '0';
        const sub = String(Number(r?.substituteRegex ?? 0));
        const minD = (r?.minDepth === null || r?.minDepth === undefined || r?.minDepth === '') ? '' : String(r?.minDepth);
        const maxD = (r?.maxDepth === null || r?.maxDepth === undefined || r?.maxDepth === '') ? '' : String(r?.maxDepth);
        if (!findRegex && String(r?.pattern || '').trim()) {
            const when = String(r?.when || 'both');
            const pattern = String(r?.pattern || '').trim();
            const flags = (r?.flags === undefined || r?.flags === null) ? 'g' : String(r?.flags);
            const replacement = String(r?.replacement ?? '');
            return `${when}\u0000${pattern}\u0000${flags}\u0000${replacement}`;
        }
        return [findRegex, replaceString, trim, placement, disabled, markdownOnly, promptOnly, runOnEdit, sub, minD, maxD].join('\u0000');
    }

    getExistingLocalRuleSigs() {
        const sigs = new Set();
        try {
            const sets = listRegexLocalSets(window.appBridge);
            sets.forEach(s => { (Array.isArray(s?.rules) ? s.rules : []).forEach(r => { sigs.add(this.getRuleSignature(r)); }); });
        } catch {}
        return sigs;
    }

    extractStRegexBindingSets(obj) {
        const out = [];
        const seenScriptIds = new Set();
        const seenRuleSigs = new Set();
        const appendRules = (rules = [], name = 'RegexBinding') => {
            const unique = [];
            (Array.isArray(rules) ? rules : []).forEach((rule) => {
                const sig = this.getRuleSignature(rule);
                if (!sig || seenRuleSigs.has(sig)) return;
                seenRuleSigs.add(sig);
                unique.push(rule);
            });
            if (unique.length) {
                out.push({
                    name: getRegexImportSetName(name, unique, '导入正则'),
                    enabled: true,
                    rules: unique,
                });
            }
        };
        const tryAddRegexes = (container) => {
            const regexes = container?.RegexBinding?.regexes;
            if (!Array.isArray(regexes) || !regexes.length) return;
            const filtered = regexes.filter(r => {
                const id = String(r?.id || '');
                if (!id) return true;
                if (seenScriptIds.has(id)) return false;
                seenScriptIds.add(id);
                return true;
            });
            if (!filtered.length) return;
            appendRules(this.convertStRegexScriptsToRules(filtered), 'RegexBinding');
        };
        const tryAddExtensionRegexes = (container) => {
            const regexes = this.extractPresetRegexScripts(container);
            if (!regexes.length) return;
            appendRules(this.convertStRegexScriptsToRules(regexes), 'Regex Scripts');
        };
        const tryParseJsonString = (s) => {
            const raw = String(s || '').trim();
            if (!raw || !raw.includes('RegexBinding') || !(raw.startsWith('{') || raw.startsWith('['))) return null;
            try { return JSON.parse(raw); } catch { return null; }
        };
        tryAddExtensionRegexes(obj);
        tryAddRegexes(obj);
        const walk = (node, depth = 0) => {
            if (!node || depth > 18) return;
            if (typeof node === 'string') {
                const parsed = tryParseJsonString(node);
                if (parsed && typeof parsed === 'object') {
                    tryAddExtensionRegexes(parsed);
                    tryAddRegexes(parsed);
                    walk(parsed, depth + 1);
                }
                return;
            }
            if (Array.isArray(node)) { node.forEach(v => walk(v, depth + 1)); return; }
            if (typeof node === 'object') {
                tryAddExtensionRegexes(node);
                tryAddRegexes(node);
                for (const v of Object.values(node)) walk(v, depth + 1);
            }
        };
        walk(obj, 0);
        return out;
    }

    async exportCurrent() {
        try {
            await this.store.ready;
            this.captureDraftsFromDOM();
            const type = 'openai';
            const presetId = this.store.getActiveId(type);
            const draftKey = this.getDraftKey(type, presetId);
            const draft = draftKey ? this.drafts.get(draftKey) : null;
            const preset = draft || this.store.getActive(type) || {};
            const rawName = String(preset.name || type).trim() || type;
            const payload = { ...(preset || {}) };

            try {
                await waitForRegexStoreReady(window.appBridge);
                const sets = listRegexLocalSets(window.appBridge);
                const bindId = this.store.getActiveId(type);
                if (type && bindId) {
                    const bound = sets
                        .filter(s => s?.bind?.type === 'preset' && s.bind.presetType === type && s.bind.presetId === bindId)
                        .map(s => ({ name: s.name, enabled: s.enabled !== false, rules: s.rules || [] }));
                    if (bound.length) {
                        payload.boundRegexSets = bound;
                        payload.extensions = payload.extensions && typeof payload.extensions === 'object'
                            ? deepClone(payload.extensions)
                            : {};
                        const flatRegexScripts = [];
                        const seenRegexSigs = new Set();
                        bound.forEach((set) => {
                            (Array.isArray(set?.rules) ? set.rules : []).forEach((rule) => {
                                const sig = this.getRuleSignature(rule);
                                if (!sig || seenRegexSigs.has(sig)) return;
                                seenRegexSigs.add(sig);
                                flatRegexScripts.push(deepClone(rule));
                            });
                        });
                        if (flatRegexScripts.length) {
                            payload.extensions.regex_scripts = flatRegexScripts;
                            const sp = payload.extensions.SPreset && typeof payload.extensions.SPreset === 'object'
                                ? deepClone(payload.extensions.SPreset)
                                : {};
                            sp.RegexBinding = { regexes: deepClone(flatRegexScripts) };
                            payload.extensions.SPreset = sp;
                        }
                    }
                }
            } catch {}

            try {
                const scriptStore = await waitForScriptStoreReady(window.appBridge);
                const bindId = this.store.getActiveId(type);
                const boundScripts = bindId && scriptStore?.getScripts
                    ? (scriptStore.getScripts('preset', bindId) || [])
                    : [];
                if (Array.isArray(boundScripts) && boundScripts.length) {
                    payload.boundScripts = deepClone(boundScripts);
                    payload.extensions = payload.extensions && typeof payload.extensions === 'object'
                        ? deepClone(payload.extensions)
                        : {};
                    const rawHelper = payload.extensions.tavern_helper;
                    const helper = Array.isArray(rawHelper)
                        ? Object.fromEntries(rawHelper)
                        : (rawHelper && typeof rawHelper === 'object' ? deepClone(rawHelper) : {});
                    helper.scripts = deepClone(boundScripts);
                    if (!helper.variables || typeof helper.variables !== 'object') helper.variables = {};
                    payload.extensions.tavern_helper = helper;
                }
            } catch {}

            const filename = `preset-${rawName}.json`;
            const ok = await this.downloadJson(filename, payload);
            if (!ok) return;
            this.showStatus('已导出当前预设', 'success');
            window.toastr?.success?.('已导出预设');
        } catch (err) {
            logger.warn('预设导出失败', err);
            this.showStatus('预设导出失败', 'error');
            window.toastr?.error?.('导出失败');
        }
    }

    async importFromFile(file) {
        await this.store.ready;
        let text = '';
        try { text = await file.text(); } catch { this.showStatus('读取文件失败', 'error'); return; }
        let json = null;
        try { json = JSON.parse(text); } catch { this.showStatus('JSON 格式错误', 'error'); return; }

        const detected = this.detectPresetType(json);
        if (detected === 'store') {
            const replace = await appConfirm({
                title: '导入预设',
                message: '检测到「整套预设设定档」。确定要导入并覆盖当前设置吗？（取消=合并导入）',
                confirmText: '覆盖导入', cancelText: '合并导入',
            });
            await this.store.importState(json, { mode: replace ? 'replace' : 'merge' });
            this.renderAllSections();
            this.showStatus('已导入预设设定档', 'success');
            window.dispatchEvent(new CustomEvent('preset-changed'));
            return;
        }

        const detectedType = (detected && detected !== 'store') ? detected : null;
        let importType = detectedType || 'openai';

        if (detectedType && detectedType !== 'openai') {
            const ok = await appConfirm({
                title: '导入类型',
                message: `检测到预设格式为「${this.getTypeLabel(detectedType)}」。要导入到该类型吗？`,
                confirmText: `导入到「${this.getTypeLabel(detectedType)}」`, cancelText: '导入到生成参数',
            });
            importType = ok ? detectedType : 'openai';
        }

        const fileBaseName = String(file?.name || '').replace(/\.[^/.]+$/, '').trim();
        const name = fileBaseName || String(json?.name || '').trim() || '导入预设';

        let boundSets = json?.boundRegexSets || json?.bound_regex_sets || null;
        let boundScripts = this.extractPresetScripts(json);
        const data = { ...json, name };
        delete data.boundRegexSets;
        delete data.bound_regex_sets;
        delete data.boundScripts;
        delete data.bound_scripts;

        if (!Array.isArray(boundSets) || !boundSets.length) {
            const stSets = this.extractStRegexBindingSets(json);
            if (stSets.length) boundSets = stSets;
        }

        const presetId = await this.store.upsert(importType, { name, data });

        if (Array.isArray(boundSets) && boundSets.length) {
            try {
                const ok = await appConfirm({
                    title: '导入正则',
                    message: `检测到预设包含绑定的正规表达式（${boundSets.length} 组）。是否一并导入并绑定？`,
                    confirmText: '一并导入', cancelText: '仅导入预设',
                });
                if (ok) {
                    await waitForRegexStoreReady(window.appBridge);
                    const bindTarget = resolveImportedRegexPresetBindTarget({
                        importType,
                        presetId,
                        presetStore: this.store,
                    });
                    const regexPresetId = String(bindTarget?.presetId || '').trim();
                    if (!regexPresetId || !bindTarget?.bind) {
                        window.toastr?.info?.('已跳过绑定正则导入');
                    } else {
                        const regexPresetName = String(
                            this.store.list(REGEX_CUSTOM_PROMPT_PRESET_TYPE).find(item => String(item.id || '') === regexPresetId)?.name ||
                            regexPresetId,
                        ).trim() || regexPresetId;
                        const bind = bindTarget.bind;
                        const existingSigs = this.getExistingLocalRuleSigs();
                        for (const s of boundSets) {
                            const rulesRaw = Array.isArray(s?.rules) ? s.rules : [];
                            const rules = [];
                            const localSeen = new Set();
                            for (const rr of rulesRaw) {
                                const sig = this.getRuleSignature(rr);
                                if (!sig || localSeen.has(sig) || existingSigs.has(sig)) continue;
                                localSeen.add(sig); existingSigs.add(sig); rules.push(rr);
                            }
                            if (!rules.length) continue;
                            const setName = String(s?.name || '正则').trim() || '正则';
                            await upsertRegexLocalSet(window.appBridge, {
                                name: `${setName} (${regexPresetName})`, enabled: s?.enabled !== false,
                                bind, rules,
                            });
                        }
                        window.dispatchEvent(new CustomEvent('regex-changed'));
                    }
                }
            } catch (err) { logger.warn('导入绑定正则失败', err); }
        }

        if (Array.isArray(boundScripts) && boundScripts.length) {
            try {
                const ok = await appConfirm({
                    title: '导入脚本',
                    message: `检测到预设包含绑定脚本（${boundScripts.length} 条）。是否一并导入并绑定？`,
                    confirmText: '一并导入', cancelText: '仅导入预设',
                });
                if (ok) {
                    const scriptStore = await waitForScriptStoreReady(window.appBridge);
                    const result = await scriptStore?.importTavernHelperScripts?.({
                        scripts: boundScripts,
                        scope: 'preset',
                        scopeId: presetId,
                        source: 'preset',
                    });
                    if (result?.count) {
                        const settings = appSettings.get();
                        const choice = await appChoice({
                            title: '脚本授权',
                            message: buildScriptAuthorizationMessage({
                                leadText: `已导入 ${result.count} 条绑定脚本。`,
                                settings,
                            }),
                            actions: [
                                { id: 'allow', label: '允许并启用', primary: true },
                                { id: 'later', label: '稍后处理' },
                            ],
                            defaultActionId: 'allow',
                        });
                        if (choice === 'allow') {
                            if (settings.scriptEnabled !== true) appSettings.update({ scriptEnabled: true });
                            const ids = Array.isArray(result.ids) ? result.ids : [];
                            await Promise.all(ids.map((id) => scriptStore.toggleScript('preset', presetId, id, true)));
                        } else {
                            window.toastr?.info?.('脚本已导入到该预设，尚未启用');
                        }
                    }
                }
            } catch (err) { logger.warn('导入绑定脚本失败', err); }
        }

        this.renderAllSections();
        this.showStatus('已导入预设', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    /* ── File helpers ── */
    hasTauriRuntime() {
        const g = typeof globalThis !== 'undefined' ? globalThis : window;
        return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || g?.__TAURI_INVOKE__);
    }

    isAndroid() {
        try { return /android/i.test(navigator.userAgent || ''); } catch { return false; }
    }

    async pickSavePath(defaultName) {
        return pickNativeSavePath({
            defaultName,
            filters: [{ name: 'JSON', extensions: ['json'] }],
        });
    }

    buildJsonDataUrl(payload) {
        const json = JSON.stringify(payload, null, 2);
        const bytes = new TextEncoder().encode(json);
        let binary = '';
        const chunkSize = 0x8000;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
        }
        return `data:application/json;base64,${btoa(binary)}`;
    }

    async downloadJson(filename, dataObj) {
        const data = JSON.stringify(dataObj, null, 2);
        if (!this.hasTauriRuntime()) {
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = filename;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 3000);
            return true;
        }
        const pick = await this.pickSavePath(filename);
        if (pick.cancelled) return false;
        const dataUrl = this.buildJsonDataUrl(dataObj);
        if (pick.fallback) {
            await safeInvoke('export_attachment', { dataUrl, fileName: filename });
        } else {
            await safeInvoke('export_attachment', { dataUrl, fileName: filename, path: pick.path });
        }
        return true;
    }
}
