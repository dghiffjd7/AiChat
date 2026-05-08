import {
    buildWorldVariableRecords,
    createWorldVariableInStore,
    deleteWorldVariableDraft,
    isWorldVariableEditableType,
    normalizeWorldVariableType,
    resolveWorldVariableSessionContext,
    saveWorldVariableDraft,
} from './world-variable-session-utils.js';

const WORLD_CONDITION_VARIABLE_HINT = '世界书条件当前只支持数字、文本、布尔；若要与另一个变量比较，请在节点模式把变量节点连到比较节点右侧。';
const WORLD_CONDITION_COMPLEX_HINT = '复杂类型变量当前仅支持查看，不能直接用于世界书条件；请到变量面板编辑。';

export function getSessionVariableRecordsImpl(options = {}) {
    const opts = typeof options === 'string' ? { searchTerm: options } : (options && typeof options === 'object' ? options : {});
    const recentIds = Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [];
    const session = resolveWorldVariableSessionContext();
    return buildWorldVariableRecords({
        ...session,
        searchTerm: opts.searchTerm,
        scope: opts.scope,
        recentIds,
    });
}

export function setVariableBrowserScopeImpl(scope = 'current') {
    const nextScope = ['current', 'global', 'session', 'recent'].includes(String(scope || '').trim().toLowerCase())
        ? String(scope || '').trim().toLowerCase()
        : 'current';
    this.variableBrowserState.scope = nextScope;
    this.renderVariableBrowser();
}

export function rememberRecentVariableImpl(record = null, deps = {}) {
    const { saveRecentVariableNames } = deps;
    const item = record && typeof record === 'object' ? record : null;
    const id = String(item?.id || '').trim();
    const fallbackName = String(item?.name || '').trim();
    const marker = id || fallbackName;
    if (!marker) return;
    const current = Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [];
    const next = [marker, ...current.filter(entry => entry !== marker && entry !== fallbackName && !id.endsWith(`:${entry}`))].slice(0, 24);
    this.variableBrowserState.recentIds = next;
    saveRecentVariableNames(next);
}

export function deleteVariableBrowserDraftImpl(deps = {}) {
    const { saveRecentVariableNames } = deps;
    const draft = this.variableBrowserState.draft;
    if (!draft?.name) return false;
    const session = resolveWorldVariableSessionContext();
    if (!deleteWorldVariableDraft({ ...session, draft })) return false;
    const nextRecent = (Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [])
        .filter(entry => entry !== draft.id && entry !== draft.name);
    this.variableBrowserState.recentIds = nextRecent;
    saveRecentVariableNames(nextRecent);
    this.variableBrowserState.selectedId = '';
    this.variableBrowserState.draft = null;
    this.renderVariableBrowser();
    window.toastr?.success?.('变量已删除');
    return true;
}

export function formatVariableBrowserValueImpl(value, type = 'string') {
    if (value === undefined) return '未设置';
    if (value === null) return 'null';
    const normalizedType = String(type || 'string').trim().toLowerCase();
    if (normalizedType === 'boolean') return value ? 'true' : 'false';
    if (normalizedType === 'array' || normalizedType === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '[object]';
        }
    }
    return String(value);
}

export function buildVariableBrowserDraftImpl(record = null) {
    const item = record && typeof record === 'object' ? record : {};
    const type = normalizeWorldVariableType(item.type || item.schema?.type || 'string', item.currentValue);
    const isEditableType = isWorldVariableEditableType(type);
    const isGlobal = item.source === 'global';
    return {
        id: String(item.id || `${item.source || 'session'}:${item.name || ''}`).trim(),
        name: String(item.name || '').trim(),
        type,
        currentValueText: this.formatVariableBrowserValue(item.currentValue, type),
        defaultValueText: this.formatVariableBrowserValue(item.defaultValue, type),
        initialValueText: this.formatVariableBrowserValue(item.initialValue, type),
        defaultValueRaw: item.defaultValue,
        source: isGlobal ? 'global' : 'session',
        isEditableType,
        canEditCurrentValue: isEditableType,
        canEditSchema: !isGlobal && isEditableType,
        canEditInitialValue: !isGlobal && isEditableType,
        canUseInWorldEditor: isEditableType,
    };
}

