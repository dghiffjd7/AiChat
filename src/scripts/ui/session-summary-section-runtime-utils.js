import {
    buildSelectedSummaryEntries,
    parseEditedSummaryLines,
} from './session-summary-utils.js';
import {
    openCompactedRawFlow,
    openCompactedSummaryEditFlow,
    runCompactedSummaryGenerationFlow,
    runDeleteSelectedSummariesFlow,
    runEditSelectedSummariesFlow,
} from './session-summary-runtime-utils.js';
import {
    applySessionSummaryBatchMode,
    ensureSessionEditableSummaryModal,
    ensureSessionReadonlySummaryModal,
    openSessionEditableSummaryModal,
} from './session-summary-panel-runtime-utils.js';
import {
    renderSessionCompactedSummarySection,
    renderSessionSummariesSection,
} from './session-summary-view-utils.js';

const defaultCopyText = async (text) => navigator.clipboard?.writeText?.(text);

export const createSessionSummarySectionRuntime = ({
    variant = 'contact',
    getSessionId = () => '',
    getChatStore = () => null,
    getSummariesContainer = () => null,
    getCompactedContainer = () => null,
    getBatchBar = () => null,
    getBatchMode = () => false,
    setBatchModeState = () => {},
    getSelectedKeys = () => new Set(),
    setSelectedKeys = () => {},
    getSummaryCompacting = () => false,
    setSummaryCompacting = () => {},
    confirm = null,
    copyText = defaultCopyText,
    toastr = null,
    logger = null,
    getNormalRowStyle = () => 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06);',
    dispatchUpdated = () => {},
    resolveRequestSummaryCompaction = () => null,
    deps = {},
} = {}) => {
    const runtimeDeps = {
        buildSelectedSummaryEntries,
        parseEditedSummaryLines,
        openCompactedRawFlow,
        openCompactedSummaryEditFlow,
        runCompactedSummaryGenerationFlow,
        runDeleteSelectedSummariesFlow,
        runEditSelectedSummariesFlow,
        applySessionSummaryBatchMode,
        ensureSessionEditableSummaryModal,
        ensureSessionReadonlySummaryModal,
        openSessionEditableSummaryModal,
        renderSessionCompactedSummarySection,
        renderSessionSummariesSection,
        ...deps,
    };

    let compactedRawModal = null;
    let compactedEditModal = null;
    let summaryEditModal = null;

    const ensureCompactedRawModal = () => {
        compactedRawModal = runtimeDeps.ensureSessionReadonlySummaryModal({
            currentModal: compactedRawModal,
            variant,
            copyText,
            toastr,
        });
        return compactedRawModal;
    };

    const ensureCompactedEditModal = () => {
        compactedEditModal = runtimeDeps.ensureSessionEditableSummaryModal({
            currentModal: compactedEditModal,
            variant,
            title: '编辑大总结',
            minHeight: '200px',
        });
        return compactedEditModal;
    };

    const ensureSummaryEditModal = () => {
        summaryEditModal = runtimeDeps.ensureSessionEditableSummaryModal({
            currentModal: summaryEditModal,
            variant,
            title: '批量编辑摘要',
            helperText: '每行一条摘要（顺序对应所选摘要）。',
            minHeight: '180px',
        });
        return summaryEditModal;
    };

    const openSummaryEditModal = (value, onSave) => {
        runtimeDeps.openSessionEditableSummaryModal({
            modal: ensureSummaryEditModal(),
            value,
            onSave,
        });
    };

    const closeSummaryEditModal = () => {
        summaryEditModal?.close?.();
    };

    const renderSummaries = () => runtimeDeps.renderSessionSummariesSection({
        container: getSummariesContainer(),
        sessionId: getSessionId(),
        chatStore: getChatStore(),
        batchMode: getBatchMode(),
        selectedKeys: getSelectedKeys(),
        onSelectionChange: (next) => {
            setSelectedKeys(next);
            renderSummaries();
        },
        copyText,
        copySuccessText: '已复制摘要',
        normalRowStyle: getNormalRowStyle(),
    });

    const renderCompactedSummary = () => runtimeDeps.renderSessionCompactedSummarySection({
        container: getCompactedContainer(),
        sessionId: getSessionId(),
        chatStore: getChatStore(),
        copyText,
        copySuccessText: '已复制大总结',
    });

    return {
        setSummaryBatchMode(enabled) {
            setBatchModeState(runtimeDeps.applySessionSummaryBatchMode({
                enabled,
                batchBarEl: getBatchBar(),
                clearSelectedKeys: () => {
                    setSelectedKeys(new Set());
                },
                renderSummaries,
            }));
        },

        openCompactedRaw() {
            runtimeDeps.openCompactedRawFlow({
                sessionId: getSessionId(),
                getCompactedSummaryRaw: (sessionId) => getChatStore()?.getCompactedSummaryRaw?.(sessionId),
                ensureModal: ensureCompactedRawModal,
                setRawValue: (raw) => compactedRawModal?.setValue?.(raw),
                showModal: () => compactedRawModal?.show?.(),
                focusTextarea: () => compactedRawModal?.focus?.(),
                toastr,
            });
        },

        editCompactedSummary() {
            runtimeDeps.openCompactedSummaryEditFlow({
                sessionId: getSessionId(),
                getCompactedSummary: (sessionId) => getChatStore()?.getCompactedSummary?.(sessionId),
                getCompactedSummaryRaw: (sessionId) => getChatStore()?.getCompactedSummaryRaw?.(sessionId),
                ensureModal: ensureCompactedEditModal,
                setOnSave: (handler) => compactedEditModal?.setOnSave?.(handler),
                setTextareaValue: (text) => compactedEditModal?.setValue?.(text),
                showModal: () => compactedEditModal?.show?.(),
                focusTextarea: () => compactedEditModal?.focus?.(),
                setCompactedSummary: (text, sessionId, options) =>
                    getChatStore()?.setCompactedSummary?.(text, sessionId, options),
                renderCompactedSummary,
                closeModal: () => compactedEditModal?.close?.(),
                dispatchUpdated,
                toastr,
            });
        },

        async deleteSelectedSummaries() {
            await runtimeDeps.runDeleteSelectedSummariesFlow({
                sessionId: getSessionId(),
                selectedKeys: [...getSelectedKeys()],
                confirm,
                buildSelectedSummaryEntries: runtimeDeps.buildSelectedSummaryEntries,
                deleteSummaryItems: (items, sessionId) => getChatStore()?.deleteSummaryItems?.(items, sessionId),
                setSummaryBatchMode: (enabled) => this.setSummaryBatchMode(enabled),
                renderSummaries,
                toastr,
            });
        },

        editSelectedSummaries() {
            runtimeDeps.runEditSelectedSummariesFlow({
                sessionId: getSessionId(),
                selectedKeys: [...getSelectedKeys()],
                buildSelectedSummaryEntries: runtimeDeps.buildSelectedSummaryEntries,
                openSummaryEditModal,
                parseEditedSummaryLines: runtimeDeps.parseEditedSummaryLines,
                updateSummaryItems: (updates, sessionId) => getChatStore()?.updateSummaryItems?.(updates, sessionId),
                closeSummaryEditModal,
                setSummaryBatchMode: (enabled) => this.setSummaryBatchMode(enabled),
                renderSummaries,
                toastr,
            });
        },

        async runCompactedSummary() {
            await runtimeDeps.runCompactedSummaryGenerationFlow({
                sessionId: getSessionId(),
                summaryCompacting: getSummaryCompacting(),
                setSummaryCompacting,
                resolveRequestSummaryCompaction,
                renderSummaries,
                renderCompactedSummary,
                logger,
                toastr,
            });
        },

        renderSummaries,
        renderCompactedSummary,
    };
};
