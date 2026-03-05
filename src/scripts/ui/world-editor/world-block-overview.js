export function getConditionSummaryOperatorImpl(op = '>') {
    const value = String(op || '>').trim();
    const map = {
        contains: '包含',
        not_contains: '不包含',
        is_empty: '为空',
        not_empty: '非空',
        regex: '正则匹配',
    };
    return map[value] || value;
}

export function getConditionSummaryValueTextImpl(value, rightType = 'number', deps = {}) {
    const { normalizeRightTypeValue, parseTypedValue, stringifyTypedValue } = deps;
    const type = normalizeRightTypeValue(rightType);
    if (type === 'variable') {
        const text = String(value ?? '').trim();
        return text ? `变量 ${text}` : '变量';
    }
    if (type === 'boolean') return parseTypedValue(value, 'boolean') ? 'true' : 'false';
    return stringifyTypedValue(value, type);
}

export function getConditionRuntimeContextImpl(deps = {}) {
    const { buildVariableContext } = deps;
    const bridge = window.appBridge;
    const chatStore = bridge?.chatStore;
    const sid = String(chatStore?.getCurrent?.() || bridge?.activeSessionId || '').trim();
    if (!chatStore || !sid) {
        return buildVariableContext({ baseVars: {}, globalVars: {} });
    }
    const useGlobal = Boolean(typeof bridge?.isSharedVariableSession === 'function' && bridge.isSharedVariableSession(sid));
    const localVars = chatStore?.listVariables?.(sid) || {};
    const globalVars = chatStore?.listGlobalVariables?.() || {};
    const baseVars = useGlobal ? globalVars : localVars;
    const runtimeContext = buildVariableContext({ baseVars, globalVars });
    runtimeContext.variableContext.local_variables = localVars;
    return runtimeContext;
}

export function formatConditionRuntimeValueImpl(value, rightType = 'string') {
    if (value === undefined) return '未找到';
    if (value === null) return 'null';
    if (Array.isArray(value)) return JSON.stringify(value);
    if (typeof value === 'object') {
        try {
            return JSON.stringify(value);
        } catch {
            return '[object]';
        }
    }
    return this.getConditionSummaryValueText(value, rightType);
}

export function getConditionExplanationReasonImpl(clauseRaw, explanation = null, deps = {}) {
    const { normalizePromptClause } = deps;
    const clause = normalizePromptClause(clauseRaw || {});
    const leftName = String(clause.left || '').trim();
    if (!leftName) return '左侧变量未设置，当前按待完善处理。';
    if (!explanation) return '当前会话暂无可用运行值，暂无法解释命中原因。';
    const op = String(clause.op || '').trim().toLowerCase();
    const leftValue = this.formatConditionRuntimeValue(explanation.leftValue, clause.rightType);
    if (op === 'is_empty') {
        return explanation.result
            ? `左值 ${leftValue} 为空，条件成立。`
            : `左值 ${leftValue} 不为空，条件不成立。`;
    }
    if (op === 'not_empty') {
        return explanation.result
            ? `左值 ${leftValue} 不为空，条件成立。`
            : `左值 ${leftValue} 为空，条件不成立。`;
    }
    const rightType = clause.rightType === 'variable' ? 'string' : clause.rightType;
    const rightValue = this.formatConditionRuntimeValue(explanation.rightValue, rightType);
    const opLabel = this.getConditionSummaryOperator(clause.op);
    return explanation.result
        ? `当前满足：${leftValue} ${opLabel} ${rightValue}`
        : `当前不满足：${leftValue} ${opLabel} ${rightValue}`;
}

export function getConditionGroupExplanationReasonImpl(logicRaw = 'and', explanation = null, deps = {}) {
    const { normalizeLogicValue } = deps;
    const logic = normalizeLogicValue(logicRaw || 'and');
    if (!explanation) return '当前会话暂无可用运行值，暂无法解释分组结果。';
    const children = Array.isArray(explanation.children) ? explanation.children : [];
    const resolved = children.filter(item => typeof item?.result === 'boolean');
    const pendingCount = Math.max(0, children.length - resolved.length);
    if (logic === 'not') {
        if (!resolved.length) return 'NOT 需要 1 条可判断子条件，当前仍未准备好。';
        return explanation.result
            ? 'NOT 子条件未命中，因此分组命中。'
            : 'NOT 子条件命中，因此分组未命中。';
    }
    if (!resolved.length) {
        return `当前 ${children.length || 0} 条子条件都尚未产出可判断结果。`;
    }
    if (logic === 'and') {
        if (explanation.result) return `AND 需要全部成立，当前 ${resolved.length} 条已判断子条件均成立。`;
        const failedCount = resolved.filter(item => item?.result === false).length;
        return `AND 需要全部成立，当前有 ${failedCount} 条未满足${pendingCount ? `，${pendingCount} 条待判断` : ''}。`;
    }
    if (logic === 'or') {
        if (explanation.result) {
            const hitCount = resolved.filter(item => item?.result === true).length;
            return `OR 需要任一成立，当前已有 ${hitCount} 条成立。`;
        }
        return `OR 需要任一成立，当前已判断子条件均未成立${pendingCount ? `，${pendingCount} 条待判断` : ''}。`;
    }
    return '分组结果已更新。';
}

