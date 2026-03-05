export function getSessionVariableRecordsImpl(options = {}) {
    const opts = typeof options === 'string' ? { searchTerm: options } : (options && typeof options === 'object' ? options : {});
    const searchTerm = String(opts.searchTerm || '');
    const scope = String(opts.scope || 'current').trim().toLowerCase();
    const bridge = window.appBridge;
    const chatStore = bridge?.chatStore;
    const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
    if (!chatStore || !sid) return [];
    const useGlobal = Boolean(typeof bridge?.isSharedVariableSession === 'function' && bridge.isSharedVariableSession(sid));
    const localVars = chatStore?.listVariables?.(sid) || {};
    const globalVars = chatStore?.listGlobalVariables?.() || {};
    const initialVars = chatStore?.listInitialVariables?.(sid) || {};
    const schemas = chatStore?.listVariableSchemas?.(sid) || {};
    const query = String(searchTerm || '').trim().toLowerCase();
    const recentIds = Array.isArray(this.variableBrowserState?.recentIds) ? this.variableBrowserState.recentIds : [];
    const getRecentIndex = (item) => {
        const idIndex = recentIds.indexOf(item.id);
        if (idIndex >= 0) return idIndex;
        return recentIds.indexOf(item.name);
    };
    const isRecentRecord = (item) => getRecentIndex(item) >= 0;
    const buildRecords = (sourceName, sourceVars = {}, includeInitial = false) => {
        const keys = new Set([
            ...Object.keys(sourceVars || {}),
            ...Object.keys(schemas || {}),
            ...(includeInitial ? Object.keys(initialVars || {}) : []),
        ].map(key => String(key || '').trim()).filter(Boolean));
        return [...keys].map((key) => {
            const schema = schemas[key] || null;
            const fallbackType = typeof sourceVars[key];
            const type = String(schema?.type || fallbackType || 'string').trim().toLowerCase();
            return {
                id: `${sourceName}:${key}`,
                name: key,
                type: ['number', 'string', 'boolean', 'enum', 'array', 'object'].includes(type) ? type : 'string',
                source: sourceName,
                currentValue: sourceVars[key],
                defaultValue: schema?.default,
                initialValue: includeInitial ? initialVars[key] : undefined,
                schema,
            };
        });
    };
    const sessionRecords = buildRecords('session', localVars, true);
    const globalRecords = buildRecords('global', globalVars, false);
    let records = [];
    if (scope === 'global') records = globalRecords;
    else if (scope === 'session') records = sessionRecords;
    else if (scope === 'recent') records = [...sessionRecords, ...globalRecords].filter(isRecentRecord);
    else records = useGlobal ? globalRecords : sessionRecords;
    records = records.filter((item) => {
        if (!query) return true;
        const haystack = [
            item.name,
            item.type,
            item.source === 'global' ? '全局' : '会话',
        ].join(' ').toLowerCase();
        return haystack.includes(query);
    });
    records.sort((a, b) => {
        const recentDelta = getRecentIndex(a) - getRecentIndex(b);
        const aRecent = isRecentRecord(a);
        const bRecent = isRecentRecord(b);
        if (aRecent && bRecent && recentDelta !== 0) return recentDelta;
        if (aRecent !== bRecent) return aRecent ? -1 : 1;
        const nameDelta = a.name.localeCompare(b.name, 'zh-CN');
        if (nameDelta !== 0) return nameDelta;
        return a.source.localeCompare(b.source, 'zh-CN');
    });
    return records.map((item) => {
        const schema = item.schema || null;
        const type = String(item.type || schema?.type || 'string').trim().toLowerCase();
        return {
            ...item,
            type: ['number', 'string', 'boolean', 'enum', 'array', 'object'].includes(type) ? type : 'string',
        };
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
    const bridge = window.appBridge;
    const chatStore = bridge?.chatStore;
    const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
    if (!chatStore || !sid) return false;
    if (draft.source === 'global') {
        chatStore.deleteGlobalVariable?.(draft.name);
    } else {
        chatStore.deleteVariable?.(draft.name, sid);
        chatStore.deleteInitialVariable?.(draft.name, sid);
    }
    chatStore.deleteVariableSchema?.(draft.name, sid);
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
    const typeRaw = String(item.type || item.schema?.type || 'string').trim().toLowerCase();
    const type = ['number', 'string', 'boolean', 'enum', 'array', 'object'].includes(typeRaw) ? typeRaw : 'string';
    return {
        id: String(item.id || `${item.source || 'session'}:${item.name || ''}`).trim(),
        name: String(item.name || '').trim(),
        type,
        currentValueText: this.formatVariableBrowserValue(item.currentValue, type),
        defaultValueText: this.formatVariableBrowserValue(item.defaultValue, type),
        initialValueText: this.formatVariableBrowserValue(item.initialValue, type),
        source: item.source === 'global' ? 'global' : 'session',
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
    this.variableBrowserDeleteBtn = this.variableBrowserModal.querySelector('#world-var-browser-delete');

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
            this.ensureVariableInStore(payload.name, payload.type, payload.defaultValue, { source: targetSource });
            const nextSource = targetSource || this.getSessionVariableRecords({ scope: 'current' }).find(item => item.name === payload.name)?.source || 'session';
            this.variableBrowserState.selectedId = `${nextSource}:${String(payload.name || '').trim()}`;
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
        const confirmed = window.confirm(`删除变量「${draft.name}」？这会同时移除当前来源中的值与本会话的变量定义。`);
        if (!confirmed) return;
        this.deleteVariableBrowserDraft();
    });
    this.variableBrowserModal.querySelector('#world-var-browser-use')?.addEventListener('click', () => {
        const draft = this.variableBrowserState.draft;
        const name = String(draft?.name || '').trim();
        if (!name) {
            window.toastr?.warning?.('请先选择一个变量');
            return;
        }
        const type = ['number', 'string', 'boolean'].includes(String(draft?.type || '').trim().toLowerCase())
            ? String(draft.type).trim().toLowerCase()
            : 'string';
        this.rememberRecentVariable(draft);
        this.closeVariableBrowser({
            name,
            type,
            defaultValue: parseTypedValue(String(draft?.defaultValueText || ''), type),
        });
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
        if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.disabled = false;
        if (this.variableBrowserDeleteBtn) this.variableBrowserDeleteBtn.disabled = true;
        if (this.variableBrowserTypeBtn) {
            const labelEl = this.variableBrowserTypeBtn.querySelector('span');
            if (labelEl) labelEl.textContent = '字符串';
        }
        return;
    }
    if (this.variableBrowserNameEl) this.variableBrowserNameEl.textContent = draft.name;
    if (this.variableBrowserSourceEl) this.variableBrowserSourceEl.textContent = draft.source === 'global' ? '当前来源：全局变量' : '当前来源：会话变量';
    if (this.variableBrowserCurrentEl) this.variableBrowserCurrentEl.value = draft.currentValueText;
    if (this.variableBrowserDefaultEl) this.variableBrowserDefaultEl.value = draft.defaultValueText;
    if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.value = draft.initialValueText;
    if (this.variableBrowserInitialEl) this.variableBrowserInitialEl.disabled = draft.source === 'global';
    if (this.variableBrowserDeleteBtn) this.variableBrowserDeleteBtn.disabled = false;
    if (this.variableBrowserTypeBtn) {
        const labelEl = this.variableBrowserTypeBtn.querySelector('span');
        if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, draft.type, '字符串');
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
    const bridge = window.appBridge;
    const chatStore = bridge?.chatStore;
    const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
    if (!chatStore || !sid) return false;
    draft.currentValueText = String(this.variableBrowserCurrentEl?.value || '');
    draft.defaultValueText = String(this.variableBrowserDefaultEl?.value || '');
    draft.initialValueText = String(this.variableBrowserInitialEl?.value || '');
    const type = ['number', 'string', 'boolean'].includes(String(draft.type || '').trim().toLowerCase())
        ? String(draft.type).trim().toLowerCase()
        : 'string';
    const defaultValue = parseTypedValue(draft.defaultValueText, type);
    const currentValue = parseTypedValue(draft.currentValueText, type);
    const initialValue = parseTypedValue(draft.initialValueText, type);
    chatStore.setVariableSchema?.(draft.name, { type, default: defaultValue }, sid);
    if (draft.source === 'global') {
        chatStore.setGlobalVariable?.(draft.name, currentValue);
    } else {
        chatStore.setVariable?.(draft.name, currentValue, sid);
        chatStore.setInitialVariable?.(draft.name, initialValue, sid);
    }
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