export function buildVariableBrowserSelectionPayloadImpl(draft = null, deps = {}) {
    const { parseTypedValue } = deps;
    const name = String(draft?.name || '').trim();
    if (!name || !draft?.canUseInWorldEditor) return null;
    const type = isWorldVariableEditableType(draft?.type)
        ? String(draft.type).trim().toLowerCase()
        : 'string';
    const rawDefault = Object.prototype.hasOwnProperty.call(draft || {}, 'defaultValueRaw')
        ? draft.defaultValueRaw
        : undefined;
    const defaultSource = rawDefault === undefined
        ? ''
        : rawDefault;
    return {
        name,
        type,
        defaultValue: parseTypedValue(defaultSource, type),
    };
}

export function createVariableBrowserModalImpl(deps = {}) {
    const {
        BLOCK_RIGHT_TYPE_OPTIONS = [],
        parseTypedValue,
        escapeHtml,
    } = deps;
    if (this.variableBrowserModal) return;
    this.variableBrowserOverlay = document.createElement('div');
    this.variableBrowserOverlay.className = 'world-var-browser-overlay';
    this.variableBrowserOverlay.style.display = 'none';
    this.variableBrowserOverlay.addEventListener('click', () => this.closeVariableBrowser(null));

    this.variableBrowserModal = document.createElement('div');
    this.variableBrowserModal.className = 'world-var-browser-modal';
    this.variableBrowserModal.style.display = 'none';
    this.variableBrowserModal.innerHTML = `
        <div class="world-var-browser-header">
            <div>
                <div class="world-var-browser-title">变量浏览器</div>
                <div class="world-var-browser-subtitle">搜索、查看并管理当前会话可用变量。</div>
            </div>
            <button type="button" class="world-var-browser-close" aria-label="关闭">×</button>
        </div>
        <div class="world-var-browser-toolbar">
            <input id="world-var-browser-search" class="world-var-browser-search" type="text" placeholder="搜索变量名 / 类型">
            <button type="button" class="world-var-btn ghost" id="world-var-browser-create">新建变量</button>
        </div>
        <div class="world-var-browser-body">
            <div class="world-var-browser-list-wrap">
                <div class="world-var-browser-scope" id="world-var-browser-scope">
                    <button type="button" class="world-var-browser-scope-btn is-active" data-scope="current">当前</button>
                    <button type="button" class="world-var-browser-scope-btn" data-scope="session">会话</button>
                    <button type="button" class="world-var-browser-scope-btn" data-scope="global">全局</button>
                    <button type="button" class="world-var-browser-scope-btn" data-scope="recent">最近</button>
                </div>
                <div class="world-var-browser-list" id="world-var-browser-list"></div>
                <div class="world-var-browser-empty" id="world-var-browser-empty">当前没有可用变量。</div>
            </div>
            <div class="world-var-browser-detail">
                <div class="world-var-browser-detail-head">
                    <div>
                        <div class="world-var-browser-detail-name" id="world-var-browser-name">未选择变量</div>
                        <div class="world-var-browser-detail-source" id="world-var-browser-source"></div>
                    </div>
                </div>
                <div class="world-var-browser-fields">
                    <div class="world-var-field">
                        <label class="world-var-label">变量类型</label>
                        <button type="button" class="world-app-select-btn" id="world-var-browser-type-btn">
                            <span>字符串</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>
                    <div class="world-var-field">
                        <label class="world-var-label" for="world-var-browser-current">当前值</label>
                        <input id="world-var-browser-current" class="world-var-input" type="text" value="" placeholder="当前值">
                    </div>
                    <div class="world-var-field">
                        <label class="world-var-label" for="world-var-browser-default">默认值</label>
                        <input id="world-var-browser-default" class="world-var-input" type="text" value="" placeholder="默认值">
                    </div>
                    <div class="world-var-field">
                        <label class="world-var-label" for="world-var-browser-initial">初始值</label>
                        <input id="world-var-browser-initial" class="world-var-input" type="text" value="" placeholder="初始值">
                    </div>
                </div>
                <div id="world-var-browser-hint" style="font-size:12px; line-height:1.5; color:var(--app-text-muted);">
                    ${WORLD_CONDITION_VARIABLE_HINT}
                </div>
                <div class="world-var-browser-actions">
                    <button type="button" class="world-var-btn danger ghost" id="world-var-browser-delete">删除变量</button>
                    <button type="button" class="world-var-btn ghost" id="world-var-browser-save">保存更改</button>
                    <button type="button" class="world-var-btn primary" id="world-var-browser-use">选中变量</button>
                </div>
            </div>
        </div>
    `;
    this.variableBrowserModal.addEventListener('click', (event) => event.stopPropagation());

    this.variableBrowserSearchEl = this.variableBrowserModal.querySelector('#world-var-browser-search');
    this.variableBrowserListEl = this.variableBrowserModal.querySelector('#world-var-browser-list');
    this.variableBrowserEmptyEl = this.variableBrowserModal.querySelector('#world-var-browser-empty');
    this.variableBrowserScopeEl = this.variableBrowserModal.querySelector('#world-var-browser-scope');
    this.variableBrowserNameEl = this.variableBrowserModal.querySelector('#world-var-browser-name');
    this.variableBrowserSourceEl = this.variableBrowserModal.querySelector('#world-var-browser-source');
    this.variableBrowserTypeBtn = this.variableBrowserModal.querySelector('#world-var-browser-type-btn');
    this.variableBrowserCurrentEl = this.variableBrowserModal.querySelector('#world-var-browser-current');
    this.variableBrowserDefaultEl = this.variableBrowserModal.querySelector('#world-var-browser-default');
    this.variableBrowserInitialEl = this.variableBrowserModal.querySelector('#world-var-browser-initial');
    this.variableBrowserHintEl = this.variableBrowserModal.querySelector('#world-var-browser-hint');
    this.variableBrowserDeleteBtn = this.variableBrowserModal.querySelector('#world-var-browser-delete');
    this.variableBrowserSaveBtn = this.variableBrowserModal.querySelector('#world-var-browser-save');
    this.variableBrowserUseBtn = this.variableBrowserModal.querySelector('#world-var-browser-use');

    this.variableBrowserModal.querySelector('.world-var-browser-close')?.addEventListener('click', () => this.closeVariableBrowser(null));
    this.variableBrowserScopeEl?.querySelectorAll('.world-var-browser-scope-btn').forEach((btn) => {
        btn.addEventListener('click', () => this.setVariableBrowserScope(btn.dataset.scope || 'current'));
    });
    this.variableBrowserModal.querySelector('#world-var-browser-create')?.addEventListener('click', () => {
        const selectedId = String(this.variableBrowserState.selectedId || '').trim();
        const selected = this.getSessionVariableRecords({ scope: this.variableBrowserState.scope }).find(item => item.id === selectedId) || null;
        void this.openVariableModal(selected ? {
            name: selected.name,
            type: selected.type,
            defaultValue: selected.defaultValue,
        } : {}).then((payload) => {
            if (!payload) return;
            const targetSource = ['global', 'session'].includes(String(this.variableBrowserState.scope || '').trim())
                ? String(this.variableBrowserState.scope).trim()
                : null;
            const session = resolveWorldVariableSessionContext();
            if (!createWorldVariableInStore({ ...session, payload, source: targetSource })) return;
            const key = String(payload.name || '').trim();
            const nextSource = targetSource || this.getSessionVariableRecords({ scope: 'current' }).find(item => item.name === key)?.source || 'session';
            this.variableBrowserState.selectedId = `${nextSource}:${key}`;
            this.renderVariableBrowser();
        });
    });
    this.variableBrowserSearchEl?.addEventListener('input', () => {
        this.variableBrowserState.search = String(this.variableBrowserSearchEl.value || '');
        this.renderVariableBrowser();
    });
    this.variableBrowserTypeBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        const draft = this.variableBrowserState.draft;
        if (!draft?.name) return;
        this.openCustomSelectMenu({
            anchorEl: this.variableBrowserTypeBtn,
            options: BLOCK_RIGHT_TYPE_OPTIONS.filter(opt => ['number', 'string', 'boolean'].includes(String(opt.value || ''))),
            currentValue: draft.type,
            onSelect: (value) => {
                const nextType = ['number', 'string', 'boolean'].includes(String(value || '').trim().toLowerCase())
                    ? String(value).trim().toLowerCase()
                    : 'string';
                draft.type = nextType;
                this.renderVariableBrowserDetail();
            },
        });
    });
    this.variableBrowserModal.querySelector('#world-var-browser-save')?.addEventListener('click', () => {
        this.saveVariableBrowserDraft();
    });
    this.variableBrowserDeleteBtn?.addEventListener('click', () => {
        const draft = this.variableBrowserState.draft;
        if (!draft?.name) {
            window.toastr?.warning?.('请先选择一个变量');
            return;
        }
        const confirmed = window.confirm(
            draft.source === 'global'
                ? `删除全局变量「${draft.name}」？这只会移除当前全局值。`
                : `删除变量「${draft.name}」？这会同时移除当前会话值、初始值和本会话变量定义。`,
        );
        if (!confirmed) return;
        this.deleteVariableBrowserDraft();
    });
    this.variableBrowserModal.querySelector('#world-var-browser-use')?.addEventListener('click', () => {
        const draft = this.variableBrowserState.draft;
        if (!String(draft?.name || '').trim()) {
            window.toastr?.warning?.('请先选择一个变量');
            return;
        }
        if (!draft.canUseInWorldEditor) {
            window.toastr?.warning?.('复杂类型变量当前仅支持查看，不能直接用于世界书条件。');
            return;
        }
        const payload = buildVariableBrowserSelectionPayloadImpl(draft, { parseTypedValue });
        if (!payload) return;
        this.rememberRecentVariable(draft);
        this.closeVariableBrowser({ payload });
    });

    document.body.appendChild(this.variableBrowserOverlay);
    document.body.appendChild(this.variableBrowserModal);
}

