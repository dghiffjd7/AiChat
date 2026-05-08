import {
    getWorldEntryActivationExplanationCore,
    resolveWorldEditorBridgeContext,
} from './world-editor-bridge-utils.js';
import {
    buildWorldConditionVariableRuntimeContext,
    resolveWorldVariableSessionContext,
} from './world-variable-session-utils.js';

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
    return buildWorldConditionVariableRuntimeContext({
        ...resolveWorldVariableSessionContext(),
        buildVariableContext,
    });
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
    const pendingReason = String(explanation?.pendingReason || clause.pendingReason || '').trim().toLowerCase();
    const leftName = String(clause.left || '').trim();
    if (!leftName) return '左侧变量未设置，当前按待完善处理。';
    if (!explanation) return '当前会话暂无可用运行值，暂无法解释命中原因。';
    if (pendingReason === 'missing_right_variable') return '右侧比较变量未设置，当前按待完善处理。';
    if (pendingReason === 'missing_right_literal') return '右侧比较值未填写，当前按待完善处理。';
    if (pendingReason === 'missing_right_input') return '右侧比较输入未接好，当前按待完善处理。';
    if (pendingReason === 'missing_input') return '当前条件链仍缺少上游输入，暂按待完善处理。';
    if (typeof explanation.result !== 'boolean') return '当前条件仍有待完善项，暂按待判断处理。';
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
    const hitCount = resolved.filter(item => item?.result === true).length;
    const failedCount = resolved.filter(item => item?.result === false).length;
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
        if (pendingCount > 0) {
            if (failedCount > 0) return `AND 需要全部成立，当前有 ${failedCount} 条未满足，另有 ${pendingCount} 条待判断。`;
            return `AND 仍有 ${pendingCount} 条待判断，当前已成立 ${hitCount} 条。`;
        }
        if (explanation.result) return `AND 需要全部成立，当前 ${resolved.length} 条已判断子条件均成立。`;
        return `AND 需要全部成立，当前有 ${failedCount} 条未满足${pendingCount ? `，${pendingCount} 条待判断` : ''}。`;
    }
    if (logic === 'or') {
        if (pendingCount > 0) {
            if (hitCount > 0) return `OR 已有 ${hitCount} 条成立，但仍有 ${pendingCount} 条待判断，当前按待完善处理。`;
            return `OR 需要任一成立，当前已判断子条件均未成立，另有 ${pendingCount} 条待判断。`;
        }
        if (explanation.result) {
            return `OR 需要任一成立，当前已有 ${hitCount} 条成立。`;
        }
        return `OR 需要任一成立，当前已判断子条件均未成立${pendingCount ? `，${pendingCount} 条待判断` : ''}。`;
    }
    return '分组结果已更新。';
}

