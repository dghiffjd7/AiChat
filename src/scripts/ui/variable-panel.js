import { appConfirm } from './app-confirm.js';
import { applyTemplate, listVariableTemplates } from '../variables/variable-templates.js';
import {
    buildRuleConditionDiagnostics,
    formatUnsupportedExpressionMessage,
} from '../variables/expression-compat-diagnostics.js';
import { validateExpressionSyntax } from '../variables/safe-expression-evaluator.js';

const TREE_LIMITS = {
    maxDepth: 8,
    maxNodes: 2000,
    maxArray: 120,
};

const createTreeNode = (name, path, order = 0) => ({
    name,
    path,
    order,
    children: new Map(),
    hasValue: false,
    value: undefined,
});

const formatTreeValue = (value) => {
    if (value === undefined) return '';
    if (value === null) return 'null';
    if (typeof value === 'string') {
        const trimmed = value.replace(/\s+/g, ' ').trim();
        return trimmed.length > 80 ? `${trimmed.slice(0, 77)}...` : trimmed;
    }
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) return `[${value.length}]`;
    if (typeof value === 'object') return `{${Object.keys(value).length}}`;
    return String(value);
};

const buildVariableTree = (vars = {}) => {
    const root = createTreeNode('', '');
    let nodeCount = 0;

    const ensureChild = (parent, name, path, order = 0) => {
        if (!parent) return null;
        let child = parent.children.get(name);
        if (!child) {
            if (nodeCount >= TREE_LIMITS.maxNodes) return null;
            child = createTreeNode(name, path, order);
            parent.children.set(name, child);
            nodeCount += 1;
        } else if (Number.isFinite(order)) {
            child.order = order;
        }
        return child;
    };

    const assignValue = (node, value, override = false) => {
        if (!node) return;
        if (override || !node.hasValue) {
            node.value = value;
            node.hasValue = true;
        }
    };

    const expandValue = (node, value, depth = 0) => {
        if (!node || value == null) return;
        if (depth >= TREE_LIMITS.maxDepth) return;
        if (Array.isArray(value)) {
            const limit = Math.min(value.length, TREE_LIMITS.maxArray);
            for (let i = 0; i < limit; i += 1) {
                const name = `[${i}]`;
                const path = node.path ? `${node.path}${name}` : name;
                const child = ensureChild(node, name, path, i);
                if (!child) break;
                assignValue(child, value[i], false);
                expandValue(child, value[i], depth + 1);
            }
            return;
        }
        if (typeof value === 'object') {
            const entries = Object.entries(value);
            for (let i = 0; i < entries.length; i += 1) {
                const [key, val] = entries[i];
                const name = String(key);
                const path = node.path ? `${node.path}.${name}` : name;
                const child = ensureChild(node, name, path, i);
                if (!child) break;
                assignValue(child, val, false);
                expandValue(child, val, depth + 1);
            }
        }
    };

    const addPath = (path, value) => {
        const raw = String(path || '').trim();
        if (!raw) return;
        const parts = raw.split('.').filter(Boolean);
        let node = root;
        let currentPath = '';
        for (let i = 0; i < parts.length; i += 1) {
            const part = parts[i];
            currentPath = currentPath ? `${currentPath}.${part}` : part;
            node = ensureChild(node, part, currentPath, i);
            if (!node) return;
        }
        assignValue(node, value, true);
        expandValue(node, value, parts.length);
    };

    Object.entries(vars || {}).forEach(([key, value]) => addPath(key, value));
    return root;
};

const getSortedChildren = (node) => {
    const list = Array.from(node?.children?.values?.() || []);
    return list.sort((a, b) => {
        if (a.order !== b.order) return a.order - b.order;
        return String(a.name || '').localeCompare(String(b.name || ''));
    });
};

const treeNodeMatches = (node, term) => {
    if (!term) return true;
    const text = `${node.path} ${node.name} ${formatTreeValue(node.value)}`.toLowerCase();
    if (text.includes(term)) return true;
    for (const child of node.children.values()) {
        if (treeNodeMatches(child, term)) return true;
    }
    return false;
};

const renderTreeNode = (node, term, depth = 0) => {
    if (!node) return null;
    if (!treeNodeMatches(node, term)) return null;
    const hasChildren = node.children && node.children.size > 0;
    const valueText = node.hasValue ? formatTreeValue(node.value) : '';

    if (hasChildren) {
        const wrap = document.createElement('details');
        wrap.open = Boolean(term) || depth < 1;
        wrap.style.cssText = `margin-left:${depth ? 12 : 0}px; padding:2px 0;`;

        const summary = document.createElement('summary');
        summary.style.cssText = 'cursor:pointer; display:flex; align-items:center; gap:8px; font-size:13px; color:var(--app-text-primary);';

        const nameEl = document.createElement('span');
        nameEl.textContent = node.name || '(root)';
        nameEl.style.cssText = 'font-weight:700;';
        summary.appendChild(nameEl);

        if (valueText) {
            const valueEl = document.createElement('span');
            valueEl.textContent = valueText;
            valueEl.style.cssText = 'font-size:11px; color:var(--app-text-muted);';
            summary.appendChild(valueEl);
        }

        const countEl = document.createElement('span');
        countEl.textContent = `(${node.children.size})`;
        countEl.style.cssText = 'font-size:11px; color:var(--app-text-muted);';
        summary.appendChild(countEl);

        wrap.appendChild(summary);

        const body = document.createElement('div');
        body.style.cssText = 'display:flex; flex-direction:column; gap:4px; padding:4px 0 4px 8px;';
        getSortedChildren(node).forEach((child) => {
            const childEl = renderTreeNode(child, term, depth + 1);
            if (childEl) body.appendChild(childEl);
        });
        wrap.appendChild(body);
        return wrap;
    }

    const row = document.createElement('div');
    row.style.cssText = `display:flex; gap:10px; align-items:flex-start; margin-left:${depth ? 12 : 0}px; padding:2px 0;`;
    row.title = node.path || node.name || '';

    const nameEl = document.createElement('span');
    nameEl.textContent = node.name || '';
    nameEl.style.cssText = 'flex:1; min-width:0; font-size:13px; color:var(--app-text-primary);';
    row.appendChild(nameEl);

    const valueEl = document.createElement('span');
    valueEl.textContent = valueText || '（空）';
    valueEl.style.cssText = 'font-size:12px; color:var(--app-text-muted); white-space:nowrap;';
    row.appendChild(valueEl);

    return row;
};

export class VariablePanel {
    constructor({ chatStore, getSessionId, getVariableScope }) {
        this.chatStore = chatStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : () => '';
        this.getVariableScope = typeof getVariableScope === 'function' ? getVariableScope : null;
        this.overlay = null;
        this.panel = null;
        this.schemaOverlay = null;
        this.schemaPanel = null;
        this.schemaFields = null;
        this.ruleOverlay = null;
        this.rulePanel = null;
        this.ruleList = null;
        this.ruleEditorOverlay = null;
        this.ruleEditorPanel = null;
        this.ruleFields = null;
        this.editingRuleId = '';
        this.templateOverlay = null;
        this.templatePanel = null;
        this.dataOverlay = null;
        this.dataPanel = null;
        this.dataTextarea = null;
        this.dataCopyBtn = null;
        this.dataMergeBtn = null;
        this.dataOverwriteBtn = null;
        this.term = '';
        this.editingKey = '';
        this.moreMenuCloseHandler = null;
        this.viewMode = 'list';
        this.viewButtons = null;
    }

