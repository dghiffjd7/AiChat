import { appConfirm } from './app-confirm.js';

export class VariablePanel {
    constructor({ chatStore, getSessionId }) {
        this.chatStore = chatStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => '';
        this.overlay = null;
        this.panel = null;
        this.schemaOverlay = null;
        this.schemaPanel = null;
        this.schemaFields = null;
        this.term = '';
        this.editingKey = '';
    }

    ensureUI() {
        if (this.overlay) return;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.38);
            z-index: 22050;
            padding: calc(10px + env(safe-area-inset-top, 0px)) 10px calc(10px + env(safe-area-inset-bottom, 0px)) 10px;
            box-sizing: border-box;
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hide();
        });

        const panel = document.createElement('div');
        panel.style.cssText = `
            width: min(96vw, 520px);
            height: min(86vh, 720px);
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 10px 40px rgba(0,0,0,0.18);
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());

        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:900;">变量管理器</div>
                <div id="var-meta" style="margin-left:auto; font-size:12px; color:#64748b; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
                <button id="var-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>

            <div style="padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06);">
                <div style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:1px solid rgba(0,0,0,0.10); border-radius:14px; background:#fff;">
                    <input id="var-search" type="text" placeholder="搜索变量名..." style="flex:1; border:none; outline:none; font-size:14px; background:transparent;">
                    <button id="var-clear-search" type="button" aria-label="清除搜索" style="display:none; width:32px; height:32px; border:none; border-radius:10px; background:#f1f5f9; cursor:pointer;">×</button>
                </div>
                <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
                    <button id="var-add" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer;">新增</button>
                    <button id="var-clear-all" style="border:1px solid rgba(239,68,68,0.35); background:#fff; color:#b91c1c; border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer;">清空</button>
                    <button id="var-rules" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer;">规则</button>
                    <button id="var-run-rules" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px; font-size:13px; cursor:pointer;">运行规则</button>
                    <div style="margin-left:auto; color:#64748b; font-size:12px;">
                        提示：提示词中使用 <code>{{getvar::name}}</code>
                    </div>
                </div>
            </div>
            <div id="var-cards" style="padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; flex-wrap:wrap; gap:8px;"></div>

            <div id="var-list" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px 12px;"></div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const q = (sel) => panel.querySelector(sel);
        q('#var-close')?.addEventListener('click', () => this.hide());
        q('#var-add')?.addEventListener('click', () => this.promptAdd());
        q('#var-clear-all')?.addEventListener('click', () => this.clearAll());
        q('#var-rules')?.addEventListener('click', () => this.promptRules());
        q('#var-run-rules')?.addEventListener('click', () => this.runRules());

        const searchEl = q('#var-search');
        const clearEl = q('#var-clear-search');
        const updateSearch = (val) => {
            this.term = String(val || '');
            const has = this.term.trim().length > 0;
            if (clearEl) clearEl.style.display = has ? 'block' : 'none';
            this.renderList();
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

        this.overlay = overlay;
        this.panel = panel;
    }

    ensureSchemaUI() {
        if (this.schemaOverlay) return;

        const overlay = document.createElement('div');
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.45);
            z-index: 22080;
            padding: calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px)) 12px;
            box-sizing: border-box;
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideSchemaModal();
        });

        const panel = document.createElement('div');
        panel.style.cssText = `
            width: min(94vw, 520px);
            max-height: 86vh;
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());

        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f8fafc; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:900;">变量配置</div>
                <div id="schema-title" style="margin-left:auto; font-size:12px; color:#64748b;"></div>
                <button id="schema-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="padding:12px; overflow:auto; display:flex; flex-direction:column; gap:10px;">
                <label style="font-size:12px; color:#64748b;">变量名</label>
                <input id="schema-key" type="text" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">

                <label style="font-size:12px; color:#64748b;">当前值</label>
                <input id="schema-value" type="text" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">

                <label style="font-size:12px; color:#64748b;">类型</label>
                <select id="schema-type" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">
                    <option value="">（无）</option>
                    <option value="number">number</option>
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                    <option value="enum">enum</option>
                    <option value="array">array</option>
                    <option value="object">object</option>
                </select>

                <label style="font-size:12px; color:#64748b;">默认值</label>
                <input id="schema-default" type="text" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">

                <div id="schema-range" style="display:none; gap:8px;">
                    <div style="flex:1;">
                        <label style="font-size:12px; color:#64748b;">最小值</label>
                        <input id="schema-min" type="number" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; width:100%;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:12px; color:#64748b;">最大值</label>
                        <input id="schema-max" type="number" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; width:100%;">
                    </div>
                </div>

                <div id="schema-options" style="display:none;">
                    <label style="font-size:12px; color:#64748b;">枚举选项（逗号分隔）</label>
                    <input id="schema-options-input" type="text" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px; width:100%;">
                </div>

                <label style="font-size:12px; color:#64748b;">展示</label>
                <select id="schema-display" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">
                    <option value="card">card</option>
                    <option value="badge">badge</option>
                    <option value="progress">progress</option>
                    <option value="hidden">hidden</option>
                </select>

                <label style="font-size:12px; color:#64748b;">颜色</label>
                <input id="schema-color" type="text" placeholder="#ff6b6b" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">

                <label style="font-size:12px; color:#64748b;">格式（例：{value}/100）</label>
                <input id="schema-format" type="text" style="padding:8px 10px; border:1px solid #e2e8f0; border-radius:10px;">
            </div>
            <div style="display:flex; gap:8px; padding:12px; border-top:1px solid #eef2f7;">
                <button id="schema-delete" style="border:1px solid rgba(239,68,68,0.35); background:#fff; color:#b91c1c; border-radius:10px; padding:8px 10px;">删除配置</button>
                <div style="flex:1;"></div>
                <button id="schema-cancel" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:8px 10px;">取消</button>
                <button id="schema-save" style="border:none; background:#0ea5e9; color:#fff; border-radius:10px; padding:8px 12px;">保存</button>
            </div>
        `;

        const q = (sel) => panel.querySelector(sel);
        const fields = {
            title: q('#schema-title'),
            key: q('#schema-key'),
            value: q('#schema-value'),
            type: q('#schema-type'),
            def: q('#schema-default'),
            rangeWrap: q('#schema-range'),
            min: q('#schema-min'),
            max: q('#schema-max'),
            optionsWrap: q('#schema-options'),
            options: q('#schema-options-input'),
            display: q('#schema-display'),
            color: q('#schema-color'),
            format: q('#schema-format'),
            save: q('#schema-save'),
            cancel: q('#schema-cancel'),
            close: q('#schema-close'),
            del: q('#schema-delete'),
        };

        const updateTypeUI = () => {
            const type = String(fields.type?.value || '').trim();
            if (fields.rangeWrap) fields.rangeWrap.style.display = type === 'number' ? 'flex' : 'none';
            if (fields.optionsWrap) fields.optionsWrap.style.display = type === 'enum' ? 'block' : 'none';
        };
        fields.type?.addEventListener('change', updateTypeUI);
        fields.close?.addEventListener('click', () => this.hideSchemaModal());
        fields.cancel?.addEventListener('click', () => this.hideSchemaModal());
        fields.save?.addEventListener('click', () => this.saveSchemaModal());
        fields.del?.addEventListener('click', () => this.deleteSchemaModal());

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        this.schemaOverlay = overlay;
        this.schemaPanel = panel;
        this.schemaFields = fields;
    }

    show() {
        this.ensureUI();
        const sid = String(this.getSessionId() || '').trim();
        const meta = this.panel?.querySelector?.('#var-meta');
        if (meta) meta.textContent = sid ? `会话：${sid}` : '未选择会话';
        this.term = '';
        const searchEl = this.panel?.querySelector?.('#var-search');
        if (searchEl) searchEl.value = '';
        this.renderList();
        this.overlay.style.display = 'block';
        this.panel?.querySelector?.('#var-search')?.focus?.();
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
    }

    showSchemaModal({ key = '', value = '', schema = null, mode = 'create' } = {}) {
        this.ensureSchemaUI();
        const fields = this.schemaFields;
        if (!fields) return;
        const name = String(key || '').trim();
        const schemaObj = schema || this.getSchema(name) || {};
        const isEdit = mode !== 'create' && name;

        if (fields.title) fields.title.textContent = name ? `变量：${name}` : '新建变量';
        if (fields.key) {
            fields.key.value = name;
            fields.key.disabled = isEdit;
        }
        if (fields.value) {
            fields.value.value = value ?? '';
        }
        const type = schemaObj?.type ? String(schemaObj.type) : '';
        if (fields.type) fields.type.value = type;

        if (fields.def) {
            const defVal = schemaObj?.default;
            if (defVal === undefined || defVal === null) {
                fields.def.value = '';
            } else if (typeof defVal === 'object') {
                try {
                    fields.def.value = JSON.stringify(defVal);
                } catch {
                    fields.def.value = '';
                }
            } else {
                fields.def.value = String(defVal);
            }
        }
        if (fields.min) fields.min.value = schemaObj?.range?.min ?? '';
        if (fields.max) fields.max.value = schemaObj?.range?.max ?? '';
        if (fields.options) fields.options.value = Array.isArray(schemaObj?.options) ? schemaObj.options.join(',') : '';
        if (fields.display) fields.display.value = schemaObj?.ui?.display || 'card';
        if (fields.color) fields.color.value = schemaObj?.ui?.color || '';
        if (fields.format) fields.format.value = schemaObj?.ui?.format || '';
        if (fields.del) fields.del.style.display = schemaObj?.type ? 'inline-flex' : 'none';

        const updateTypeUI = () => {
            const currentType = String(fields.type?.value || '').trim();
            if (fields.rangeWrap) fields.rangeWrap.style.display = currentType === 'number' ? 'flex' : 'none';
            if (fields.optionsWrap) fields.optionsWrap.style.display = currentType === 'enum' ? 'block' : 'none';
        };
        updateTypeUI();

        this.schemaOverlay.style.display = 'block';
        setTimeout(() => fields.key?.focus?.(), 0);
    }

    hideSchemaModal() {
        if (this.schemaOverlay) this.schemaOverlay.style.display = 'none';
    }

    saveSchemaModal() {
        const fields = this.schemaFields;
        if (!fields) return;
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        const key = String(fields.key?.value || '').trim();
        if (!key) {
            window.toastr?.warning?.('变量名不能为空');
            return;
        }
        const valueRaw = fields.value?.value ?? '';
        const type = String(fields.type?.value || '').trim().toLowerCase();

        if (type) {
            const allowed = new Set(['number', 'string', 'boolean', 'enum', 'array', 'object']);
            if (!allowed.has(type)) {
                window.toastr?.warning?.('类型记号无效');
                return;
            }
            const schema = { id: key, name: key, type };

            const defInput = fields.def?.value ?? '';
            if (defInput !== '') {
                if (type === 'number') {
                    const n = Number(defInput);
                    if (!Number.isFinite(n)) {
                        window.toastr?.warning?.('默认值必须是数字');
                        return;
                    }
                    schema.default = n;
                } else if (type === 'boolean') {
                    const s = String(defInput).trim().toLowerCase();
                    if (s === 'true' || s === '1' || s === 'yes' || s === 'on') schema.default = true;
                    else if (s === 'false' || s === '0' || s === 'no' || s === 'off') schema.default = false;
                    else {
                        window.toastr?.warning?.('默认值必须是 true/false');
                        return;
                    }
                } else if (type === 'array' || type === 'object') {
                    try {
                        schema.default = JSON.parse(defInput);
                    } catch {
                        window.toastr?.warning?.('默认值需为合法 JSON');
                        return;
                    }
                } else {
                    schema.default = String(defInput);
                }
            }

            if (type === 'number') {
                const minRaw = fields.min?.value ?? '';
                const maxRaw = fields.max?.value ?? '';
                const min = minRaw === '' ? null : Number(minRaw);
                const max = maxRaw === '' ? null : Number(maxRaw);
                schema.range = {
                    min: Number.isFinite(min) ? min : null,
                    max: Number.isFinite(max) ? max : null,
                };
            }
            if (type === 'enum') {
                const options = String(fields.options?.value || '').split(',').map(s => s.trim()).filter(Boolean);
                schema.options = options;
            }

            schema.ui = {
                display: String(fields.display?.value || 'card').trim(),
                color: String(fields.color?.value || '').trim(),
                format: String(fields.format?.value || '').trim(),
            };

            this.chatStore?.setVariableSchema?.(key, schema, sid);
        } else {
            this.chatStore?.deleteVariableSchema?.(key, sid);
        }

        this.chatStore?.setVariable?.(key, valueRaw, sid);
        this.renderList();
        this.hideSchemaModal();
    }

    deleteSchemaModal() {
        const fields = this.schemaFields;
        if (!fields) return;
        const { sid } = this.getVars();
        if (!sid) return;
        const key = String(fields.key?.value || '').trim();
        if (!key) return;
        this.chatStore?.deleteVariableSchema?.(key, sid);
        this.renderList();
        this.hideSchemaModal();
    }

    getVars() {
        const sid = String(this.getSessionId() || '').trim();
        const vars = sid ? (this.chatStore?.listVariables?.(sid) || {}) : {};
        return { sid, vars };
    }

    getSchemas() {
        const sid = String(this.getSessionId() || '').trim();
        const schemas = sid ? (this.chatStore?.listVariableSchemas?.(sid) || {}) : {};
        return { sid, schemas };
    }

    getSchema(key) {
        const { sid, schemas } = this.getSchemas();
        if (!sid) return null;
        const name = String(key || '').trim();
        if (!name) return null;
        return schemas?.[name] || null;
    }

    renderList() {
        this.renderCards();
        const listEl = this.panel?.querySelector?.('#var-list');
        if (!listEl) return;
        const { vars } = this.getVars();
        const term = this.term.trim().toLowerCase();
        const entries = Object.entries(vars || {})
            .map(([k, v]) => ({ k: String(k), v: (v === null || v === undefined) ? '' : String(v) }))
            .filter(({ k, v }) => {
                if (!term) return true;
                return k.toLowerCase().includes(term) || v.toLowerCase().includes(term);
            })
            .sort((a, b) => a.k.localeCompare(b.k));

        listEl.innerHTML = '';
        if (!entries.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:18px 10px; color:#94a3b8; text-align:center;';
            empty.textContent = this.getVars().sid ? '暂无变量' : '未选择会话';
            listEl.appendChild(empty);
            return;
        }

        entries.forEach(({ k, v }) => {
            const row = document.createElement('div');
            row.style.cssText = `
                padding:10px 10px;
                border: 1px solid rgba(0,0,0,0.06);
                border-radius: 12px;
                margin-bottom: 8px;
                background: #fff;
            `;
            const schema = this.getSchema(k);
            const typeLabel = schema?.type ? String(schema.type) : '';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:6px; font-weight:900; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            <span>${k}</span>
                            ${typeLabel ? `<span style="font-size:10px; padding:2px 6px; border-radius:999px; background:rgba(14,165,233,0.12); color:#0369a1;">${typeLabel}</span>` : ''}
                        </div>
                        <div style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${v || '（空）'}</div>
                    </div>
                    <button class="var-schema" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:6px 10px; cursor:pointer;">配置</button>
                    <button class="var-edit" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:6px 10px; cursor:pointer;">编辑</button>
                    <button class="var-del" style="border:1px solid rgba(239,68,68,0.35); background:#fff; color:#b91c1c; border-radius:10px; padding:6px 10px; cursor:pointer;">删除</button>
                </div>
                <div style="margin-top:8px; font-size:12px; color:#475569;">
                    <code>{{getvar::${k}}}</code>
                </div>
            `;
            row.querySelector('.var-schema')?.addEventListener('click', () => this.promptSchema(k));
            row.querySelector('.var-edit')?.addEventListener('click', () => this.promptEdit(k, v));
            row.querySelector('.var-del')?.addEventListener('click', () => this.deleteKey(k));
            listEl.appendChild(row);
        });
    }

    renderCards() {
        const cardsEl = this.panel?.querySelector?.('#var-cards');
        if (!cardsEl) return;
        const { vars } = this.getVars();
        const { schemas } = this.getSchemas();
        const entries = Object.entries(schemas || {}).filter(([, schema]) => {
            const display = String(schema?.ui?.display || 'card').toLowerCase();
            return display && display !== 'hidden';
        });
        cardsEl.innerHTML = '';
        if (!entries.length) {
            cardsEl.style.display = 'none';
            return;
        }
        cardsEl.style.display = 'flex';
        entries.forEach(([key, schema]) => {
            const display = String(schema?.ui?.display || 'card').toLowerCase();
            const label = schema?.ui?.label || schema?.name || key;
            const rawValue = (vars && Object.prototype.hasOwnProperty.call(vars, key)) ? vars[key] : schema?.default;
            const valueText = typeof rawValue === 'string' ? rawValue : (rawValue == null ? '' : JSON.stringify(rawValue));
            const format = schema?.ui?.format ? String(schema.ui.format) : '';
            const rendered = format ? format.replace(/\{value\}/g, valueText) : valueText;
            const color = schema?.ui?.color ? String(schema.ui.color) : '#0ea5e9';

            if (display === 'progress') {
                const min = Number(schema?.range?.min ?? 0);
                const max = Number(schema?.range?.max ?? 100);
                const num = Number(rawValue);
                const clamped = Number.isFinite(num) ? Math.max(min, Math.min(max, num)) : min;
                const percent = max > min ? Math.round(((clamped - min) / (max - min)) * 100) : 0;
                const card = document.createElement('div');
                card.style.cssText = 'flex:1 1 140px; min-width:120px; padding:10px; border-radius:12px; border:1px solid rgba(15,23,42,0.08); background:#fff;';
                card.innerHTML = `
                    <div style="font-size:12px; color:#64748b; margin-bottom:6px;">${label}</div>
                    <div style="font-size:14px; font-weight:700; color:#0f172a; margin-bottom:6px;">${rendered || clamped}</div>
                    <div style="height:6px; background:rgba(15,23,42,0.08); border-radius:999px; overflow:hidden;">
                        <div style="height:100%; width:${percent}%; background:${color};"></div>
                    </div>
                `;
                cardsEl.appendChild(card);
                return;
            }

            if (display === 'badge') {
                const badge = document.createElement('div');
                badge.style.cssText = `padding:6px 10px; border-radius:999px; background:${color}22; color:${color}; font-size:12px; display:flex; gap:6px; align-items:center;`;
                badge.innerHTML = `<span>${label}</span><strong style="font-weight:700;">${rendered || '-'}</strong>`;
                cardsEl.appendChild(badge);
                return;
            }

            const card = document.createElement('div');
            card.style.cssText = 'flex:1 1 140px; min-width:120px; padding:10px; border-radius:12px; border:1px solid rgba(15,23,42,0.08); background:#fff;';
            card.innerHTML = `
                <div style="font-size:12px; color:#64748b;">${label}</div>
                <div style="font-size:14px; font-weight:700; color:#0f172a; margin-top:4px;">${rendered || '-'}</div>
            `;
            cardsEl.appendChild(card);
        });
    }

    promptAdd() {
        this.showSchemaModal({ mode: 'create' });
    }

    promptEdit(key, curValue) {
        this.showSchemaModal({ key, value: curValue, mode: 'edit' });
    }

    async deleteKey(key) {
        const ok = await appConfirm({ title: '删除变量', message: `删除变量 "${key}"？`, danger: true });
        if (!ok) return;
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        this.chatStore?.deleteVariable?.(String(key).trim(), sid);
        this.chatStore?.deleteVariableSchema?.(String(key).trim(), sid);
        this.renderList();
    }

    async clearAll() {
        const ok = await appConfirm({ title: '清空变量', message: '清空当前会话的所有变量？', danger: true });
        if (!ok) return;
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        this.chatStore?.clearVariables?.(sid);
        this.renderList();
    }

    promptSchema(key) {
        this.showSchemaModal({ key, value: this.getVars().vars?.[key], schema: this.getSchema(key), mode: 'edit' });
    }

    promptRules() {
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        const current = this.chatStore?.listVariableRules?.(sid) || [];
        const draft = JSON.stringify(current, null, 2);
        const input = prompt('编辑规则 JSON（数组）', draft);
        if (input === null) return;
        try {
            const parsed = JSON.parse(input || '[]');
            if (!Array.isArray(parsed)) throw new Error('必须是数组');
            this.chatStore?.setVariableRules?.(parsed, sid);
            window.toastr?.success?.('规则已保存');
        } catch (err) {
            window.toastr?.error?.(`规则解析失败：${err?.message || err}`);
        }
    }

    runRules() {
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        if (window.appBridge?.runVariableRules) {
            window.appBridge.runVariableRules(sid);
            window.toastr?.info?.('已触发手动规则');
        } else {
            window.toastr?.warning?.('规则引擎未就绪');
        }
    }
}
