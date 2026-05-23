const STYLE_ID = 'agent-center-status-chip-style';
const DEFAULT_REFRESH_INTERVAL_MS = 6000;

const STATUS_CHIP_CSS = `
.chat-room-topbar .chat-room-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.agent-status-chip {
    height: 28px;
    max-width: 118px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 0 8px;
    border: 1px solid rgba(15, 23, 42, 0.10);
    border-radius: 999px;
    background: var(--app-surface-card);
    color: var(--app-text-secondary);
    font-size: 11px;
    font-weight: 800;
    line-height: 1;
    cursor: pointer;
    flex: 0 1 auto;
    min-width: 0;
    -webkit-tap-highlight-color: transparent;
    transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease, transform 0.16s ease;
}
.chat-room-topbar .agent-status-chip {
    position: relative;
    z-index: 2;
}
.agent-status-chip:hover {
    background: var(--app-surface-subtle);
    color: var(--app-text-primary);
    transform: translateY(-1px);
}
.agent-status-chip:active {
    transform: scale(0.96);
}
.agent-status-chip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgba(148, 163, 184, 0.9);
    flex-shrink: 0;
}
.agent-status-chip-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.agent-status-chip-count {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(15, 23, 42, 0.08);
    color: inherit;
    font-size: 10px;
    line-height: 1;
    flex-shrink: 0;
}
.agent-status-chip:not(.has-count) .agent-status-chip-count {
    display: none;
}
.agent-status-chip.is-pending {
    border-color: rgba(37, 99, 235, 0.26);
    background: rgba(37, 99, 235, 0.10);
    color: #1d4ed8;
}
.agent-status-chip.is-pending .agent-status-chip-dot {
    background: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}
.agent-status-chip.is-active {
    border-color: rgba(16, 185, 129, 0.24);
    background: rgba(16, 185, 129, 0.10);
    color: #047857;
}
.agent-status-chip.is-active .agent-status-chip-dot {
    background: #10b981;
    box-shadow: 0 0 0 3px rgba(16, 185, 129, 0.13);
}
.agent-status-chip.is-failed {
    border-color: rgba(244, 63, 94, 0.24);
    background: rgba(244, 63, 94, 0.10);
    color: #be123c;
}
.agent-status-chip.is-failed .agent-status-chip-dot {
    background: #f43f5e;
    box-shadow: 0 0 0 3px rgba(244, 63, 94, 0.13);
}
.agent-status-chip.is-ready {
    border-color: rgba(99, 102, 241, 0.22);
    background: rgba(99, 102, 241, 0.09);
    color: #4338ca;
}
body[data-theme-mode='dark'] .agent-status-chip {
    border-color: rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.76);
    color: #cbd5e1;
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.04) inset;
}
body[data-theme-mode='dark'] .agent-status-chip:hover {
    border-color: rgba(148, 163, 184, 0.34);
    background: rgba(30, 41, 59, 0.88);
    color: #f8fafc;
}
body[data-theme-mode='dark'] .agent-status-chip-count {
    background: rgba(148, 163, 184, 0.18);
}
body[data-theme-mode='dark'] .agent-status-chip.is-pending {
    border-color: rgba(96, 165, 250, 0.34);
    background: rgba(37, 99, 235, 0.20);
    color: #93c5fd;
}
body[data-theme-mode='dark'] .agent-status-chip.is-active {
    border-color: rgba(52, 211, 153, 0.34);
    background: rgba(16, 185, 129, 0.18);
    color: #6ee7b7;
}
body[data-theme-mode='dark'] .agent-status-chip.is-failed {
    border-color: rgba(251, 113, 133, 0.36);
    background: rgba(244, 63, 94, 0.18);
    color: #fda4af;
}
body[data-theme-mode='dark'] .agent-status-chip.is-ready {
    border-color: rgba(129, 140, 248, 0.36);
    background: rgba(99, 102, 241, 0.20);
    color: #c4b5fd;
}
.moments-actions .agent-status-chip {
    max-width: 96px;
}
@media (max-width: 420px) {
    .agent-status-chip {
        max-width: 92px;
        padding: 0 7px;
    }
    .chat-room-topbar .agent-status-chip {
        max-width: 48px;
    }
    .chat-room-topbar .agent-status-chip-label {
        display: none;
    }
}
@media (prefers-reduced-motion: reduce) {
    .agent-status-chip {
        transition: none !important;
    }
    .agent-status-chip:hover,
    .agent-status-chip:active {
        transform: none !important;
    }
}
`;

const toCount = value => Math.max(0, Math.trunc(Number(value) || 0));

const isActiveRun = run => run?.isActive === true || ['queued', 'running', 'waiting_permission'].includes(String(run?.status || '').trim());
const isFailedRun = run => run?.isFailure === true || ['failed', 'cancelled'].includes(String(run?.status || '').trim());

