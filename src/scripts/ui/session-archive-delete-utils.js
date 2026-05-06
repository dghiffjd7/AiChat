export const runArchiveDeleteFlow = async ({
  sessionId = '',
  archiveId = '',
  deleteArchiveTurnCheckpointState = async () => {},
  deleteArchive = () => {},
  renderArchives = () => {},
  logger = null,
  warnMessage = 'delete archive turn checkpoint state failed',
} = {}) => {
  const sid = String(sessionId || '').trim();
  const aid = String(archiveId || '').trim();
  if (!sid || !aid) return false;
  try {
    await deleteArchiveTurnCheckpointState?.(sid, aid);
  } catch (err) {
    logger?.warn?.(warnMessage, err);
  }
  deleteArchive?.(aid, sid);
  renderArchives?.();
  return true;
};
