const noop = () => {};

export const bindSessionMemoryShareButton = ({
    buttonEl = null,
    openManager = async () => {},
    logger = null,
    warnMessage = 'open memory share manager failed',
    errorMessage = '打开记忆共享失败',
    toastr = null,
} = {}) => {
    if (!buttonEl?.addEventListener) return false;
    buttonEl.addEventListener('click', () => {
        Promise.resolve(openManager()).catch((err) => {
            logger?.warn?.(warnMessage, err);
            toastr?.error?.(errorMessage);
        });
    });
    return true;
};

export const bindSessionSummarySectionControls = ({
    clearButtonEl = null,
    batchButtonEl = null,
    batchCancelButtonEl = null,
    batchDeleteButtonEl = null,
    batchEditButtonEl = null,
    compactedRawButtonEl = null,
    compactedEditButtonEl = null,
    compactedRunButtonEl = null,
    compactedClearButtonEl = null,
    getSessionId = () => '',
    getSummaryBatchMode = () => false,
    clearSelectedKeys = noop,
    setSummaryBatchMode = noop,
    renderSummaries = noop,
    deleteSelectedSummaries = noop,
    editSelectedSummaries = noop,
    openCompactedRaw = noop,
    editCompactedSummary = noop,
    runCompactedSummary = noop,
    renderCompactedSummary = noop,
    clearSummaries = noop,
    clearCompactedSummary = noop,
    confirm = async () => false,
    summaryClearTitle = '清空摘要',
    summaryClearMessage = '确定要清空当前存档/聊天的所有摘要吗？',
    compactedClearTitle = '清空大总结',
    compactedClearMessage = '确定要清空当前存档/聊天的大总结吗？',
} = {}) => {
    clearButtonEl?.addEventListener?.('click', async () => {
        const sessionId = String(getSessionId() || '').trim();
        if (!sessionId) return;
        const ok = await confirm({
            title: summaryClearTitle,
            message: summaryClearMessage,
            danger: true,
        });
        if (!ok) return;
        try {
            clearSummaries(sessionId);
        } catch {}
        clearSelectedKeys();
        setSummaryBatchMode(false);
        renderSummaries();
    });

    batchButtonEl?.addEventListener?.('click', () => {
        setSummaryBatchMode(!getSummaryBatchMode());
    });
    batchCancelButtonEl?.addEventListener?.('click', () => setSummaryBatchMode(false));
    batchDeleteButtonEl?.addEventListener?.('click', () => deleteSelectedSummaries());
    batchEditButtonEl?.addEventListener?.('click', () => editSelectedSummaries());
    compactedRawButtonEl?.addEventListener?.('click', () => openCompactedRaw());
    compactedEditButtonEl?.addEventListener?.('click', () => editCompactedSummary());
    compactedRunButtonEl?.addEventListener?.('click', () => runCompactedSummary());
    compactedClearButtonEl?.addEventListener?.('click', async () => {
        const sessionId = String(getSessionId() || '').trim();
        if (!sessionId) return;
        const ok = await confirm({
            title: compactedClearTitle,
            message: compactedClearMessage,
            danger: true,
        });
        if (!ok) return;
        try {
            clearCompactedSummary(sessionId);
        } catch {}
        renderCompactedSummary();
    });
    return true;
};

export const bindSessionPanelSharedWindowEvents = ({
    target = globalThis.window,
    isPanelVisible = () => false,
    applyMemoryMode = noop,
    getSessionId = () => '',
    renderSummaries = noop,
    renderCompactedSummary = noop,
} = {}) => {
    if (!target?.addEventListener) return false;
    target.addEventListener('memory-storage-mode-changed', () => {
        try {
            if (!isPanelVisible()) return;
            applyMemoryMode();
        } catch {}
    });
    target.addEventListener('chatapp-summaries-updated', (ev) => {
        try {
            if (!isPanelVisible()) return;
            const sessionId = String(getSessionId() || '').trim();
            const targetSessionId = String(ev?.detail?.sessionId || '').trim();
            if (!sessionId || !targetSessionId || sessionId !== targetSessionId) return;
            renderSummaries();
            renderCompactedSummary();
        } catch {}
    });
    return true;
};