export function getEntryActivationExplanationImpl(entry, idx = this.currentIndex, deps = {}) {
    const { logger } = deps;
    const bridge = window.appBridge;
    const worldId = String(entry?._refSourceId || entry?._sourceWorldId || this.worldName || '').trim();
    const entryId = this.getEntryId(entry, idx);
    if (!bridge?.explainWorldEntryActivation || !worldId || !entryId) return null;
    try {
        const label = bridge.buildWorldDebugLabel?.() || null;
        return bridge.explainWorldEntryActivation(worldId, entryId, label);
    } catch (err) {
        logger?.warn?.('读取世界书条目激活解释失败', err);
        return null;
    }
}

export function renderEntryActivationOverviewImpl(explanation, deps = {}) {
    const { escapeHtml } = deps;
    if (!explanation) return '';
    const sourceLabelMap = {
        direct: '直接命中',
        recursive: '递归命中',
        inactive: '当前未激活',
    };
    return `
        <div class="world-entry-activation-overview">
            <div class="world-entry-activation-head">
                <div class="world-entry-activation-title">条目激活</div>
                <div class="world-entry-activation-pills">
                    <span class="world-cond-overview-pill ${explanation.active ? '' : 'warn'}">${explanation.active ? '条目已激活' : '条目未激活'}</span>
                    <span class="world-cond-overview-pill">${escapeHtml(sourceLabelMap[explanation.activationSource] || '当前未激活')}</span>
                    ${explanation.recursionStep ? `<span class="world-cond-overview-pill">递归第 ${explanation.recursionStep} 轮</span>` : ''}
                    ${explanation.probabilityEnabled ? `<span class="world-cond-overview-pill subtle">概率 ${escapeHtml(String(explanation.probabilityValue))}%</span>` : ''}
                    ${explanation.filteredByGroup ? '<span class="world-cond-overview-pill warn">组竞争过滤</span>' : ''}
                </div>
            </div>
            <div class="world-entry-activation-grid">
                <div class="world-entry-activation-card">
                    <div class="world-entry-activation-label">主关键词</div>
                    <div class="world-entry-activation-value">${explanation.keys.length ? escapeHtml(explanation.keys.join(' / ')) : '未设置'}</div>
                    <div class="world-entry-activation-meta">${explanation.matchedPrimaryKeys.length ? `当前命中：${escapeHtml(explanation.matchedPrimaryKeys.join(' / '))}` : '当前未命中'}</div>
                </div>
                ${explanation.selective ? `
                    <div class="world-entry-activation-card">
                        <div class="world-entry-activation-label">副关键词</div>
                        <div class="world-entry-activation-value">${explanation.secondaryKeys.length ? escapeHtml(explanation.secondaryKeys.join(' / ')) : '未设置'}</div>
                        <div class="world-entry-activation-meta">${escapeHtml(explanation.selectiveLogicLabel || '副关键词逻辑')} / ${explanation.matchedSecondaryKeys.length ? `命中：${escapeHtml(explanation.matchedSecondaryKeys.join(' / '))}` : '当前未命中'}</div>
                    </div>
                ` : ''}
                <div class="world-entry-activation-card">
                    <div class="world-entry-activation-label">匹配来源</div>
                    <div class="world-entry-activation-value">${explanation.sourceFields.length ? escapeHtml(explanation.sourceFields.join(' / ')) : '当前没有可用上下文'}</div>
                    <div class="world-entry-activation-meta">${explanation.hasMatchInput ? '已按当前会话上下文判定' : '当前没有聊天输入，按条目内容参与'}</div>
                </div>
                <div class="world-entry-activation-card">
                    <div class="world-entry-activation-label">状态说明</div>
                    <div class="world-entry-activation-value">${explanation.reasons.length ? escapeHtml(explanation.reasons[0]) : (explanation.active ? '条目已通过激活层' : '暂无说明')}</div>
                    <div class="world-entry-activation-meta">
                        ${explanation.probabilityEnabled ? '概览未模拟随机概率；实际发送时仍会走概率掷骰。' : ''}
                        ${!explanation.probabilityEnabled && explanation.filteredByGroup ? '当前条目满足触发，但在分组竞争后被过滤。' : ''}
                        ${!explanation.probabilityEnabled && !explanation.filteredByGroup && explanation.preventRecursion ? '本条目命中后不会继续触发递归。' : ''}
                    </div>
                </div>
            </div>
        </div>
    `;
}

