export const clearSessionMemoriesForNewChat = async ({
  sessionId = '',
  isGroup = false,
  keepNonSummary = false,
  memoryTableStore = null,
  resolveDefaultMemoryTemplateId = async () => '',
  resolveSummaryTableIds = () => [],
  notifyRowsUpdated = null,
} = {}) => {
  if (!memoryTableStore?.getMemories) return false;
  const templateId = await resolveDefaultMemoryTemplateId();
  if (!templateId) return false;
  const sid = String(sessionId || '').trim();
  if (!sid) return false;
  let rows = [];
  try {
    rows = await memoryTableStore.getMemories({
      scope: isGroup ? 'group' : 'contact',
      group_id: isGroup ? sid : undefined,
      contact_id: isGroup ? undefined : sid,
      template_id: templateId,
    });
  } catch {
    return false;
  }
  let globalUserProfileRows = [];
  if (!keepNonSummary) {
    try {
      const globalRows = await memoryTableStore.getMemories({
        scope: 'global',
        template_id: templateId,
      });
      globalUserProfileRows = (Array.isArray(globalRows) ? globalRows : [])
        .filter(row => String(row?.table_id || '').trim() === 'user_profile');
    } catch {}
  }
  const resolvedSummaryTableIds = (() => {
    try {
      const values = resolveSummaryTableIds?.({ sessionId: sid, isGroup });
      return Array.isArray(values) ? values : [];
    } catch {
      return [];
    }
  })();
  const summaryTableIds = new Set(
    resolvedSummaryTableIds
      .map((tableId) => String(tableId || '').trim())
      .filter(Boolean),
  );
  const ids = Array.from(new Set([
    ...(Array.isArray(rows) ? rows : [])
      .filter((row) => row && (!keepNonSummary || summaryTableIds.has(String(row?.table_id || '').trim())))
      .map((row) => String(row?.id || '').trim())
      .filter(Boolean),
    ...globalUserProfileRows
      .map(row => String(row?.id || '').trim())
      .filter(Boolean),
  ]));
  if (!ids.length) return true;
  try {
    await memoryTableStore.batchDeleteMemories?.(ids);
  } catch {
    for (const id of ids) {
      try {
        await memoryTableStore.deleteMemory?.(id);
      } catch {}
    }
  }
  try {
    notifyRowsUpdated?.({ sessionId: sid, templateId });
  } catch {}
  return true;
};

export const runStartNewChatFlow = async ({
  sessionId = '',
  isGroup = false,
  sessionMode = '',
  getMemoryStorageMode = () => 'summary',
  askMemoryTableNewChatMode = async () => 'replace',
  promptForArchiveName = () => '',
  buildMemoryTableSnapshot = async () => null,
  captureArchivePointer = async () => null,
  clearSessionMemories = async () => false,
  startNewChat = () => '',
  persistArchivePointer = async () => {},
  restoreMemoryForActiveThread = async () => {},
  logger = null,
  sourcePrefix = 'contact',
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { started: false, cancelled: true, archiveId: '' };
  let keepNonSummary = false;
  let memoryTableSnapshot = null;
  let archivePointer = null;
  const storageMode = String(getMemoryStorageMode?.() || 'summary').toLowerCase();
  if (storageMode === 'table') {
    const choice = await askMemoryTableNewChatMode?.();
    if (choice === 'cancel') return { started: false, cancelled: true, archiveId: '' };
    keepNonSummary = choice === 'keep';
  }
  const rawName = await Promise.resolve(promptForArchiveName?.());
  if (rawName === null) return { started: false, cancelled: true, archiveId: '' };
  if (storageMode === 'table') {
    memoryTableSnapshot = await buildMemoryTableSnapshot?.({ sessionId: sid, isGroup });
    try {
      archivePointer = await captureArchivePointer?.(sid, {
        fallbackSnapshot: memoryTableSnapshot,
        source: `${sourcePrefix}_start_new_chat_capture`,
      });
    } catch (err) {
      logger?.warn?.('build archive pointer before new chat failed', err);
    }
    try {
      await clearSessionMemories?.({
        sessionId: sid,
        isGroup,
        keepNonSummary,
        sessionMode,
      });
    } catch (err) {
      logger?.warn?.('clear memory tables for new chat failed', err);
    }
  }
  const archiveId = startNewChat?.(sid, String(rawName || '').trim(), { memoryTableSnapshot }) || '';
  if (archiveId && archivePointer) {
    try {
      await persistArchivePointer?.(sid, archiveId, archivePointer, {
        fallbackSnapshot: memoryTableSnapshot,
        source: `${sourcePrefix}_start_new_chat_save_archive`,
      });
    } catch (err) {
      logger?.warn?.('persist archive pointer for new chat archive failed', err);
    }
  }
  try {
    await restoreMemoryForActiveThread?.(sid, {
      refreshBaselineWhenNoTail: true,
      source: `start_new_chat_${sourcePrefix}`,
    });
  } catch (err) {
    logger?.warn?.('refresh turn checkpoint baseline after new chat failed', err);
  }
  return {
    started: true,
    cancelled: false,
    archiveId: String(archiveId || '').trim(),
    keepNonSummary,
    memoryTableSnapshot,
  };
};

export const runRpPlotResetFlow = async ({
  sessionId = '',
  keepInput = false,
  runStartNewChat = runStartNewChatFlow,
  startNewChat = () => '',
  resetVariableState = () => {},
  clearRenderedMessages = () => {},
  resetRenderState = () => {},
  seedGreeting = async () => false,
  clearInput = () => {},
  refreshUi = () => {},
  ...flowOptions
} = {}) => {
  const sid = String(sessionId || '').trim();
  if (!sid) return { started: false, cancelled: true, archiveId: '' };
  const result = await runStartNewChat({
    ...flowOptions,
    sessionId: sid,
    isGroup: false,
    sessionMode: 'rp',
    sourcePrefix: 'rp_plot_reset',
    startNewChat: (targetSessionId, archiveName, options) => {
      clearRenderedMessages?.();
      resetVariableState?.(targetSessionId);
      resetRenderState?.(targetSessionId);
      return startNewChat?.(targetSessionId, archiveName, options) || '';
    },
  });
  if (!result?.started) return result;
  await seedGreeting?.(sid);
  if (!keepInput) clearInput?.();
  refreshUi?.(sid);
  return result;
};