    ensureUI() {
        if (this.overlay) return;

        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay variable-panel-overlay';
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
        panel.className = 'app-themed-panel variable-panel-shell';
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
            <div style="display:flex; align-items:center; gap:10px; padding:12px 14px; background:#f3f4f6; border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:900; font-size:15px;">变量管理器</div>
                <div id="var-meta" style="margin-left:auto; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;"></div>
                <button id="var-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 12px; cursor:pointer;">关闭</button>
            </div>

            <div style="padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06);">
                <div class="variable-panel-search-box" style="display:flex; align-items:center; gap:8px; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:14px; background:var(--app-surface-card);">
                    <span class="variable-panel-search-icon" style="color:var(--app-text-muted);">🔍</span>
                    <input id="var-search" type="text" placeholder="搜索变量名..." style="flex:1; border:none; outline:none; font-size:14px; background:transparent;">
                    <button id="var-clear-search" type="button" aria-label="清除搜索" style="display:none; width:28px; height:28px; border:none; border-radius:8px; background:var(--app-surface-panel); cursor:pointer; font-size:14px; color:var(--app-text-primary);">×</button>
                </div>
                <div style="margin-top:10px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                    <button id="var-add" style="border:none; background:#2563eb; color:var(--app-text-inverse); border-radius:10px; padding:8px 14px; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:6px;">
                        <span style="font-size:14px;">+</span>新增
                    </button>
                    <button id="var-templates" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 12px; font-size:13px; cursor:pointer;">模板</button>
                    <button id="var-rules" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 12px; font-size:13px; cursor:pointer;">规则</button>
                    <button id="var-more" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 12px; font-size:13px; cursor:pointer;" title="更多操作">⋮ 更多</button>
                </div>
                <div class="variable-panel-usage-hint" style="margin-top:10px; padding:8px 10px; background:var(--app-surface-panel); border-radius:8px; font-size:11px; color:var(--app-text-secondary);">
                    💡 提示词中使用 <code class="variable-panel-inline-code" style="padding:2px 6px; border-radius:4px;">{{getvar::name}}</code> 引用变量
                </div>
                <div style="margin-top:10px; display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <div style="font-size:12px; color:var(--app-text-muted);">视图</div>
                    <div id="var-view-toggle" style="display:flex; gap:6px; padding:2px; background:var(--app-surface-hover); border-radius:999px;">
                        <button id="var-view-list" type="button" style="border:1px solid var(--app-border-default); background:var(--app-text-primary); color:var(--app-text-inverse); border-radius:999px; padding:4px 10px; font-size:12px; cursor:pointer;">文本</button>
                        <button id="var-view-tree" type="button" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); color:var(--app-text-primary); border-radius:999px; padding:4px 10px; font-size:12px; cursor:pointer;">树状</button>
                    </div>
                </div>
            </div>
            <div id="var-scroll" style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch;">
                <div id="var-cards" style="padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; flex-wrap:wrap; gap:8px;"></div>
                <div id="var-list" style="padding:10px 12px;"></div>
            </div>
        `;

        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        const q = (sel) => panel.querySelector(sel);
        q('#var-close')?.addEventListener('click', () => this.hide());
        q('#var-add')?.addEventListener('click', () => this.promptAdd());
        q('#var-templates')?.addEventListener('click', () => this.showTemplateModal());
        q('#var-rules')?.addEventListener('click', () => this.showRules());
        q('#var-more')?.addEventListener('click', (e) => this.showMoreMenu(e.currentTarget));

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

        const viewListBtn = q('#var-view-list');
        const viewTreeBtn = q('#var-view-tree');
        this.viewButtons = { list: viewListBtn, tree: viewTreeBtn };
        viewListBtn?.addEventListener('click', () => this.setViewMode('list'));
        viewTreeBtn?.addEventListener('click', () => this.setViewMode('tree'));
        this.updateViewToggle();

        this.overlay = overlay;
        this.panel = panel;
    }

    ensureSchemaUI() {
        if (this.schemaOverlay) return;

        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay variable-panel-overlay variable-schema-overlay';
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
        panel.className = 'app-themed-panel variable-panel-shell variable-schema-panel';
        panel.style.cssText = `
            width: min(94vw, 520px);
            max-height: 86vh;
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());

        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:900;">变量配置</div>
                <div id="schema-title" style="margin-left:auto; font-size:12px; color:var(--app-text-muted);"></div>
                <button id="schema-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="padding:12px; overflow:auto; display:flex; flex-direction:column; gap:10px;">
                <label style="font-size:12px; color:var(--app-text-muted);">变量名</label>
                <input id="schema-key" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">

                <label style="font-size:12px; color:var(--app-text-muted);">当前值</label>
                <input id="schema-value" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">

                <label style="font-size:12px; color:var(--app-text-muted);">类型</label>
                <select id="schema-type" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    <option value="">（无）</option>
                    <option value="number">number</option>
                    <option value="string">string</option>
                    <option value="boolean">boolean</option>
                    <option value="enum">enum</option>
                    <option value="array">array</option>
                    <option value="object">object</option>
                </select>

                <label style="font-size:12px; color:var(--app-text-muted);">默认值</label>
                <input id="schema-default" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">

                <div id="schema-range" style="display:none; gap:8px;">
                    <div style="flex:1;">
                        <label style="font-size:12px; color:var(--app-text-muted);">最小值</label>
                        <input id="schema-min" type="number" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; width:100%;">
                    </div>
                    <div style="flex:1;">
                        <label style="font-size:12px; color:var(--app-text-muted);">最大值</label>
                        <input id="schema-max" type="number" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; width:100%;">
                    </div>
                </div>

                <div id="schema-options" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">枚举选项（逗号分隔）</label>
                    <input id="schema-options-input" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; width:100%;">
                </div>

                <label style="font-size:12px; color:var(--app-text-muted);">展示</label>
                <select id="schema-display" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    <option value="card">card</option>
                    <option value="badge">badge</option>
                    <option value="progress">progress</option>
                    <option value="hidden">hidden</option>
                </select>

                <label style="font-size:12px; color:var(--app-text-muted);">颜色</label>
                <input id="schema-color" type="text" placeholder="#ff6b6b" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">

                <label style="font-size:12px; color:var(--app-text-muted);">格式（例：{value}/100）</label>
                <input id="schema-format" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
            </div>
            <div style="display:flex; gap:8px; padding:12px; border-top:1px solid #eef2f7;">
                <button id="schema-delete" style="border:1px solid rgba(239,68,68,0.35); background:var(--app-surface-card); color:#b91c1c; border-radius:10px; padding:8px 10px;">删除配置</button>
                <div style="flex:1;"></div>
                <button id="schema-cancel" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px;">取消</button>
                <button id="schema-save" style="border:none; background:#0ea5e9; color:var(--app-text-inverse); border-radius:10px; padding:8px 12px;">保存</button>
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

    ensureRuleUI() {
        if (this.ruleOverlay) return;

        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay variable-panel-overlay variable-rules-overlay';
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.45);
            z-index: 22090;
            padding: calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px)) 12px;
            box-sizing: border-box;
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideRules();
        });

        const panel = document.createElement('div');
        panel.className = 'app-themed-panel variable-panel-shell variable-rules-panel';
        panel.style.cssText = `
            width: min(94vw, 560px);
            max-height: 86vh;
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:900;">规则管理</div>
                <div style="margin-left:auto; font-size:12px; color:var(--app-text-muted);">当前会话规则</div>
                <button id="rule-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="padding:12px; display:flex; gap:8px; align-items:center; border-bottom:1px solid rgba(0,0,0,0.06);">
                <button id="rule-add" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px; font-size:13px;">新增规则</button>
                <button id="rule-json" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px; font-size:13px;">JSON</button>
                <button id="rule-run" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px; font-size:13px;">运行规则</button>
            </div>
            <div id="rule-list" style="padding:12px; overflow:auto; flex:1; display:flex; flex-direction:column; gap:10px;"></div>
        `;

        panel.querySelector('#rule-close')?.addEventListener('click', () => this.hideRules());
        panel.querySelector('#rule-add')?.addEventListener('click', () => this.openRuleEditor());
        panel.querySelector('#rule-json')?.addEventListener('click', () => this.promptRulesJson());
        panel.querySelector('#rule-run')?.addEventListener('click', () => this.runRules());

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.ruleOverlay = overlay;
        this.rulePanel = panel;
        this.ruleList = panel.querySelector('#rule-list');
    }

    ensureRuleEditorUI() {
        if (this.ruleEditorOverlay) return;
        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay variable-panel-overlay variable-rule-editor-overlay';
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.52);
            z-index: 22120;
            padding: calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px)) 12px;
            box-sizing: border-box;
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideRuleEditor();
        });

        const panel = document.createElement('div');
        panel.className = 'app-themed-panel variable-panel-shell variable-rule-editor-panel';
        panel.style.cssText = `
            width: min(94vw, 560px);
            max-height: 88vh;
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:900;">规则编辑</div>
                <div id="rule-title" style="margin-left:auto; font-size:12px; color:var(--app-text-muted);"></div>
                <button id="rule-editor-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="padding:12px; overflow:auto; display:flex; flex-direction:column; gap:10px;">
                <label style="font-size:12px; color:var(--app-text-muted);">规则名</label>
                <input id="rule-name" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">

                <div style="display:flex; gap:12px; align-items:center;">
                    <label style="font-size:12px; color:var(--app-text-muted);">
                        <input id="rule-enabled" type="checkbox" style="margin-right:6px;">启用
                    </label>
                    <label style="font-size:12px; color:var(--app-text-muted);">
                        优先级
                        <input id="rule-priority" type="number" value="0" style="margin-left:6px; padding:6px 8px; width:90px; border:1px solid var(--app-border-default); border-radius:8px;">
                    </label>
                </div>

                <label style="font-size:12px; color:var(--app-text-muted);">触发类型</label>
                <select id="rule-trigger-type" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    <option value="every_turn">每轮</option>
                    <option value="every_n_turns">每 N 轮</option>
                    <option value="keyword">关键词</option>
                    <option value="condition">条件表达式</option>
                    <option value="manual">手动</option>
                </select>

                <div id="rule-trigger-n-wrap" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">N（每 N 轮）</label>
                    <input id="rule-trigger-n" type="number" min="1" value="1" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px; width:100%;">
                </div>

                <div id="rule-trigger-keywords-wrap" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">关键词（逗号分隔）</label>
                    <input id="rule-trigger-keywords" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    <label style="font-size:12px; color:var(--app-text-muted); margin-top:6px;">
                        <input id="rule-trigger-case" type="checkbox" style="margin-right:6px;">区分大小写
                    </label>
                </div>

                <div id="rule-trigger-expr-wrap" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">条件表达式（安全子集：变量、括号、逻辑/比较/四则运算）</label>
                    <textarea id="rule-trigger-expr" rows="2" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;"></textarea>
                    <div id="rule-trigger-expr-status" style="display:none; font-size:12px; line-height:1.4; margin-top:6px;"></div>
                </div>

                <label style="font-size:12px; color:var(--app-text-muted);">动作类型</label>
                <select id="rule-action-type" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    <option value="set_value">设置数值</option>
                    <option value="increment">递增</option>
                    <option value="decrement">递减</option>
                    <option value="toggle">切换布尔</option>
                    <option value="push">数组追加</option>
                    <option value="remove">数组移除</option>
                    <option value="ai_evaluate">AI 评估</option>
                    <option value="notify">通知提示</option>
                    <option value="switch_persona">切换角色卡</option>
                    <option value="inject_prompt">注入提示词</option>
                </select>

                <label style="font-size:12px; color:var(--app-text-muted);">目标变量</label>
                <input id="rule-action-target" list="rule-target-list" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                <datalist id="rule-target-list"></datalist>

                <div id="rule-action-value-wrap">
                    <label id="rule-action-value-label" style="font-size:12px; color:var(--app-text-muted);">设置值</label>
                    <input id="rule-action-value" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                </div>

                <div id="rule-action-delta-wrap" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">增量</label>
                    <input id="rule-action-delta" type="number" value="1" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                </div>

                <div id="rule-action-ai-wrap" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">AI 评估提示词</label>
                    <textarea id="rule-action-prompt" rows="4" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;"></textarea>
                    <label style="font-size:12px; color:var(--app-text-muted);">应用方式</label>
                    <select id="rule-action-mode" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                        <option value="delta">增量</option>
                        <option value="set">直接赋值</option>
                    </select>
                </div>

                <div id="rule-action-message-wrap" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">通知内容</label>
                    <input id="rule-action-message" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    <label style="font-size:12px; color:var(--app-text-muted);">通知级别</label>
                    <select id="rule-action-message-style" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                        <option value="info">info</option>
                        <option value="success">success</option>
                        <option value="warning">warning</option>
                        <option value="error">error</option>
                    </select>
                </div>

                <div id="rule-action-persona-wrap" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">角色卡 ID / 名称</label>
                    <input id="rule-action-persona" type="text" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                </div>

                <div id="rule-action-inject-wrap" style="display:none;">
                    <label style="font-size:12px; color:var(--app-text-muted);">注入提示词</label>
                    <textarea id="rule-action-inject" rows="4" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;"></textarea>
                    <label style="font-size:12px; color:var(--app-text-muted);">注入角色</label>
                    <select id="rule-action-inject-role" style="padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;">
                        <option value="system">system</option>
                        <option value="user">user</option>
                        <option value="assistant">assistant</option>
                    </select>
                </div>
            </div>
            <div style="display:flex; gap:8px; padding:12px; border-top:1px solid #eef2f7;">
                <button id="rule-delete" style="border:1px solid rgba(239,68,68,0.35); background:var(--app-surface-card); color:#b91c1c; border-radius:10px; padding:8px 10px;">删除</button>
                <div style="flex:1;"></div>
                <button id="rule-cancel" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px;">取消</button>
                <button id="rule-save" style="border:none; background:#0ea5e9; color:var(--app-text-inverse); border-radius:10px; padding:8px 12px;">保存</button>
            </div>
        `;

        const q = (sel) => panel.querySelector(sel);
        const fields = {
            title: q('#rule-title'),
            name: q('#rule-name'),
            enabled: q('#rule-enabled'),
            priority: q('#rule-priority'),
            triggerType: q('#rule-trigger-type'),
            triggerNWrap: q('#rule-trigger-n-wrap'),
            triggerN: q('#rule-trigger-n'),
            triggerKeywordsWrap: q('#rule-trigger-keywords-wrap'),
            triggerKeywords: q('#rule-trigger-keywords'),
            triggerCase: q('#rule-trigger-case'),
            triggerExprWrap: q('#rule-trigger-expr-wrap'),
            triggerExpr: q('#rule-trigger-expr'),
            triggerExprStatus: q('#rule-trigger-expr-status'),
            actionType: q('#rule-action-type'),
            actionTarget: q('#rule-action-target'),
            actionValueWrap: q('#rule-action-value-wrap'),
            actionValueLabel: q('#rule-action-value-label'),
            actionValue: q('#rule-action-value'),
            actionDeltaWrap: q('#rule-action-delta-wrap'),
            actionDelta: q('#rule-action-delta'),
            actionAiWrap: q('#rule-action-ai-wrap'),
            actionPrompt: q('#rule-action-prompt'),
            actionMode: q('#rule-action-mode'),
            actionMessageWrap: q('#rule-action-message-wrap'),
            actionMessage: q('#rule-action-message'),
            actionMessageStyle: q('#rule-action-message-style'),
            actionPersonaWrap: q('#rule-action-persona-wrap'),
            actionPersona: q('#rule-action-persona'),
            actionInjectWrap: q('#rule-action-inject-wrap'),
            actionInject: q('#rule-action-inject'),
            actionInjectRole: q('#rule-action-inject-role'),
            targetList: q('#rule-target-list'),
            save: q('#rule-save'),
            cancel: q('#rule-cancel'),
            close: q('#rule-editor-close'),
            del: q('#rule-delete'),
        };

        const updateTriggerUI = () => {
            const type = String(fields.triggerType?.value || '');
            if (fields.triggerNWrap) fields.triggerNWrap.style.display = type === 'every_n_turns' ? 'block' : 'none';
            if (fields.triggerKeywordsWrap) fields.triggerKeywordsWrap.style.display = type === 'keyword' ? 'block' : 'none';
            if (fields.triggerExprWrap) fields.triggerExprWrap.style.display = type === 'condition' ? 'block' : 'none';
            this.updateRuleTriggerExprFeedback();
        };
        const updateActionUI = () => {
            const type = String(fields.actionType?.value || '');
            const needsTarget = !['notify', 'switch_persona', 'inject_prompt'].includes(type);
            if (fields.actionTarget) {
                fields.actionTarget.disabled = !needsTarget;
                fields.actionTarget.style.opacity = needsTarget ? '1' : '0.6';
            }
            const needsValue = type === 'set_value' || type === 'push' || type === 'remove';
            if (fields.actionValueWrap) fields.actionValueWrap.style.display = needsValue ? 'block' : 'none';
            if (fields.actionValueLabel) {
                if (type === 'push') fields.actionValueLabel.textContent = '追加值';
                else if (type === 'remove') fields.actionValueLabel.textContent = '移除值';
                else fields.actionValueLabel.textContent = '设置值';
            }
            if (fields.actionDeltaWrap) fields.actionDeltaWrap.style.display = (type === 'increment' || type === 'decrement') ? 'block' : 'none';
            if (fields.actionAiWrap) fields.actionAiWrap.style.display = type === 'ai_evaluate' ? 'block' : 'none';
            if (fields.actionMessageWrap) fields.actionMessageWrap.style.display = type === 'notify' ? 'block' : 'none';
            if (fields.actionPersonaWrap) fields.actionPersonaWrap.style.display = type === 'switch_persona' ? 'block' : 'none';
            if (fields.actionInjectWrap) fields.actionInjectWrap.style.display = type === 'inject_prompt' ? 'block' : 'none';
        };
        fields.triggerType?.addEventListener('change', updateTriggerUI);
        fields.triggerExpr?.addEventListener('input', () => this.updateRuleTriggerExprFeedback());
        fields.triggerExpr?.addEventListener('blur', () => this.updateRuleTriggerExprFeedback());
        fields.actionType?.addEventListener('change', updateActionUI);
        fields.close?.addEventListener('click', () => this.hideRuleEditor());
        fields.cancel?.addEventListener('click', () => this.hideRuleEditor());
        fields.save?.addEventListener('click', () => this.saveRuleEditor());
        fields.del?.addEventListener('click', () => this.deleteRuleEditor());

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.ruleEditorOverlay = overlay;
        this.ruleEditorPanel = panel;
        this.ruleFields = fields;
    }

    ensureTemplateUI() {
        if (this.templateOverlay) return;
        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay variable-panel-overlay variable-template-overlay';
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.45);
            z-index: 22140;
            padding: calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px)) 12px;
            box-sizing: border-box;
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideTemplateModal();
        });

        const panel = document.createElement('div');
        panel.className = 'app-themed-panel variable-panel-shell variable-template-panel';
        panel.style.cssText = `
            width: min(92vw, 520px);
            max-height: 86vh;
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:900;">变量模板</div>
                <div style="margin-left:auto; font-size:12px; color:var(--app-text-muted);">一键创建常用变量</div>
                <button id="tpl-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div id="tpl-list" style="padding:12px; overflow:auto; display:flex; flex-direction:column; gap:10px;"></div>
        `;
        panel.querySelector('#tpl-close')?.addEventListener('click', () => this.hideTemplateModal());

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.templateOverlay = overlay;
        this.templatePanel = panel;
    }

    ensureDataUI() {
        if (this.dataOverlay) return;
        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay variable-panel-overlay variable-data-overlay';
        overlay.style.cssText = `
            display:none; position:fixed; inset:0;
            background: rgba(0,0,0,0.45);
            z-index: 22160;
            padding: calc(12px + env(safe-area-inset-top, 0px)) 12px calc(12px + env(safe-area-inset-bottom, 0px)) 12px;
            box-sizing: border-box;
        `;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) this.hideDataModal();
        });

        const panel = document.createElement('div');
        panel.className = 'app-themed-panel variable-panel-shell variable-data-panel';
        panel.style.cssText = `
            width: min(94vw, 620px);
            max-height: 88vh;
            background: var(--app-surface-card);
            border-radius: 14px;
            overflow: hidden;
            display:flex;
            flex-direction:column;
            box-shadow: 0 12px 40px rgba(0,0,0,0.25);
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:var(--app-surface-subtle); border-bottom:1px solid var(--app-border-default);">
                <div id="data-title" style="font-weight:900;">导入/导出</div>
                <div style="margin-left:auto;"></div>
                <button id="data-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div style="padding:12px; flex:1; display:flex; flex-direction:column; gap:10px;">
                <textarea id="data-text" rows="12" style="flex:1; min-height:200px; padding:10px; border:1px solid var(--app-border-default); border-radius:12px; font-size:12px; line-height:1.5;"></textarea>
            </div>
            <div style="display:flex; gap:8px; padding:12px; border-top:1px solid #eef2f7;">
                <button id="data-copy" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 10px;">复制</button>
                <div style="flex:1;"></div>
                <button id="data-merge" style="border:1px solid #0ea5e9; background:var(--app-surface-card); color:#0284c7; border-radius:10px; padding:8px 10px;">合并导入</button>
                <button id="data-overwrite" style="border:none; background:#0ea5e9; color:var(--app-text-inverse); border-radius:10px; padding:8px 12px;">覆盖导入</button>
            </div>
        `;

        const copyBtn = panel.querySelector('#data-copy');
        const mergeBtn = panel.querySelector('#data-merge');
        const overwriteBtn = panel.querySelector('#data-overwrite');
        panel.querySelector('#data-close')?.addEventListener('click', () => this.hideDataModal());
        copyBtn?.addEventListener('click', () => this.copyDataModal());
        mergeBtn?.addEventListener('click', () => this.applyImportModal(true));
        overwriteBtn?.addEventListener('click', () => this.applyImportModal(false));

        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.dataOverlay = overlay;
        this.dataPanel = panel;
        this.dataTextarea = panel.querySelector('#data-text');
        this.dataCopyBtn = copyBtn;
        this.dataMergeBtn = mergeBtn;
        this.dataOverwriteBtn = overwriteBtn;
    }

    show() {
        this.ensureUI();
        const { sid, scope } = this.getVars();
        const meta = this.panel?.querySelector?.('#var-meta');
        if (meta) meta.textContent = scope === 'global' ? '全局变量（共享）' : (sid ? `会话：${sid}` : '未选择会话');
        this.term = '';
        const searchEl = this.panel?.querySelector?.('#var-search');
        if (searchEl) searchEl.value = '';
        this.renderList();
        this.overlay.style.display = 'block';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        this.closeMoreMenu();
    }

    closeMoreMenu() {
        const existing = document.querySelector('.var-more-menu');
        if (existing) existing.remove();
        if (this.moreMenuCloseHandler) {
            document.removeEventListener('pointerdown', this.moreMenuCloseHandler, true);
            this.moreMenuCloseHandler = null;
        }
    }

    showRules() {
        const { sid, scope } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        if (scope === 'global') {
            window.toastr?.info?.('全局变量暂不支持规则');
            return;
        }
        this.ensureRuleUI();
        this.renderRuleList();
        if (this.ruleOverlay) this.ruleOverlay.style.display = 'block';
    }

    hideRules() {
        if (this.ruleOverlay) this.ruleOverlay.style.display = 'none';
    }

    showRuleEditor(rule) {
        this.ensureRuleEditorUI();
        const fields = this.ruleFields;
        if (!fields) return;
        const normalized = this.normalizeRule(rule);
        this.editingRuleId = normalized.id;
        if (fields.title) fields.title.textContent = normalized.name || normalized.id || '新规则';
        if (fields.name) fields.name.value = normalized.name || '';
        if (fields.enabled) fields.enabled.checked = normalized.enabled !== false;
        if (fields.priority) fields.priority.value = Number(normalized.priority || 0);
        if (fields.triggerType) fields.triggerType.value = normalized.trigger.type || 'every_turn';
        if (fields.triggerN) fields.triggerN.value = normalized.trigger.n || 1;
        if (fields.triggerKeywords) fields.triggerKeywords.value = (normalized.trigger.keywords || []).join(', ');
        if (fields.triggerCase) fields.triggerCase.checked = Boolean(normalized.trigger.caseSensitive);
        if (fields.triggerExpr) fields.triggerExpr.value = normalized.trigger.expr || '';
        if (fields.actionType) fields.actionType.value = normalized.action.type || 'set_value';
        if (fields.actionTarget) fields.actionTarget.value = normalized.action.target || '';
        if (fields.actionValue) fields.actionValue.value =
            normalized.action.value === undefined || normalized.action.value === null
                ? ''
                : (typeof normalized.action.value === 'object' ? JSON.stringify(normalized.action.value) : String(normalized.action.value));
        if (fields.actionDelta) fields.actionDelta.value = Number.isFinite(Number(normalized.action.value)) ? Number(normalized.action.value) : 1;
        if (fields.actionPrompt) fields.actionPrompt.value = normalized.action.prompt || '';
        if (fields.actionMode) fields.actionMode.value = normalized.action.mode || 'delta';
        if (fields.actionMessage) fields.actionMessage.value = normalized.action.message || '';
        if (fields.actionMessageStyle) fields.actionMessageStyle.value = normalized.action.style || 'info';
        if (fields.actionPersona) fields.actionPersona.value = normalized.action.persona || '';
        if (fields.actionInject) fields.actionInject.value = normalized.action.prompt || '';
        if (fields.actionInjectRole) fields.actionInjectRole.value = normalized.action.role || 'system';

        const { vars } = this.getVars();
        if (fields.targetList) {
            fields.targetList.innerHTML = '';
            Object.keys(vars || {}).forEach((name) => {
                const opt = document.createElement('option');
                opt.value = name;
                fields.targetList.appendChild(opt);
            });
        }

        fields.triggerType?.dispatchEvent(new Event('change'));
        fields.actionType?.dispatchEvent(new Event('change'));
        this.updateRuleTriggerExprFeedback();
        if (this.ruleEditorOverlay) this.ruleEditorOverlay.style.display = 'block';
    }

    hideRuleEditor() {
        if (this.ruleEditorOverlay) this.ruleEditorOverlay.style.display = 'none';
        this.editingRuleId = '';
    }

    validateRuleTriggerExpr(rawInput = null) {
        const expr = rawInput === null
            ? String(this.ruleFields?.triggerExpr?.value || '').trim()
            : String(rawInput || '').trim();
        if (!expr) return { ok: false, error: '条件表达式不能为空' };
        const result = validateExpressionSyntax(expr);
        if (result.ok) return { ok: true, error: '' };
        return {
            ok: false,
            error: result.error || '表达式语法无效',
        };
    }

    updateRuleTriggerExprFeedback() {
        const fields = this.ruleFields;
        if (!fields?.triggerExpr || !fields?.triggerExprStatus) return { ok: true, error: '' };
        const isCondition = String(fields.triggerType?.value || '') === 'condition';
        if (!isCondition) {
            fields.triggerExpr.style.borderColor = 'var(--app-border-default)';
            fields.triggerExprStatus.style.display = 'none';
            fields.triggerExprStatus.textContent = '';
            return { ok: true, error: '' };
        }
        const expr = String(fields.triggerExpr.value || '').trim();
        if (!expr) {
            fields.triggerExpr.style.borderColor = '#f59e0b';
            fields.triggerExprStatus.style.display = 'block';
            fields.triggerExprStatus.style.color = '#b45309';
            fields.triggerExprStatus.textContent = '请输入条件表达式';
            return { ok: false, error: '条件表达式不能为空' };
        }
        const result = this.validateRuleTriggerExpr(expr);
        if (result.ok) {
            fields.triggerExpr.style.borderColor = '#10b981';
            fields.triggerExprStatus.style.display = 'block';
            fields.triggerExprStatus.style.color = '#047857';
            fields.triggerExprStatus.textContent = '语法通过';
            return result;
        }
        fields.triggerExpr.style.borderColor = '#ef4444';
        fields.triggerExprStatus.style.display = 'block';
        fields.triggerExprStatus.style.color = '#b91c1c';
        fields.triggerExprStatus.textContent = formatUnsupportedExpressionMessage(result.error);
        return result;
    }

    saveRuleEditor() {
        const fields = this.ruleFields;
        if (!fields) return;
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        const rules = this.getRules().rules;
        const id = this.editingRuleId || `vr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
        const name = String(fields.name?.value || '').trim();
        const enabled = fields.enabled?.checked !== false;
        const priority = Number(fields.priority?.value || 0) || 0;
        const triggerType = String(fields.triggerType?.value || 'every_turn');
        const trigger = { type: triggerType };
        if (triggerType === 'every_n_turns') {
            const n = Number(fields.triggerN?.value || 0);
            trigger.n = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 1;
        }
        if (triggerType === 'keyword') {
            const keywords = String(fields.triggerKeywords?.value || '').split(',').map(s => s.trim()).filter(Boolean);
            trigger.keywords = keywords;
            trigger.caseSensitive = Boolean(fields.triggerCase?.checked);
        }
        if (triggerType === 'condition') {
            const expr = String(fields.triggerExpr?.value || '').trim();
            const validation = this.validateRuleTriggerExpr(expr);
            this.updateRuleTriggerExprFeedback();
            if (!validation.ok) {
                window.toastr?.warning?.('当前不支持这类条件语法，请按下方提示改写');
                return;
            }
            trigger.expr = expr;
        }
        const actionType = String(fields.actionType?.value || 'set_value');
        const action = { type: actionType };
        const needsTarget = !['notify', 'switch_persona', 'inject_prompt'].includes(actionType);
        action.target = String(fields.actionTarget?.value || '').trim();
        if (needsTarget && !action.target) {
            window.toastr?.warning?.('目标变量不能为空');
            return;
        }
        if (actionType === 'set_value' || actionType === 'push' || actionType === 'remove') {
            action.value = this.parseValue(fields.actionValue?.value || '');
        } else if (actionType === 'increment' || actionType === 'decrement') {
            const delta = Number(fields.actionDelta?.value || 0);
            action.value = Number.isFinite(delta) ? delta : 1;
        } else if (actionType === 'ai_evaluate') {
            action.prompt = String(fields.actionPrompt?.value || '').trim();
            action.mode = String(fields.actionMode?.value || 'delta');
        } else if (actionType === 'notify') {
            action.message = String(fields.actionMessage?.value || '').trim();
            action.style = String(fields.actionMessageStyle?.value || 'info');
        } else if (actionType === 'switch_persona') {
            action.persona = String(fields.actionPersona?.value || '').trim();
        } else if (actionType === 'inject_prompt') {
            action.prompt = String(fields.actionInject?.value || '').trim();
            action.role = String(fields.actionInjectRole?.value || 'system');
        }

        const next = { id, name, enabled, priority, trigger, action };
        const idx = rules.findIndex(r => String(r?.id || '') === id);
        if (idx >= 0) rules[idx] = next;
        else rules.push(next);
        this.setRules(rules);
        this.renderRuleList();
        this.hideRuleEditor();
        window.toastr?.success?.('规则已保存');
    }

    deleteRuleEditor() {
        if (!this.editingRuleId) return;
        this.deleteRuleById(this.editingRuleId);
        this.hideRuleEditor();
    }

    showTemplateModal() {
        const { sid, scope } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        if (scope === 'global') {
            window.toastr?.info?.('全局变量暂不支持模板');
            return;
        }
        this.ensureTemplateUI();
        this.renderTemplateList();
        if (this.templateOverlay) this.templateOverlay.style.display = 'block';
    }

    hideTemplateModal() {
        if (this.templateOverlay) this.templateOverlay.style.display = 'none';
    }

    showExportModal() {
        const { sid, vars } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        const schemas = this.listSchemas();
        const rules = this.listRules();
        const payload = {
            version: 1,
            sessionId: sid,
            variables: vars || {},
            schemas: schemas || {},
            rules: Array.isArray(rules) ? rules : [],
        };
        this.ensureDataUI();
        if (this.dataPanel) {
            const title = this.dataPanel.querySelector('#data-title');
            if (title) title.textContent = '导出变量与规则';
        }
        if (this.dataTextarea) {
            this.dataTextarea.value = JSON.stringify(payload, null, 2);
            this.dataTextarea.readOnly = true;
        }
        if (this.dataMergeBtn) this.dataMergeBtn.style.display = 'none';
        if (this.dataOverwriteBtn) this.dataOverwriteBtn.style.display = 'none';
        if (this.dataCopyBtn) this.dataCopyBtn.style.display = 'inline-flex';
        if (this.dataOverlay) this.dataOverlay.style.display = 'block';
    }

    showImportModal() {
        const { sid } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        this.ensureDataUI();
        if (this.dataPanel) {
            const title = this.dataPanel.querySelector('#data-title');
            if (title) title.textContent = '导入变量与规则';
        }
        if (this.dataTextarea) {
            this.dataTextarea.value = '';
            this.dataTextarea.readOnly = false;
        }
        if (this.dataMergeBtn) this.dataMergeBtn.style.display = 'inline-flex';
        if (this.dataOverwriteBtn) this.dataOverwriteBtn.style.display = 'inline-flex';
        if (this.dataCopyBtn) this.dataCopyBtn.style.display = 'inline-flex';
        if (this.dataOverlay) this.dataOverlay.style.display = 'block';
    }

    hideDataModal() {
        if (this.dataOverlay) this.dataOverlay.style.display = 'none';
    }

    async copyDataModal() {
        if (!this.dataTextarea) return;
        const text = String(this.dataTextarea.value || '');
        if (!text) return;
        try {
            await navigator.clipboard?.writeText?.(text);
            window.toastr?.success?.('已复制');
        } catch {
            window.toastr?.warning?.('复制失败');
        }
    }

    async applyImportModal(merge = false) {
        const { sid, scope } = this.getVars();
        if (!sid || !this.dataTextarea) return;
        const raw = String(this.dataTextarea.value || '').trim();
        if (!raw) {
            window.toastr?.warning?.('请输入 JSON');
            return;
        }
        let parsed = null;
        try {
            parsed = JSON.parse(raw);
        } catch (err) {
            window.toastr?.error?.(`JSON 解析失败：${err?.message || err}`);
            return;
        }
        const data = parsed && typeof parsed === 'object' ? parsed : {};
        const nextVars = data.variables && typeof data.variables === 'object' ? data.variables : {};
        const nextSchemas = data.schemas && typeof data.schemas === 'object' ? data.schemas : {};
        const nextRules = Array.isArray(data.rules) ? data.rules : [];

        if (!merge) {
            const ok = await appConfirm({ title: '覆盖导入', message: '将覆盖当前变量/规则，是否继续？', danger: true });
            if (!ok) return;
            this.clearVars();
            if (scope !== 'global') {
                this.clearSchemas();
                this.setRules(nextRules);
            }
        } else {
            const currentSchemas = scope === 'global' ? {} : this.listSchemas();
            const currentVars = this.listVars();
            const currentRules = scope === 'global' ? [] : this.listRules();
            const mergedRules = Array.isArray(currentRules) ? currentRules.slice() : [];
            if (scope !== 'global') {
                nextRules.forEach((rule) => {
                    const id = String(rule?.id || '');
                    if (!id || mergedRules.some(r => String(r?.id || '') === id)) {
                        mergedRules.push({ ...rule, id: `vr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}` });
                    } else {
                        mergedRules.push(rule);
                    }
                });
                this.setRules(mergedRules);
                Object.entries({ ...(currentSchemas || {}), ...(nextSchemas || {}) }).forEach(([key, schema]) => {
                    this.setSchema(key, schema);
                });
            }
            Object.entries({ ...(currentVars || {}), ...(nextVars || {}) }).forEach(([key, value]) => {
                this.setVar(key, value);
            });
        }

        if (!merge) {
            if (scope !== 'global') {
                Object.entries(nextSchemas || {}).forEach(([key, schema]) => {
                    this.setSchema(key, schema);
                });
            }
            Object.entries(nextVars || {}).forEach(([key, value]) => {
                this.setVar(key, value);
            });
        }

        this.renderList();
        this.hideDataModal();
        window.toastr?.success?.('导入完成');
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
                const minText = String(minRaw ?? '').trim();
                const maxText = String(maxRaw ?? '').trim();
                const hasMin = minText.length > 0;
                const hasMax = maxText.length > 0;
                if (hasMin || hasMax) {
                    const min = hasMin ? Number(minText) : null;
                    const max = hasMax ? Number(maxText) : null;
                    schema.range = {
                        min: Number.isFinite(min) ? min : null,
                        max: Number.isFinite(max) ? max : null,
                    };
                }
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

            if (!this.isGlobalScope()) {
                this.setSchema(key, schema);
            }
        } else {
            if (!this.isGlobalScope()) {
                this.deleteSchema(key);
            }
        }

        this.setVar(key, valueRaw);
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
        this.deleteSchema(key);
        this.renderList();
        this.hideSchemaModal();
    }

    resolveScope() {
        const sid = String(this.getSessionId() || '').trim();
        const rawScope = this.getVariableScope ? this.getVariableScope(sid) : 'session';
        const scope = rawScope === 'global' ? 'global' : 'session';
        return { sid, scope };
    }

    isGlobalScope() {
        return this.resolveScope().scope === 'global';
    }

    listVars() {
        const { sid, scope } = this.resolveScope();
        if (scope === 'global') {
            return this.chatStore?.listGlobalVariables?.() || {};
        }
        return sid ? (this.chatStore?.listVariables?.(sid) || {}) : {};
    }

    setVar(key, value) {
        const name = String(key || '').trim();
        if (!name) return false;
        const { sid, scope } = this.resolveScope();
        if (scope === 'global') return this.chatStore?.setGlobalVariable?.(name, value);
        if (!sid) return false;
        return this.chatStore?.setVariable?.(name, value, sid);
    }

    deleteVar(key) {
        const name = String(key || '').trim();
        if (!name) return false;
        const { sid, scope } = this.resolveScope();
        if (scope === 'global') return this.chatStore?.deleteGlobalVariable?.(name);
        if (!sid) return false;
        return this.chatStore?.deleteVariable?.(name, sid);
    }

    clearVars() {
        const { sid, scope } = this.resolveScope();
        if (scope === 'global') return this.chatStore?.clearGlobalVariables?.();
        if (!sid) return false;
        return this.chatStore?.clearVariables?.(sid);
    }

    listSchemas() {
        const { sid, scope } = this.resolveScope();
        if (scope === 'global') return {};
        return sid ? (this.chatStore?.listVariableSchemas?.(sid) || {}) : {};
    }

    setSchema(key, schema) {
        if (this.isGlobalScope()) {
            window.toastr?.info?.('全局变量暂不支持 Schema');
            return false;
        }
        const name = String(key || '').trim();
        if (!name) return false;
        const { sid } = this.resolveScope();
        if (!sid) return false;
        return this.chatStore?.setVariableSchema?.(name, schema, sid);
    }

    deleteSchema(key) {
        if (this.isGlobalScope()) return false;
        const name = String(key || '').trim();
        if (!name) return false;
        const { sid } = this.resolveScope();
        if (!sid) return false;
        return this.chatStore?.deleteVariableSchema?.(name, sid);
    }

    clearSchemas() {
        if (this.isGlobalScope()) return false;
        const { sid } = this.resolveScope();
        if (!sid) return false;
        return this.chatStore?.clearVariableSchemas?.(sid);
    }

    listRules() {
        const { sid, scope } = this.resolveScope();
        if (scope === 'global') return [];
        return sid ? (this.chatStore?.listVariableRules?.(sid) || []) : [];
    }

    setRules(list) {
        if (this.isGlobalScope()) {
            window.toastr?.info?.('全局变量暂不支持规则');
            return false;
        }
        const { sid } = this.resolveScope();
        if (!sid) return false;
        return this.chatStore?.setVariableRules?.(list, sid);
    }

    getVars() {
        const { sid, scope } = this.resolveScope();
        const vars = this.listVars();
        return { sid, vars, scope };
    }

    getSchemas() {
        const { sid, scope } = this.resolveScope();
        const schemas = this.listSchemas();
        return { sid, schemas, scope };
    }

    getSchema(key) {
        const { sid, schemas } = this.getSchemas();
        if (!sid) return null;
        const name = String(key || '').trim();
        if (!name) return null;
        return schemas?.[name] || null;
    }

    getRules() {
        const { sid, scope } = this.resolveScope();
        const rules = this.listRules();
        return { sid, rules: Array.isArray(rules) ? rules : [], scope };
    }

    normalizeRule(rule) {
        const raw = rule && typeof rule === 'object' ? rule : {};
        const trigger = raw.trigger && typeof raw.trigger === 'object' ? raw.trigger : {};
        const action = raw.action && typeof raw.action === 'object' ? raw.action : {};
        return {
            id: String(raw.id || `vr_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`),
            name: String(raw.name || ''),
            enabled: raw.enabled !== false,
            priority: Number.isFinite(Number(raw.priority)) ? Number(raw.priority) : 0,
            trigger: {
                type: String(trigger.type || 'every_turn'),
                n: Number.isFinite(Number(trigger.n)) ? Math.max(1, Math.trunc(Number(trigger.n))) : 1,
                keywords: Array.isArray(trigger.keywords)
                    ? trigger.keywords.map(k => String(k)).filter(Boolean)
                    : (typeof trigger.keywords === 'string' ? trigger.keywords.split(',').map(s => s.trim()).filter(Boolean) : []),
                caseSensitive: Boolean(trigger.caseSensitive),
                expr: String(trigger.expr || ''),
            },
            action: {
                type: String(action.type || 'set_value'),
                target: String(action.target || ''),
                value: action.value,
                prompt: String(action.prompt || ''),
                message: String(action.message || ''),
                style: String(action.style || ''),
                persona: String(action.persona || ''),
                role: String(action.role || ''),
                position: String(action.position || ''),
                mode: String(action.mode || 'delta'),
            },
        };
    }

    parseValue(rawInput) {
        const raw = String(rawInput ?? '').trim();
        if (!raw) return '';
        if (raw === 'true' || raw === 'false') return raw === 'true';
        if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw);
        if (raw.startsWith('{') || raw.startsWith('[')) {
            try {
                return JSON.parse(raw);
            } catch {}
        }
        return raw;
    }

    describeRuleTrigger(rule) {
        const t = rule?.trigger || {};
        const type = String(t.type || 'every_turn');
        if (type === 'every_n_turns') return `每 ${t.n || 1} 轮`;
        if (type === 'keyword') {
            const list = Array.isArray(t.keywords) ? t.keywords.join(', ') : '';
            return list ? `关键词: ${list}` : '关键词触发';
        }
        if (type === 'condition') return `条件: ${t.expr || ''}`.trim();
        if (type === 'manual') return '手动触发';
        return '每轮触发';
    }

    describeRuleAction(rule) {
        const a = rule?.action || {};
        const target = a.target ? String(a.target) : '未设置';
        if (a.type === 'increment') return `递增 ${target} (+${a.value ?? 1})`;
        if (a.type === 'decrement') return `递减 ${target} (-${a.value ?? 1})`;
        if (a.type === 'toggle') return `切换 ${target}`;
        if (a.type === 'push') return `追加 ${target}`;
        if (a.type === 'remove') return `移除 ${target}`;
        if (a.type === 'ai_evaluate') return `AI 评估 ${target}`;
        if (a.type === 'notify') return `通知: ${String(a.message || a.value || '').trim() || '提示'}`;
        if (a.type === 'switch_persona') return `切换角色卡: ${String(a.persona || a.value || '').trim() || '未设置'}`;
        if (a.type === 'inject_prompt') return `注入提示词 (${String(a.role || 'system')})`;
        return `设置 ${target}`;
    }

    renderRuleList() {
        if (!this.ruleList) return;
        const { rules } = this.getRules();
        const list = rules.map(r => this.normalizeRule(r));
        const diagnosticsByRuleId = buildRuleConditionDiagnostics(list);
        this.ruleList.innerHTML = '';
        if (!list.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:16px; color:var(--app-text-muted); text-align:center;';
            empty.textContent = '暂无规则';
            this.ruleList.appendChild(empty);
            return;
        }

        list.forEach(rule => {
            const row = document.createElement('div');
            row.className = 'var-rule-card';
            row.style.cssText = `
                padding:10px 12px;
                border:1px solid rgba(15,23,42,0.08);
                border-radius:12px;
                background:var(--app-surface-card);
                display:flex;
                flex-direction:column;
                gap:6px;
            `;
            const title = document.createElement('div');
            title.style.cssText = 'display:flex; align-items:center; gap:8px;';
            const name = document.createElement('div');
            name.textContent = rule.name || rule.id;
            name.style.cssText = 'font-weight:700; color:var(--app-text-primary); font-size:13px;';
            const diagnostic = diagnosticsByRuleId[rule.id] || null;
            const warning = diagnostic ? document.createElement('span') : null;
            if (warning) {
                warning.textContent = '条件需改写';
                warning.title = diagnostic.error || '';
                warning.style.cssText = 'font-size:11px; color:#b45309; background:#fef3c7; border:1px solid #fcd34d; border-radius:999px; padding:2px 7px;';
            }
            const toggle = document.createElement('label');
            toggle.style.cssText = 'margin-left:auto; font-size:12px; color:var(--app-text-muted);';
            toggle.innerHTML = `<input type="checkbox" ${rule.enabled ? 'checked' : ''} style="margin-right:6px;">启用`;
            toggle.querySelector('input')?.addEventListener('change', (e) => {
                const enabled = e.target.checked;
                const { sid, rules: current } = this.getRules();
                if (!sid) return;
                const next = current.map(item => {
                    if (String(item?.id || '') !== rule.id) return item;
                    return { ...item, enabled };
                });
                this.setRules(next);
                this.renderRuleList();
            });
            title.appendChild(name);
            if (warning) title.appendChild(warning);
            title.appendChild(toggle);

            const summary = document.createElement('div');
            summary.style.cssText = 'font-size:12px; color:var(--app-text-secondary);';
            summary.textContent = `${this.describeRuleTrigger(rule)} → ${this.describeRuleAction(rule)}`;
            if (diagnostic) summary.title = formatUnsupportedExpressionMessage(diagnostic, { prefix: '当前不支持这条条件语法' });

            const warningText = diagnostic ? document.createElement('div') : null;
            if (warningText) {
                warningText.style.cssText = 'font-size:12px; color:#b45309;';
                warningText.textContent = formatUnsupportedExpressionMessage(diagnostic, { prefix: '这条规则的条件需要改写' });
            }

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; gap:8px; flex-wrap:wrap;';
            const editBtn = document.createElement('button');
            editBtn.textContent = '编辑';
            editBtn.style.cssText = 'border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;';
            editBtn.addEventListener('click', () => this.showRuleEditor(rule));
            const delBtn = document.createElement('button');
            delBtn.textContent = '删除';
            delBtn.style.cssText = 'border:1px solid rgba(239,68,68,0.35); background:var(--app-surface-card); color:#b91c1c; border-radius:10px; padding:6px 10px; cursor:pointer;';
            delBtn.addEventListener('click', () => this.deleteRuleById(rule.id));
            actions.appendChild(editBtn);
            actions.appendChild(delBtn);

            if (String(rule.trigger?.type || '') === 'manual') {
                const runBtn = document.createElement('button');
                runBtn.textContent = '运行';
                runBtn.style.cssText = 'border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;';
                runBtn.addEventListener('click', () => this.runRule(rule.id));
                actions.appendChild(runBtn);
            }

            row.appendChild(title);
            row.appendChild(summary);
            if (warningText) row.appendChild(warningText);
            row.appendChild(actions);
            this.ruleList.appendChild(row);
        });
    }

    async deleteRuleById(ruleId) {
        const { sid, rules } = this.getRules();
        if (!sid) return;
        const targetId = String(ruleId || '').trim();
        if (!targetId) return;
        const ok = await appConfirm({ title: '删除规则', message: '确定删除该规则？', danger: true });
        if (!ok) return;
        const next = rules.filter(r => String(r?.id || '') !== targetId);
        this.setRules(next);
        this.renderRuleList();
    }

    runRule(ruleId) {
        const { sid } = this.getRules();
        if (!sid) return;
        if (window.appBridge?.runVariableRules) {
            window.appBridge.runVariableRules(sid, ruleId);
            window.toastr?.info?.('已触发规则');
        }
    }

    renderTemplateList() {
        const wrap = this.templatePanel?.querySelector?.('#tpl-list');
        if (!wrap) return;
        wrap.innerHTML = '';
        const templates = listVariableTemplates();
        const { sid, vars } = this.getVars();
        templates.forEach(tpl => {
            const card = document.createElement('div');
            card.className = 'var-template-card';
            card.style.cssText = 'border:1px solid rgba(15,23,42,0.08); border-radius:12px; padding:10px; background:var(--app-surface-card); display:flex; align-items:center; gap:10px;';
            const meta = document.createElement('div');
            meta.style.cssText = 'flex:1;';
            const count = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
            const desc = tpl.desc ? `${tpl.desc}${count ? ` · ${count} 变量` : ''}` : (count ? `${count} 变量` : '');
            meta.innerHTML = `<div style="font-weight:700; color:var(--app-text-primary);">${tpl.name}</div><div style="font-size:12px; color:var(--app-text-muted); margin-top:4px;">${desc}</div>`;
            const btn = document.createElement('button');
            btn.textContent = '应用';
            btn.style.cssText = 'border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;';
            btn.addEventListener('click', async () => {
                if (!sid) return;
                const keys = Array.isArray(tpl.variables) ? tpl.variables.map(v => String(v?.id || v?.name || '').trim()).filter(Boolean) : [];
                const exists = keys.filter(k => Object.prototype.hasOwnProperty.call(vars || {}, k));
                let overwrite = true;
                if (exists.length) {
                    const ok = await appConfirm({
                        title: '覆盖变量',
                        message: `已存在变量：${exists.join('、')}\n是否覆盖？`,
                        danger: true,
                    });
                    if (!ok) return;
                } else {
                    overwrite = true;
                }
                const res = applyTemplate(this.chatStore, sid, tpl.id, { overwrite });
                if (res?.ok) {
                    this.renderList();
                    window.toastr?.success?.('模板已应用');
                } else {
                    window.toastr?.error?.('模板应用失败');
                }
            });
            card.appendChild(meta);
            card.appendChild(btn);
            wrap.appendChild(card);
        });
    }

    setViewMode(mode) {
        const next = mode === 'tree' ? 'tree' : 'list';
        if (this.viewMode === next) return;
        this.viewMode = next;
        this.updateViewToggle();
        this.renderList();
    }

    updateViewToggle() {
        if (!this.viewButtons) return;
        const { list, tree } = this.viewButtons;
        const applyStyle = (btn, active) => {
            if (!btn) return;
            btn.style.background = active ? 'var(--app-text-primary)' : 'var(--app-surface-card)';
            btn.style.color = active ? 'var(--app-text-inverse)' : 'var(--app-text-primary)';
            btn.style.border = active ? '1px solid var(--app-text-primary)' : '1px solid var(--app-border-default)';
        };
        applyStyle(list, this.viewMode === 'list');
        applyStyle(tree, this.viewMode === 'tree');
    }

    renderTreeList(listEl) {
        const { vars } = this.getVars();
        const term = this.term.trim().toLowerCase();
        const tree = buildVariableTree(vars || {});
        const nodes = getSortedChildren(tree);

        listEl.innerHTML = '';
        if (!nodes.length) {
            const empty = document.createElement('div');
            empty.style.cssText = 'padding:18px 10px; color:var(--app-text-muted); text-align:center;';
            empty.textContent = this.getVars().sid ? '暂无变量' : '未选择会话';
            listEl.appendChild(empty);
            return;
        }

        const fragment = document.createDocumentFragment();
        nodes.forEach((node) => {
            const nodeEl = renderTreeNode(node, term, 0);
            if (nodeEl) fragment.appendChild(nodeEl);
        });
        listEl.appendChild(fragment);
    }

    renderList() {
        this.renderCards();
        const listEl = this.panel?.querySelector?.('#var-list');
        if (!listEl) return;
        if (this.viewMode === 'tree') {
            this.renderTreeList(listEl);
            return;
        }
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
            empty.style.cssText = 'padding:18px 10px; color:var(--app-text-muted); text-align:center;';
            empty.textContent = this.getVars().sid ? '暂无变量' : '未选择会话';
            listEl.appendChild(empty);
            return;
        }

        entries.forEach(({ k, v }) => {
            const row = document.createElement('div');
            row.className = 'var-row-card';
            row.style.cssText = `
                padding:10px 10px;
                border: 1px solid rgba(0,0,0,0.06);
                border-radius: 12px;
                margin-bottom: 8px;
                background: var(--app-surface-card);
            `;
            const schema = this.getSchema(k);
            const typeLabel = schema?.type ? String(schema.type) : '';
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="flex:1; min-width:0;">
                        <div style="display:flex; align-items:center; gap:6px; font-weight:900; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            <span>${k}</span>
                            ${typeLabel ? `<span style="font-size:10px; padding:2px 6px; border-radius:999px; background:rgba(14,165,233,0.12); color:#0369a1;">${typeLabel}</span>` : ''}
                        </div>
                        <div style="color:var(--app-text-muted); font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${v || '（空）'}</div>
                    </div>
                    <button class="var-schema" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;">配置</button>
                    <button class="var-edit" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;">编辑</button>
                    <button class="var-del" style="border:1px solid rgba(239,68,68,0.35); background:var(--app-surface-card); color:#b91c1c; border-radius:10px; padding:6px 10px; cursor:pointer;">删除</button>
                </div>
                <div style="margin-top:8px; font-size:12px; color:var(--app-text-secondary);">
                    <code class="variable-panel-inline-code" style="padding:2px 6px; border-radius:4px;">{{getvar::${k}}}</code>
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
                card.className = 'var-summary-card';
                card.style.cssText = 'flex:1 1 140px; min-width:120px; padding:10px; border-radius:12px; border:1px solid rgba(15,23,42,0.08); background:var(--app-surface-card);';
                card.innerHTML = `
                    <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:6px;">${label}</div>
                    <div style="font-size:14px; font-weight:700; color:var(--app-text-primary); margin-bottom:6px;">${rendered || clamped}</div>
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
            card.className = 'var-summary-card';
            card.style.cssText = 'flex:1 1 140px; min-width:120px; padding:10px; border-radius:12px; border:1px solid rgba(15,23,42,0.08); background:var(--app-surface-card);';
            card.innerHTML = `
                <div style="font-size:12px; color:var(--app-text-muted);">${label}</div>
                <div style="font-size:14px; font-weight:700; color:var(--app-text-primary); margin-top:4px;">${rendered || '-'}</div>
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
        this.deleteVar(String(key).trim());
        this.deleteSchema(String(key).trim());
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
        this.clearVars();
        this.renderList();
    }

    promptSchema(key) {
        this.showSchemaModal({ key, value: this.getVars().vars?.[key], schema: this.getSchema(key), mode: 'edit' });
    }

    promptRulesJson() {
        const { sid, scope } = this.getVars();
        if (!sid) {
            window.toastr?.warning?.('请先进入聊天室');
            return;
        }
        if (scope === 'global') {
            window.toastr?.info?.('全局变量暂不支持规则');
            return;
        }
        const current = this.listRules();
        const draft = JSON.stringify(current, null, 2);
        const input = prompt('编辑规则 JSON（数组）', draft);
        if (input === null) return;
        try {
            const parsed = JSON.parse(input || '[]');
            if (!Array.isArray(parsed)) throw new Error('必须是数组');
            this.setRules(parsed);
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

    showMoreMenu(anchor) {
        // 如果菜单已存在，则关闭并返回
        const existing = document.querySelector('.var-more-menu');
        if (existing) {
            this.closeMoreMenu();
            return;
        }
        const menu = document.createElement('div');
        menu.className = 'var-more-menu';
        menu.style.cssText = `
            position: absolute;
            background: var(--app-surface-card);
            border: 1px solid rgba(15,23,42,0.1);
            border-radius: 12px;
            box-shadow: 0 8px 24px rgba(15,23,42,0.15);
            padding: 6px;
            z-index: 25000;
            min-width: 140px;
        `;

        const menuItems = [
            { icon: '📤', label: '导出', action: () => this.showExportModal() },
            { icon: '📥', label: '导入', action: () => this.showImportModal() },
            { icon: '▶️', label: '运行规则', action: () => this.runRules() },
            { icon: '🗑️', label: '清空全部', danger: true, action: () => this.clearAll() },
        ];

        menuItems.forEach(({ icon, label, danger, action }) => {
            const btn = document.createElement('button');
            btn.style.cssText = `
                display: flex;
                align-items: center;
                gap: 10px;
                width: 100%;
                padding: 10px 12px;
                border: none;
                background: transparent;
                border-radius: 8px;
                cursor: pointer;
                font-size: 13px;
                text-align: left;
                color: ${danger ? '#ef4444' : 'var(--app-text-secondary)'};
            `;
            btn.innerHTML = `<span style="font-size:14px;">${icon}</span><span>${label}</span>`;
            btn.addEventListener('mouseenter', () => btn.style.background = danger ? 'rgba(239,68,68,0.08)' : 'var(--app-surface-hover)');
            btn.addEventListener('mouseleave', () => btn.style.background = 'transparent');
            btn.addEventListener('click', () => {
                this.closeMoreMenu();
                action();
            });
            menu.appendChild(btn);
        });

        // 定位到按钮下方
        const rect = anchor.getBoundingClientRect();
        menu.style.top = `${rect.bottom + 4}px`;
        menu.style.left = `${rect.left}px`;
        document.body.appendChild(menu);

        // 点击外部关闭
        const closeMenu = (e) => {
            if (!menu.contains(e.target) && e.target !== anchor) {
                this.closeMoreMenu();
            }
        };
        this.moreMenuCloseHandler = closeMenu;
        setTimeout(() => {
            if (this.moreMenuCloseHandler !== closeMenu) return;
            if (!document.body.contains(menu)) return;
            document.addEventListener('pointerdown', closeMenu, true);
        }, 0);
    }
}