export function renderBlockSettingsPanelImpl(block, blockPage = 0, deps = {}) {
    const { escapeHtml, ROLE_OPTIONS = [] } = deps;
    if (!block || typeof block !== 'object') return '';
    const title = String(block.title || '').trim();
    const roleLabelText = this.getOptionLabel(ROLE_OPTIONS, block.role, 'system');
    const priorityValue = Number.isFinite(Number(block.priority)) ? Number(block.priority) : 100;
    return `
        <div class="world-block-settings-card">
            <div class="world-block-settings-head">
                <div>
                    <div class="world-block-settings-title">当前分页设置</div>
                    <div class="world-block-settings-subtitle">控制本页是否启用，以及注入角色与顺序。</div>
                </div>
                <label class="world-entry-inline-check world-block-settings-toggle">
                    <input type="checkbox" id="we-block-enabled" ${block.enabled !== false ? 'checked' : ''}>
                    <span>启用本页</span>
                </label>
            </div>
            <div class="world-block-settings-grid">
                <div class="world-entry-field">
                    <label>分页标题</label>
                    <input type="text" id="we-block-title" value="${escapeHtml(title)}" placeholder="例如：基础设定 / 状态卡 / 条件页 ${blockPage + 1}">
                </div>
                <div class="world-entry-field">
                    <label>注入角色（role）</label>
                    <button type="button" class="world-app-select-btn" id="we-block-role-btn">
                        <span>${escapeHtml(roleLabelText)}</span>
                        <span class="world-app-select-btn-chevron">▾</span>
                    </button>
                </div>
                <div class="world-entry-field">
                    <label>优先级（priority）</label>
                    <input type="number" id="we-block-priority" min="-9999" max="9999" value="${priorityValue}">
                </div>
            </div>
        </div>
    `;
}

