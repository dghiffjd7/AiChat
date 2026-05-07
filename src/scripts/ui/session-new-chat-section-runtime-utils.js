import {
    clearSessionMemoriesForNewChat,
    runStartNewChatFlow,
} from './session-new-chat-utils.js';

export const createSessionNewChatSectionRuntime = ({
    getSessionId = () => '',
    isGroup = false,
    resolveSessionMode = () => 'chat',
    getMemoryStorageMode = () => 'off',
    askMemoryTableNewChatMode = null,
    promptForArchiveName = null,
    buildMemoryTableSnapshot = null,
    captureArchivePointer = null,
    memoryTableStore = null,
    resolveDefaultMemoryTemplateId = null,
    resolveSummaryTableIds = null,
    notifyRowsUpdated = null,
    startNewChat = null,
    persistArchivePointer = null,
    restoreMemoryForActiveThread = null,
    logger = null,
    sourcePrefix = 'contact',
    onStarted = null,
    deps = {},
} = {}) => {
    const runtimeDeps = {
        clearSessionMemoriesForNewChat,
        runStartNewChatFlow,
        ...deps,
    };

    return {
        async startNewChat() {
            const sessionId = String(getSessionId?.() || '').trim();
            if (!sessionId) return null;
            const sessionMode = String(resolveSessionMode?.({ sessionId, isGroup }) || 'chat').trim() || 'chat';
            const result = await runtimeDeps.runStartNewChatFlow({
                sessionId,
                isGroup,
                sessionMode,
                getMemoryStorageMode,
                askMemoryTableNewChatMode,
                promptForArchiveName,
                buildMemoryTableSnapshot,
                captureArchivePointer,
                clearSessionMemories: ({ sessionId, isGroup, keepNonSummary, sessionMode }) =>
                    runtimeDeps.clearSessionMemoriesForNewChat({
                        sessionId,
                        isGroup,
                        keepNonSummary,
                        memoryTableStore,
                        resolveDefaultMemoryTemplateId,
                        resolveSummaryTableIds: ({ sessionId, isGroup }) =>
                            resolveSummaryTableIds?.({ sessionId, isGroup, sessionMode }) || [],
                        notifyRowsUpdated,
                    }),
                startNewChat,
                persistArchivePointer,
                restoreMemoryForActiveThread,
                logger,
                sourcePrefix,
            });
            if (!result?.started) return result;
            onStarted?.({ sessionId, result, isGroup, sessionMode });
            return result;
        },
    };
};
