import {
    buildSessionMemoryShareDraft,
    createSessionMemoryShareSectionRuntime,
} from './session-memory-share-section-runtime-utils.js';
import {
    buildMomentsToChatMemoryShareContext,
    buildRpToChatMemoryShareContext,
    loadGlobalMemoryShareRows,
    loadMemoryShareRows,
    resolveDefaultRpBridgeSourceId,
    resolveRpDisplayName,
} from './session-memory-share-context-utils.js';
import { createSessionMemoryShareModal } from './session-shared-view-utils.js';
import {
    pruneMomentsToChatBridgeTableSettings,
} from '../memory/memory-bridge-utils.js';

export const createGroupMemoryShareRuntime = ({
    getSessionId = () => '',
    getSummaryEl = () => null,
    getSessionSettings = () => ({}),
    setSessionSettings = () => {},
    getContact = () => null,
    memoryTableStore = null,
    resolveTemplateDefinition = async () => null,
    resolveTemplateId = async () => '',
    getRpCharacterNameForSession = () => '',
    getRpSessionIdForSession = () => '',
    getRpSessionIdForActivePersona = () => '',
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

    const getRpDisplayName = (sessionId = '') => resolveRpDisplayName({
        sessionId,
        getRpCharacterNameForSession,
        getContact,
    });

    const getDefaultRpBridgeSourceId = (sessionId = getSessionId()) => resolveDefaultRpBridgeSourceId({
        sessionId,
        getRpSessionIdForSession,
        getRpSessionIdForActivePersona,
    });

    const loadRpMemoryShareRows = async (sourceId = '', templateId = '') => loadMemoryShareRows({
        memoryTableStore,
        sourceId,
        templateId,
        sourceIsGroup: false,
    });

    const loadGlobalRows = async ({ templateId = '' } = {}) => loadGlobalMemoryShareRows({
        memoryTableStore,
        templateId,
    });

    const buildMemoryShareContext = async (
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
            loadRows: (sourceId, options) => loadRpMemoryShareRows(sourceId, options?.templateId),
            fallbackEnabled: globalSettings.memoryBridgeRpToChatEnabled !== false,
            fallbackLimit: globalSettings.memoryBridgeRpToChatLimit,
        });
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
                isRpTarget: false,
            }),
            buildMemoryShareContext: (sessionId, _sourceId, tableSettings) =>
                buildMemoryShareContext(sessionId, tableSettings),
            createModal: () => runtimeDeps.createSessionMemoryShareModal({
                variant: 'group',
                documentRef,
                hintText: '真正全局的用户档案会自动共享；这里仅管理当前角色的创意写作会话注入到本群聊的额外记忆。',
            }),
            bodyEl,
            getSourceStaticLabel: (sessionId) => {
                const sourceId = getDefaultRpBridgeSourceId(sessionId);
                return sourceId ? (getRpDisplayName(sourceId) || sourceId) : '当前为空';
            },
            getPrimaryGroupLabel: () => '创意写作',
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
                    detailHint: '管理动态摘要 / 大纲注入到当前群聊请求的规则。',
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
            getRpToChatFallbackEnabled: () => getGlobalSettings?.().memoryBridgeRpToChatEnabled !== false,
            getRpToChatFallbackLimit: () => getGlobalSettings?.().memoryBridgeRpToChatLimit,
            notifySaveSuccess,
            notifySaveError,
            logger,
            showEmptyState: false,
        });
        return memoryShareRuntime;
    };

    return {
        getRpDisplayName,
        getDefaultRpBridgeSourceId,
        loadRpMemoryShareRows,
        buildMemoryShareContext,
        refreshMemoryShareSummary: (sessionId = getSessionId()) => ensureMemoryShareRuntime().refreshMemoryShareSummary(sessionId),
        ensureMemoryShareModal: () => ensureMemoryShareRuntime().ensureMemoryShareModal(),
        closeMemoryShareManager: () => ensureMemoryShareRuntime().closeMemoryShareManager(),
        renderMemoryShareManager: () => ensureMemoryShareRuntime().renderMemoryShareManager(),
        openMemoryShareManager: () => ensureMemoryShareRuntime().openMemoryShareManager(),
        saveMemoryShareManager: () => ensureMemoryShareRuntime().saveMemoryShareManager(),
    };
};
