import { isRpSessionId } from '../memory/memory-context-utils.js';
import {
    getChatToRpBridgeSourceMeta,
    normalizeBridgeLimit,
    pruneChatToRpBridgeTableSettings,
    pruneRpToChatBridgeTableSettings,
    resolveChatToRpBridgeTableSettings,
    resolveRpToChatBridgeTableSettings,
} from '../memory/memory-bridge-utils.js';
import {
    closeSessionMemoryShareModal,
    finalizeSessionMemoryShareSave,
    mountSessionMemoryShareModal,
    openSessionMemoryShareManager,
    refreshSessionMemoryShareSummary,
    renderSessionMemoryShareManager,
} from './session-memory-share-runtime-utils.js';

const asObject = (value) => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {}
);

export const buildSessionMemoryShareDraft = ({
    sessionId = '',
    sessionSettings = {},
    isRpTarget = false,
} = {}) => {
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedSettings = asObject(sessionSettings);
    const sourceId = isRpTarget ? String(normalizedSettings.chatBridgeSourceSessionId || '').trim() : '';
    const tableSettings = isRpTarget
        ? {
            ...(sourceId
                ? asObject(normalizedSettings.chatBridgeTableSettings)
                : asObject(normalizedSettings.chatBridgeAllSocialTableSettings)),
        }
        : {
            ...asObject(normalizedSettings.rpBridgeTableSettings),
        };
    return {
        sessionId: normalizedSessionId,
        sourceId,
        tableSettings,
    };
};

export const applyChatToRpMemoryShareSettings = ({
    sessionSettings = {},
    draft = null,
    fallbackEnabled = true,
    fallbackLimit = 0,
    normalizeLimit = normalizeBridgeLimit,
} = {}) => {
    const nextSettings = { ...asObject(sessionSettings) };
    const sourceId = String(draft?.sourceId || '').trim();
    const { sourceMode, sourceIsGroup } = getChatToRpBridgeSourceMeta(sourceId);
    if (sourceMode === 'all_social') {
        const normalizedAllSocialTableSettings = {
            ...asObject(nextSettings.chatBridgeAllSocialTableSettings),
            ...pruneChatToRpBridgeTableSettings(draft?.tableSettings || {}, { sourceMode }),
        };
        const resolvedTableSettings = resolveChatToRpBridgeTableSettings({
            sessionSettings: {
                ...nextSettings,
                chatBridgeSourceSessionId: '',
                chatBridgeAllSocialTableSettings: normalizedAllSocialTableSettings,
            },
            sourceMode,
            fallbackEnabled,
            fallbackLimit,
        });
        nextSettings.chatBridgeSourceSessionId = '';
        nextSettings.chatBridgeAllSocialTableSettings = normalizedAllSocialTableSettings;
        nextSettings.chatBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
        nextSettings.chatBridgeOutlineLimit = Math.max(
            normalizeLimit(resolvedTableSettings?.chat_outline?.limit, 0),
            normalizeLimit(resolvedTableSettings?.group_outline?.limit, 0),
        );
        return nextSettings;
    }

    const normalizedTableSettings = {
        ...asObject(nextSettings.chatBridgeTableSettings),
        ...pruneChatToRpBridgeTableSettings(draft?.tableSettings || {}, { sourceIsGroup, sourceMode }),
    };
    const resolvedTableSettings = resolveChatToRpBridgeTableSettings({
        sessionSettings: {
            ...nextSettings,
            chatBridgeSourceSessionId: sourceId,
            chatBridgeTableSettings: normalizedTableSettings,
        },
        sourceIsGroup,
        sourceMode,
        fallbackEnabled,
        fallbackLimit,
    });
    const outlineTableId = sourceIsGroup ? 'group_outline' : 'chat_outline';
    nextSettings.chatBridgeSourceSessionId = sourceId;
    nextSettings.chatBridgeTableSettings = normalizedTableSettings;
    nextSettings.chatBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
    nextSettings.chatBridgeOutlineLimit = normalizeLimit(resolvedTableSettings?.[outlineTableId]?.limit, 0);
    return nextSettings;
};

