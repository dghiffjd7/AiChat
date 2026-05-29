import { buildAgentCenterView } from './agent-center-view-model.js';
import { PROVIDER_TOOL_PERMISSION_ACTIONS } from '../agent/provider-tool-permission-actions.js';
import { appConfirm } from './app-confirm.js';

const STYLE_ID = 'agent-center-panel-style';

const PANEL_CSS = `
.agent-center-overlay {
    position: fixed;
    inset: 0;
    z-index: 22000;
    display: none;
    align-items: stretch;
    justify-content: flex-end;
    box-sizing: border-box;
    padding: max(8px, env(safe-area-inset-top, 0px)) max(8px, env(safe-area-inset-right, 0px)) max(8px, env(safe-area-inset-bottom, 0px)) max(8px, env(safe-area-inset-left, 0px));
    background: rgba(15,23,42,0.28);
}
.agent-center-panel {
    width: min(620px, 100vw);
    height: calc(var(--app-visual-height, 100dvh) - max(8px, env(safe-area-inset-top, 0px)) - max(8px, env(safe-area-inset-bottom, 0px)));
    max-height: calc(100vh - max(8px, env(safe-area-inset-top, 0px)) - max(8px, env(safe-area-inset-bottom, 0px)));
    display: flex;
    flex-direction: column;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    border: 1px solid var(--app-border-default);
    border-radius: 12px;
    box-shadow: -12px 0 36px rgba(15,23,42,0.18);
    overflow: hidden;
}
.agent-center-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid var(--app-border-default);
    flex-shrink: 0;
}
.agent-center-title {
    min-width: 0;
}
.agent-center-title strong {
    display: block;
    font-size: 18px;
    line-height: 1.2;
}
.agent-center-meta {
    margin-top: 4px;
    font-size: 12px;
    color: var(--app-text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.agent-center-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}
.agent-center-button {
    border: 1px solid var(--app-border-default);
    border-radius: 10px;
    background: var(--app-surface-subtle);
    color: var(--app-text-primary);
    padding: 7px 10px;
    font-weight: 800;
    cursor: pointer;
}
.agent-center-tabs {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 6px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--app-border-default);
    flex-shrink: 0;
}
.agent-center-tab {
    border: 1px solid transparent;
    border-radius: 10px;
    background: transparent;
    color: var(--app-text-secondary);
    padding: 8px 6px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
}
.agent-center-tab.is-active {
    border-color: rgba(59,130,246,0.24);
    background: rgba(59,130,246,0.10);
    color: #1d4ed8;
}
.agent-center-content {
    min-height: 0;
    flex: 1;
    overflow: auto;
    -webkit-overflow-scrolling: touch;
    padding: 12px;
}
.agent-center-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.agent-center-filter-row {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
}
.agent-center-filter {
    min-height: 30px;
    border: 1px solid var(--app-border-default);
    border-radius: 999px;
    background: var(--app-surface-card);
    color: var(--app-text-secondary);
    padding: 5px 9px;
    font-size: 12px;
    font-weight: 800;
    white-space: nowrap;
    cursor: pointer;
}
.agent-center-filter.is-active {
    border-color: rgba(59,130,246,0.26);
    background: rgba(59,130,246,0.10);
    color: #1d4ed8;
}
.agent-center-filter.is-danger.is-active {
    border-color: rgba(244,63,94,0.26);
    background: rgba(244,63,94,0.10);
    color: #be123c;
}
.agent-center-card {
    border: 1px solid var(--app-border-default);
    border-radius: 8px;
    background: var(--app-surface-subtle);
    padding: 10px 12px;
}
.agent-center-card.is-failure {
    border-color: rgba(244,63,94,0.24);
    background: rgba(244,63,94,0.07);
}
.agent-center-card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}
.agent-center-card-title {
    font-size: 13px;
    font-weight: 900;
    line-height: 1.35;
    word-break: break-word;
}
.agent-center-card-sub {
    margin-top: 3px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--app-text-secondary);
    word-break: break-word;
}
.agent-center-card-error {
    color: #be123c;
}
.agent-center-chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
}
.agent-center-card-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
}
.agent-center-card-action {
    border: 1px solid var(--app-border-default);
    border-radius: 9px;
    background: var(--app-surface-card);
    color: var(--app-text-primary);
    padding: 6px 9px;
    font-size: 12px;
    font-weight: 800;
    cursor: pointer;
}
.agent-center-card-action.is-primary {
    border-color: rgba(14,165,233,0.34);
    background: rgba(14,165,233,0.14);
    color: #0369a1;
}
.agent-center-card-action.is-danger {
    border-color: rgba(244,63,94,0.24);
    background: rgba(244,63,94,0.08);
    color: #be123c;
}
.agent-center-chip {
    display: inline-flex;
    align-items: center;
    min-height: 22px;
    padding: 4px 7px;
    border-radius: 999px;
    border: 1px solid rgba(148,163,184,0.22);
    color: var(--app-text-secondary);
    font-size: 11px;
    font-weight: 800;
    white-space: nowrap;
}
.agent-center-chip.is-risk-high,
.agent-center-chip.is-risk-medium {
    border-color: rgba(245,158,11,0.24);
    background: rgba(245,158,11,0.10);
    color: #b45309;
}
.agent-center-chip.is-status-failed,
.agent-center-chip.is-status-denied,
.agent-center-chip.is-status-expired {
    border-color: rgba(244,63,94,0.22);
    background: rgba(244,63,94,0.10);
    color: #be123c;
}
.agent-center-chip.is-status-running,
.agent-center-chip.is-status-pending {
    border-color: rgba(59,130,246,0.22);
    background: rgba(59,130,246,0.10);
    color: #1d4ed8;
}
.agent-center-empty {
    padding: 28px 12px;
    color: var(--app-text-secondary);
    text-align: center;
    font-size: 13px;
}
.agent-center-error {
    margin-bottom: 10px;
    padding: 10px 12px;
    border: 1px solid rgba(244,63,94,0.22);
    border-radius: 8px;
    background: rgba(244,63,94,0.08);
    color: #be123c;
    font-size: 12px;
    line-height: 1.5;
}
@media (max-width: 680px) {
    .agent-center-overlay {
        justify-content: center;
    }
    .agent-center-panel {
        width: 100%;
    }
    .agent-center-tabs {
        grid-template-columns: repeat(2, minmax(0, 1fr));
    }
}
`;

