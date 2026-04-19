/**
 * Regex panel (Session scoped)
 * - Only applies in the current chat session
 */
import { RegexStore, regex_placement, substitute_find_regex } from '../storage/regex-store.js';
import { logger } from '../utils/logger.js';

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

export class RegexSessionPanel {
    constructor(getSessionId) {
        this.store = window.appBridge?.regex || new RegexStore();
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => 'default';
        this.element = null;
        this.overlay = null;
        this.statusEl = null;
    }

    async show() {
        await this.store.ready;
        if (!this.element) this.createUI();
        await this.refresh();
        this.overlay.style.display = 'block';
        this.element.style.display = 'flex';
    }

    hide() {
        if (this.element) this.element.style.display = 'none';
        if (this.overlay) this.overlay.style.display = 'none';
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'regex-session-overlay';
        this.overlay.className = 'app-themed-overlay regex-session-overlay';
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.element = document.createElement('div');
        this.element.id = 'regex-session-panel';
        this.element.className = 'app-themed-panel regex-session-panel';
        this.element.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            flex-direction:column;
            overflow:hidden;
        `;
        this.element.onclick = (e) => e.stopPropagation();

        this.element.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:800; color:#0f172a;">正规表达式（聊天室）</div>
                    <div id="re-session-sub" style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                </div>
                <button id="re-session-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div id="re-session-scroll" style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <label style="display:flex; align-items:center; gap:8px; font-size:13px; color:#334155; cursor:pointer;">
                        <input id="re-session-enabled" type="checkbox" style="width:16px; height:16px;">
                        启用本聊天室正则
                    </label>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        <button type="button" id="re-session-add" style="padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">＋ 新增规则</button>
                        <button type="button" id="re-session-save" style="padding:10px 12px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:700;">保存</button>
                    </div>
                </div>

                <div id="re-session-list" style="margin-top:12px; display:flex; flex-direction:column; gap:10px;"></div>

                <div id="re-session-status" style="display:none; margin-top:12px; padding:10px; border-radius:10px; font-size:13px;"></div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.element);

        this.statusEl = this.element.querySelector('#re-session-status');
        this.element.querySelector('#re-session-close').onclick = () => this.hide();
        this.element.querySelector('#re-session-add').onclick = () => {
            const list = this.element.querySelector('#re-session-list');
            list.appendChild(this.renderRuleCard({
                placement: [regex_placement.USER_INPUT],
                markdownOnly: true,
                runOnEdit: true,
                disabled: false,
            }));
        };
        this.element.querySelector('#re-session-list').addEventListener('click', (e) => {
            const del = e.target.closest('.re-del');
            if (!del) return;
            const card = del.closest('.regex-rule');
            if (card) card.remove();
        });
        this.element.querySelector('#re-session-save').onclick = async () => this.save();
    }

    showStatus(message, type = 'info') {
        const el = this.statusEl;
        if (!el) return;
        const colors = {
            success: { bg: '#dcfce7', fg: '#166534' },
            error: { bg: '#fee2e2', fg: '#991b1b' },
            info: { bg: '#dbeafe', fg: '#1e40af' }
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
        card.style.cssText = 'border:1px solid rgba(0,0,0,0.08); border-radius:12px; background:#fff; overflow:hidden;';

        const header = document.createElement('div');
        header.className = 're-header';
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; background:rgba(248,250,252,0.85); cursor:pointer;';

        const left = document.createElement('div');
        left.style.cssText = 'display:flex; align-items:center; gap:10px; min-width:0;';
        left.innerHTML = `
            <div class="re-toggle" style="font-size:16px; color:#64748b; user-select:none; width:18px;">▸</div>
            <div style="min-width:0;">
                <div class="re-title" style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <div class="re-sub" style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
            </div>
        `;
        header.appendChild(left);

        const right = document.createElement('div');
        right.style.cssText = 'display:flex; align-items:center; gap:10px;';
        const enabledWrap = document.createElement('label');
        enabledWrap.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:#334155; cursor:pointer;';
        enabledWrap.innerHTML = `<input type="checkbox" class="re-enabled" style="width:16px; height:16px;">启用`;
        right.appendChild(enabledWrap);
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 're-del';
        del.textContent = '删除';
        del.style.cssText = 'padding:6px 10px; border:1px solid #fecaca; border-radius:10px; background:#fee2e2; color:#b91c1c; cursor:pointer; font-size:12px;';
        right.appendChild(del);
        header.appendChild(right);

        const body = document.createElement('div');
        body.className = 're-body';
        body.style.cssText = 'display:none; padding:12px; gap:10px;';
        body.innerHTML = `
            <div style="display:flex; gap:10px; flex-wrap:wrap;">
                <div style="flex:1; min-width: 220px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">脚本名称</div>
                    <input class="re-name" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;">
                </div>
                <div style="flex:1; min-width: 280px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">Find Regex</div>
                    <input class="re-find" spellcheck="false" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">
                </div>
            </div>

            <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px;">
                <div style="flex:1; min-width: 260px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">Replace With</div>
                    <textarea class="re-repl" rows="3" spellcheck="false" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;"></textarea>
                </div>
                <div style="flex:1; min-width: 260px;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">Trim Out（每行一个）</div>
                    <textarea class="re-trim" rows="3" spellcheck="false" style="width:100%; padding:10px; border:1px solid #e2e8f0; border-radius:10px; font-size:13px;"></textarea>
                </div>
            </div>

            <div style="display:flex; gap:14px; flex-wrap:wrap; margin-top:12px;">
                <div style="flex:1; min-width: 260px; border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:10px;">
                    <div style="font-weight:800; color:#0f172a; margin-bottom:8px;">影响条目（Affects）</div>
                    <div style="display:flex; gap:12px; flex-wrap:wrap; color:#334155; font-size:13px;">
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="1">用户输入</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="2">AI输出</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="3">Slash</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="5">世界书</label>
                        <label style="display:flex; gap:6px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-place" value="6">推理</label>
                    </div>
                    <div style="display:flex; gap:10px; flex-wrap:wrap; margin-top:10px; align-items:center;">
                        <div style="font-size:13px; color:#334155; font-weight:700;">深度</div>
                        <input class="re-min-depth" type="number" min="-1" max="9999" placeholder="Min" style="width:120px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">
                        <input class="re-max-depth" type="number" min="0" max="9999" placeholder="Max" style="width:120px; padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">
                    </div>
                </div>

                <div style="flex:1; min-width: 260px; border:1px solid rgba(0,0,0,0.06); border-radius:12px; padding:10px;">
                    <div style="font-weight:800; color:#0f172a; margin-bottom:8px;">其他选项</div>
                    <div style="display:flex; flex-direction:column; gap:8px; color:#334155; font-size:13px;">
                        <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-disabled">停用（Disabled）</label>
                        <label style="display:flex; gap:8px; align-items:center; cursor:pointer;"><input type="checkbox" class="re-run-on-edit">编辑消息时执行（Run On Edit）</label>
                        <label style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                            <span style="font-weight:700;">Find Regex 宏</span>
                            <select class="re-substitute" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">
                                <option value="0">不替换</option>
                                <option value="1">替换（raw）</option>
                                <option value="2">替换（escaped）</option>
                            </select>
                        </label>
                        <div style="margin-top:6px;">
                            <div style="font-weight:700; color:#0f172a; margin-bottom:6px;">暂时性（Ephemerality）</div>
                            <label style="display:flex; gap:8px; align-items:center; cursor:pointer; margin-bottom:6px;">
                                <input type="checkbox" class="re-md-only">仅影响聊天显示（不改存档）
                            </label>
                            <label style="display:flex; gap:8px; align-items:center; cursor:pointer;">
                                <input type="checkbox" class="re-prompt-only">仅影响发送给 LLM 的 prompt（不改存档）
                            </label>
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

    collectRules() {
        const root = this.element.querySelector('#re-session-list');
        const rules = [];
        root.querySelectorAll('.regex-rule').forEach(el => {
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

    async refresh() {
        await this.store.ready;
        const sid = this.getSessionId();
        const sub = this.element.querySelector('#re-session-sub');
        if (sub) sub.textContent = `当前会话：${sid}`;
        const state = this.store.getSession(sid);
        this.element.querySelector('#re-session-enabled').checked = state.enabled !== false;
        const list = this.element.querySelector('#re-session-list');
        list.innerHTML = '';
        (Array.isArray(state.rules) ? state.rules : []).forEach(r => list.appendChild(this.renderRuleCard(r)));
    }

    async save() {
        const sid = this.getSessionId();
        if (!sid) return;
        try {
            const enabled = this.element.querySelector('#re-session-enabled')?.checked !== false;
            const rules = this.collectRules();
            await this.store.setSession(sid, { enabled, rules });
            this.showStatus('已保存', 'success');
            window.dispatchEvent(new CustomEvent('regex-changed'));
        } catch (err) {
            logger.error('保存聊天室正则失败', err);
            this.showStatus(err.message || '保存失败', 'error');
        }
    }
}
