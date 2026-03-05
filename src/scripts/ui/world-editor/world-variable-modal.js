export function createVariableModalImpl(deps = {}) {
    const {
        BLOCK_RIGHT_TYPE_OPTIONS = [],
        BLOCK_OP_OPTIONS = [],
        buildVariableCreationDraft,
        normalizeRightTypeValue,
    } = deps;
    if (this.variableModal) return;
    this.variableOverlay = document.createElement('div');
    this.variableOverlay.className = 'world-var-overlay';
    this.variableOverlay.style.display = 'none';
    this.variableOverlay.addEventListener('click', () => this.closeVariableModal(null));

    this.variableModal = document.createElement('div');
    this.variableModal.className = 'world-var-modal';
    this.variableModal.style.display = 'none';
    this.variableModal.innerHTML = `
        <div class="world-var-header">
            <div>
                <div class="world-var-title">新增变量</div>
                <div class="world-var-subtitle">默认会创建数值条件：变量名 > 10，只填名称即可。</div>
            </div>
            <button type="button" class="world-var-close" aria-label="关闭">×</button>
        </div>
        <div class="world-var-body">
            <label class="world-var-label" for="world-var-name">变量名</label>
            <input id="world-var-name" class="world-var-input" type="text" value="" placeholder="例如 stat_data.苏晚晴.love_degree.0">

            <div class="world-var-grid">
                <div class="world-var-field">
                    <label class="world-var-label">变量类型</label>
                    <button type="button" class="world-app-select-btn" id="world-var-type-btn">
                        <span>数字</span>
                        <span class="world-app-select-btn-chevron">▾</span>
                    </button>
                </div>
                <div class="world-var-field">
                    <label class="world-var-label" for="world-var-default">默认值</label>
                    <input id="world-var-default" class="world-var-input" type="text" value="0" placeholder="0">
                </div>
                <div class="world-var-field">
                    <label class="world-var-label">比较</label>
                    <button type="button" class="world-app-select-btn" id="world-var-op-btn">
                        <span>大于 (&gt;)</span>
                        <span class="world-app-select-btn-chevron">▾</span>
                    </button>
                </div>
                <div class="world-var-field">
                    <label class="world-var-label">比较值类型</label>
                    <button type="button" class="world-app-select-btn" id="world-var-righttype-btn">
                        <span>数字</span>
                        <span class="world-app-select-btn-chevron">▾</span>
                    </button>
                </div>
            </div>

            <div class="world-var-field" id="world-var-right-wrap">
                <label class="world-var-label" for="world-var-right">比较值</label>
                <input id="world-var-right" class="world-var-input" type="text" value="10" placeholder="10">
            </div>
        </div>
        <div class="world-var-actions">
            <button type="button" class="world-var-btn ghost" id="world-var-cancel">取消</button>
            <button type="button" class="world-var-btn primary" id="world-var-ok">创建</button>
        </div>
    `;
    this.variableModal.addEventListener('click', (e) => e.stopPropagation());

    this.variableNameInputEl = this.variableModal.querySelector('#world-var-name');
    this.variableDefaultInputEl = this.variableModal.querySelector('#world-var-default');
    this.variableRightInputEl = this.variableModal.querySelector('#world-var-right');
    this.variableTypeBtn = this.variableModal.querySelector('#world-var-type-btn');
    this.variableOpBtn = this.variableModal.querySelector('#world-var-op-btn');
    this.variableRightTypeBtn = this.variableModal.querySelector('#world-var-righttype-btn');

    this.variableModal.querySelector('.world-var-close')?.addEventListener('click', () => this.closeVariableModal(null));
    this.variableModal.querySelector('#world-var-cancel')?.addEventListener('click', () => this.closeVariableModal(null));
    this.variableModal.querySelector('#world-var-ok')?.addEventListener('click', () => this.submitVariableModal());

    this.variableTypeBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openCustomSelectMenu({
            anchorEl: this.variableTypeBtn,
            options: BLOCK_RIGHT_TYPE_OPTIONS.filter(opt => opt.value !== 'variable'),
            currentValue: this.variableModalDraft.type,
            onSelect: (value) => {
                this.variableModalDraft.type = ['number', 'string', 'boolean'].includes(String(value || '')) ? String(value) : 'number';
                this.renderVariableModalDraft();
            },
        });
    });
    this.variableOpBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openCustomSelectMenu({
            anchorEl: this.variableOpBtn,
            options: BLOCK_OP_OPTIONS,
            currentValue: this.variableModalDraft.op,
            onSelect: (value) => {
                this.variableModalDraft.op = String(value || '>');
                this.renderVariableModalDraft();
            },
        });
    });
    this.variableRightTypeBtn?.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.openCustomSelectMenu({
            anchorEl: this.variableRightTypeBtn,
            options: BLOCK_RIGHT_TYPE_OPTIONS,
            currentValue: this.variableModalDraft.rightType,
            onSelect: (value) => {
                this.variableModalDraft.rightType = normalizeRightTypeValue(value);
                this.renderVariableModalDraft();
            },
        });
    });

    document.body.appendChild(this.variableOverlay);
    document.body.appendChild(this.variableModal);
}

