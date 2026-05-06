export const runArchiveSwitchFlow = async ({
  sessionId = '',
  isGroup = false,
  archive = null,
  getMemoryStorageMode = () => 'summary',
  buildMemoryTableSnapshot = async () => null,
  captureArchivePointer = async () => null,
  loadArchivedMessages = async () => false,
  getLastArchiveTransition = () => null,
  persistArchivePointer = async () => {},
  applyMemoryTableSnapshot = async () => false,
  restoreArchivePointerForLoadedThread = async () => {},
  logger = null,
  sourcePrefix = 'contact',
  restoreWarnMessage = 'restore checkpoint memory after archive load failed',
} = {}) => {
  const sid = String(sessionId || '').trim();
  const archiveId = String(archive?.id || '').trim();
  if (!sid || !archiveId) {
    return {
      loaded: false,
      currentSnapshot: null,
      currentArchivePointer: null,
      targetSnapshot: null,
      archivedCurrentId: '',
    };
  }

  const memoryTableOn = String(getMemoryStorageMode?.() || 'summary').toLowerCase() === 'table';
  let currentSnapshot = null;
  let currentArchivePointer = null;
  if (memoryTableOn) {
    currentSnapshot = await buildMemoryTableSnapshot?.({ sessionId: sid, isGroup });
    try {
      currentArchivePointer = await captureArchivePointer?.(sid, {
        fallbackSnapshot: currentSnapshot,
        source: `${sourcePrefix}_archive_switch_capture`,
      });
    } catch (err) {
      logger?.warn?.(`build archive pointer before ${sourcePrefix} archive switch failed`, err);
    }
  }

  const targetSnapshot = archive?.memoryTableSnapshot ?? null;
  const loaded = await loadArchivedMessages?.(archiveId, sid, { memoryTableSnapshot: currentSnapshot });
  const transition = getLastArchiveTransition?.(sid) || null;
  const archivedCurrentId = String(transition?.archivedCurrentId || '').trim();

  if (loaded && archivedCurrentId && currentArchivePointer) {
    try {
      await persistArchivePointer?.(sid, archivedCurrentId, currentArchivePointer, {
        fallbackSnapshot: currentSnapshot,
        source: `${sourcePrefix}_archive_switch_save_previous`,
      });
    } catch (err) {
      logger?.warn?.(`persist previous ${sourcePrefix} archive pointer failed`, err);
    }
  }

  if (loaded && memoryTableOn && targetSnapshot) {
    try {
      await applyMemoryTableSnapshot?.({ sessionId: sid, isGroup, snapshot: targetSnapshot });
    } catch (err) {
      logger?.warn?.('apply memory table snapshot failed', err);
    }
  }

  if (loaded) {
    try {
      await restoreArchivePointerForLoadedThread?.(sid, {
        refreshBaselineWhenNoTail: true,
        source: `archive_load_${sourcePrefix}`,
      });
    } catch (err) {
      logger?.warn?.(restoreWarnMessage, err);
    }
  }

  return {
    loaded: Boolean(loaded),
    currentSnapshot,
    currentArchivePointer,
    targetSnapshot,
    archivedCurrentId,
  };
};
