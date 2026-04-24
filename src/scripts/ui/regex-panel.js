/**
 * Regex panel (Global + Local, ST-like)
 * - Global rules always apply
 * - Local sets apply when their bound preset/world is active
 */
import { RegexStore, regex_placement, substitute_find_regex } from '../storage/regex-store.js';
import { logger } from '../utils/logger.js';
import { appConfirm } from './app-confirm.js';

const deepClone = (v) => {
    try {
        return structuredClone(v);
    } catch {
        return JSON.parse(JSON.stringify(v));
    }
};

const genId = (prefix) => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const normalizeScript = (r = {}) => {
    // Legacy support
    if (!('findRegex' in r) && (('pattern' in r) || ('when' in r) || ('replacement' in r))) {
        const when = (r.when === 'input' || r.when === 'output' || r.when === 'both') ? r.when : 'both';
        const pattern = String(r.pattern || '');
        const flags = (r.flags === undefined || r.flags === null) ? 'g' : String(r.flags);
        const placement = [];
        if (when === 'input' || when === 'both') placement.push(regex_placement.USER_INPUT);
        if (when === 'output' || when === 'both') placement.push(regex_placement.AI_OUTPUT);
        return {
            id: r.id || genId('re'),
            scriptName: String(r.name || '').trim(),
            findRegex: pattern ? `/${pattern}/${flags}` : '',
            replaceString: String(r.replacement ?? ''),
            trimStrings: [],
            placement,
            disabled: r.enabled === false,
            markdownOnly: false,
            promptOnly: false,
            runOnEdit: false,
            substituteRegex: substitute_find_regex.NONE,
            minDepth: null,
            maxDepth: null,
        };
    }

    return {
        id: r.id || genId('re'),
        scriptName: String(r.scriptName || r.name || '').trim(),
        findRegex: String(r.findRegex || ''),
        replaceString: String(r.replaceString ?? r.replacement ?? ''),
        trimStrings: Array.isArray(r.trimStrings) ? r.trimStrings.map((s) => String(s || '')).filter(Boolean) : [],
        placement: Array.isArray(r.placement) ? r.placement.map((n) => Number(n)).filter(Number.isFinite) : [],
        disabled: Boolean(r.disabled),
        markdownOnly: Boolean(r.markdownOnly),
        promptOnly: Boolean(r.promptOnly),
        runOnEdit: Boolean(r.runOnEdit),
        substituteRegex: (r.substituteRegex === 1 || r.substituteRegex === 2) ? Number(r.substituteRegex) : 0,
        minDepth: (r.minDepth === '' || r.minDepth === undefined) ? null : (r.minDepth === null ? null : Number(r.minDepth)),
        maxDepth: (r.maxDepth === '' || r.maxDepth === undefined) ? null : (r.maxDepth === null ? null : Number(r.maxDepth)),
    };
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
    constructor() {
        this.store = window.appBridge?.regex || new RegexStore();
        this.element = null;
        this.overlay = null;
        this.activeTab = 'global'; // global | local
        this.activeLocalSetId = null;
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
                        参考 ST：按规则替换输入/输出文本；支持全局与绑定预设/世界书的局部规则
                    </div>
                </div>
                <button id="regex-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>

            <div style="${PANEL_SUBHEADER_STYLE}">
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <button class="regex-tab" data-tab="global" style="border:none; background:transparent; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; color:var(--app-text-secondary);">全局正则</button>
                    <button class="regex-tab" data-tab="local" style="border:none; background:transparent; padding:10px 12px; border-radius:10px; cursor:pointer; font-size:14px; color:var(--app-text-secondary);">局部正则</button>
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
        const r = normalizeScript(rule);
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
                            <select class="re-substitute" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                                <option value="0">不替换</option>
                                <option value="1">替换（raw）</option>
                                <option value="2">替换（escaped）</option>
                            </select>
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
            const id = el.dataset.ruleId || genId('re');
            const placement = Array.from(el.querySelectorAll('.re-place'))
                .filter(cb => cb.checked)
                .map(cb => Number(cb.value))
                .filter(Number.isFinite);
            const minDepthRaw = el.querySelector('.re-min-depth')?.value;
            const maxDepthRaw = el.querySelector('.re-max-depth')?.value;
            rules.push(normalizeScript({
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
            return;
        }
        body.appendChild(await this.renderLocal());
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

    async renderLocal() {
        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; gap:12px; align-items:stretch; flex-wrap:wrap;';

        const left = document.createElement('div');
        left.style.cssText = 'flex:1; min-width: 220px; max-width: 320px;';
        left.innerHTML = `
            <div style="font-weight:800; color:var(--app-text-primary); margin-bottom:8px;">局部正则集合</div>
            <div style="display:flex; gap:8px; margin-bottom:8px;">
                <button type="button" id="re-local-new" style="flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">＋ 新建</button>
                <button type="button" id="re-local-del" style="${DANGER_ACTION_STYLE}">删除</button>
            </div>
            <div id="re-local-setlist" style="${LOCAL_SETLIST_STYLE}"></div>
        `;

        const right = document.createElement('div');
        right.style.cssText = 'flex:3; min-width: 280px;';
        right.innerHTML = `<div id="re-local-editor"></div>`;

        wrap.appendChild(left);
        wrap.appendChild(right);

        const sets = this.store.listLocalSets();
        if (!this.activeLocalSetId && sets[0]?.id) this.activeLocalSetId = sets[0].id;

        const setlist = left.querySelector('#re-local-setlist');
        const editor = right.querySelector('#re-local-editor');
        const renderSetList = () => {
            setlist.innerHTML = '';
            if (!sets.length) {
                const empty = document.createElement('div');
                empty.style.cssText = 'padding:12px; color:var(--app-text-muted); text-align:center;';
                empty.textContent = '暂无局部正则集合';
                setlist.appendChild(empty);
                return;
            }
            sets.forEach(s => {
                const item = document.createElement('button');
                item.type = 'button';
                item.style.cssText = 'width:100%; text-align:left; padding:10px 12px; border:none; cursor:pointer; background:var(--app-surface-card); border-bottom:1px solid var(--app-border-subtle);';
                item.innerHTML = `
                    <div style="font-weight:800; color:var(--app-text-primary);">${s.name || s.id}</div>
                    <div style="font-size:12px; color:var(--app-text-muted); margin-top:2px;">${s.bind ? this.formatBind(s.bind) : '未绑定（不会自动启用）'}</div>
                `;
                if (s.id === this.activeLocalSetId) {
                    item.style.background = 'var(--app-border-default)';
                }
                item.onclick = async () => {
                    this.activeLocalSetId = s.id;
                    await this.refreshAll();
                };
                setlist.appendChild(item);
            });
        };
        renderSetList();

        const setObj = this.activeLocalSetId ? this.store.getLocalSet(this.activeLocalSetId) : null;
        editor.innerHTML = '';
        editor.appendChild(this.renderLocalEditor(setObj));

        left.querySelector('#re-local-new').onclick = async () => {
            const name = prompt('新建局部正则名称', '新正则');
            if (!name) return;
            const id = await this.store.upsertLocalSet({ name, enabled: true, bind: null, rules: [] });
            this.activeLocalSetId = id;
            await this.refreshAll();
            this.showStatus('已新建', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };
        left.querySelector('#re-local-del').onclick = async () => {
            if (!this.activeLocalSetId) return;
            const cur = this.store.getLocalSet(this.activeLocalSetId);
            const ok = await appConfirm({
                title: '删除正则',
                message: `删除局部正则「${cur?.name || this.activeLocalSetId}」？`,
                danger: true,
            });
            if (!ok) return;
            await this.store.removeLocalSet(this.activeLocalSetId);
            this.activeLocalSetId = null;
            await this.refreshAll();
            this.showStatus('已删除', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };

        return wrap;
    }

    formatBind(bind) {
        if (!bind) return '';
        if (bind.type === 'world') return `绑定世界书：${bind.worldId || ''}`;
        if (bind.type === 'preset') return `绑定预设：${bind.presetType || ''}/${bind.presetId || ''}`;
        return '绑定：未知';
    }

    renderLocalEditor(setObj) {
        const s = setObj ? deepClone(setObj) : null;
        if (!s) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:12px; color:var(--app-text-muted);';
            empty.textContent = '请选择或新建一个局部正则集合';
            return empty;
        }

        const wrap = document.createElement('div');
        wrap.style.cssText = 'display:flex; flex-direction:column; gap:12px;';

        const head = document.createElement('div');
        head.style.cssText = LOCAL_EDITOR_HEAD_STYLE;
        head.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width:220px;">
                    <div style="font-weight:800; color:var(--app-text-primary);">局部正则：${s.name}</div>
                    <div style="color:var(--app-text-muted); font-size:12px; margin-top:4px;">绑定到预设或世界书后，切换到对应对象时自动生效</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
                    <button type="button" id="re-local-rename" style="padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">✎ 重命名</button>
                    <button type="button" id="re-local-save" style="padding:10px 12px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:700;">保存</button>
                </div>
            </div>
            <div style="margin-top:10px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
                <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:var(--app-text-secondary); cursor:pointer;">
                    <input id="re-local-enabled" type="checkbox" style="width:16px; height:16px;">
                    启用集合
                </label>
                <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
                    <div style="font-size:13px; color:var(--app-text-secondary); font-weight:700;">绑定</div>
                    <select id="re-bind-type" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px;">
                        <option value="">不绑定</option>
                        <option value="preset">绑定预设</option>
                        <option value="world">绑定世界书</option>
                    </select>
                    <select id="re-bind-preset-type" style="display:none; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px;"></select>
                    <select id="re-bind-preset-id" style="display:none; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px; min-width: 220px;"></select>
                    <select id="re-bind-world" style="display:none; padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:13px; min-width: 220px;"></select>
                </div>
            </div>
        `;
        wrap.appendChild(head);

        const enabledEl = head.querySelector('#re-local-enabled');
        enabledEl.checked = s.manualEnabled !== false;

        const bindType = head.querySelector('#re-bind-type');
        const presetType = head.querySelector('#re-bind-preset-type');
        const presetId = head.querySelector('#re-bind-preset-id');
        const worldSel = head.querySelector('#re-bind-world');

        presetType.innerHTML = PRESET_TYPES.map(t => `<option value="${t.id}">${t.label}</option>`).join('');

        const updatePresetList = () => {
            const pt = presetType.value;
            const presets = window.appBridge?.presets?.list?.(pt) || [];
            presetId.innerHTML = '';
            presets.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name || p.id;
                presetId.appendChild(opt);
            });
        };
        updatePresetList();

        const updateWorldList = async () => {
            const ws = window.appBridge?.worldStore;
            await ws?.ready;
            const list = ws?.list?.() || [];
            worldSel.innerHTML = '';
            list.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                worldSel.appendChild(opt);
            });
        };
        updateWorldList().catch(() => {});

        const applyBindUI = () => {
            const t = bindType.value;
            presetType.style.display = t === 'preset' ? '' : 'none';
            presetId.style.display = t === 'preset' ? '' : 'none';
            worldSel.style.display = t === 'world' ? '' : 'none';
        };

        // init bind values
        if (s.bind?.type === 'preset') {
            bindType.value = 'preset';
            presetType.value = s.bind.presetType || 'openai';
            updatePresetList();
            presetId.value = s.bind.presetId || '';
        } else if (s.bind?.type === 'world') {
            bindType.value = 'world';
            worldSel.value = s.bind.worldId || '';
        } else {
            bindType.value = '';
        }
        applyBindUI();

        bindType.onchange = () => applyBindUI();
        presetType.onchange = () => { updatePresetList(); };

        const rulesWrap = document.createElement('div');
        rulesWrap.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;';
        rulesWrap.innerHTML = `
            <div style="font-weight:800; color:var(--app-text-primary);">规则</div>
            <button type="button" id="re-local-add" style="padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">＋ 新增规则</button>
        `;
        wrap.appendChild(rulesWrap);

        const list = document.createElement('div');
        list.id = 're-local-rules';
        list.style.cssText = 'display:flex; flex-direction:column; gap:10px;';
        (Array.isArray(s.rules) ? s.rules : []).forEach(r => list.appendChild(this.renderRuleCard(r)));
        wrap.appendChild(list);

        rulesWrap.querySelector('#re-local-add').onclick = () => {
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

        head.querySelector('#re-local-rename').onclick = async () => {
            const name = prompt('重命名局部正则', s.name || '局部正则');
            if (!name) return;
            s.name = name;
                await this.store.upsertLocalSet({ ...s, name });
                await this.refreshAll();
                this.showStatus('已重命名', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        };

        head.querySelector('#re-local-save').onclick = async () => {
            try {
                const enabled = enabledEl.checked !== false;
                const rules = this.collectRules(list);

                let bind = null;
                if (bindType.value === 'preset') {
                    bind = { type: 'preset', presetType: presetType.value, presetId: presetId.value };
                } else if (bindType.value === 'world') {
                    bind = { type: 'world', worldId: worldSel.value };
                }

                await this.store.upsertLocalSet({ id: s.id, name: s.name, enabled, bind, rules });
                this.showStatus('已保存局部正则', 'success');
                window.dispatchEvent(new CustomEvent('regex-changed'));
            } catch (err) {
                logger.error('保存局部正则失败', err);
                this.showStatus(err.message || '保存失败', 'error');
            }
        };

        return wrap;
    }
}