export function renderVariableBrowserDetailImpl(deps = {}) {
    const { BLOCK_RIGHT_TYPE_OPTIONS = [] } = deps;
    if (!this.variableBrowserModal) return;
    const draft = this.variableBrowserState.draft;
    if (!draft || !draft.name) {
        if (this.variableBrowserNameEl) this.variableBrowserNameEl.textContent = '未选择变量';
        if (this.variableBrowserSourceEl) this.variableBrowserSourceEl.textContent = '';
    if (this.variableBrowserCurrentEl) this.variableBrowserCurrentEl.value = '';
    if (this.variableBrowserDefaultEl) this.variableBrowserDefaultEl.value = '';
    if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.value = '';
    if (this.variableBrowserCurrentEl) this.variableBrowserCurrentEl.disabled = true;
    if (this.variableBrowserDefaultEl) this.variableBrowserDefaultEl.disabled = true;
    if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.disabled = true;
    if (this.variableBrowserDeleteBtn) this.variableBrowserDeleteBtn.disabled = true;
    if (this.variableBrowserSaveBtn) this.variableBrowserSaveBtn.disabled = true;
    if (this.variableBrowserUseBtn) this.variableBrowserUseBtn.disabled = true;
    if (this.variableBrowserHintEl) this.variableBrowserHintEl.textContent = WORLD_CONDITION_VARIABLE_HINT;
    if (this.variableBrowserTypeBtn) {
        const labelEl = this.variableBrowserTypeBtn.querySelector('span');
        if (labelEl) labelEl.textContent = '字符串';
        this.variableBrowserTypeBtn.disabled = true;
    }
    return;
}
    if (this.variableBrowserNameEl) this.variableBrowserNameEl.textContent = draft.name;
    if (this.variableBrowserSourceEl) {
        let sourceText = draft.source === 'global' ? '当前来源：全局变量' : '当前来源：会话变量';
        if (!draft.isEditableType) sourceText += '（复杂类型当前只读，请到变量面板编辑）';
        else if (draft.source === 'global') sourceText += '（这里只修改当前值，不维护默认值/初始值）';
        this.variableBrowserSourceEl.textContent = sourceText;
    }
    if (this.variableBrowserCurrentEl) this.variableBrowserCurrentEl.value = draft.currentValueText;
    if (this.variableBrowserDefaultEl) this.variableBrowserDefaultEl.value = draft.defaultValueText;
    if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.value = draft.initialValueText;
    if (this.variableBrowserCurrentEl) this.variableBrowserCurrentEl.disabled = !draft.canEditCurrentValue;
    if (this.variableBrowserDefaultEl) this.variableBrowserDefaultEl.disabled = !draft.canEditSchema;
    if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.disabled = !draft.canEditInitialValue;
    if (this.variableBrowserDeleteBtn) this.variableBrowserDeleteBtn.disabled = false;
    if (this.variableBrowserSaveBtn) this.variableBrowserSaveBtn.disabled = !(draft.canEditCurrentValue || draft.canEditSchema || draft.canEditInitialValue);
    if (this.variableBrowserUseBtn) this.variableBrowserUseBtn.disabled = !draft.canUseInWorldEditor;
    if (this.variableBrowserTypeBtn) {
        const labelEl = this.variableBrowserTypeBtn.querySelector('span');
        if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, draft.type, '字符串');
        this.variableBrowserTypeBtn.disabled = !draft.canEditSchema;
    }
    if (this.variableBrowserHintEl) {
        this.variableBrowserHintEl.textContent = draft.isEditableType
            ? WORLD_CONDITION_VARIABLE_HINT
            : WORLD_CONDITION_COMPLEX_HINT;
    }
}

