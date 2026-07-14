import { isRpSessionId } from '../memory/memory-context-utils.js';
import {
    buildSessionMemoryShareDraft,
    createSessionMemoryShareSectionRuntime,
} from './session-memory-share-section-runtime-utils.js';
import {
    buildMomentsToChatMemoryShareContext,
    buildChatToRpMemoryShareContext,
    buildRpToChatMemoryShareContext,
    listSocialSessionIds,
    loadGlobalMemoryShareRows,
    loadMemoryShareRows,
    resolveDefaultRpBridgeSourceId,
    resolveRpDisplayName,
    resolveSessionDisplayName,
} from './session-memory-share-context-utils.js';
import {
    pruneMomentsToChatBridgeTableSettings,
} from '../memory/memory-bridge-utils.js';
import { createSessionMemoryShareModal } from './session-shared-view-utils.js';

export const createContactMemoryShareRuntime = ({
    getSessionId = () => '',
    getSummaryEl = () => null,
    getSessionSettings = () => ({}),
    setSessionSettings = () => {},
    getContact = () => null,
    listSessions = () => [],
    memoryTableStore = null,
    resolveTemplateDefinition = async () => null,
    resolveTemplateId = async () => '',
    getRpCharacterNameForSession = () => '',
    getRpSessionIdForSession = () => '',
    getRpSessionIdForActivePersona = () => '',
    bindSourceButton = null,
    refreshSourceButton = () => {},
    closeSourceMenu = () => {},
    documentRef = globalThis.document,
    bodyEl = globalThis.document?.body,
    getGlobalSettings = () => ({}),
    updateGlobalSettings = () => {},
    dispatchSettingChanged = () => {},
    notifySaveSuccess = () => {},
    notifySaveError = () => {},
    logger = null,
    deps = {},
} = {}) => {
    const runtimeDeps = {
        createSessionMemoryShareModal,
        createSessionMemoryShareSectionRuntime,
        ...deps,
    };
    let memoryShareRuntime = null;

    const getRpDisplayName = (sessionId = getSessionId()) => resolveRpDisplayName({
        sessionId,
        getRpCharacterNameForSession,
        getContact,
    });

    const getSessionDisplayName = (sessionId = '') => resolveSessionDisplayName({
        sessionId,
        getContact,
        getRpDisplayName,
    });

    const listSocialSessions = () => listSocialSessionIds({
        listSessions,
    });

    const getDefaultRpBridgeSourceId = (sessionId = getSessionId()) => resolveDefaultRpBridgeSourceId({
        sessionId,
        getRpSessionIdForSession,
        getRpSessionIdForActivePersona,
    });

    const loadRows = async (sourceId = '', { templateId = '', sourceIsGroup = false } = {}) => loadMemoryShareRows({
        memoryTableStore,
        sourceId,
        templateId,
        sourceIsGroup,
    });

    const loadGlobalRows = async ({ templateId = '' } = {}) => loadGlobalMemoryShareRows({
        memoryTableStore,
        templateId,
    });

    const buildChatToRpContext = async (
        sessionId = getSessionId(),
        rawSourceId = null,
        rawTableSettings = null,
    ) => {
        const globalSettings = getGlobalSettings?.() || {};
        return buildChatToRpMemoryShareContext({
            sessionId,
            rawSourceId,
            rawTableSettings,
            resolveTemplateDefinition,
            resolveTemplateId,
            getSessionSettings,
            listSocialSessions,
            loadRows,
            getSessionDisplayName,
            fallbackEnabled: globalSettings.memoryBridgeChatToRpEnabled !== false,
        });
    };

    const buildRpToChatContext = async (
        sessionId = getSessionId(),
        rawTableSettings = null,
    ) => {
        const globalSettings = getGlobalSettings?.() || {};
        return buildRpToChatMemoryShareContext({
            sessionId,
            rawTableSettings,
            resolveTemplateDefinition,
            resolveTemplateId,
            getSessionSettings,
            getDefaultSourceId: getDefaultRpBridgeSourceId,
            getRpDisplayName,
            loadRows,
            fallbackEnabled: globalSettings.memoryBridgeRpToChatEnabled !== false,
            fallbackLimit: globalSettings.memoryBridgeRpToChatLimit,
        });
    };

    const buildMemoryShareContext = async (
        sessionId = getSessionId(),
        rawSourceId = null,
        rawTableSettings = null,
    ) => {
        const sid = String(sessionId || '').trim();
        if (!sid) return null;
        return isRpSessionId(sid)
            ? buildChatToRpContext(sid, rawSourceId, rawTableSettings)
            : buildRpToChatContext(sid, rawTableSettings);
    };

    const ensureMemoryShareRuntime = () => {
        if (memoryShareRuntime) return memoryShareRuntime;
        memoryShareRuntime = runtimeDeps.createSessionMemoryShareSectionRuntime({
            getSessionId,
            getSummaryEl,
            getSessionSettings,
            setSessionSettings,
            buildDraft: (sessionId) => buildSessionMemoryShareDraft({
                sessionId,
                sessionSettings: getSessionSettings(sessionId) || {},
                isRpTarget: isRpSessionId(sessionId),
            }),
            buildMemoryShareContext,
            createModal: () => runtimeDeps.createSessionMemoryShareModal({
                variant: 'contact',
                documentRef,
            }),
            bodyEl,
            bindSourceButton,
            refreshSourceButton,
            closeSourceMenu,
            listSourceSessionIds: listSocialSessions,
            getSourceSessionLabel: getSessionDisplayName,
            getSourceStaticLabel: (sessionId) => {
                const sourceId = getDefaultRpBridgeSourceId(sessionId);
                return sourceId ? (getRpDisplayName(sourceId) || sourceId) : '当前为空';
            },
            getHintText: ({ isRpTarget }) => (
                isRpTarget
                    ? '真正全局的用户档案会自动共享；这里仅管理聊天 / 群聊注入到当前创意写作会话的额外记忆。'
                    : '真正全局的用户档案会自动共享；这里仅管理当前角色的创意写作会话注入到本聊天的额外记忆。'
            ),
            getPrimaryGroupLabel: ({ isRpTarget }) => (isRpTarget ? '聊天室' : '创意写作'),
            buildExtraMemoryShareGroups: async () => {
                const context = await buildMomentsToChatMemoryShareContext({
                    resolveTemplateDefinition,
                    resolveTemplateId,
                    loadGlobalRows,
                    getGlobalSettings,
                });
                const applyGlobalPatch = (patch = {}) => {
                    updateGlobalSettings?.(patch);
                    Object.entries(patch).forEach(([key, value]) => dispatchSettingChanged?.(key, value));
                };
                return [{
                    id: 'moments',
                    label: '动态',
                    description: context?.summarySourceText || '来源：动态',
                    detailHint: '管理动态摘要 / 大纲注入到当前聊天或创意写作请求的规则。',
                    context,
                    enabled: context?.enabled !== false,
                    tableSettings: context?.tableSettings || {},
                    setEnabled: async (enabled) => {
                        applyGlobalPatch({ memoryBridgeMomentsToChatEnabled: Boolean(enabled) });
                    },
                    setTableSetting: async (tableId, value) => {
                        const current = getGlobalSettings?.() || {};
                        const next = pruneMomentsToChatBridgeTableSettings({
                            ...(current.memoryBridgeMomentsToChatTableSettings || {}),
                            [tableId]: value,
                        });
                        applyGlobalPatch({ memoryBridgeMomentsToChatTableSettings: next });
                    },
                }];
            },
            getChatToRpFallbackEnabled: () => getGlobalSettings?.().memoryBridgeChatToRpEnabled !== false,
            getRpToChatFallbackEnabled: () => getGlobalSettings?.().memoryBridgeRpToChatEnabled !== false,
            getRpToChatFallbackLimit: () => getGlobalSettings?.().memoryBridgeRpToChatLimit,
            notifySaveSuccess,
            notifySaveError,
            logger,
        });
        return memoryShareRuntime;
    };

    return {
        getRpDisplayName,
        getSessionDisplayName,
        listSocialSessions,
        getDefaultRpBridgeSourceId,
        loadMemoryShareRows: loadRows,
        buildChatToRpMemoryShareContext: buildChatToRpContext,
        buildRpToChatMemoryShareContext: buildRpToChatContext,
        buildMemoryShareContext,
        ensureMemoryShareModal: () => ensureMemoryShareRuntime().ensureMemoryShareModal(),
        refreshMemoryShareSummary: (sessionId = getSessionId()) => ensureMemoryShareRuntime().refreshMemoryShareSummary(sessionId),
        closeMemoryShareManager: () => ensureMemoryShareRuntime().closeMemoryShareManager(),
        renderMemoryShareManager: () => ensureMemoryShareRuntime().renderMemoryShareManager(),
        openMemoryShareManager: () => ensureMemoryShareRuntime().openMemoryShareManager(),
        saveMemoryShareManager: () => ensureMemoryShareRuntime().saveMemoryShareManager(),
    };
};
