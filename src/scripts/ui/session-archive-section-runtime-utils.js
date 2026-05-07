import { renderSessionArchivesSection } from './session-archive-view-utils.js';

export const createSessionArchiveSectionRuntime = ({
    getContainer = () => null,
    getSessionId = () => '',
    getChatStore = () => null,
    isGroup = false,
    getMemoryStorageMode = () => 'off',
    buildMemoryTableSnapshot = null,
    captureArchivePointer = null,
    loadArchivedMessages = null,
    getLastArchiveTransition = null,
    persistArchivePointer = null,
    applyMemoryTableSnapshot = null,
    restoreArchivePointerForLoadedThread = null,
    logger = null,
    appConfirmFn = null,
    runArchiveSwitchFlow = null,
    runArchiveDeleteFlow = null,
    deleteArchiveTurnCheckpointState = null,
    deleteArchive = null,
    onArchiveLoaded = null,
    onArchiveDeleted = null,
    onHide = null,
    createEmptyState = null,
    createArchiveRow = null,
    sourcePrefix = 'contact',
    restoreWarnMessage = 'restore checkpoint memory after archive load failed',
    deleteWarnMessage = 'delete archive turn checkpoint state failed',
    deps = {},
} = {}) => {
    const runtimeDeps = {
        renderSessionArchivesSection,
        ...deps,
    };

    return {
        renderArchives() {
            const sessionId = getSessionId();
            return runtimeDeps.renderSessionArchivesSection({
                container: getContainer(),
                sessionId,
                chatStore: getChatStore(),
                isGroup,
                getMemoryStorageMode,
                buildMemoryTableSnapshot,
                captureArchivePointer,
                loadArchivedMessages,
                getLastArchiveTransition,
                persistArchivePointer,
                applyMemoryTableSnapshot,
                restoreArchivePointerForLoadedThread,
                logger,
                appConfirmFn,
                runArchiveSwitchFlow,
                runArchiveDeleteFlow,
                deleteArchiveTurnCheckpointState,
                deleteArchive,
                onArchiveLoaded,
                onArchiveDeleted,
                onHide,
                createEmptyState,
                createArchiveRow,
                sourcePrefix,
                restoreWarnMessage,
                deleteWarnMessage,
            });
        },
    };
};
