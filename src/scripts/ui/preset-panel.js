/**
 * Preset panel (SillyTavern-like) — vertical card layout
 * - "生成参数" and "自定义" are primary cards (expanded by default)
 * - Other sections are secondary cards (collapsed by default)
 * - Each section has its own inline preset selector
 */

import { PresetStore } from '../storage/preset-store.js';
import { appSettings } from '../storage/app-settings.js';
import { LLMClient } from '../api/client.js';
import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import { appConfirm } from './app-confirm.js';

const canInitClient = (cfg) => {
    const c = cfg || {};
    const hasKey = typeof c.apiKey === 'string' && c.apiKey.trim().length > 0;
    const hasVertexSa = c.provider === 'vertexai' && typeof c.vertexaiServiceAccount === 'string' && c.vertexaiServiceAccount.trim().length > 0;
    return hasKey || hasVertexSa;
};

/* Section definitions — order matters for rendering */
const SECTIONS = [
    { id: 'openai',       storeType: 'openai',    label: '生成参数',        primary: true },
    { id: 'custom',       storeType: 'openai',    label: '自定义提示词区块', primary: true },
    { id: 'sysprompt',    storeType: 'sysprompt',  label: '系统提示词' },
    { id: 'chatprompts',  storeType: 'sysprompt',  label: '聊天提示词' },
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

/* ── chevron SVG (shared) ── */
const chevronSvg = `<svg viewBox="0 0 24 24" style="width:16px;height:16px;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;fill:none;transition:transform 250ms cubic-bezier(.2,.9,.2,1);"><polyline points="6 9 12 15 18 9"/></svg>`;

/* ── CSS ── */
const PANEL_CSS = `
#preset-panel *,
#preset-panel *::before,
#preset-panel *::after { box-sizing: border-box; }

#preset-panel {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 14px;
    color: #1e293b;
}

/* ── header ── */
.pp-header {
    padding: 14px 16px;
    border-bottom: 1px solid #e2e8f0;
    background: rgba(248,250,252,0.92);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}
.pp-header-title { font-weight: 800; color: #0f172a; font-size: 16px; }
.pp-header-sub { color: #64748b; font-size: 12px; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-header-actions { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.pp-header-actions button {
    border: 1px solid #e2e8f0; background: #fff; padding: 6px 10px;
    border-radius: 10px; cursor: pointer; font-size: 12px; color: #334155;
}
.pp-close {
    border: none !important; background: transparent !important;
    font-size: 22px !important; color: #0f172a !important; padding: 4px 6px !important;
}

/* ── scroll body ── */
.pp-scroll {
    padding: 12px 16px 16px;
    overflow-y: auto;
    flex: 1 1 0;
    min-height: 0;
    max-height: 100%;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
    touch-action: pan-y;
}

/* ── section card ── */
.pp-card {
    border: 1px solid #e2e8f0;
    border-radius: 12px;
    background: #fff;
    overflow: hidden;
    transition: box-shadow 200ms ease;
    margin-bottom: 12px;
}
.pp-card:last-child { margin-bottom: 0; }
.pp-card.pp-primary {
    border-left: 3px solid #3b82f6;
}
.pp-card.pp-secondary {
    border-left: 3px solid #d1d5db;
}
.pp-card.pp-secondary.pp-expanded {
    border-left-color: #3b82f6;
}
.pp-card-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 12px 14px;
    min-height: 48px;
    cursor: pointer; user-select: none;
    background: #f8fafc;
    transition: background 180ms ease;
}
.pp-card-header:hover { background: #f1f5f9; }
.pp-card.pp-primary .pp-card-header { cursor: pointer; }
.pp-card-header-left {
    display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;
}
.pp-card-label { font-weight: 700; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-card-badge {
    font-size: 11px; color: #64748b; background: #f1f5f9;
    padding: 2px 8px; border-radius: 999px; white-space: nowrap; flex-shrink: 0;
}
.pp-card-chevron {
    color: #94a3b8; flex-shrink: 0; width: 28px; height: 28px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 8px; transition: color 180ms, background 180ms;
}
.pp-card.pp-expanded .pp-card-chevron { color: #3b82f6; }
.pp-card.pp-expanded .pp-card-chevron svg { transform: rotate(180deg); }
/* primary cards are also collapsible */

.pp-card-body {
    padding: 0 14px 14px;
    display: none;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    overscroll-behavior: contain;
}
.pp-card.pp-expanded .pp-card-body {
    display: block;
    max-height: 50vh;
}

/* ── inline preset selector ── */
.pp-preset-bar {
    display: flex; align-items: center; gap: 6px;
    padding: 8px 0 10px; border-bottom: 1px solid #f1f5f9; margin-bottom: 10px;
    overflow-x: auto; -webkit-overflow-scrolling: touch;
}
.pp-preset-bar select {
    flex: 1; min-width: 100px; padding: 7px 8px;
    border: 1px solid #e2e8f0; border-radius: 8px; font-size: 13px;
    background: #fff; color: #0f172a;
}
.pp-preset-bar button {
    padding: 5px 8px; border: 1px solid #e2e8f0; border-radius: 8px;
    background: #f8fafc; cursor: pointer; font-size: 11px; color: #334155;
    white-space: nowrap; flex-shrink: 0;
}
.pp-preset-bar button.pp-danger {
    border-color: #fecaca; background: #fee2e2; color: #b91c1c;
}
.pp-preset-bar .pp-enabled-wrap {
    display: flex; align-items: center; gap: 4px; font-size: 11px; color: #334155;
    cursor: pointer; white-space: nowrap; flex-shrink: 0;
}

/* ── form helpers ── */
.pp-field-label { font-weight: 700; color: #0f172a; margin-bottom: 6px; font-size: 13px; }
.pp-textarea {
    width: 100%; min-height: 140px; resize: vertical;
    border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;
    font-size: 12px; line-height: 1.45;
    background: #ffffff; color: #0f172a; box-sizing: border-box;
}
.pp-input {
    width: 100%; padding: 10px; border: 1px solid #e2e8f0;
    border-radius: 10px; font-size: 14px; background: #fff; color: #0f172a;
}
.pp-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.pp-row > div { flex: 1; min-width: 140px; }
.pp-flags { margin-top: 10px; display: flex; gap: 12px; flex-wrap: wrap; }
.pp-flags label {
    display: flex; align-items: center; gap: 8px;
    font-size: 13px; color: #334155; cursor: pointer;
}
.pp-flags input[type="checkbox"] { width: 16px; height: 16px; }

/* ── openai blocks ── */
.pp-block {
    border: 1px solid rgba(0,0,0,0.08); border-radius: 12px;
    background: #fff; overflow: hidden;
}
.pp-block-header {
    display: flex; align-items: center; justify-content: space-between;
    gap: 10px; padding: 10px 12px; background: rgba(248,250,252,0.85);
    cursor: pointer; user-select: none;
}
.pp-block-left { display: flex; align-items: center; gap: 10px; min-width: 0; }
.pp-block-toggle { font-size: 16px; color: #64748b; user-select: none; width: 18px; }
.pp-block-drag { font-size: 16px; color: #64748b; cursor: grab; user-select: none; }
.pp-block-title { font-weight: 800; color: #0f172a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pp-block-sub { color: #64748b; font-size: 12px; }
.pp-block-right { display: flex; align-items: center; gap: 10px; }
.pp-block-body { padding: 10px 12px; display: none; flex-direction: column; gap: 10px; }
.pp-block.pp-block-disabled { opacity: 0.62; filter: grayscale(1); background: #f1f5f9; }
.pp-block.pp-block-disabled .pp-block-header { background: #e2e8f0; }

/* ── status ── */
.pp-status {
    display: none; padding: 10px 16px;
    font-size: 13px;
    flex-shrink: 0;
}

/* ── footer ── */
.pp-footer {
    display: flex; align-items: center; justify-content: flex-end; gap: 10px;
    padding: 12px 16px; border-top: 1px solid #e2e8f0;
    flex-shrink: 0;
}

/* ── header fixed ── */
.pp-header { flex-shrink: 0; }
.pp-footer button {
    padding: 10px 18px; border-radius: 10px; cursor: pointer; font-size: 14px;
}
.pp-btn-cancel { border: 1px solid #e2e8f0; background: #f8fafc; color: #334155; }
.pp-btn-save { border: none; background: #3b82f6; color: #fff; font-weight: 700; }
.pp-btn-save:active { background: #2563eb; }
`;

export class PresetPanel {
    constructor() {
        this.store = window.appBridge?.presets || new PresetStore();
        this.element = null;
        this.overlayElement = null;
        this.statusEl = null;
        this.drafts = new Map();
    }

    getTypeLabel(type) {
        const hit = SECTIONS.find(t => t.id === type);
        return hit?.label || String(type || '');
    }

    async applyBoundConfigIfAny() {
        const preset = this.store.getActive('openai') || {};
        const boundId = preset?.boundProfileId;
        if (!boundId) return;
        const cm = window.appBridge?.config;
        if (!cm?.setActiveProfile) return;
        const currentId = cm.getActiveProfileId?.();
        if (currentId && currentId === boundId) return;
        try {
            const runtime = await cm.setActiveProfile(boundId);
            const cfg = runtime || cm.get?.();
            if (window.appBridge) {
                window.appBridge.config.set(cfg);
                window.appBridge.client = canInitClient(cfg) ? new LLMClient(cfg) : null;
            }
            window.dispatchEvent(new CustomEvent('preset-bound-config-applied', { detail: { profileId: boundId } }));
        } catch (err) {
            logger.warn('应用预设绑定的 API 配置失败', err);
        }
    }

    async show() {
        await this.store.ready;
        if (!this.element) this.createUI();
        this.renderAllSections();
        this.element.style.display = 'flex';
        this.overlayElement.style.display = 'block';
    }

    hide() {
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
            bottom: calc(10px + env(safe-area-inset-bottom, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            box-sizing: border-box;
            background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index: 21000; flex-direction: column; overflow: hidden;
        `;
        this.element.onclick = (e) => e.stopPropagation();

        /* single innerHTML write — avoids innerHTML += serialization issues */
        this.element.innerHTML = `
            <style>${PANEL_CSS}</style>
            <div class="pp-header">
                <div style="min-width:0;">
                    <div class="pp-header-title">预设（Preset）</div>
                    <div class="pp-header-sub">选择/编辑提示词与生成参数</div>
                </div>
                <div class="pp-header-actions">
                    <button id="preset-import">导入</button>
                    <button id="preset-export">导出</button>
                    <button class="pp-close" id="preset-close">&times;</button>
                </div>
            </div>
            <div class="pp-scroll" id="preset-scroll"></div>
            <div class="pp-status" id="preset-status"></div>
            <div class="pp-footer">
                <button class="pp-btn-cancel" id="preset-cancel">取消</button>
                <button class="pp-btn-save" id="preset-save">保存</button>
            </div>
        `;

        document.body.appendChild(this.overlayElement);
        document.body.appendChild(this.element);

        this.statusEl = this.element.querySelector('#preset-status');
        this.element.querySelector('#preset-close').onclick = () => this.hide();
        this.element.querySelector('#preset-cancel').onclick = () => this.hide();
        this.element.querySelector('#preset-save').onclick = () => this.onSave();

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
    }

    /* ════════════════════════════════════════
       Render all section cards
       ════════════════════════════════════════ */
    renderAllSections() {
        const scroll = this.element.querySelector('#preset-scroll');
        if (!scroll) return;
        scroll.innerHTML = '';

        for (const sec of SECTIONS) {
            const card = this.buildSectionCard(sec);
            scroll.appendChild(card);
        }
    }

    buildSectionCard(sec) {
        const card = document.createElement('div');
        card.className = `pp-card ${sec.primary ? 'pp-primary pp-expanded' : 'pp-secondary'}`;
        card.dataset.sectionId = sec.id;

        /* badge text: show key info */
        const badgeText = this.getSectionBadge(sec);

        /* header */
        const header = document.createElement('div');
        header.className = 'pp-card-header';
        header.innerHTML = `
            <div class="pp-card-header-left">
                <span class="pp-card-label">${sec.label}</span>
                ${badgeText ? `<span class="pp-card-badge">${badgeText}</span>` : ''}
            </div>
            <div class="pp-card-chevron">${chevronSvg}</div>
        `;
        card.appendChild(header);

        /* body */
        const body = document.createElement('div');
        body.className = 'pp-card-body';
        card.appendChild(body);

        /* preset bar + editor */
        body.appendChild(this.buildPresetBar(sec));
        const editor = document.createElement('div');
        editor.className = 'pp-section-editor';
        body.appendChild(editor);
        this.renderSectionEditor(sec, editor);

        /* collapse toggle for all cards */
        header.addEventListener('click', () => {
            const expanded = card.classList.contains('pp-expanded');
            card.classList.toggle('pp-expanded', !expanded);
        });

        return card;
    }

    getSectionBadge(sec) {
        const p = this.store.getActive(sec.storeType) || {};
        if (sec.id === 'openai') {
            const t = p.temperature ?? 1;
            const tp = p.top_p ?? 0.98;
            return `temp ${t} · top_p ${tp}`;
        }
        if (sec.id === 'custom') {
            const prompts = Array.isArray(p.prompts) ? p.prompts : [];
            return `${prompts.length} 区块`;
        }
        const name = this.store.getActive(sec.storeType)?.name;
        return name || '';
    }

    /* ── inline preset selector bar ── */
    buildPresetBar(sec) {
        const bar = document.createElement('div');
        bar.className = 'pp-preset-bar';

        const select = document.createElement('select');
        const presets = this.store.list(sec.storeType);
        const activeId = this.store.getActiveId(sec.storeType);
        presets.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = p.name || p.id;
            select.appendChild(opt);
        });
        if (activeId) select.value = activeId;
        bar.appendChild(select);

        select.onchange = async () => {
            this.captureDraftsFromDOM();
            await this.store.setActive(sec.storeType, select.value);
            if (sec.storeType === 'openai') await this.applyBoundConfigIfAny();
            this.rerenderSection(sec);
            window.dispatchEvent(new CustomEvent('preset-changed'));
        };

        const enabledWrap = document.createElement('label');
        enabledWrap.className = 'pp-enabled-wrap';
        const enabledCb = document.createElement('input');
        enabledCb.type = 'checkbox';
        enabledCb.style.cssText = 'width:16px; height:16px;';
        enabledCb.checked = this.store.getEnabled(sec.storeType);
        enabledCb.onchange = async () => {
            await this.store.setEnabled(sec.storeType, !!enabledCb.checked);
            this.showStatus('已更新启用状态', 'success');
            window.dispatchEvent(new CustomEvent('preset-changed'));
        };
        enabledWrap.appendChild(enabledCb);
        enabledWrap.appendChild(document.createTextNode('启用'));
        bar.appendChild(enabledWrap);

        /* For "custom" section, also show "新建区块" in the bar header. For others, show new/rename/delete */
        if (sec.id !== 'custom') {
            const btnNew = document.createElement('button');
            btnNew.textContent = '新建';
            btnNew.onclick = () => this.onNewForSection(sec);
            bar.appendChild(btnNew);

            const btnRename = document.createElement('button');
            btnRename.textContent = '重命名';
            btnRename.onclick = () => this.onRenameForSection(sec);
            bar.appendChild(btnRename);

            const btnDel = document.createElement('button');
            btnDel.textContent = '删除';
            btnDel.className = 'pp-danger';
            btnDel.onclick = () => this.onDeleteForSection(sec);
            bar.appendChild(btnDel);
        }

        return bar;
    }

    rerenderSection(sec) {
        const card = this.element.querySelector(`.pp-card[data-section-id="${sec.id}"]`);
        if (!card) return;
        /* update badge */
        const badge = card.querySelector('.pp-card-badge');
        const newBadge = this.getSectionBadge(sec);
        if (badge) badge.textContent = newBadge || '';

        /* update preset bar select */
        const select = card.querySelector('.pp-preset-bar select');
        if (select) {
            const presets = this.store.list(sec.storeType);
            const activeId = this.store.getActiveId(sec.storeType);
            select.innerHTML = '';
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || p.id;
                select.appendChild(opt);
            });
            if (activeId) select.value = activeId;
        }

        /* update enabled */
        const enabledCb = card.querySelector('.pp-enabled-wrap input');
        if (enabledCb) enabledCb.checked = this.store.getEnabled(sec.storeType);

        /* re-render editor */
        const editor = card.querySelector('.pp-section-editor');
        if (editor) {
            editor.innerHTML = '';
            this.renderSectionEditor(sec, editor);
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

    /* ── helpers ── */
    renderTextarea(label, id, value, placeholder = '') {
        const block = document.createElement('div');
        block.style.marginTop = '10px';
        block.innerHTML = `
            <div class="pp-field-label">${label}</div>
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
        const desc = document.createElement('div');
        desc.style.cssText = 'color:#64748b; font-size:12px; margin-bottom:8px;';
        desc.textContent = '私聊/群聊/动态提示词都放在这里；其中"私聊/群聊/摘要"固定注入到系统深度=1。';
        wrap.appendChild(desc);

        const list = document.createElement('div');
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

        const makePromptBlock = (cfg) => {
            const card = document.createElement('div');
            card.className = 'pp-block';
            card.dataset.collapsed = 'true';

            const isEnabled = Boolean(p[cfg.enabledKey]);
            if (!isEnabled) card.classList.add('pp-block-disabled');

            const header = document.createElement('div');
            header.className = 'pp-block-header';
            header.innerHTML = `
                <div class="pp-block-left">
                    <div class="pp-block-toggle">&#9656;</div>
                    <div style="min-width:0;">
                        <div class="pp-block-title">${cfg.title}</div>
                        <div class="pp-block-sub">${cfg.subtitle}</div>
                    </div>
                </div>
            `;

            const right = document.createElement('div');
            right.className = 'pp-block-right';
            const enabledWrap = document.createElement('label');
            enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#334155; cursor:pointer;';
            enabledWrap.innerHTML = `<input id="${cfg.idPrefix}-enabled" type="checkbox" style="width:16px; height:16px;">启用`;
            const enabledInput = enabledWrap.querySelector('input');
            enabledInput.checked = isEnabled;
            enabledInput.addEventListener('click', (e) => e.stopPropagation());
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
                    { v: EXT_PROMPT_TYPES.IN_PROMPT, t: 'IN_PROMPT（系统开头）' },
                    { v: EXT_PROMPT_TYPES.IN_CHAT, t: 'IN_CHAT（按深度插入历史）' },
                    { v: EXT_PROMPT_TYPES.BEFORE_PROMPT, t: 'BEFORE_PROMPT（最前）' },
                    { v: EXT_PROMPT_TYPES.NONE, t: 'NONE（不注入）' },
                ];
            pos.innerHTML = opts.map(o => `<option value="${o.v}">${o.t}</option>`).join('');
            const fallbackPos = opts.some(o => o.v === EXT_PROMPT_TYPES.SYSTEM_DEPTH_1) ? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1 : EXT_PROMPT_TYPES.IN_PROMPT;
            pos.value = String(p[cfg.positionKey] ?? fallbackPos);

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

            if (cfg.showDepthRole !== false) {
                body.appendChild(this.renderInputRow([
                    { label: '注入位置', el: pos },
                    { label: '深度（IN_CHAT）', el: depth },
                    { label: '角色（IN_CHAT）', el: role },
                ]));
            } else {
                depth.disabled = true;
                role.disabled = true;
                body.appendChild(this.renderInputRow([
                    { label: '注入位置', el: pos },
                    { label: '深度（固定）', el: depth },
                    { label: '角色（固定）', el: role },
                ]));
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
            setCollapsed(true);

            return card;
        };

        const fixedDepthOpts = [
            { v: EXT_PROMPT_TYPES.SYSTEM_DEPTH_1, t: 'SYSTEM_DEPTH_1（紧跟 chat history）' },
            { v: EXT_PROMPT_TYPES.NONE, t: 'NONE（不注入）' },
        ];

        list.appendChild(makePromptBlock({
            idPrefix: 'dialogue', title: '私聊提示词',
            subtitle: '解析 <content> 内的私聊标签',
            enabledKey: 'dialogue_enabled', positionKey: 'dialogue_position',
            depthKey: 'dialogue_depth', roleKey: 'dialogue_role',
            rulesKey: 'dialogue_rules', defaultDepth: 1, placeholder: '私聊协议提示词',
            positionOptions: fixedDepthOpts, showDepthRole: false,
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'moment', title: '动态发布决策提示词',
            subtitle: '让模型决定是否输出 moment_start/moment_end',
            enabledKey: 'moment_create_enabled', positionKey: 'moment_create_position',
            depthKey: 'moment_create_depth', roleKey: 'moment_create_role',
            rulesKey: 'moment_create_rules', defaultDepth: 0, placeholder: '动态发布决策提示词',
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'moment-comment', title: '动态评论回复提示词',
            subtitle: '仅用于"动态评论"场景',
            enabledKey: 'moment_comment_enabled', positionKey: 'moment_comment_position',
            depthKey: 'moment_comment_depth', roleKey: 'moment_comment_role',
            rulesKey: 'moment_comment_rules', defaultDepth: 0, placeholder: '动态评论回复规则',
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'group', title: '群聊提示词',
            subtitle: '解析 <content> 内的群聊标签',
            enabledKey: 'group_enabled', positionKey: 'group_position',
            depthKey: 'group_depth', roleKey: 'group_role',
            rulesKey: 'group_rules', defaultDepth: 1, placeholder: '群聊协议提示词',
            positionOptions: fixedDepthOpts, showDepthRole: false,
        }));
        list.appendChild(makePromptBlock({
            idPrefix: 'summary', title: '摘要提示词',
            subtitle: '固定注入到系统深度=1',
            enabledKey: 'summary_enabled', positionKey: 'summary_position',
            depthKey: 'summary_depth', roleKey: 'summary_role',
            rulesKey: 'summary_rules', defaultDepth: 1, placeholder: '摘要格式提示词',
            positionOptions: fixedDepthOpts, showDepthRole: false,
        }));

        wrap.appendChild(list);
        return wrap;
    }

    /* ── Context ── */
    renderContextEditor(p) {
        const wrap = document.createElement('div');
        const desc = document.createElement('div');
        desc.style.cssText = 'color:#64748b; font-size:12px; margin-bottom:4px;';
        desc.textContent = 'ST 的 story_string 模板，支持 {{#if}} 与变量';
        wrap.appendChild(desc);

        wrap.appendChild(this.renderTextarea('Story String', 'context-story', p.story_string || '', '{{#if description}}{{description}}{{/if}} ...'));

        const pos = document.createElement('select');
        pos.id = 'context-position'; pos.className = 'pp-input';
        pos.innerHTML = `
            <option value="${EXT_PROMPT_TYPES.IN_PROMPT}">IN_PROMPT（系统开头）</option>
            <option value="${EXT_PROMPT_TYPES.IN_CHAT}">IN_CHAT（按深度插入历史）</option>
            <option value="${EXT_PROMPT_TYPES.BEFORE_PROMPT}">BEFORE_PROMPT（最前）</option>
            <option value="${EXT_PROMPT_TYPES.NONE}">NONE（不注入）</option>
        `;
        pos.value = String(p.story_string_position ?? EXT_PROMPT_TYPES.IN_PROMPT);

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

        wrap.appendChild(this.renderInputRow([
            { label: '注入位置', el: pos },
            { label: '深度（IN_CHAT）', el: depth },
            { label: '角色（IN_CHAT）', el: role },
        ]));

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
        desc.style.cssText = 'color:#64748b; font-size:12px; margin-bottom:4px;';
        desc.textContent = '控制序列/包裹/宏（目前仅保存，暂未用于 prompt 构建）';
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
            <div class="pp-field-label">最大上下文长度（max_context）</div>
            <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                <div style="flex:2; min-width:200px;" id="gen-max-context-range-wrap"></div>
                <div style="flex:1; min-width:140px;" id="gen-max-context-num-wrap"></div>
            </div>
            <div style="color:#64748b; font-size:12px; margin-top:4px;">用于限制可用上下文窗口。</div>
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
        const orderBlock = pickPromptOrderBlock();
        const order = Array.isArray(orderBlock?.order) ? orderBlock.order : [];

        const blocks = order.length
            ? order.map(o => ({ identifier: o.identifier, enabled: o.enabled !== false }))
            : prompts.filter(pr => pr?.identifier).map(pr => ({ identifier: pr.identifier, enabled: true }));

        const headRow = document.createElement('div');
        headRow.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:8px;';
        headRow.innerHTML = `
            <div style="color:#64748b; font-size:12px;">区块默认折叠，点击展开；可拖拽排序</div>
            <button type="button" id="openai-add-block" style="padding:6px 10px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer; font-size:12px;">+ 新增区块</button>
        `;
        wrap.appendChild(headRow);

        const list = document.createElement('div');
        list.id = 'openai-blocks';
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';

        const makeBlockEl = ({ identifier, enabled }) => {
            const pr = promptById.get(identifier);
            const known = OPENAI_KNOWN_BLOCKS[identifier];
            const isMarker = Boolean(pr?.marker) || Boolean(known?.marker);
            const canEdit = !isMarker && (typeof pr?.content === 'string' || !pr);
            const title = pr?.name || known?.label || identifier;
            const roleName = roleIdToName(pr?.role || 'system');
            const sysPrompt = (typeof pr?.system_prompt === 'boolean') ? pr.system_prompt : true;

            const card = document.createElement('div');
            card.className = `pp-block openai-block ${enabled === false ? 'pp-block-disabled' : ''}`;
            card.draggable = true;
            card.dataset.identifier = identifier;
            card.dataset.collapsed = 'true';

            const header = document.createElement('div');
            header.className = 'pp-block-header';
            header.innerHTML = `
                <div class="pp-block-left">
                    <div class="pp-block-toggle">&#9656;</div>
                    <div class="pp-block-drag">&#9776;</div>
                    <div style="min-width:0;">
                        <div class="pp-block-title">${title}</div>
                        <div class="pp-block-sub">${isMarker ? 'marker（自动填充）' : `role: ${roleName}`}</div>
                    </div>
                </div>
            `;

            const right = document.createElement('div');
            right.className = 'pp-block-right';
            const enabledWrap = document.createElement('label');
            enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#334155; cursor:pointer;';
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
                del.style.cssText = 'padding:6px 10px; border:1px solid #fecaca; border-radius:10px; background:#fee2e2; color:#b91c1c; cursor:pointer; font-size:12px;';
                del.onclick = async (e) => {
                    e.stopPropagation();
                    const ok = await appConfirm({ title: '删除区块', message: `删除区块「${identifier}」？`, danger: true });
                    if (ok) card.remove();
                };
                right.appendChild(del);
            }

            header.appendChild(right);
            card.appendChild(header);

            const setCollapsed = (collapsed) => {
                card.dataset.collapsed = collapsed ? 'true' : 'false';
                const toggle = header.querySelector('.pp-block-toggle');
                if (toggle) toggle.innerHTML = collapsed ? '&#9656;' : '&#9662;';
                const body = card.querySelector('.pp-block-body');
                if (body) body.style.display = collapsed ? 'none' : 'block';
            };
            header.addEventListener('click', () => setCollapsed(card.dataset.collapsed !== 'true'));

            if (canEdit) {
                const body = document.createElement('div');
                body.className = 'pp-block-body';

                const nameInput = document.createElement('input');
                nameInput.type = 'text'; nameInput.className = 'block-name pp-input';
                nameInput.placeholder = '区块名称'; nameInput.value = pr?.name || title;

                const roleSel = document.createElement('select');
                roleSel.className = 'block-role pp-input';
                roleSel.innerHTML = `<option value="system">system</option><option value="user">user</option><option value="assistant">assistant</option>`;
                roleSel.value = roleName;

                const sysChkWrap = document.createElement('label');
                sysChkWrap.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;';
                sysChkWrap.innerHTML = `<input type="checkbox" class="block-system" style="width:16px; height:16px;">system_prompt`;
                sysChkWrap.querySelector('input').checked = sysPrompt;

                const metaRow = document.createElement('div');
                metaRow.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap;';
                const leftCell = document.createElement('div');
                leftCell.style.cssText = 'flex:1; min-width:180px;';
                leftCell.appendChild(nameInput);
                const rightCell = document.createElement('div');
                rightCell.style.cssText = 'flex:1; min-width:180px; display:flex; flex-direction:column; gap:8px;';
                rightCell.appendChild(roleSel);
                rightCell.appendChild(sysChkWrap);
                metaRow.appendChild(leftCell);
                metaRow.appendChild(rightCell);
                body.appendChild(metaRow);

                const taId = `openai-block-content-${identifier.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
                const taBlock = this.renderTextarea(identifier, taId, pr?.content || '', '');
                const ta = taBlock.querySelector(`#${taId}`);
                if (ta) { ta.dataset.promptIdentifier = identifier; ta.classList.add('block-content'); ta.style.minHeight = '120px'; }
                body.appendChild(taBlock);
                card.appendChild(body);
            } else {
                const hint = document.createElement('div');
                hint.className = 'pp-block-body';
                hint.style.cssText = 'display:none; padding:10px 12px; color:#64748b; font-size:12px;';
                hint.textContent = '该区块为 marker，将在构建 prompt 时自动填充内容。';
                card.appendChild(hint);
            }

            /* Drag reorder */
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer?.setData('text/plain', identifier);
                e.dataTransfer?.setDragImage(card, 20, 20);
                card.style.opacity = '0.6';
            });
            card.addEventListener('dragend', () => {
                card.style.opacity = '';
                list.querySelectorAll('.openai-block').forEach(el => el.classList.remove('drop-target'));
            });
            card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drop-target'); });
            card.addEventListener('dragleave', () => { card.classList.remove('drop-target'); });
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromId = e.dataTransfer?.getData('text/plain');
                if (!fromId || fromId === identifier) return;
                const fromEl = list.querySelector(`.openai-block[data-identifier="${CSS.escape(fromId)}"]`);
                if (fromEl) list.insertBefore(fromEl, card);
                card.classList.remove('drop-target');
            });

            setCollapsed(true);
            return card;
        };

        blocks.forEach(b => { if (b?.identifier) list.appendChild(makeBlockEl(b)); });
        wrap.appendChild(list);

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
            list.appendChild(makeBlockEl({ identifier, enabled: true }));
        };

        return wrap;
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
        /* Capture all visible sections at once.
         * Multiple sections may share the same storeType (e.g. sysprompt + chatprompts both → 'sysprompt').
         * We accumulate into the same draft so fields merge rather than overwrite. */
        for (const sec of SECTIONS) {
            try {
                const card = this.element.querySelector(`.pp-card[data-section-id="${sec.id}"]`);
                if (!card) continue;
                const editor = card.querySelector('.pp-section-editor');
                if (!editor || !editor.children.length) continue;
                const storeType = sec.storeType;
                const presetId = this.store.getActiveId(storeType);
                const key = this.getDraftKey(storeType, presetId);
                if (!key) continue;
                /* Use existing draft as base (may already contain fields from a sibling section) */
                const base = this.drafts.has(key)
                    ? this.drafts.get(key)
                    : deepClone(this.store.getActive(storeType) || {});
                const next = this.collectSectionData(sec.id, editor, base);
                this.drafts.set(key, next);
            } catch (err) {
                logger.debug('captureDraft failed for', sec.id, err);
            }
        }
    }

    collectSectionData(sectionId, root, base) {
        const current = deepClone(base || {});

        if (sectionId === 'sysprompt') {
            current.content = root.querySelector('#sysprompt-content')?.value ?? '';
            current.post_history = root.querySelector('#sysprompt-post')?.value ?? '';
            return current;
        }

        if (sectionId === 'chatprompts') {
            current.dialogue_enabled = Boolean(root.querySelector('#dialogue-enabled')?.checked);
            current.dialogue_position = getInt(root.querySelector('#dialogue-position')?.value, current.dialogue_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1);
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
            current.group_enabled = Boolean(root.querySelector('#group-enabled')?.checked);
            current.group_position = getInt(root.querySelector('#group-position')?.value, current.group_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1);
            current.group_depth = getInt(root.querySelector('#group-depth')?.value, current.group_depth ?? 1);
            current.group_role = getInt(root.querySelector('#group-role')?.value, current.group_role ?? EXT_PROMPT_ROLES.SYSTEM);
            current.group_rules = root.querySelector('#group-rules')?.value ?? '';
            current.summary_enabled = Boolean(root.querySelector('#summary-enabled')?.checked);
            current.summary_position = getInt(root.querySelector('#summary-position')?.value, current.summary_position ?? EXT_PROMPT_TYPES.SYSTEM_DEPTH_1);
            current.summary_rules = root.querySelector('#summary-rules')?.value ?? '';
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
            current.boundProfileId = window.appBridge?.config?.getActiveProfileId?.() || current.boundProfileId || null;
            return current;
        }

        if (sectionId === 'custom') {
            const prompts = Array.isArray(current.prompts) ? current.prompts : [];
            const promptById = new Map();
            prompts.forEach(pr => { if (pr?.identifier) promptById.set(pr.identifier, pr); });

            const textareas = root.querySelectorAll('textarea[data-prompt-identifier]');
            textareas.forEach((ta) => {
                const ident = ta.dataset.promptIdentifier;
                if (!ident) return;
                const container = ta.closest('.openai-block');
                const name = container?.querySelector('.block-name')?.value;
                const role = container?.querySelector('.block-role')?.value;
                const systemPrompt = container?.querySelector('.block-system')?.checked;
                const existing = promptById.get(ident) || { identifier: ident };
                promptById.set(ident, {
                    ...existing, identifier: ident,
                    name: (name || existing.name || ident),
                    role: roleIdToName(role || existing.role || 'system'),
                    system_prompt: typeof systemPrompt === 'boolean' ? systemPrompt : (existing.system_prompt ?? true),
                    marker: false, content: String(ta.value || ''),
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
            current.boundProfileId = window.appBridge?.config?.getActiveProfileId?.() || current.boundProfileId || null;
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

    async onNewForSection(sec) {
        await this.store.ready;
        const name = prompt('新建预设名称', '新预设');
        if (!name) return;
        this.captureDraftsFromDOM();
        const base = this.store.getActive(sec.storeType) || {};
        const data = { ...deepClone(base), name };
        const id = await this.store.upsert(sec.storeType, { name, data });
        await this.store.setActive(sec.storeType, id);
        for (const k of Array.from(this.drafts.keys())) {
            if (String(k).startsWith(`${sec.storeType}:`)) this.drafts.delete(k);
        }
        this.rerenderSection(sec);
        /* Also re-render sibling sections sharing same storeType */
        for (const s of SECTIONS) {
            if (s.id !== sec.id && s.storeType === sec.storeType) this.rerenderSection(s);
        }
        this.showStatus('已新建', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    async onRenameForSection(sec) {
        await this.store.ready;
        const id = this.store.getActiveId(sec.storeType);
        const current = this.store.getActive(sec.storeType);
        if (!id || !current) return;
        this.captureDraftsFromDOM();
        const name = prompt('重命名预设', current.name || id);
        if (!name) return;
        await this.store.upsert(sec.storeType, { id, name, data: { ...current, name } });
        const key = this.getDraftKey(sec.storeType, id);
        if (key && this.drafts.has(key)) {
            const d = this.drafts.get(key) || {};
            d.name = name;
            this.drafts.set(key, d);
        }
        this.rerenderSection(sec);
        for (const s of SECTIONS) {
            if (s.id !== sec.id && s.storeType === sec.storeType) this.rerenderSection(s);
        }
        this.showStatus('已重命名', 'success');
        window.dispatchEvent(new CustomEvent('preset-changed'));
    }

    async onDeleteForSection(sec) {
        await this.store.ready;
        const id = this.store.getActiveId(sec.storeType);
        if (!id) return;
        const ok = await appConfirm({ title: '删除预设', message: '删除该预设？此操作不可恢复。', danger: true });
        if (!ok) return;
        this.captureDraftsFromDOM();

        try {
            await window.appBridge?.regex?.ready;
            const sets = window.appBridge?.regex?.listLocalSets?.() || [];
            const bound = sets.filter(s =>
                s?.bind?.type === 'preset' &&
                String(s.bind.presetType || '') === String(sec.storeType) &&
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
                        if (sid) await window.appBridge.regex.removeLocalSet(sid);
                    }
                    window.dispatchEvent(new CustomEvent('regex-changed'));
                }
            }
        } catch {}

        await this.store.remove(sec.storeType, id);
        const key = this.getDraftKey(sec.storeType, id);
        if (key) this.drafts.delete(key);
        this.rerenderSection(sec);
        for (const s of SECTIONS) {
            if (s.id !== sec.id && s.storeType === sec.storeType) this.rerenderSection(s);
        }
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
            const sets = window.appBridge?.regex?.listLocalSets?.() || [];
            sets.forEach(s => { (Array.isArray(s?.rules) ? s.rules : []).forEach(r => { sigs.add(this.getRuleSignature(r)); }); });
        } catch {}
        return sigs;
    }

    extractStRegexBindingSets(obj) {
        const out = [];
        const seenScriptIds = new Set();
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
            const rules = this.convertStRegexScriptsToRules(filtered);
            if (rules.length) out.push({ name: 'RegexBinding', enabled: true, rules });
        };
        const tryParseJsonString = (s) => {
            const raw = String(s || '').trim();
            if (!raw || !raw.includes('RegexBinding') || !(raw.startsWith('{') || raw.startsWith('['))) return null;
            try { return JSON.parse(raw); } catch { return null; }
        };
        const walk = (node, depth = 0) => {
            if (!node || depth > 18) return;
            if (typeof node === 'string') {
                const parsed = tryParseJsonString(node);
                if (parsed && typeof parsed === 'object') { tryAddRegexes(parsed); walk(parsed, depth + 1); }
                return;
            }
            if (Array.isArray(node)) { node.forEach(v => walk(v, depth + 1)); return; }
            if (typeof node === 'object') { tryAddRegexes(node); for (const v of Object.values(node)) walk(v, depth + 1); }
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
                await window.appBridge?.regex?.ready;
                const sets = window.appBridge?.regex?.listLocalSets?.() || [];
                const bindId = this.store.getActiveId(type);
                if (type && bindId) {
                    const bound = sets
                        .filter(s => s?.bind?.type === 'preset' && s.bind.presetType === type && s.bind.presetId === bindId)
                        .map(s => ({ name: s.name, enabled: s.enabled !== false, rules: s.rules || [] }));
                    if (bound.length) payload.boundRegexSets = bound;
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
        const defaultName = String(json?.name || '').trim() || fileBaseName || '导入预设';
        const name = prompt('导入预设名称', defaultName);
        if (!name) return;

        let boundSets = json?.boundRegexSets || json?.bound_regex_sets || null;
        const data = { ...json, name };
        delete data.boundRegexSets;
        delete data.bound_regex_sets;

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
                    await window.appBridge?.regex?.ready;
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
                        await window.appBridge.regex.upsertLocalSet({
                            name: `${setName} (${name})`, enabled: s?.enabled !== false,
                            bind: { type: 'preset', presetType: importType, presetId }, rules,
                        });
                    }
                    window.dispatchEvent(new CustomEvent('regex-changed'));
                }
            } catch (err) { logger.warn('导入绑定正则失败', err); }
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
        if (this.isAndroid()) return { path: '', cancelled: false, fallback: true };
        try {
            const { save } = await import('@tauri-apps/plugin-dialog');
            const result = await save({ defaultPath: defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] });
            if (!result) return { path: '', cancelled: true, fallback: false };
            return { path: result, cancelled: false, fallback: false };
        } catch (err) {
            logger.warn('预设导出：保存对话框不可用', err);
            return { path: '', cancelled: false, fallback: true };
        }
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
