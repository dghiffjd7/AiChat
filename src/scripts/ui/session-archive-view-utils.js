export const renderSessionArchivesSection = ({
  container = null,
  sessionId = '',
  chatStore = null,
  isGroup = false,
  getMemoryStorageMode = () => 'summary',
  buildMemoryTableSnapshot = async () => null,
  captureArchivePointer = async () => null,
  loadArchivedMessages = async () => null,
  getLastArchiveTransition = () => null,
  persistArchivePointer = async () => null,
  applyMemoryTableSnapshot = async () => null,
  restoreArchivePointerForLoadedThread = async () => null,
  logger = console,
  appConfirmFn = async () => true,
  runArchiveSwitchFlow = async () => {},
  runArchiveDeleteFlow = async () => {},
  deleteArchiveTurnCheckpointState = async () => null,
  deleteArchive = async () => null,
  onArchiveLoaded = () => {},
  onArchiveDeleted = () => {},
  onHide = () => {},
  createEmptyState = () => null,
  createArchiveRow = () => ({ row: null }),
  sourcePrefix = 'contact',
  restoreWarnMessage = 'restore checkpoint memory after archive load failed',
  deleteWarnMessage = 'delete archive turn checkpoint state failed',
} = {}) => {
  if (!container || !chatStore || !sessionId) return false;
  const archives = chatStore.getArchives(sessionId);
  const currentId = chatStore.state.sessions[sessionId]?.currentArchiveId;
  container.innerHTML = '';

  if (!archives.length) {
    const empty = createEmptyState?.();
    if (empty) container.appendChild(empty);
    return true;
  }

  archives.forEach((archive) => {
    const dateText = new Date(archive.timestamp).toLocaleString();
    const messageCount = Number(archive.messageCount || (Array.isArray(archive.messages) ? archive.messages.length : 0)) || 0;
    const isCurrent = archive.id === currentId;
    const { row } = createArchiveRow({
      archiveName: archive.name,
      isCurrent,
      dateText,
      messageCount,
      onSelect: async () => {
        if (isCurrent) return;
        const ok = await appConfirmFn({
          title: '加载存档',
          message: `确定要加载存档「${archive.name}」吗？\n当前聊天将被自动保存。`,
        });
        if (!ok) return;
        await runArchiveSwitchFlow({
          sessionId,
          isGroup,
          archive,
          getMemoryStorageMode,
          buildMemoryTableSnapshot: ({ sessionId, isGroup }) => buildMemoryTableSnapshot({ sessionId, isGroup }),
          captureArchivePointer,
          loadArchivedMessages,
          getLastArchiveTransition,
          persistArchivePointer,
          applyMemoryTableSnapshot: ({ sessionId, isGroup, snapshot }) => applyMemoryTableSnapshot({ sessionId, isGroup, snapshot }),
          restoreArchivePointerForLoadedThread,
          logger,
          sourcePrefix,
          restoreWarnMessage,
        });
        onArchiveLoaded?.(sessionId, archive);
        onHide?.();
      },
      onDelete: async (event) => {
        event?.stopPropagation?.();
        const ok = await appConfirmFn({
          title: '删除存档',
          message: '确定要删除这条存档吗？',
          danger: true,
        });
        if (!ok) return;
        await runArchiveDeleteFlow({
          sessionId,
          archiveId: archive.id,
          deleteArchiveTurnCheckpointState,
          deleteArchive,
          renderArchives: onArchiveDeleted,
          logger,
          warnMessage: deleteWarnMessage,
        });
      },
    });
    if (row) container.appendChild(row);
  });
  return true;
};