const trim = (value, fallback = '') => {
    const text = String(value ?? '').trim();
    return text || fallback;
};

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
}[ch]));

const list = value => (Array.isArray(value) ? value : [value])
    .map(item => trim(item))
    .filter(Boolean);

const formatMeta = (items = []) => items.filter(Boolean).join(' · ');

const statusChipClass = value => `agent-center-chip is-status-${trim(value, 'unknown').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;

const riskChipClass = value => `agent-center-chip is-risk-${trim(value, 'low').toLowerCase().replace(/[^a-z0-9_-]+/g, '-')}`;

const normalizeActivityStatus = (value = '') => {
    const status = trim(value).toLowerCase();
    return ['active', 'failure', 'queued', 'running', 'waiting_permission', 'succeeded', 'failed', 'cancelled'].includes(status)
        ? status
        : '';
};

const normalizeSurface = (value = '') => trim(value).toLowerCase().replace(/[^a-z0-9_-]+/g, '-');

const activityStatusLabel = (status = '') => ({
    active: '运行中',
    failure: '失败',
    queued: '排队',
    running: '运行中',
    waiting_permission: '待确认',
    succeeded: '完成',
    failed: '失败',
    cancelled: '已取消',
}[normalizeActivityStatus(status)] || '全部');

const activityCardClass = status => (
    ['failed', 'cancelled'].includes(trim(status).toLowerCase()) ? 'agent-center-card is-failure' : 'agent-center-card'
);

const renderChips = (chips = []) => {
    const html = chips.filter(Boolean).map((chip) => {
        const label = trim(chip.label);
        if (!label) return '';
        return `<span class="${escapeHtml(chip.className || 'agent-center-chip')}">${escapeHtml(label)}</span>`;
    }).filter(Boolean).join('');
    return html ? `<div class="agent-center-chip-row">${html}</div>` : '';
};

const renderEmpty = message => `<div class="agent-center-empty">${escapeHtml(message)}</div>`;

const renderChatFormatReview = (review = null) => {
    if (!review) return '';
    const issueText = formatMeta([
        `${Number(review.eventCount || 0)} event`,
        `${Number((review.errors || []).length)} error`,
        `${Number((review.warnings || []).length)} warning`,
        review.sourceTextKind ? `source: ${review.sourceTextKind}` : '',
        review.hasRawOriginal ? 'rawOriginal' : '',
    ]);
    const errorText = (review.errors || []).length ? `错误：${(review.errors || []).join('；')}` : '';
    const warningText = (review.warnings || []).length ? `警告：${(review.warnings || []).join('；')}` : '';
    const repairText = review.repairCandidate?.available
        ? `修复候选：${formatMeta([review.repairCandidate.title, review.repairCandidate.summary])}`
        : '';
    const actionText = (review.actionLabels || []).length
        ? `可在消息旁处理：${review.actionLabels.join('、')}`
        : '';
    return [
        issueText ? `<div class="agent-center-card-sub">格式诊断：${escapeHtml(issueText)}</div>` : '',
        errorText ? `<div class="agent-center-card-sub agent-center-card-error">${escapeHtml(errorText)}</div>` : '',
        warningText ? `<div class="agent-center-card-sub">${escapeHtml(warningText)}</div>` : '',
        repairText ? `<div class="agent-center-card-sub">${escapeHtml(repairText)}</div>` : '',
        actionText ? `<div class="agent-center-card-sub">${escapeHtml(actionText)}</div>` : '',
    ].filter(Boolean).join('');
};

const providerToolActionLabel = action => ({
    [PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce]: '允许一次',
    [PROVIDER_TOOL_PERMISSION_ACTIONS.deny]: '拒绝',
    [PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow]: '记住允许',
}[action] || '处理');

const continuationCommitStrategyLabel = strategy => ({
    preview_only: '只预览',
    append_to_previous_bubble: '接到上一气泡',
}[trim(strategy)] || '只预览');

const normalizeContinuationCommitStrategy = strategy => (
    trim(strategy) === 'append_to_previous_bubble' ? 'append_to_previous_bubble' : 'preview_only'
);

export class AgentCenterPanel {
    constructor({
        getActions = () => globalThis.window?.appBridge?.debugUiRegistry?.actions || {},
        confirm = appConfirm,
        getFailureSeenAt = () => 0,
        markFailureSeen = () => {},
    } = {}) {
        this.getActions = getActions;
        this.confirm = confirm;
        this.getFailureSeenAt = getFailureSeenAt;
        this.markFailureSeen = markFailureSeen;
        this.overlayElement = null;
        this.panelElement = null;
        this.contentElement = null;
        this.metaElement = null;
        this.tabsElement = null;
        this.activeTab = 'pending';
        this.activityStatus = '';
        this.surface = '';
        this.view = buildAgentCenterView();
        this.lastError = '';
    }

    ensureStyle() {
        if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = PANEL_CSS;
        document.head.appendChild(style);
    }

    ensureDom() {
        if (this.overlayElement || typeof document === 'undefined') return;
        this.ensureStyle();
        const overlay = document.createElement('div');
        overlay.className = 'agent-center-overlay';
        overlay.dataset.agentCenterOverlay = 'true';
        overlay.innerHTML = `
            <section class="agent-center-panel" role="dialog" aria-modal="true" aria-labelledby="agent-center-title">
                <header class="agent-center-header">
                    <div class="agent-center-title">
                        <strong id="agent-center-title">Agent Center</strong>
                        <div class="agent-center-meta"></div>
                    </div>
                    <div class="agent-center-actions">
                        <button type="button" class="agent-center-button" data-action="refresh">刷新</button>
                        <button type="button" class="agent-center-button" data-action="close">关闭</button>
                    </div>
                </header>
                <nav class="agent-center-tabs" aria-label="Agent Center tabs"></nav>
                <main class="agent-center-content"></main>
            </section>
        `;
        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) this.hide();
        });
        overlay.querySelector('[data-action="close"]')?.addEventListener('click', () => this.hide());
        overlay.querySelector('[data-action="refresh"]')?.addEventListener('click', () => this.refresh());
        this.overlayElement = overlay;
        this.panelElement = overlay.querySelector('.agent-center-panel');
        this.contentElement = overlay.querySelector('.agent-center-content');
        this.metaElement = overlay.querySelector('.agent-center-meta');
        this.tabsElement = overlay.querySelector('.agent-center-tabs');
        document.body.appendChild(overlay);
    }

    async callAction(name, args = undefined, fallback = null) {
        const actions = this.getActions?.() || {};
        const fn = actions?.[name];
        if (typeof fn !== 'function') return fallback;
        try {
            return await Promise.resolve(args === undefined ? fn() : fn(args));
        } catch (err) {
            this.lastError = trim(err?.message || err, `${name} failed`);
            return fallback;
        }
    }

    async collectView(options = {}) {
        this.lastError = '';
        const opts = options && typeof options === 'object' ? options : {};
        const hasSurface = Object.prototype.hasOwnProperty.call(opts, 'surface');
        const hasActivityStatus = Object.prototype.hasOwnProperty.call(opts, 'activityStatus') ||
            Object.prototype.hasOwnProperty.call(opts, 'status');
        const activityStatus = normalizeActivityStatus(hasActivityStatus
            ? (opts.activityStatus || opts.status || '')
            : this.activityStatus);
        const surface = normalizeSurface(hasSurface ? opts.surface : this.surface);
        const failureSeenAt = Number(this.getFailureSeenAt?.({ surface }) || 0) || 0;
        const agentRunView = await this.callAction('listAgentRunView', {
            limit: 50,
            failureSeenAt,
            ...(activityStatus ? { status: activityStatus } : {}),
            ...(surface ? { surface } : {}),
        }, null);
        const [pendingPermissions, contactProfilePendingUpdates, tools, permissionRules, sessionGate, experimentStatus, continuationCommitPolicy] = await Promise.all([
            this.callAction('listProviderToolPendingPermissions', { limit: 100 }, []),
            this.callAction('listContactProfilePendingUpdates', undefined, []),
            this.callAction('listAgentTools', undefined, []),
            this.callAction('listAgentPermissionRules', undefined, []),
            this.callAction('getProviderToolSessionGate', undefined, null),
            this.callAction('getProviderToolExperimentStatus', undefined, null),
            this.callAction('getProviderContinuationCommitPolicy', undefined, null),
        ]);
        return buildAgentCenterView({
            pendingPermissions,
            contactProfilePendingUpdates,
            agentRunView,
            tools,
            permissionRules,
            sessionGate,
            experimentStatus,
            continuationCommitPolicy,
        });
    }

    show(options = {}) {
        const opts = options && typeof options === 'object' ? options : {};
        const tab = Object.prototype.hasOwnProperty.call(opts, 'tab') ? opts.tab : this.activeTab;
        this.ensureDom();
        this.activeTab = trim(tab, 'pending');
        this.activityStatus = normalizeActivityStatus(opts.activityStatus || opts.status || '');
        this.surface = normalizeSurface(opts.surface || '');
        if (this.overlayElement) this.overlayElement.style.display = 'flex';
        this.refresh();
    }

    hide() {
        if (this.overlayElement) this.overlayElement.style.display = 'none';
    }

    async refresh() {
        this.ensureDom();
        this.view = await this.collectView();
        if (this.activeTab === 'activity' && normalizeActivityStatus(this.activityStatus) === 'failure') {
            const newestFailureAt = Number(this.view?.meta?.newestFailureAt || this.view?.activity?.meta?.scopedNewestFailureAt || this.view?.activity?.meta?.newestFailureAt || 0) || 0;
            this.markFailureSeen?.({
                surface: this.surface,
                at: Math.max(Date.now(), newestFailureAt),
            });
            if (this.view?.meta) this.view.meta.unreadFailedRuns = 0;
        }
        this.render();
    }

    setActiveTab(tab = 'pending', { resetActivityStatus = false } = {}) {
        const next = trim(tab, 'pending');
        if (!this.view.tabs.some(item => item.id === next)) return;
        this.activeTab = next;
        if (resetActivityStatus) this.activityStatus = '';
        this.render();
    }

    setActivityStatus(status = '') {
        this.activeTab = 'activity';
        this.activityStatus = normalizeActivityStatus(status);
        this.refresh();
    }

    renderTabs() {
        if (!this.tabsElement) return;
        this.tabsElement.innerHTML = this.view.tabs.map((tab) => `
            <button
                type="button"
                class="agent-center-tab${tab.id === this.activeTab ? ' is-active' : ''}"
                data-tab="${escapeHtml(tab.id)}"
            >${escapeHtml(tab.label)}${tab.count ? ` ${Number(tab.count)}` : ''}</button>
        `).join('');
        this.tabsElement.querySelectorAll('[data-tab]').forEach((button) => {
            button.addEventListener('click', () => this.setActiveTab(button.dataset.tab, {
                resetActivityStatus: button.dataset.tab === 'activity',
            }));
        });
    }

    renderMeta() {
        if (!this.metaElement) return;
        const meta = this.view.meta || {};
        this.metaElement.textContent = formatMeta([
            `待确认 ${Number(meta.pending || 0)}`,
            `活动中 ${Number(meta.activeRuns || 0)}`,
            `失败 ${Number(meta.failedRuns || 0)}`,
            `工具 ${Number(meta.tools || 0)}`,
            this.surface ? `范围 ${this.surface}` : '',
            meta.sessionGateEnabled ? '会话 Gate 开启' : '会话 Gate 关闭',
        ]);
    }

    renderPending() {
        const items = this.view.pending || [];
        if (!items.length) return renderEmpty('没有待确认的 Agent/tool 请求');
        return `<div class="agent-center-list">${items.map(item => {
            const isProfileUpdate = item.kind === 'contact_profile_update';
            const isToolPermission = item.kind === 'tool_permission';
            const impactText = isProfileUpdate
                ? `保存会写入联系人「${item.contactId || item.sessionId || '-'}」画像，并影响后续动态弱触发、提示词上下文和 Agent 画像读取；忽略只清除本次候选，不删除旧画像。`
                : '';
            const toolImpactText = isToolPermission
                ? '允许一次只执行这一个已保存的 tool call；不会重放聊天、不会自动续跑 provider、不会直接写聊天正文。'
                : '';
            const chatEmitPreview = item.chatEmitPreview || null;
            const chatEmitCommitPreview = item.chatEmitCommitPreview || null;
            const chatEmitCommit = item.chatEmitCommit || null;
            const chatEmitMeta = chatEmitPreview
                ? formatMeta([
                    chatEmitPreview.kind,
                    chatEmitPreview.target ? `目标：${chatEmitPreview.target}` : '',
                    chatEmitPreview.speaker ? `说话人：${chatEmitPreview.speaker}` : '',
                    chatEmitPreview.time ? `时间：${chatEmitPreview.time}` : '',
                ])
                : '';
            const isPending = item.status === 'pending';
            return `
            <article class="agent-center-card">
                <div class="agent-center-card-head">
                    <div>
                        <div class="agent-center-card-title">${escapeHtml(item.toolName)}</div>
                        <div class="agent-center-card-sub">${escapeHtml(formatMeta([item.sessionId, item.source]))}</div>
                    </div>
                    <span class="${escapeHtml(statusChipClass(item.status))}">${escapeHtml(item.status)}</span>
                </div>
                ${renderChips([
                    { label: `risk: ${item.riskLevel}`, className: riskChipClass(item.riskLevel) },
                    ...item.permissions.map(permission => ({ label: permission })),
                    item.expiresAt ? { label: `expires: ${new Date(item.expiresAt).toLocaleTimeString()}` } : null,
                ])}
                ${isProfileUpdate ? `
                    <div class="agent-center-card-sub">${escapeHtml(formatMeta([item.reason ? `原因：${item.reason}` : '', item.profileSummary]))}</div>
                    <div class="agent-center-card-sub">${escapeHtml(impactText)}</div>
                    <div class="agent-center-card-actions">
                        <button type="button" class="agent-center-card-action is-primary" data-profile-action="approve" data-pending-id="${escapeHtml(item.id)}">保存画像</button>
                        <button type="button" class="agent-center-card-action is-danger" data-profile-action="deny" data-pending-id="${escapeHtml(item.id)}">忽略</button>
                    </div>
                ` : ''}
                ${isToolPermission ? `
                    <div class="agent-center-card-sub">${escapeHtml(toolImpactText)}</div>
                    ${chatEmitPreview ? `
                        <div class="agent-center-card-sub">候选预览：${escapeHtml(chatEmitMeta || chatEmitPreview.kind || '聊天事件候选')}</div>
                        <div class="agent-center-card-sub">${escapeHtml(chatEmitPreview.contentPreview || '-')}</div>
                    ` : ''}
                    ${chatEmitCommitPreview ? `
                        <div class="agent-center-card-sub">后续提交预览：${escapeHtml(chatEmitCommitPreview.effect || '-')}</div>
                        <div class="agent-center-card-sub">撤销边界：${escapeHtml(chatEmitCommitPreview.undoSummary || '-')}</div>
                    ` : ''}
                    ${renderChips([
                        { label: `resume: ${item.resumeStatus}` },
                        { label: `continue: ${item.continuationStatus}` },
                        chatEmitCommit ? { label: `commit: ${chatEmitCommit.status}` } : null,
                        chatEmitCommit ? { label: `undo: ${chatEmitCommit.undoStatus}` } : null,
                    ])}
                    ${chatEmitCommit?.resultSummary ? `
                        <div class="agent-center-card-sub">提交结果：${escapeHtml(chatEmitCommit.resultSummary)}</div>
                    ` : ''}
                    ${chatEmitCommit?.message ? `
                        <div class="agent-center-card-sub">提交说明：${escapeHtml(chatEmitCommit.message)}</div>
                    ` : ''}
                    ${chatEmitCommit?.undoMessage ? `
                        <div class="agent-center-card-sub">撤销说明：${escapeHtml(chatEmitCommit.undoMessage)}</div>
                    ` : ''}
                    ${chatEmitCommit?.errorMessage ? `
                        <div class="agent-center-card-sub agent-center-card-error">提交错误：${escapeHtml(chatEmitCommit.errorMessage)}</div>
                    ` : ''}
                    ${chatEmitCommit?.undoErrorMessage ? `
                        <div class="agent-center-card-sub agent-center-card-error">撤销错误：${escapeHtml(chatEmitCommit.undoErrorMessage)}</div>
                    ` : ''}
                    ${isPending ? `
                        <div class="agent-center-card-actions">
                            <button type="button" class="agent-center-card-action is-primary" data-provider-permission-action="${PROVIDER_TOOL_PERMISSION_ACTIONS.allowOnce}" data-pending-id="${escapeHtml(item.id)}">允许一次</button>
                            <button type="button" class="agent-center-card-action is-danger" data-provider-permission-action="${PROVIDER_TOOL_PERMISSION_ACTIONS.deny}" data-pending-id="${escapeHtml(item.id)}">拒绝</button>
                            <button type="button" class="agent-center-card-action" data-provider-permission-action="${PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow}" data-pending-id="${escapeHtml(item.id)}">记住允许</button>
                        </div>
                    ` : ''}
                    ${chatEmitCommit?.canCommit || chatEmitCommit?.canUndo ? `
                        <div class="agent-center-card-actions">
                            ${chatEmitCommit?.canCommit ? `<button type="button" class="agent-center-card-action is-primary" data-chat-emit-commit-action="commit" data-pending-id="${escapeHtml(item.id)}">提交候选</button>` : ''}
                            ${chatEmitCommit?.canUndo ? `<button type="button" class="agent-center-card-action is-danger" data-chat-emit-commit-action="undo" data-pending-id="${escapeHtml(item.id)}">撤销提交</button>` : ''}
                        </div>
                    ` : ''}
                ` : ''}
            </article>
        `; }).join('')}</div>`;
    }

    async handleProfilePendingAction(action = '', pendingId = '') {
        const normalizedAction = trim(action);
        const id = trim(pendingId);
        if (!id) return;
        const item = (this.view.pending || []).find(entry => entry.id === id);
        const contactId = item?.contactId || item?.sessionId || '';
        const approving = normalizedAction === 'approve';
        const ok = await this.confirm({
            title: approving ? '保存联系人画像' : '忽略联系人画像',
            message: approving
                ? `确定保存联系人「${contactId || '-'}」的画像候选吗？\n\n保存后会影响后续动态弱触发、提示词上下文和 Agent 画像读取。`
                : `确定忽略联系人「${contactId || '-'}」的画像候选吗？\n\n忽略只清除本次候选，不删除已有画像。`,
            danger: !approving,
            confirmText: approving ? '保存画像' : '忽略',
        });
        if (!ok) return;
        const actionName = approving ? 'approveContactProfilePendingUpdate' : 'denyContactProfilePendingUpdate';
        await this.callAction(actionName, { id }, null);
        await this.refresh();
    }

    async handleProviderPermissionAction(action = '', pendingId = '') {
        const normalizedAction = trim(action);
        const id = trim(pendingId);
        if (!id) return;
        const item = (this.view.pending || []).find(entry => entry.id === id);
        const toolName = item?.toolName || 'tool';
        const label = providerToolActionLabel(normalizedAction);
        const remembering = normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.rememberAllow;
        const denying = normalizedAction === PROVIDER_TOOL_PERMISSION_ACTIONS.deny;
        const ok = await this.confirm({
            title: `${label} Agent 工具`,
            message: denying
                ? `确定拒绝「${toolName}」这次工具请求吗？\n\n拒绝后不会执行工具，也不会续跑 provider。`
                : remembering
                    ? `确定记住允许「${toolName}」吗？\n\n影响范围：当前会话。后续同类白名单工具请求可复用这条权限；执行仍不重放聊天、不直接写聊天正文。`
                    : `确定允许「${toolName}」执行一次吗？\n\n只会执行这一个已保存的 tool call；不会重放聊天、不会自动续跑 provider、不会直接写聊天正文。`,
            confirmText: label,
            danger: denying,
        });
        if (!ok) return;
        const actions = this.getActions?.() || {};
        const resolver = actions.resolveProviderToolPendingPermission;
        if (typeof resolver !== 'function') {
            this.lastError = '当前环境没有 Agent 工具权限处理动作';
            this.render();
            return;
        }
        try {
            await Promise.resolve(resolver({
                id,
                action: normalizedAction,
                reason: 'agent center pending action',
            }));
            await this.refresh();
        } catch (err) {
            this.lastError = trim(err?.message || err, 'resolveProviderToolPendingPermission failed');
            this.render();
        }
    }

    async handleChatEmitCommitAction(action = '', pendingId = '') {
        const normalizedAction = trim(action);
        const id = trim(pendingId);
        if (!id || !['commit', 'undo'].includes(normalizedAction)) return;
        const item = (this.view.pending || []).find(entry => entry.id === id);
        const committing = normalizedAction === 'commit';
        const ok = await this.confirm({
            title: committing ? '提交聊天候选' : '撤销聊天候选',
            message: committing
                ? `确定提交「${item?.toolName || 'chat.emit'}」候选吗？\n\n这一步会实际写入聊天或动态；提交后可从 Agent Center 撤销本次提交。`
                : `确定撤销「${item?.toolName || 'chat.emit'}」刚才提交的候选吗？\n\n撤销会删除本次新增聊天消息，或按提交快照回滚动态变更。`,
            confirmText: committing ? '提交候选' : '撤销提交',
            danger: !committing,
        });
        if (!ok) return;
        const actionName = committing ? 'commitChatEmitPendingPermission' : 'undoChatEmitPendingCommit';
        const result = await this.callAction(actionName, {
            id,
            confirmed: true,
            reason: 'agent center chat emit commit action',
        }, null);
        if (!result) {
            this.lastError = committing
                ? '当前环境没有聊天候选提交动作'
                : '当前环境没有聊天候选撤销动作';
        } else if (result.ok === false && (result.message || result.reason)) {
            this.lastError = result.message || result.reason;
        }
        await this.refresh();
    }

    async handleSessionGateAction(action = '') {
        const normalizedAction = trim(action);
        if (!['enable', 'disable'].includes(normalizedAction)) return;
        const enabling = normalizedAction === 'enable';
        const ok = await this.confirm({
            title: enabling ? '启用当前会话 Gate' : '关闭当前会话 Gate',
            message: enabling
                ? '影响范围：当前会话。启用后，模型输出白名单 tool call 时会进入待确认/允许一次流程；网络、真实 runner 和聊天写入仍默认关闭。'
                : '影响范围：当前会话。关闭后，后续 provider tool call 只会保留捕获/诊断，不会执行工具；已有 Agent 活动记录不会删除。',
            confirmText: enabling ? '启用 Gate' : '关闭 Gate',
            danger: !enabling,
        });
        if (!ok) return;
        const actions = this.getActions?.() || {};
        if (typeof actions.setProviderToolSessionGate !== 'function') {
            this.lastError = '当前环境没有会话 Gate 控制动作';
            this.render();
            return;
        }
        try {
            await Promise.resolve(actions.setProviderToolSessionGate({
                enabled: enabling,
                networkAllowed: false,
                realRunnerAllowed: false,
                source: 'agent_center',
                reason: enabling
                    ? 'enabled from Agent Center safety tab'
                    : 'disabled from Agent Center safety tab',
            }));
            await this.refresh();
        } catch (err) {
            this.lastError = trim(err?.message || err, 'setProviderToolSessionGate failed');
            this.render();
        }
    }

    async handleContinuationPolicyAction(strategy = '') {
        const normalizedStrategy = normalizeContinuationCommitStrategy(strategy);
        const actions = this.getActions?.() || {};
        if (typeof actions.setProviderContinuationCommitPolicy !== 'function') {
            this.lastError = '当前环境没有 Provider continuation 策略设置动作';
            this.render();
            return;
        }
        try {
            await Promise.resolve(actions.setProviderContinuationCommitPolicy({
                defaultStrategy: normalizedStrategy,
            }));
            await this.refresh();
        } catch (err) {
            this.lastError = trim(err?.message || err, 'setProviderContinuationCommitPolicy failed');
            this.render();
        }
    }

    renderActivity() {
        const activity = this.view.activity || {};
        const runs = activity.runs || [];
        const meta = activity.meta || {};
        const statusCounts = this.surface ? (meta.scopedStatusCounts || meta.statusCounts || {}) : (meta.statusCounts || {});
        const activeStatus = normalizeActivityStatus(this.activityStatus);
        const filters = [
            { status: '', label: `全部 ${Number(this.surface ? (meta.scoped ?? meta.filtered ?? 0) : (meta.total || 0))}` },
            { status: 'active', label: `运行中 ${Number(this.surface ? (meta.scopedActive ?? meta.active ?? 0) : (meta.active || 0))}` },
            { status: 'failure', label: `失败 ${Number(this.surface ? (meta.scopedFailures ?? meta.failures ?? 0) : (meta.failures || 0))}`, tone: 'danger' },
            { status: 'succeeded', label: `完成 ${Number(statusCounts.succeeded || 0)}` },
        ];
        const filterHtml = `<div class="agent-center-filter-row" aria-label="Agent activity filters">${filters.map(filter => `
            <button
                type="button"
                class="agent-center-filter${activeStatus === filter.status ? ' is-active' : ''}${filter.tone === 'danger' ? ' is-danger' : ''}"
                data-activity-status="${escapeHtml(filter.status)}"
            >${escapeHtml(filter.label)}</button>
        `).join('')}</div>`;
        if (!runs.length) return `${filterHtml}${renderEmpty(activeStatus ? `没有${activityStatusLabel(activeStatus)} Agent 活动` : '还没有 Agent 活动记录')}`;
        return `${filterHtml}<div class="agent-center-list">${runs.map(run => {
            const failureDetail = trim(run.errorMessage || run.cancelReason || run.lastStep?.errorMessage);
            return `
            <article class="${escapeHtml(activityCardClass(run.status))}">
                <div class="agent-center-card-head">
                    <div>
                        <div class="agent-center-card-title">${escapeHtml(run.title || run.kind || run.id)}</div>
                        <div class="agent-center-card-sub">${escapeHtml(formatMeta([run.kind, run.source, run.sessionId]))}</div>
                    </div>
                    <span class="${escapeHtml(statusChipClass(run.status))}">${escapeHtml(run.status)}</span>
                </div>
                <div class="agent-center-card-sub">${escapeHtml(run.summary || run.lastStep?.summary || run.errorMessage || '-')}</div>
                ${failureDetail ? `<div class="agent-center-card-sub agent-center-card-error">错误：${escapeHtml(failureDetail)}</div>` : ''}
                ${renderChips([
                    { label: `steps ${Number(run.stepCount || 0)}` },
                    { label: `tools ${Number(run.toolCallCount || 0)}` },
                    run.lastStep ? { label: `last: ${run.lastStep.type}` } : null,
                ])}
                ${renderChatFormatReview(run.review)}
            </article>
        `; }).join('')}</div>`;
    }

    renderTools() {
        const tools = this.view.tools || [];
        if (!tools.length) return renderEmpty('还没有注册 Agent 工具');
        return `<div class="agent-center-list">${tools.map(tool => `
            <article class="agent-center-card">
                <div class="agent-center-card-title">${escapeHtml(tool.title || tool.name)}</div>
                <div class="agent-center-card-sub">${escapeHtml(formatMeta([tool.name, tool.source, tool.description]))}</div>
                ${renderChips([
                    { label: `risk: ${tool.riskLevel}`, className: riskChipClass(tool.riskLevel) },
                    { label: tool.executionMode },
                    ...tool.permissions.map(permission => ({ label: permission })),
                ])}
                ${renderChips([
                    { label: tool.capabilities?.read ? 'read' : 'no read' },
                    { label: tool.capabilities?.write ? 'write' : 'read-only' },
                    { label: tool.capabilities?.network ? 'network' : 'local' },
                    { label: `cost: ${tool.capabilities?.cost || 'none'}` },
                    { label: `undo: ${tool.capabilities?.undo || 'none'}` },
                    { label: `model: ${tool.capabilities?.modelContext || 'none'}` },
                    { label: `confirm: ${tool.capabilities?.confirmation || 'allow_once'}` },
                ])}
            </article>
        `).join('')}</div>`;
    }

    renderSafety() {
        const safety = this.view.safety || {};
        const gate = safety.sessionGate || {};
        const provider = safety.providerTools || {};
        const policy = safety.continuationCommitPolicy || {};
        const gateEnabled = gate.enabled === true;
        const defaultStrategy = normalizeContinuationCommitStrategy(policy.defaultStrategy);
        return `<div class="agent-center-list">
            <article class="agent-center-card">
                <div class="agent-center-card-head">
                    <div>
                        <div class="agent-center-card-title">Provider Tool Gate</div>
                        <div class="agent-center-card-sub">${escapeHtml(gateEnabled ? '当前会话允许白名单工具进入待确认执行链路' : '当前会话未开启 provider tool 执行')}</div>
                    </div>
                    <span class="${escapeHtml(statusChipClass(gateEnabled ? 'running' : 'denied'))}">${escapeHtml(gateEnabled ? '开启' : '关闭')}</span>
                </div>
                <div class="agent-center-card-sub">首版只建议开放低风险读取或候选捕获工具。启用 Gate 不会自动续跑 provider，不会直接写聊天正文，网络和真实 runner 默认保持关闭。</div>
                ${renderChips([
                    { label: gate.networkAllowed ? 'network allowed' : 'network blocked' },
                    { label: gate.realRunnerAllowed ? 'real runner allowed' : 'real runner blocked' },
                    { label: gate.writesChat ? 'writes chat' : 'writes chat blocked' },
                    ...list(gate.allowedTools).map(tool => ({ label: tool })),
                ])}
                <div class="agent-center-card-actions">
                    <button
                        type="button"
                        class="agent-center-card-action${gateEnabled ? '' : ' is-primary'}"
                        data-session-gate-action="${escapeHtml(gateEnabled ? 'disable' : 'enable')}"
                    >${escapeHtml(gateEnabled ? '关闭当前会话 Gate' : '启用当前会话 Gate')}</button>
                </div>
            </article>
            <article class="agent-center-card">
                <div class="agent-center-card-title">Provider Tool Experiment</div>
                <div class="agent-center-card-sub">${escapeHtml(provider.enabled ? '实验入口开启' : '实验入口关闭')}</div>
                ${renderChips([
                    { label: provider.enabled ? 'enabled' : 'disabled', className: statusChipClass(provider.enabled ? 'running' : 'denied') },
                    ...list(provider.allowedTools).map(tool => ({ label: tool })),
                ])}
            </article>
            <article class="agent-center-card">
                <div class="agent-center-card-head">
                    <div>
                        <div class="agent-center-card-title">Continuation 默认策略</div>
                        <div class="agent-center-card-sub">工具结果后的 provider 继续执行仍会弹出确认；这里只决定确认面板的默认提交方式。</div>
                    </div>
                    <span class="${escapeHtml(statusChipClass('pending'))}">${escapeHtml(continuationCommitStrategyLabel(defaultStrategy))}</span>
                </div>
                <div class="agent-center-card-actions">
                    ${['preview_only', 'append_to_previous_bubble'].map(strategy => `
                        <button
                            type="button"
                            class="agent-center-card-action${defaultStrategy === strategy ? ' is-primary' : ''}"
                            data-continuation-policy-strategy="${escapeHtml(strategy)}"
                        >${escapeHtml(continuationCommitStrategyLabel(strategy))}</button>
                    `).join('')}
                </div>
            </article>
            <article class="agent-center-card">
                <div class="agent-center-card-title">Permission Rules</div>
                <div class="agent-center-card-sub">${Number((safety.permissionRules || []).length)} 条规则。当前壳只读展示，不在这里修改权限。</div>
            </article>
        </div>`;
    }

    render() {
        this.renderMeta();
        this.renderTabs();
        if (!this.contentElement) return;
        const error = this.lastError
            ? `<div class="agent-center-error">${escapeHtml(this.lastError)}</div>`
            : '';
        const body = this.activeTab === 'pending'
            ? this.renderPending()
            : this.activeTab === 'activity'
                ? this.renderActivity()
                : this.activeTab === 'tools'
                    ? this.renderTools()
                    : this.renderSafety();
        this.contentElement.innerHTML = `${error}${body}`;
        if (this.activeTab === 'pending') {
            this.contentElement.querySelectorAll('[data-profile-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleProfilePendingAction(
                    button.dataset.profileAction || '',
                    button.dataset.pendingId || '',
                ));
            });
            this.contentElement.querySelectorAll('[data-provider-permission-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleProviderPermissionAction(
                    button.dataset.providerPermissionAction || '',
                    button.dataset.pendingId || '',
                ));
            });
            this.contentElement.querySelectorAll('[data-chat-emit-commit-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleChatEmitCommitAction(
                    button.dataset.chatEmitCommitAction || '',
                    button.dataset.pendingId || '',
                ));
            });
        }
        if (this.activeTab === 'activity') {
            this.contentElement.querySelectorAll('[data-activity-status]').forEach((button) => {
                button.addEventListener('click', () => this.setActivityStatus(button.dataset.activityStatus || ''));
            });
        }
        if (this.activeTab === 'safety') {
            this.contentElement.querySelectorAll('[data-session-gate-action]').forEach((button) => {
                button.addEventListener('click', () => this.handleSessionGateAction(button.dataset.sessionGateAction || ''));
            });
            this.contentElement.querySelectorAll('[data-continuation-policy-strategy]').forEach((button) => {
                button.addEventListener('click', () => this.handleContinuationPolicyAction(button.dataset.continuationPolicyStrategy || ''));
            });
        }
    }
}
