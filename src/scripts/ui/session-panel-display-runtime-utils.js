export const applySessionPanelMemoryMode = ({
    memoryMode = 'off',
    memoryFeaturesSection = null,
    summarySection = null,
    memoryTableSection = null,
    renderMemoryTable = null,
} = {}) => {
    const normalizedMode = String(memoryMode || 'off').trim() || 'off';
    const memoryOn = normalizedMode !== 'off';
    const summaryOn = normalizedMode === 'summary';
    if (memoryFeaturesSection) memoryFeaturesSection.style.display = memoryOn ? 'block' : 'none';
    if (summarySection) summarySection.style.display = memoryOn && summaryOn ? 'block' : 'none';
    if (memoryTableSection) memoryTableSection.style.display = memoryOn && !summaryOn ? 'block' : 'none';
    if (memoryOn && !summaryOn) {
        renderMemoryTable?.();
    }
    return {
        memoryMode: normalizedMode,
        memoryOn,
        summaryOn,
    };
};

export const runSessionPanelShowFlow = ({
    ensureUi = null,
    beforeShow = null,
    applyMemoryMode = null,
    populate = null,
    renderArchives = null,
    renderSummaries = null,
    renderCompactedSummary = null,
    getMemoryMode = () => 'off',
    renderMemoryTable = null,
    getOverlayEl = () => null,
    getPanelEl = () => null,
} = {}) => {
    ensureUi?.();
    beforeShow?.();
    applyMemoryMode?.();
    populate?.();
    renderArchives?.();
    renderSummaries?.();
    renderCompactedSummary?.();
    if (String(getMemoryMode?.() || '').trim() === 'table') {
        renderMemoryTable?.();
    }
    const overlayEl = getOverlayEl?.();
    const panelEl = getPanelEl?.();
    if (overlayEl) overlayEl.style.display = 'block';
    if (panelEl) panelEl.style.display = 'flex';
    return true;
};
