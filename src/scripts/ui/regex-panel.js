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
    { id: 'openai', label: '生成参数/自定义' },
    { id: 'reasoning', label: '推理格式' },
];

const PANEL_HEADER_STYLE = 'padding:14px 16px; border-bottom:1px solid var(--app-border-subtle); background:var(--app-surface-panel); display:flex; align-items:center; justify-content:space-between; gap:10px;';
const PANEL_SUBHEADER_STYLE = 'padding:10px 16px; border-bottom:1px solid var(--app-border-subtle); background:var(--app-surface-card); display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
const RULE_CARD_STYLE = 'border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); overflow:hidden;';
const RULE_HEADER_STYLE = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-subtle); cursor:pointer;';
const SECTION_BOX_STYLE = 'flex:1; min-width: 260px; border:1px solid var(--app-border-subtle); border-radius:12px; padding:10px; background:var(--app-surface-subtle);';
const LOCAL_SETLIST_STYLE = 'border:1px solid var(--app-border-default); border-radius:12px; overflow:hidden; background:var(--app-surface-card);';
const LOCAL_EDITOR_HEAD_STYLE = 'border:1px solid var(--app-border-default); border-radius:12px; padding:12px; background:linear-gradient(180deg, var(--app-surface-panel) 0%, var(--app-surface-subtle) 100%);';
const DANGER_BUTTON_STYLE = 'padding:6px 10px; border:1px solid rgba(239,68,68,0.35); border-radius:10px; background:var(--app-surface-card); color:#f87171; cursor:pointer; font-size:12px;';
const DANGER_ACTION_STYLE = 'padding:10px 12px; border:1px solid rgba(239,68,68,0.35); border-radius:10px; background:var(--app-surface-card); color:#f87171; cursor:pointer;';

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
        if (this.element) this.element.style.display = 'none';
        if (this.overlay) this.overlay.style.display = 'none';
    }

    createUI() {
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
                    <div style="font-weight:800; color:var(--app-text-primary);">正规表达式</div>
                    <div style="color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        按规则替换输入/输出文本；全局始终生效，角色/预设按绑定对象生效
                    </div>
                </div>
                <button id="regex-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>

            <div style="${PANEL_SUBHEADER_STYLE}">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="regex-tab" data-tab="global" style="border:none; background:transparent; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; color:var(--app-text-secondary);">全局</button>
                    <button class="regex-tab" data-tab="character" style="border:none; background:transparent; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; color:var(--app-text-secondary);">角色</button>
                    <button class="regex-tab" data-tab="preset" style="border:none; background:transparent; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; color:var(--app-text-secondary);">预设</button>
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
            btn.style.background = isActive ? 'var(--app-border-default)' : 'transparent';
            btn.style.color = isActive ? 'var(--app-text-primary)' : 'var(--app-text-secondary)';
            btn.style.fontWeight = isActive ? '800' : '600';
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
        right.style.cssText = 'display:flex; align-items:center; gap:10px;';
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
                    <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">Replace With</div>
                    <textarea class="re-repl" rows="3" spellcheck="false" style="width:100%; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;"></textarea>
                    <div style="color:var(--app-text-muted); font-size:12px; margin-top:6px;">支持 {{match}}、$1/$2…、$&lt;name&gt;。</div>
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
                        <div style="font-size:13px; color:var(--app-text-secondary); font-weight:700;">深度</div>
                        <input class="re-min-depth" type="number" min="-1" max="9999" placeholder="Min" style="width:120px; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                        <input class="re-max-depth" type="number" min="0" max="9999" placeholder="Max" style="width:120px; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                        <div style="color:var(--app-text-muted); font-size:12px;">0=最后一条，1=倒数第二条…</div>
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
            card.style.filter = disabled ? 'grayscale(1)' : '';
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
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

        const head = document.createElement('div');
        head.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
        head.innerHTML = `
            <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--app-text-secondary); cursor:pointer;">
                <input id="re-global-enabled" type="checkbox" style="width:16px; height:16px;">
                启用全局正则
            </label>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button type="button" id="re-global-import" style="padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">导入</button>
                <button type="button" id="re-global-export" style="padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">导出</button>
                <button type="button" id="re-global-add" style="padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">＋ 新增规则</button>
                <button type="button" id="re-global-save" style="padding:10px 12px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:700;">保存</button>
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

    formatLocalSetRuntimeState(setObj) {
        const s = setObj && typeof setObj === 'object' ? setObj : null;
        if (!s) return '运行状态未知';
        if (s.manualEnabled === false) return '当前不会生效：手动停用';
        if (!s.bind) return '当前不会自动生效：未绑定';
        return isLocalRegexSetAutoActive(s, this.getActiveRegexContext())
            ? '当前已生效：绑定对象命中'
            : '当前未生效：等待切换到对应绑定对象';
    }

    formatBind(bind) {
        if (!bind) return '';
        if (bind.type === 'world') return `绑定世界书：${bind.worldId || ''}`;
        if (bind.type === 'preset') {
            const ptLabel = PRESET_TYPES.find(t => t.id === bind.presetType)?.label || bind.presetType || '';
            return `绑定预设：${ptLabel} / ${bind.presetId || ''}`;
        }
        return '绑定：未知';
    }

    getLocalSetVisualState(setObj) {
        const s = setObj && typeof setObj === 'object' ? setObj : {};
        if (s.manualEnabled === false) {
            return {
                label: '手动停用',
                color: '#ef4444',
                glow: 'rgba(239,68,68,0.22)',
                opacity: '0.58',
            };
        }
        if (!s.bind) {
            return {
                label: '未绑定',
                color: '#94a3b8', // theme-audit-ignore: semantic status color
                glow: 'rgba(148,163,184,0.18)',
                opacity: '0.72',
            };
        }
        if (isLocalRegexSetAutoActive(s, this.getActiveRegexContext())) {
            return {
                label: '当前生效',
                color: '#10b981',
                glow: 'rgba(16,185,129,0.28)',
                opacity: '1',
            };
        }
        return {
            label: '当前未生效',
            color: '#f59e0b',
            glow: 'rgba(245,158,11,0.22)',
            opacity: '0.86',
        };
    }

    renderScopedSetItem(setObj, { activeId, scope }) {
        const item = document.createElement('button');
        const s = setObj && typeof setObj === 'object' ? setObj : {};
        const isActive = s.id === activeId;
        const visual = this.getLocalSetVisualState(s);
        const name = String(s.name || s.id || '未命名正则').trim() || '未命名正则';
        item.type = 'button';
        item.title = `${name} · ${visual.label}`;
        item.setAttribute('aria-label', `${name}，${visual.label}`);
        const rowBg = isActive ? 'var(--app-border-default)' : 'var(--app-surface-card)';
        item.style.cssText = `
            width:100%;
            min-height:46px;
            text-align:left;
            padding:8px 10px;
            border:none;
            cursor:pointer;
            display:flex;
            align-items:center;
            gap:10px;
            background:${rowBg};
            border-bottom:1px solid var(--app-border-subtle);
            opacity:${isActive ? '1' : visual.opacity};
            box-shadow:${isActive ? 'inset 0 0 0 1px var(--app-border-strong, var(--app-border-default))' : 'none'};
        `;

        const badgeBg = isActive ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.08)';
        const badgeBorder = isActive ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.08)';
        const badge = document.createElement('span');
        badge.style.cssText = `
            min-width:0;
            max-width:100%;
            flex:1 1 auto;
            display:inline-flex;
            align-items:center;
            position:relative;
            overflow:hidden;
            border-radius:999px;
            padding:2px 9px 2px 12px;
            background:${badgeBg};
            border:1px solid ${badgeBorder};
            box-shadow:inset 3px 0 0 ${visual.color}, 0 1px 2px rgba(0,0,0,0.2);
        `;

        const title = document.createElement('span');
        title.textContent = name;
        title.style.cssText = `
            min-width:0;
            flex:1 1 auto;
            display:block;
            position:relative;
            z-index:1;
            color:var(--app-text-primary);
            font-weight:${isActive ? '900' : '800'};
            white-space:nowrap;
            overflow:hidden;
            text-overflow:ellipsis;
        `;

        badge.appendChild(title);
        item.appendChild(badge);
        item.onclick = async () => {
            this.setActiveSetIdForScope(scope, s.id);
            await this.refreshAll();
        };
        return item;
    }

    renderScoped(scope) {
        const scopeLabel = scope === 'world' ? '角色' : '预设';
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:12px; align-items:stretch; flex-wrap:wrap;';

        const left = document.createElement('div');
        left.style.cssText = 'flex:1; min-width: 220px; max-width: 320px;';

        const setlistEl = document.createElement('div');
        setlistEl.id = 're-scoped-setlist';
        setlistEl.style.cssText = LOCAL_SETLIST_STYLE;

        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display:flex; gap:8px; margin-bottom:8px;';
        btnRow.innerHTML = `
            <button type="button" id="re-scoped-new" style="flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">＋ 新建</button>
            <button type="button" id="re-scoped-import" style="flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">导入</button>
            <button type="button" id="re-scoped-del" style="${DANGER_ACTION_STYLE}">删除</button>
        `;

        const titleEl = document.createElement('div');
        titleEl.style.cssText = 'font-weight:800; color:var(--app-text-primary); margin-bottom:8px;';
        titleEl.textContent = `${scopeLabel}正则集合`;

        left.appendChild(titleEl);
        left.appendChild(btnRow);
        left.appendChild(setlistEl);

        const editorEl = document.createElement('div');
        editorEl.id = 're-scoped-editor';

        const right = document.createElement('div');
        right.style.cssText = 'flex:3; min-width: 280px;';
        right.appendChild(editorEl);

        wrap.appendChild(left);
        wrap.appendChild(right);

        const allSets = this.store.listLocalSets();
        const sets = allSets.filter(s => s.bind?.type === scope);
        const unboundSets = allSets.filter(s => !s.bind);
        const visibleSets = [...sets, ...unboundSets];

        let activeId = this.getActiveSetIdForScope(scope);
        if (!activeId || !visibleSets.find(s => s.id === activeId)) {
            activeId = sets[0]?.id || unboundSets[0]?.id || null;
            this.setActiveSetIdForScope(scope, activeId);
        }

        const setlist = setlistEl;
        const editor = editorEl;

        const renderSetList = () => {
            setlist.innerHTML = '';
            if (!sets.length && !unboundSets.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:12px; color:var(--app-text-muted); text-align:center;';
                empty.textContent = `暂无${scopeLabel}正则集合`;
                setlist.appendChild(empty);
                return;
            }
            visibleSets.forEach(s => {
                setlist.appendChild(this.renderScopedSetItem(s, { activeId, scope }));
            });
        };
        renderSetList();

        const setObj = activeId ? this.store.getLocalSet(activeId) : null;
        editor.innerHTML = '';
        editor.appendChild(this.renderScopedEditor(setObj, scope));

        btnRow.querySelector('#re-scoped-new').onclick = async () => {
            const name = prompt(`新建${scopeLabel}正则名称`, '新正则');
            if (!name) return;
            const bind = scope === 'world'
                ? await this.pickWorld()
                : await this.pickPreset();
            const id = await this.store.upsertLocalSet({ name, enabled: true, bind, rules: [] });
            this.setActiveSetIdForScope(scope, id);
            await this.refreshAll();
            this.showStatus('已新建', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };
        btnRow.querySelector('#re-scoped-import').onclick = async () => {
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
                await this.refreshAll();
                const count = validSets.reduce((sum, s) => sum + (Array.isArray(s.rules) ? s.rules.length : 0), 0);
                this.showStatus(`已导入 ${validSets.length} 组 / ${count} 条规则`, 'success');
                window.dispatchEvent(new CustomEvent('regex-changed'));
            } catch (err) {
                logger.error(`导入${scopeLabel}正则失败`, err);
                this.showStatus(err.message || '导入失败', 'error');
            }
        };
        btnRow.querySelector('#re-scoped-del').onclick = async () => {
            const curId = this.getActiveSetIdForScope(scope);
            if (!curId) return;
            const cur = this.store.getLocalSet(curId);
            const ok = await appConfirm({
                title: '删除正则',
                message: `删除${scopeLabel}正则「${cur?.name || curId}」？`,
                danger: true,
            });
            if (!ok) return;
            await this.store.removeLocalSet(curId);
            this.setActiveSetIdForScope(scope, null);
            await this.refreshAll();
            this.showStatus('已删除', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };

        return wrap;
    }

    async pickWorld() {
        const list = await listWorldIds(window.appBridge);
        if (!list.length) return null;
        const name = prompt(`选择绑定的世界书（输入名称）：\n${list.join('\n')}`, list[0]);
        if (!name || !list.includes(name)) return null;
        return { type: 'world', worldId: name };
    }

    async pickPreset() {
        const labels = PRESET_TYPES.map((t, i) => `${i + 1}. ${t.label}`).join('\n');
        const choice = prompt(`选择预设类型：\n${labels}`, '1');
        if (!choice) return null;
        const idx = parseInt(choice, 10) - 1;
        const pt = PRESET_TYPES[idx];
        if (!pt) return null;
        const presets = this.presetStore?.list?.(pt.id) || [];
        if (!presets.length) { this.showStatus(`${pt.label} 无可用预设`, 'info'); return null; }
        const presetLabels = presets.map((p, i) => `${i + 1}. ${p.name || p.id}`).join('\n');
        const pChoice = prompt(`选择 ${pt.label} 预设：\n${presetLabels}`, '1');
        if (!pChoice) return null;
        const pIdx = parseInt(pChoice, 10) - 1;
        const p = presets[pIdx];
        if (!p) return null;
        return { type: 'preset', presetType: pt.id, presetId: p.id };
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
        const runtimeStateText = this.formatLocalSetRuntimeState(s);
        const bindText = s.bind ? this.formatBind(s.bind) : '未绑定';

        const head = document.createElement('div');
        head.style.cssText = LOCAL_EDITOR_HEAD_STYLE;

        // --- row 1: title + action buttons ---
        const row1 = document.createElement('div');
        row1.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';

        const infoCol = document.createElement('div');
        infoCol.style.cssText = 'flex:1; min-width:220px;';
        const titleDiv = document.createElement('div');
        titleDiv.style.cssText = 'font-weight:800; color:var(--app-text-primary);';
        titleDiv.textContent = `${scopeLabel}正则：${s.name}`;
        const hintDiv = document.createElement('div');
        hintDiv.style.cssText = 'color:var(--app-text-muted); font-size:12px; margin-top:4px;';
        hintDiv.textContent = '“启用集合”只表示手动允许；真正是否生效取决于当前是否命中绑定对象。';
        const stateDiv = document.createElement('div');
        stateDiv.style.cssText = 'color:var(--app-text-secondary); font-size:12px; margin-top:4px;';
        stateDiv.textContent = runtimeStateText;
        infoCol.appendChild(titleDiv);
        infoCol.appendChild(hintDiv);
        infoCol.appendChild(stateDiv);

        const btnCol = document.createElement('div');
        btnCol.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap; align-items:center;';
        const btnExport = document.createElement('button');
        btnExport.type = 'button';
        btnExport.textContent = '导出';
        btnExport.style.cssText = 'padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;';
        const btnRename = document.createElement('button');
        btnRename.type = 'button';
        btnRename.textContent = '✎ 重命名';
        btnRename.style.cssText = 'padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;';
        const btnSave = document.createElement('button');
        btnSave.type = 'button';
        btnSave.textContent = '保存';
        btnSave.style.cssText = 'padding:10px 12px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:700;';
        btnCol.appendChild(btnExport);
        btnCol.appendChild(btnRename);
        btnCol.appendChild(btnSave);

        row1.appendChild(infoCol);
        row1.appendChild(btnCol);

        // --- row 2: enabled checkbox + bind info ---
        const row2 = document.createElement('div');
        row2.style.cssText = 'margin-top:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;';

        const enabledLabel = document.createElement('label');
        enabledLabel.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px; color:var(--app-text-secondary); cursor:pointer;';
        const enabledEl = document.createElement('input');
        enabledEl.type = 'checkbox';
        enabledEl.style.cssText = 'width:16px; height:16px;';
        enabledEl.checked = s.manualEnabled !== false;
        enabledLabel.appendChild(enabledEl);
        enabledLabel.appendChild(document.createTextNode('启用集合'));

        const bindDiv = document.createElement('div');
        bindDiv.style.cssText = 'display:flex; gap:10px; flex-wrap:wrap; align-items:center;';
        const bindLabel = document.createElement('div');
        bindLabel.style.cssText = 'font-size:13px; color:var(--app-text-secondary);';
        bindLabel.textContent = bindText;
        const btnRebind = document.createElement('button');
        btnRebind.type = 'button';
        btnRebind.textContent = '换绑';
        btnRebind.style.cssText = 'padding:6px 10px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); cursor:pointer; font-size:12px;';
        bindDiv.appendChild(bindLabel);
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
                : await this.pickPreset();
            if (!newBind) return;
            s.bind = newBind;
            await this.store.upsertLocalSet({ ...s });
            await this.refreshAll();
            this.showStatus('已换绑', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };

        // --- rules section ---
        const rulesHeader = document.createElement('div');
        rulesHeader.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
        const rulesTitle = document.createElement('div');
        rulesTitle.style.cssText = 'font-weight:800; color:var(--app-text-primary);';
        rulesTitle.textContent = '规则';
        const btnAdd = document.createElement('button');
        btnAdd.type = 'button';
        btnAdd.textContent = '＋ 新增规则';
        btnAdd.style.cssText = 'padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;';
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
                const safeName = (s.name || scopeLabel).replace(/[^a-zA-Z0-9一-鿿_-]/g, '_');
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
            const name = prompt(`重命名${scopeLabel}正则`, s.name || `${scopeLabel}正则`);
            if (!name) return;
            s.name = name;
            await this.store.upsertLocalSet({ ...s, name });
            await this.refreshAll();
            this.showStatus('已重命名', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };

        btnSave.onclick = async () => {
            try {
                const enabled = enabledEl.checked !== false;
                const rules = this.collectRules(list);
                await this.store.upsertLocalSet({ id: s.id, name: s.name, enabled, bind: s.bind, rules });
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