export const applyRpToChatMemoryShareSettings = ({
    sessionSettings = {},
    draft = null,
    fallbackEnabled = true,
    fallbackLimit = 0,
    normalizeLimit = normalizeBridgeLimit,
} = {}) => {
    const nextSettings = { ...asObject(sessionSettings) };
    const normalizedTableSettings = {
        ...asObject(nextSettings.rpBridgeTableSettings),
        ...pruneRpToChatBridgeTableSettings(draft?.tableSettings || {}),
    };
    const resolvedTableSettings = resolveRpToChatBridgeTableSettings({
        sessionSettings: {
            ...nextSettings,
            rpBridgeTableSettings: normalizedTableSettings,
        },
        fallbackEnabled,
        fallbackLimit: normalizeLimit(fallbackLimit, 0),
    });
    nextSettings.rpBridgeTableSettings = normalizedTableSettings;
    nextSettings.rpBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
    nextSettings.rpBridgeOutlineLimit = normalizeLimit(resolvedTableSettings?.rp_outline?.limit, 0);
    return nextSettings;
};

export const createSessionMemoryShareSectionRuntime = ({
    getSessionId = () => '',
    getSummaryEl = () => null,
    getSessionSettings = () => ({}),
    setSessionSettings = () => {},
    buildDraft = () => null,
    buildMemoryShareContext = async () => null,
    createModal = () => null,
    bodyEl = globalThis.document?.body,
    panelDisplay = 'flex',
    closeSourceMenu = () => {},
    bindSourceButton = null,
    refreshSourceButton = () => {},
    listSourceSessionIds = () => [],
    getSourceSessionLabel = (id) => id,
    getSourceStaticLabel = () => '',
    getHintText = () => '',
    getChatToRpFallbackEnabled = () => true,
    getChatToRpFallbackLimit = () => 0,
    getRpToChatFallbackEnabled = () => true,
    getRpToChatFallbackLimit = () => 0,
    notifySaveSuccess = () => {},
    notifySaveError = () => {},
    logger = null,
    showEmptyState = true,
    defaultSourceButtonLabel = '所有聊天室（默认仅注入大纲）',
    normalizeLimit = normalizeBridgeLimit,
    resolveIsRpTarget = (sessionId) => isRpSessionId(sessionId),
    deps = {},
} = {}) => {
    const runtimeDeps = {
        applyChatToRpMemoryShareSettings,
        applyRpToChatMemoryShareSettings,
        closeSessionMemoryShareModal,
        finalizeSessionMemoryShareSave,
        mountSessionMemoryShareModal,
        openSessionMemoryShareManager,
        refreshSessionMemoryShareSummary,
        renderSessionMemoryShareManager,
        ...deps,
    };

    const state = {
        overlayEl: null,
        panelEl: null,
        hintEl: null,
        sourceWrapEl: null,
        sourceStaticEl: null,
        sourceSelectEl: null,
        sourceButtonEl: null,
        rowsEl: null,
        saveButtonEl: null,
        draft: null,
    };

    const setDraft = (draft) => {
        state.draft = draft;
    };

    const renderMemoryShareManagerForDraft = async () => {
        const sessionId = String(state.draft?.sessionId || '').trim();
        return runtimeDeps.renderSessionMemoryShareManager({
            draft: state.draft,
            rowsEl: state.rowsEl,
            hintEl: state.hintEl,
            sourceWrapEl: state.sourceWrapEl,
            sourceStaticEl: state.sourceStaticEl,
            sourceSelectEl: state.sourceSelectEl,
            sourceButtonEl: state.sourceButtonEl,
            isRpTarget: resolveIsRpTarget(sessionId),
            resolveContext: ({ sessionId, sourceId, tableSettings }) =>
                buildMemoryShareContext(sessionId, sourceId, tableSettings),
            listSourceSessionIds,
            getSourceSessionLabel,
            getSourceStaticLabel,
            getHintText,
            refreshSourceButton,
            showEmptyState,
            normalizeLimit,
        });
    };

    const closeMemoryShareManager = () => runtimeDeps.closeSessionMemoryShareModal({
        overlayEl: state.overlayEl,
        panelEl: state.panelEl,
        beforeClose: closeSourceMenu,
        onClosed: () => {
            state.draft = null;
        },
    });

    const saveMemoryShareManager = async () => {
        if (!state.draft) return;
        const sessionId = String(state.draft.sessionId || '').trim();
        if (!sessionId) return;
        const sessionSettings = asObject(getSessionSettings(sessionId));
        const nextSettings = resolveIsRpTarget(sessionId)
            ? runtimeDeps.applyChatToRpMemoryShareSettings({
                sessionSettings,
                draft: state.draft,
                fallbackEnabled: getChatToRpFallbackEnabled(),
                fallbackLimit: normalizeLimit(getChatToRpFallbackLimit(), 0),
                normalizeLimit,
            })
            : runtimeDeps.applyRpToChatMemoryShareSettings({
                sessionSettings,
                draft: state.draft,
                fallbackEnabled: getRpToChatFallbackEnabled(),
                fallbackLimit: normalizeLimit(getRpToChatFallbackLimit(), 0),
                normalizeLimit,
            });
        setSessionSettings(sessionId, nextSettings);
        await runtimeDeps.finalizeSessionMemoryShareSave({
            closeManager: closeMemoryShareManager,
            refreshSummary: () => refreshMemoryShareSummary(sessionId),
            notifySuccess: notifySaveSuccess,
        });
    };

    const ensureMemoryShareModal = () => {
        if (state.panelEl) return state.panelEl;
        const modal = createModal();
        if (!modal) return null;
        state.overlayEl = modal.overlay || null;
        state.panelEl = modal.panel || null;
        state.hintEl = modal.hint || null;
        state.sourceWrapEl = modal.sourceWrap || null;
        state.sourceStaticEl = modal.sourceStatic || null;
        state.sourceSelectEl = modal.sourceSelect || null;
        state.sourceButtonEl = modal.sourceButton || null;
        state.rowsEl = modal.rows || null;
        state.saveButtonEl = modal.saveButton || null;
        runtimeDeps.mountSessionMemoryShareModal({
            modal,
            bodyEl,
            bindSourceButton,
            sourceButtonEl: state.sourceButtonEl,
            sourceSelectEl: state.sourceSelectEl,
            sourceButtonFallback: defaultSourceButtonLabel,
            onClose: closeMemoryShareManager,
            onSourceChange: () => {
                if (!state.draft) return;
                state.draft.sourceId = String(state.sourceSelectEl?.value || '').trim();
                renderMemoryShareManagerForDraft().catch((err) => {
                    logger?.warn?.('render memory share manager failed', err);
                });
            },
            onSave: () => {
                saveMemoryShareManager().catch((err) => {
                    logger?.warn?.('save memory share manager failed', err);
                    notifySaveError?.();
                });
            },
        });
        return state.panelEl;
    };

    const openMemoryShareManagerForSession = async () => {
        ensureMemoryShareModal();
        return runtimeDeps.openSessionMemoryShareManager({
            ensureModal: ensureMemoryShareModal,
            buildDraft: () => buildDraft(getSessionId()),
            assignDraft: setDraft,
            renderManager: renderMemoryShareManagerForDraft,
            overlayEl: state.overlayEl,
            panelEl: state.panelEl,
            panelDisplay,
        });
    };

    const refreshMemoryShareSummary = async (sessionId = getSessionId()) => runtimeDeps.refreshSessionMemoryShareSummary({
        summaryEl: getSummaryEl(),
        sessionId,
        resolveContext: ({ sessionId }) => buildMemoryShareContext(sessionId),
    });

    return {
        refreshMemoryShareSummary,
        ensureMemoryShareModal,
        closeMemoryShareManager,
        renderMemoryShareManager: renderMemoryShareManagerForDraft,
        openMemoryShareManager: openMemoryShareManagerForSession,
        saveMemoryShareManager,
    };
};