export function renderVariableModalDraftImpl(deps = {}) {
    const {
        BLOCK_RIGHT_TYPE_OPTIONS = [],
        BLOCK_OP_OPTIONS = [],
        buildVariableCreationDraft,
    } = deps;
    if (!this.variableModal) return;
    const draft = buildVariableCreationDraft(this.variableModalDraft);
    this.variableModalDraft = draft;
    if (this.variableNameInputEl) this.variableNameInputEl.value = draft.name;
    if (this.variableDefaultInputEl) this.variableDefaultInputEl.value = draft.defaultValueText;
    if (this.variableRightInputEl) this.variableRightInputEl.value = draft.rightValueText;
    if (this.variableTypeBtn) {
        const labelEl = this.variableTypeBtn.querySelector('span');
        if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, draft.type, '数字');
    }
    if (this.variableOpBtn) {
        const labelEl = this.variableOpBtn.querySelector('span');
        if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_OP_OPTIONS, draft.op, '大于 (>)');
    }
    if (this.variableRightTypeBtn) {
        const labelEl = this.variableRightTypeBtn.querySelector('span');
        if (labelEl) labelEl.textContent = this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, draft.rightType, '数字');
    }
    const rightWrap = this.variableModal.querySelector('#world-var-right-wrap');
    const hideRight = ['is_empty', 'not_empty'].includes(String(draft.op || '').trim().toLowerCase());
    if (rightWrap) rightWrap.style.display = hideRight ? 'none' : '';
    if (this.variableRightTypeBtn) this.variableRightTypeBtn.disabled = hideRight;
    if (this.variableRightInputEl) this.variableRightInputEl.disabled = hideRight;
}

export function openVariableModalImpl(initialDraft = {}, deps = {}) {
    const { buildVariableCreationDraft } = deps;
    if (!this.variableModal) this.createVariableModal();
    if (!this.variableOverlay || !this.variableModal) return Promise.resolve(null);
    this.variableModalDraft = buildVariableCreationDraft(initialDraft);
    this.renderVariableModalDraft();
    this.variableOverlay.style.display = 'block';
    this.variableModal.style.display = 'block';
    queueMicrotask(() => {
        this.variableNameInputEl?.focus();
        this.variableNameInputEl?.select();
    });

    if (this.variableKeyHandler) {
        document.removeEventListener('keydown', this.variableKeyHandler);
    }
    this.variableKeyHandler = (event) => {
        if (event.key === 'Escape') {
            event.preventDefault();
            this.closeVariableModal(null);
        } else if (event.key === 'Enter') {
            const target = event.target;
            if (target && target.tagName === 'TEXTAREA') return;
            event.preventDefault();
            this.submitVariableModal();
        }
    };
    document.addEventListener('keydown', this.variableKeyHandler);
    return new Promise((resolve) => {
        this.variableResolve = resolve;
    });
}

export function submitVariableModalImpl(deps = {}) {
    const { buildVariableCreationDraft, parseTypedValue } = deps;
    const name = String(this.variableNameInputEl?.value || '').trim();
    if (!name) {
        window.toastr?.warning?.('请填写变量名');
        this.variableNameInputEl?.focus();
        return;
    }
    const draft = buildVariableCreationDraft({
        ...this.variableModalDraft,
        name,
        defaultValue: this.variableDefaultInputEl?.value,
        rightValue: this.variableRightInputEl?.value,
    });
    const payload = {
        name,
        type: draft.type,
        defaultValue: parseTypedValue(draft.defaultValueText, draft.type),
        op: draft.op,
        rightType: draft.rightType,
        rightValue: parseTypedValue(draft.rightValueText, draft.rightType),
    };
    this.closeVariableModal(payload);
}

export function closeVariableModalImpl(value = null) {
    this.closeCustomSelectMenu();
    if (this.variableOverlay) this.variableOverlay.style.display = 'none';
    if (this.variableModal) this.variableModal.style.display = 'none';
    if (this.variableKeyHandler) {
        document.removeEventListener('keydown', this.variableKeyHandler);
        this.variableKeyHandler = null;
    }
    if (this.variableResolve) {
        const resolve = this.variableResolve;
        this.variableResolve = null;
        resolve(value);
    }
}