export function getEntryActivationExplanationImpl(entry, idx = this.currentIndex, deps = {}) {
    const { logger } = deps;
    return getWorldEntryActivationExplanationCore({
        ...resolveWorldEditorBridgeContext(),
        entry,
        idx,
        worldName: this.worldName,
        getEntryId: this.getEntryId?.bind(this),
        logger,
    });
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
        pendingItems: [],
        variables: new Map(),
    };
    const runtimeContext = this.getConditionRuntimeContext();
    const explanation = explainConditionTree(tree, runtimeContext);
    const runtimeStats = {
        total: 0,
        resolved: 0,
        hit: 0,
        miss: 0,
        pending: 0,
    };
    const collectRuntimeStats = (node) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node.children)) {
            node.children.forEach((child) => collectRuntimeStats(child));
            return;
        }
        runtimeStats.total += 1;
        if (typeof node.result === 'boolean') {
            runtimeStats.resolved += 1;
            if (node.result) runtimeStats.hit += 1;
            else runtimeStats.miss += 1;
            return;
        }
        runtimeStats.pending += 1;
    };
    collectRuntimeStats(explanation);
    const entryActivation = this.getEntryActivationExplanation(entry, this.currentIndex);
    let clauseOrder = 0;
    let missingLeftFixIndex = 0;
    let missingRightFixIndex = 0;
    visitConditionTree(tree, (node) => {
        if (isConditionTreeGroup(node)) return;
        const clause = normalizePromptClause(node);
        clauseOrder += 1;
        stats.clauseCount += 1;
        const pendingReason = String(clause.pendingReason || '').trim().toLowerCase();
        const left = String(clause.left || '').trim();
        const op = String(clause.op || '').trim().toLowerCase();
        const needsRight = !['is_empty', 'not_empty'].includes(op);
        const rightMissing = needsRight && clause.rightType === 'variable' && !String(clause.right || '').trim();
        if (pendingReason === 'missing_input') {
            stats.pendingItems.push({
                label: `条件 ${clauseOrder}`,
                reason: '上游输入缺失',
                kind: 'missing_input',
            });
            return;
        }
        if (pendingReason === 'missing_right_input') {
            stats.pendingItems.push({
                label: `条件 ${clauseOrder}`,
                reason: '缺少右值输入',
                kind: 'missing_right_input',
            });
            return;
        }
        if (pendingReason === 'missing_right_literal') {
            stats.pendingItems.push({
                label: `条件 ${clauseOrder}`,
                reason: '右侧比较值未填写',
                kind: 'missing_right_literal',
            });
            return;
        }
        if (!left) {
            stats.pendingItems.push({
                label: `条件 ${clauseOrder}`,
                reason: '未设置变量',
                kind: 'missing_left_variable',
                fixIndex: missingLeftFixIndex,
            });
            missingLeftFixIndex += 1;
            return;
        }
        if (rightMissing) {
            stats.pendingItems.push({
                label: `条件 ${clauseOrder}`,
                reason: '变量比较的右值为空',
                kind: 'missing_right_variable',
                fixIndex: missingRightFixIndex,
            });
            missingRightFixIndex += 1;
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
        stats.pendingItems.push({
            nodeId: target.nodeId,
            label: target.label,
            reason: '未接入当前生效链路',
            kind: 'disconnected_from_result',
        });
    });
    const pendingCount = stats.pendingItems.length;
    return {
        tree,
        explanation,
        entryActivation,
        clauseCount: stats.clauseCount,
        pendingCount,
        pendingItems: stats.pendingItems,
        variables: [...stats.variables.values()].sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')),
        runtimeStats,
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
        const groupResultKnown = typeof explanation?.result === 'boolean';
        const groupReasonClass = explanation?.result === true
            ? ' is-hit'
            : explanation?.result === false
                ? ' is-warn'
                : '';
        return `
            <div class="world-cond-summary-group" data-depth="${depth}">
                <div class="world-cond-summary-group-head">
                    <span class="world-cond-summary-logic">${escapeHtml(String(logic || 'and').toUpperCase())}</span>
                    <span class="world-cond-summary-badge ${groupResultKnown ? (explanation?.result ? '' : 'danger') : 'subtle'}">${groupResultKnown ? (explanation?.result ? '命中' : '未命中') : '待判断'}</span>
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
    const clauseResultKnown = typeof explanation?.result === 'boolean';
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
                ${explanation ? `<span class="world-cond-summary-badge ${clauseResultKnown ? (explanation.result ? '' : 'danger') : 'subtle'}">${clauseResultKnown ? (explanation.result ? '命中' : '未命中') : '待判断'}</span>` : ''}
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
    const runtimeStats = overview.runtimeStats || { total: 0, resolved: 0, hit: 0, miss: 0, pending: 0 };
    const runtimeFocus = typeof this.getBlockRuntimeFocusTargets === 'function'
        ? this.getBlockRuntimeFocusTargets(block)
        : { pathNodeIds: [], hitNodeIds: [], missNodeIds: [], pendingNodeIds: [] };
    const runtimeFocusCounts = {
        path: Array.isArray(runtimeFocus.pathNodeIds) ? runtimeFocus.pathNodeIds.length : 0,
        hit: Array.isArray(runtimeFocus.hitNodeIds) ? runtimeFocus.hitNodeIds.length : 0,
        miss: Array.isArray(runtimeFocus.missNodeIds) ? runtimeFocus.missNodeIds.length : 0,
        pending: Array.isArray(runtimeFocus.pendingNodeIds) ? runtimeFocus.pendingNodeIds.length : 0,
    };
    const hitRate = runtimeStats.resolved > 0
        ? Math.round((runtimeStats.hit / runtimeStats.resolved) * 100)
        : 0;
    const blockEnabled = block?.enabled !== false;
    const blockResultKnown = typeof overview.explanation?.result === 'boolean';
    const blockHit = blockResultKnown && overview.explanation?.result === true;
    const entryActive = overview.entryActivation?.active !== false;
    const effectiveInjectable = blockEnabled && entryActive && blockHit;
    const blockStatusText = !blockEnabled
        ? 'block 已禁用'
        : blockResultKnown
            ? (blockHit ? 'block 当前命中' : 'block 当前未命中')
            : 'block 待判断';
    const blockStatusClass = !blockEnabled
        ? 'warn'
        : blockResultKnown
            ? (blockHit ? 'good' : 'warn')
            : 'subtle';
    const entryActivationHtml = this.renderEntryActivationOverview(overview.entryActivation)
        || '<div class="world-entry-activation-overview"><div class="world-entry-activation-title">条目激活</div><div class="world-entry-activation-meta">当前无法读取条目激活解释。</div></div>';
    const renderRuntimeAction = (kind = 'path', label = '', count = 0, tone = 'path') => `
        <button
            type="button"
            class="world-block-runtime-action is-${escapeHtml(tone)}"
            data-runtime-focus="${escapeHtml(kind)}"
            ${count ? '' : 'disabled'}
        >
            <span>${escapeHtml(label)}</span>
            <span class="world-block-runtime-action-count">(${Number(count || 0)})</span>
        </button>
    `;
    const blockRuntimeOverviewHtml = `
        <div class="world-block-runtime-overview">
            <div class="world-block-runtime-head">
                <div class="world-entry-activation-title">block 判定</div>
                <div class="world-entry-activation-pills">
                    <span class="world-cond-overview-pill ${blockStatusClass}">${escapeHtml(blockStatusText)}</span>
                    <span class="world-cond-overview-pill ${effectiveInjectable ? 'good' : 'warn'}">${effectiveInjectable ? '当前可注入' : '当前不可注入'}</span>
                </div>
            </div>
            <div class="world-block-runtime-grid">
                <div class="world-block-runtime-card">
                    <div class="world-entry-activation-label">条件总数</div>
                    <div class="world-entry-activation-value">${runtimeStats.total}</div>
                    <div class="world-entry-activation-meta">已判定 ${runtimeStats.resolved} / ${runtimeStats.total}</div>
                </div>
                <div class="world-block-runtime-card">
                    <div class="world-entry-activation-label">命中统计</div>
                    <div class="world-entry-activation-value">${runtimeStats.hit} 命中 / ${runtimeStats.miss} 未命中</div>
                    <div class="world-entry-activation-meta">${runtimeStats.pending ? `${runtimeStats.pending} 条待判断` : '当前无待判断项'}</div>
                </div>
                <div class="world-block-runtime-card">
                    <div class="world-entry-activation-label">命中率（已判定）</div>
                    <div class="world-entry-activation-value">${runtimeStats.resolved ? `${hitRate}%` : '—'}</div>
                    <div class="world-entry-activation-meta">仅基于当前会话可判定条件计算</div>
                </div>
                <div class="world-block-runtime-card">
                    <div class="world-entry-activation-label">联动说明</div>
                    <div class="world-entry-activation-value">
                        ${!entryActive ? '条目未激活，block 条件即使命中也不会注入。' : (!blockEnabled ? 'block 已禁用，当前不会注入。' : (blockHit ? '条目+block 均满足，当前可注入。' : '条目激活但 block 未命中，当前不注入。'))}
                    </div>
                </div>
            </div>
            <div class="world-block-runtime-actions">
                ${renderRuntimeAction('path', '定位当前判定链路', runtimeFocusCounts.path, 'path')}
                ${renderRuntimeAction('hit', '定位命中节点', runtimeFocusCounts.hit, 'hit')}
                ${renderRuntimeAction('miss', '定位未命中节点', runtimeFocusCounts.miss, 'miss')}
                ${renderRuntimeAction('pending', '定位待判断节点', runtimeFocusCounts.pending, 'pending')}
            </div>
        </div>
    `;
    return `
        <div class="world-cond-overview" id="we-condition-overview">
            <div class="world-cond-overview-head">
                <div>
                    <div class="world-cond-overview-title">当前触发条件</div>
                    <div class="world-cond-overview-subtitle">先看条目激活，再看 block 条件命中，需要调整时再进入编辑。</div>
                </div>
                <div class="world-cond-overview-stats">
                    <span class="world-cond-overview-pill">${overview.clauseCount} 条条件</span>
                    <span class="world-cond-overview-pill">${overview.variables.length} 个变量</span>
                    <span class="world-cond-overview-pill subtle">已判定 ${runtimeStats.resolved} / ${runtimeStats.total}</span>
                    <span class="world-cond-overview-pill ${blockStatusClass}">${escapeHtml(blockStatusText)}</span>
                    ${overview.pendingCount ? `<span class="world-cond-overview-pill warn">${overview.pendingCount} 处待完善</span>` : ''}
                </div>
            </div>
            <div class="world-cond-overview-panels">
                <div class="world-cond-overview-panel">${entryActivationHtml}</div>
                <div class="world-cond-overview-panel">${blockRuntimeOverviewHtml}</div>
            </div>
            <div class="world-cond-overview-structure">
                ${this.renderConditionOverviewNode(overview.tree, 0, overview.explanation)}
            </div>
            ${overview.pendingCount ? `
                <details class="world-cond-overview-pending">
                    <summary>待完善项（${overview.pendingCount}）</summary>
                    <div class="world-cond-overview-pending-list">
                        ${overview.pendingItems.map((item) => `
                            <div class="world-cond-overview-pending-item">
                                <button type="button" class="world-cond-overview-pending-main" data-node-id="${escapeHtml(item.nodeId || '')}">
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