export function collectBlockConditionOverviewImpl(entry, block, deps = {}) {
    const {
        buildWhenFromNodeGraph,
        normalizeConditionTree,
        explainConditionTree,
        visitConditionTree,
        isConditionTreeGroup,
        normalizePromptClause,
    } = deps;
    let tree = null;
    if (block && typeof block === 'object') {
        const primaryClause = this.ensureBlockPrimaryClause(block);
        const graph = this.ensureBlockNodeGraph(block);
        const compiledWhen = buildWhenFromNodeGraph(graph, primaryClause);
        tree = normalizeConditionTree(compiledWhen, primaryClause);
        block.when = tree;
    }
    if (!tree) tree = this.ensureBlockConditionTree(block);
    const stats = {
        clauseCount: 0,
        groupCount: 0,
        pendingCount: 0,
        pendingItems: [],
        variables: new Map(),
    };
    const runtimeContext = this.getConditionRuntimeContext();
    const explanation = explainConditionTree(tree, runtimeContext);
    const entryActivation = this.getEntryActivationExplanation(entry, this.currentIndex);
    let clauseOrder = 0;
    visitConditionTree(tree, (node, path) => {
        if (isConditionTreeGroup(node)) {
            stats.groupCount += 1;
            return;
        }
        const clause = normalizePromptClause(node);
        clauseOrder += 1;
        stats.clauseCount += 1;
        const left = String(clause.left || '').trim();
        const op = String(clause.op || '').trim().toLowerCase();
        const needsRight = !['is_empty', 'not_empty'].includes(op);
        const rightMissing = needsRight && clause.rightType === 'variable' && !String(clause.right || '').trim();
        if (!left) {
            stats.pendingCount += 1;
            stats.pendingItems.push({
                order: clauseOrder,
                path,
                label: `条件 ${clauseOrder}`,
                reason: '未设置变量',
                kind: 'missing_left_variable',
                fixIndex: stats.pendingItems.filter(item => item?.kind === 'missing_left_variable').length,
            });
            return;
        }
        if (rightMissing) {
            stats.pendingCount += 1;
            stats.pendingItems.push({
                order: clauseOrder,
                path,
                label: `条件 ${clauseOrder}`,
                reason: '变量比较的右值为空',
                kind: 'missing_right_variable',
                fixIndex: stats.pendingItems.filter(item => item?.kind === 'missing_right_variable').length,
            });
            return;
        }
        const prev = stats.variables.get(left) || {
            name: left,
            type: clause.defineVariable?.type || '',
            defaultValue: clause.defineVariable?.default,
            autoCreate: false,
            refCount: 0,
        };
        prev.refCount += 1;
        if (clause.defineVariable?.name === left) {
            prev.autoCreate = true;
            prev.type = clause.defineVariable?.type || prev.type || 'number';
            prev.defaultValue = clause.defineVariable?.default ?? prev.defaultValue;
        }
        stats.variables.set(left, prev);
    });
    const disconnectedTargets = this.getBlockDisconnectedNodeTargets(block);
    disconnectedTargets.forEach((target) => {
        stats.pendingCount += 1;
        stats.pendingItems.push({
            order: stats.pendingItems.length + 1,
            path: 'root',
            nodeId: target.nodeId,
            label: `${target.label} ${target.order}`,
            reason: '未接入当前生效链路',
            kind: 'disconnected_from_result',
        });
    });
    return {
        tree,
        explanation,
        entryActivation,
        clauseCount: stats.clauseCount,
        groupCount: stats.groupCount,
        pendingCount: stats.pendingCount,
        pendingItems: stats.pendingItems,
        variables: [...stats.variables.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
    };
}

export function renderConditionOverviewNodeImpl(node, depth = 0, explanation = null, deps = {}) {
    const { isConditionTreeGroup, normalizeLogicValue, createDefaultPromptClause, normalizePromptClause, escapeHtml } = deps;
    if (!node || typeof node !== 'object') return '';
    if (isConditionTreeGroup(node)) {
        const logic = normalizeLogicValue(node.logic || 'and');
        const children = logic === 'not'
            ? [node.clause || createDefaultPromptClause()]
            : (Array.isArray(node.clauses) && node.clauses.length ? node.clauses : [createDefaultPromptClause()]);
        const childExplanations = Array.isArray(explanation?.children) ? explanation.children : [];
        const groupReason = this.getConditionGroupExplanationReason(logic, explanation);
        const groupReasonClass = explanation?.result === true
            ? ' is-hit'
            : explanation?.result === false
                ? ' is-warn'
                : '';
        return `
            <div class="world-cond-summary-group" data-depth="${depth}">
                <div class="world-cond-summary-group-head">
                    <span class="world-cond-summary-logic">${escapeHtml(String(logic || 'and').toUpperCase())}</span>
                    <span class="world-cond-summary-badge ${explanation?.result ? '' : 'danger'}">${explanation?.result ? '命中' : '未命中'}</span>
                </div>
                <div class="world-cond-summary-group-reason${groupReasonClass}">${escapeHtml(groupReason)}</div>
                <div class="world-cond-summary-group-body">
                    ${children.map((child, idx) => this.renderConditionOverviewNode(child, depth + 1, childExplanations[idx] || null)).join('')}
                </div>
            </div>
        `;
    }
    const clause = normalizePromptClause(node);
    const left = String(clause.left || '').trim() || '未设置变量';
    const op = this.getConditionSummaryOperator(clause.op);
    const hideRight = ['is_empty', 'not_empty'].includes(String(clause.op || '').trim().toLowerCase());
    const right = hideRight ? '' : this.getConditionSummaryValueText(clause.right, clause.rightType);
    const leftValue = explanation ? this.formatConditionRuntimeValue(explanation.leftValue, clause.rightType) : '';
    const rightValue = explanation && !hideRight
        ? this.formatConditionRuntimeValue(explanation.rightValue, clause.rightType === 'variable' ? 'string' : clause.rightType)
        : '';
    const runtimeReason = this.getConditionExplanationReason(clause, explanation);
    const reasonClass = explanation?.result === true
        ? ' is-hit'
        : explanation?.result === false
            ? ' is-warn'
            : '';
    return `
        <div class="world-cond-summary-clause${clause.left ? '' : ' is-pending'}" data-depth="${depth}">
            <div class="world-cond-summary-clause-main">
                <span class="world-cond-summary-var">${escapeHtml(left)}</span>
                <span class="world-cond-summary-op">${escapeHtml(op)}</span>
                ${hideRight ? '' : `<span class="world-cond-summary-value">${escapeHtml(right || '未设置')}</span>`}
            </div>
            <div class="world-cond-summary-meta">
                ${clause.defineVariable?.name ? `<span class="world-cond-summary-badge">自动建</span>` : ''}
                ${clause.rightType === 'variable' && right ? `<span class="world-cond-summary-badge subtle">变量比较</span>` : ''}
                ${clause.left ? '' : `<span class="world-cond-summary-badge danger">待完善</span>`}
                ${explanation ? `<span class="world-cond-summary-badge ${explanation.result ? '' : 'danger'}">${explanation.result ? '命中' : '未命中'}</span>` : ''}
            </div>
            ${explanation ? `
                <div class="world-cond-summary-runtime">
                    <span>当前值：${escapeHtml(leftValue)}</span>
                    ${hideRight ? '' : `<span>比较值：${escapeHtml(rightValue)}</span>`}
                </div>
            ` : ''}
            <div class="world-cond-summary-reason${reasonClass}">${escapeHtml(runtimeReason)}</div>
        </div>
    `;
}

export function renderBlockConditionOverviewImpl(entry, block, deps = {}) {
    const { escapeHtml, BLOCK_RIGHT_TYPE_OPTIONS = [] } = deps;
    const overview = this.collectBlockConditionOverview(entry, block);
    return `
        <div class="world-cond-overview" id="we-condition-overview">
            <div class="world-cond-overview-head">
                <div>
                    <div class="world-cond-overview-title">当前触发条件</div>
                    <div class="world-cond-overview-subtitle">先看条目激活，再看 block 条件命中，需要调整时再进入编辑。</div>
                </div>
                <div class="world-cond-overview-stats">
                    <span class="world-cond-overview-pill ${overview.entryActivation?.active ? '' : 'warn'}">${overview.entryActivation?.active ? '条目已激活' : '条目未激活'}</span>
                    <span class="world-cond-overview-pill ${block?.enabled === false ? 'warn' : ''}">${block?.enabled === false ? 'block 已禁用' : 'block 已启用'}</span>
                    <span class="world-cond-overview-pill">${overview.clauseCount} 条条件</span>
                    <span class="world-cond-overview-pill">${overview.variables.length} 个变量</span>
                    <span class="world-cond-overview-pill ${overview.explanation?.result ? '' : 'warn'}">${overview.explanation?.result ? 'block 当前命中' : 'block 当前未命中'}</span>
                    ${overview.pendingCount ? `<span class="world-cond-overview-pill warn">${overview.pendingCount} 处待完善</span>` : ''}
                </div>
            </div>
            ${this.renderEntryActivationOverview(overview.entryActivation)}
            <div class="world-cond-overview-structure">
                ${this.renderConditionOverviewNode(overview.tree, 0, overview.explanation)}
            </div>
            ${overview.pendingCount ? `
                <details class="world-cond-overview-pending">
                    <summary>待完善项（${overview.pendingCount}）</summary>
                    <div class="world-cond-overview-pending-list">
                        ${overview.pendingItems.map((item) => `
                            <div class="world-cond-overview-pending-item">
                                <button type="button" class="world-cond-overview-pending-main" data-path="${escapeHtml(item.path || '')}" data-node-id="${escapeHtml(item.nodeId || '')}">
                                    <span class="world-cond-overview-pending-label">${escapeHtml(item.label)}</span>
                                    <span class="world-cond-overview-pending-reason">${escapeHtml(item.reason)}</span>
                                </button>
                                ${item.kind ? `<button type="button" class="world-cond-overview-pending-fix" data-fix-kind="${escapeHtml(item.kind)}" data-fix-index="${Number(item.fixIndex || 0)}" data-node-id="${escapeHtml(item.nodeId || '')}">${item.kind === 'disconnected_from_result' ? '定位节点' : '快速修复'}</button>` : ''}
                            </div>
                        `).join('')}
                    </div>
                </details>
            ` : ''}
            <div class="world-cond-overview-vars">
                <div class="world-cond-overview-vars-title">涉及变量</div>
                <div class="world-cond-overview-var-list">
                    ${overview.variables.length ? overview.variables.map((item) => `
                        <div class="world-cond-overview-var-card">
                            <div class="world-cond-overview-var-name">${escapeHtml(item.name)}</div>
                            <div class="world-cond-overview-var-meta">
                                <span>${escapeHtml(this.getOptionLabel(BLOCK_RIGHT_TYPE_OPTIONS, item.type, item.type || '未定义类型'))}</span>
                                <span>引用 ${item.refCount}</span>
                                ${item.autoCreate ? `<span>默认 ${escapeHtml(this.getConditionSummaryValueText(item.defaultValue, item.type || 'number'))}</span>` : ''}
                            </div>
                        </div>
                    `).join('') : '<div class="world-cond-overview-empty">当前还没有可识别的变量条件。</div>'}
                </div>
            </div>
        </div>
    `;
}