export function renderVariableBrowserImpl(deps = {}) {
    const { BLOCK_RIGHT_TYPE_OPTIONS = [], escapeHtml } = deps;
    if (!this.variableBrowserModal || !this.variableBrowserListEl || !this.variableBrowserEmptyEl) return;
    const scope = String(this.variableBrowserState.scope || 'current').trim().toLowerCase();
    const records = this.getSessionVariableRecords({ searchTerm: this.variableBrowserState.search, scope });
    const currentSelected = String(this.variableBrowserState.selectedId || '').trim();
    const selected = records.find(item => item.id === currentSelected) || records[0] || null;
    this.variableBrowserState.selectedId = String(selected?.id || '').trim();
    this.variableBrowserState.draft = selected ? this.buildVariableBrowserDraft(selected) : null;
    this.variableBrowserScopeEl?.querySelectorAll('.world-var-browser-scope-btn').forEach((btn) => {
        btn.classList.toggle('is-active', String(btn.dataset.scope || '').trim() === scope);
    });
    this.variableBrowserListEl.innerHTML = records.map((item) => {
        const active = item.id === this.variableBrowserState.selectedId;
        const isRecent = (Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [])
            .some(entry => entry === item.id || entry === item.name);
        return `
            <button type="button" class="world-var-browser-item ${active ? 'is-active' : ''}" data-id="${escapeHtml(item.id)}">
                <div class="world-var-browser-item-top">
                    <span class="world-var-browser-item-name">${escapeHtml(item.name)}</span>
                    <span class="world-var-browser-item-badges">
                        <span class="world-var-browser-item-badge ${item.source === 'global' ? '' : 'subtle'}">${item.source === 'global' ? '全局' : '会话'}</span>
                        ${isRecent ? '<span class="world-var-browser-item-badge recent">最近</span>' : ''}
                    </span>
                </div>
                <div class="world-var-browser-item-meta">
                    <span>${escapeHtml(this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, item.type, item.type || '字符串'))}</span>
                    <span>当前值：${escapeHtml(this.formatVariableBrowserValue(item.currentValue, item.type))}</span>
                </div>
            </button>
        `;
    }).join('');
    this.variableBrowserEmptyEl.style.display = records.length ? 'none' : 'block';
    this.variableBrowserListEl.querySelectorAll('.world-var-browser-item').forEach((btn) => {
        btn.addEventListener('click', () => {
            this.variableBrowserState.selectedId = String(btn.dataset.id || '').trim();
            this.renderVariableBrowser();
        });
    });
    this.renderVariableBrowserDetail();
}

