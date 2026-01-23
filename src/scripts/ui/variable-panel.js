import { appConfirm } from './app-confirm.js';

export class VariablePanel {
    constructor({ chatStore, getSessionId }) {
        this.chatStore = chatStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => '';
        this.overlay = null;
        this.panel = null;
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
                    <div style="margin-left:auto; color:#64748b; font-size:12px;">
                        提示：提示词中使用 <code>{{getvar::name}}</code>
                    </div>
                </div>
            </div>

            <div id="var-list" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px 12px;"></div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const q = (sel) => panel.querySelector(sel);
        q('#var-close')?.addEventListener('click', () => this.hide());
        q('#var-add')?.addEventListener('click', () => this.promptAdd());
        q('#var-clear-all')?.addEventListener('click', () => this.clearAll());

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

    getVars() {
        const sid = String(this.getSessionId() || '').trim();
        const vars = sid ? (this.chatStore?.listVariables?.(sid) || {}) : {};
        return { sid, vars };
    }

    renderList() {
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
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:900; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${k}</div>
                        <div style="color:#64748b; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${v || '（空）'}</div>
                    </div>
                    <button class="var-edit" style="border:1px solid #e2e8f0; background:#fff; border-radius:10px; padding:6px 10px; cursor:pointer;">编辑</button>
                    <button class="var-del" style="border:1px solid rgba(239,68,68,0.35); background:#fff; color:#b91c1c; border-radius:10px; padding:6px 10px; cursor:pointer;">删除</button>
                </div>
                <div style="margin-top:8px; font-size:12px; color:#475569;">
                    <code>{{getvar::${k}}}</code>
                </div>
            `;
            row.querySelector('.var-edit')?.addEventListener('click', () => this.promptEdit(k, v));
            row.querySelector('.var-del')?.addEventListener('click', () => this.deleteKey(k));
            listEl.appendChild(row);
        });
    }

    promptAdd() {
        const key = prompt('变量名（name）', '');
        if (!key) return;
        const value = prompt('变量值（value）', '') ?? '';
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        this.chatStore?.setVariable?.(String(key).trim(), String(value), sid);
        this.renderList();
    }

    promptEdit(key, curValue) {
        const next = prompt(`编辑变量：${key}`, String(curValue ?? ''));
        if (next === null) return;
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        this.chatStore?.setVariable?.(String(key).trim(), String(next), sid);
        this.renderList();
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
}