export const buildAgentStatusChipView = (agentCenterView = {}, {
    activityScope = 'meta',
    idleLabel = 'Agent',
    showSessionGateState = true,
    showToolsCount = true,
} = {}) => {
    const meta = agentCenterView?.meta || {};
    const visibleRuns = Array.isArray(agentCenterView?.activity?.runs) ? agentCenterView.activity.runs : [];
    const useVisibleActivity = activityScope === 'visible';
    const pending = toCount(meta.pending);
    const activeRuns = useVisibleActivity ? visibleRuns.filter(isActiveRun).length : toCount(meta.activeRuns);
    const failedRuns = useVisibleActivity ? visibleRuns.filter(isFailedRun).length : toCount(meta.failedRuns);
    const tools = showToolsCount ? toCount(meta.tools) : 0;
    const sessionGateEnabled = showSessionGateState && meta.sessionGateEnabled === true;

    if (pending > 0) {
        return {
            label: '待确认',
            count: String(pending),
            tone: 'pending',
            tab: 'pending',
            title: `打开 Agent Center，${pending} 个请求待确认`,
        };
    }
    if (activeRuns > 0) {
        return {
            label: '运行中',
            count: String(activeRuns),
            tone: 'active',
            tab: 'activity',
            activityStatus: 'active',
            title: `打开 Agent Center，${activeRuns} 个 Agent 任务运行中`,
        };
    }
    if (failedRuns > 0) {
        return {
            label: '失败',
            count: String(failedRuns),
            tone: 'failed',
            tab: 'activity',
            activityStatus: 'failure',
            title: `打开 Agent Center，${failedRuns} 个 Agent 任务失败`,
        };
    }
    if (sessionGateEnabled) {
        return {
            label: 'Agent 开启',
            count: tools ? String(tools) : '',
            tone: 'ready',
            tab: 'safety',
            activityStatus: '',
            title: '打开 Agent Center，查看工具与安全状态',
        };
    }
    return {
        label: idleLabel,
        count: tools ? String(tools) : '',
        tone: 'idle',
        tab: 'activity',
        activityStatus: '',
        title: tools ? `打开 Agent Center，${tools} 个工具已注册` : '打开 Agent Center',
    };
};

export class AgentCenterStatusChip {
    constructor({
        documentRef = globalThis.document,
        rootElement = null,
        beforeElement = null,
        collectView = async () => ({}),
        openAgentCenter = () => {},
        refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
        activityScope = 'meta',
        idleLabel = 'Agent',
        showSessionGateState = true,
        showToolsCount = true,
    } = {}) {
        this.documentRef = documentRef;
        this.rootElement = rootElement;
        this.beforeElement = beforeElement;
        this.collectView = collectView;
        this.openAgentCenter = openAgentCenter;
        this.refreshIntervalMs = Math.max(0, Number(refreshIntervalMs) || 0);
        this.viewOptions = { activityScope, idleLabel, showSessionGateState, showToolsCount };
        this.element = null;
        this.labelElement = null;
        this.countElement = null;
        this.state = buildAgentStatusChipView({}, this.viewOptions);
        this.refreshTimer = null;
        this.refreshToken = 0;
    }

    ensureStyle() {
        const doc = this.documentRef;
        if (!doc || doc.getElementById?.(STYLE_ID)) return;
        const style = doc.createElement('style');
        style.id = STYLE_ID;
        style.textContent = STATUS_CHIP_CSS;
        doc.head?.appendChild?.(style);
    }

    mount() {
        const doc = this.documentRef;
        const root = this.rootElement;
        if (!doc || !root || this.element) return this.element;
        this.ensureStyle();
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'agent-status-chip';
        button.innerHTML = `
            <span class="agent-status-chip-dot" aria-hidden="true"></span>
            <span class="agent-status-chip-label"></span>
            <span class="agent-status-chip-count"></span>
        `;
        button.addEventListener('click', () => {
            this.openAgentCenter({
                tab: this.state.tab || 'activity',
                activityStatus: this.state.activityStatus || '',
            });
            this.refresh();
        });
        if (this.beforeElement && this.beforeElement.parentNode === root) {
            root.insertBefore(button, this.beforeElement);
        } else {
            root.appendChild(button);
        }
        this.element = button;
        this.labelElement = button.querySelector('.agent-status-chip-label');
        this.countElement = button.querySelector('.agent-status-chip-count');
        this.render(this.state);
        this.refresh();
        this.start();
        return this.element;
    }

    start() {
        if (!this.refreshIntervalMs || this.refreshTimer) return;
        this.refreshTimer = setInterval(() => {
            if (this.documentRef?.visibilityState === 'hidden') return;
            this.refresh();
        }, this.refreshIntervalMs);
    }

    stop() {
        if (!this.refreshTimer) return;
        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
    }

    async refresh() {
        const token = ++this.refreshToken;
        try {
            const view = await Promise.resolve(this.collectView());
            if (token !== this.refreshToken) return;
            this.render(buildAgentStatusChipView(view, this.viewOptions));
        } catch (err) {
            if (token !== this.refreshToken) return;
            this.render({
                label: 'Agent',
                count: '!',
                tone: 'failed',
                tab: 'activity',
                activityStatus: 'failure',
                title: `Agent 状态读取失败：${String(err?.message || err || 'unknown error')}`,
            });
        }
    }

    render(state = buildAgentStatusChipView({}, this.viewOptions)) {
        this.state = state;
        if (!this.element) return;
        const tone = String(state.tone || 'idle').replace(/[^a-z0-9_-]+/gi, '-').toLowerCase() || 'idle';
        const count = String(state.count || '').trim();
        this.element.className = `agent-status-chip is-${tone}${count ? ' has-count' : ''}`;
        this.element.dataset.agentStatusTone = tone;
        this.element.title = state.title || '打开 Agent Center';
        this.element.setAttribute('aria-label', state.title || '打开 Agent Center');
        if (this.labelElement) this.labelElement.textContent = state.label || 'Agent';
        if (this.countElement) this.countElement.textContent = count;
    }
}