export function saveVariableBrowserDraftImpl(deps = {}) {
    const { parseTypedValue } = deps;
    const draft = this.variableBrowserState.draft;
    if (!draft?.name) return false;
    if (!isWorldVariableEditableType(draft.type)) {
        window.toastr?.warning?.('复杂类型变量当前仅支持查看，请到变量面板中编辑。');
        return false;
    }
    const session = resolveWorldVariableSessionContext();
    const saved = saveWorldVariableDraft({
        ...session,
        draft,
        currentValueText: String(this.variableBrowserCurrentEl?.value || ''),
        defaultValueText: String(this.variableBrowserDefaultEl?.value || ''),
        initialValueText: String(this.variableBrowserInitialEl?.value || ''),
        parseTypedValue,
    });
    if (!saved) return false;
    this.renderVariableBrowser();
    window.toastr?.success?.('变量已更新');
    return true;
}

export function openVariableBrowserImpl({ initialName = '' } = {}) {
    if (!this.variableBrowserModal) this.createVariableBrowserModal();
    if (!this.variableBrowserOverlay || !this.variableBrowserModal) return Promise.resolve(null);
    this.variableBrowserState.search = '';
    this.variableBrowserState.scope = 'current';
    this.variableBrowserState.selectedId = '';
    this.variableBrowserState.draft = null;
    if (this.variableBrowserSearchEl) this.variableBrowserSearchEl.value = '';
    const initial = String(initialName || '').trim();
    if (initial) {
        const currentRecords = this.getSessionVariableRecords({ scope: 'current' });
        const matched = currentRecords.find(item => item.name === initial) || this.getSessionVariableRecords({ scope: 'session' }).find(item => item.name === initial) || this.getSessionVariableRecords({ scope: 'global' }).find(item => item.name === initial) || null;
        this.variableBrowserState.selectedId = String(matched?.id || '').trim();
    }
    this.renderVariableBrowser();
    this.variableBrowserOverlay.style.display = 'block';
    this.variableBrowserModal.style.display = 'flex';
    queueMicrotask(() => {
        this.variableBrowserSearchEl?.focus();
        this.variableBrowserSearchEl?.select?.();
    });
    if (this.variableBrowserKeyHandler) {
        document.removeEventListener('keydown', this.variableBrowserKeyHandler);
    }
    this.variableBrowserKeyHandler = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeVariableBrowser(null);
        }
    };
    document.addEventListener('keydown', this.variableBrowserKeyHandler);
    return new Promise((resolve) => {
        this.variableBrowserResolve = resolve;
    });
}

export function closeVariableBrowserImpl(value = null) {
    this.closeCustomSelectMenu();
    if (this.variableBrowserOverlay) this.variableBrowserOverlay.style.display = 'none';
    if (this.variableBrowserModal) this.variableBrowserModal.style.display = 'none';
    if (this.variableBrowserKeyHandler) {
        document.removeEventListener('keydown', this.variableBrowserKeyHandler);
        this.variableBrowserKeyHandler = null;
    }
    if (this.variableBrowserResolve) {
        const resolve = this.variableBrowserResolve;
        this.variableBrowserResolve = null;
        resolve(value);
    }
}
