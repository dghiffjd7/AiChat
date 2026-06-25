import { getSummaryTableIdsForContext, isRpSessionId } from '../memory/memory-context-utils.js';
import {
  clearSessionMemoriesForNewChat,
  runStartNewChatFlow,
} from './session-new-chat-utils.js';
import { runArchiveSwitchFlow } from './session-archive-switch-utils.js';

const trim = value => String(value || '').trim();
const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const PERSONA_SUMMARY_TABLE_IDS = [
  'chat_summary',
  'chat_outline',
  'group_summary',
  'group_outline',
  'rp_summary',
  'rp_outline',
  'moment_summary',
  'moment_outline',
];

const resolveIsGroup = (sessionId = '', contactsStore = null) => {
  const sid = trim(sessionId);
  if (!sid) return false;
  if (sid.startsWith('group:')) return true;
  try {
    return Boolean(contactsStore?.getContact?.(sid)?.isGroup);
  } catch {
    return false;
  }
};

export const resolvePersonaNewChatSummaryTableIds = ({
  sessionId = '',
  isGroup = false,
  sessionMode = '',
} = {}) => {
  const sid = trim(sessionId);
  const mode = trim(sessionMode).toLowerCase();
  const contextType = mode === 'rp' || isRpSessionId(sid)
    ? 'rp'
    : (isGroup ? 'group' : 'contact');
  const { summaryTableId, outlineTableId } = getSummaryTableIdsForContext({
    sessionId: sid,
    isGroup,
    contextType,
    uiMode: mode === 'rp' ? 'rp' : 'chat',
  });
  return [summaryTableId, outlineTableId].filter(Boolean);
};

export const collectPersonaNewChatTargets = ({
  chatStore = null,
  contactsStore = null,
  rpSessionId = '',
} = {}) => {
  const sessionIds = new Set();
  try {
    (chatStore?.listSessions?.() || []).forEach((id) => {
      const sid = trim(id);
      if (sid) sessionIds.add(sid);
    });
  } catch {}

  const byId = new Map();
  const addTarget = (sessionId, source = '') => {
    const sid = trim(sessionId);
    if (!sid) return;
    const hasSession = typeof chatStore?.hasSession === 'function'
      ? Boolean(chatStore.hasSession(sid))
      : sessionIds.has(sid);
    const sessionMode = isRpSessionId(sid) ? 'rp' : 'chat';
    const prev = byId.get(sid);
    const next = {
      sessionId: sid,
      isGroup: sessionMode === 'rp' ? false : resolveIsGroup(sid, contactsStore),
      sessionMode,
      hasSession,
      source: prev?.source || source,
    };
    byId.set(sid, prev ? { ...prev, ...next, hasSession: prev.hasSession || next.hasSession } : next);
  };

  sessionIds.forEach(id => addTarget(id, 'chat'));
  try {
    (contactsStore?.listContacts?.() || []).forEach((contact) => {
      const cid = trim(contact?.id);
      if (!cid || isRpSessionId(cid)) return;
      addTarget(cid, 'contact');
    });
  } catch {}
  if (trim(rpSessionId)) addTarget(rpSessionId, 'rp');

  return [...byId.values()].sort((a, b) => {
    const ar = a.sessionMode === 'rp' ? 0 : 1;
    const br = b.sessionMode === 'rp' ? 0 : 1;
    if (ar !== br) return ar - br;
    if (a.hasSession !== b.hasSession) return a.hasSession ? -1 : 1;
    return a.sessionId.localeCompare(b.sessionId);
  });
};

export const clearPersonaGlobalMemoriesForNewChat = async ({
  keepNonSummary = false,
  memoryTableStore = null,
  resolveDefaultMemoryTemplateId = async () => '',
  notifyRowsUpdated = null,
} = {}) => {
  if (!memoryTableStore?.getMemories) return false;
  const templateId = await resolveDefaultMemoryTemplateId();
  if (!templateId) return false;
  let rows = [];
  try {
    rows = await memoryTableStore.getMemories({ scope: 'global', template_id: templateId });
  } catch {
    return false;
  }
  if (!Array.isArray(rows) || rows.length === 0) return true;
  const summaryIds = new Set(PERSONA_SUMMARY_TABLE_IDS);
  const ids = rows
    .filter(row => row && (!keepNonSummary || summaryIds.has(trim(row?.table_id))))
    .map(row => trim(row?.id))
    .filter(Boolean);
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
    notifyRowsUpdated?.({ sessionId: 'moments', templateId });
  } catch {}
  return true;
};

export const buildPersonaGlobalMemorySnapshot = async ({
  memoryTableStore = null,
  resolveDefaultMemoryTemplateId = async () => '',
} = {}) => {
  if (!memoryTableStore?.getMemories) return null;
  const templateId = await resolveDefaultMemoryTemplateId();
  if (!templateId) return null;
  let rows = [];
  try {
    rows = await memoryTableStore.getMemories({ scope: 'global', template_id: templateId });
  } catch {
    return null;
  }
  return {
    templateId,
    rows: (Array.isArray(rows) ? rows : [])
      .map((row) => {
        const tableId = trim(row?.table_id);
        if (!tableId) return null;
        return {
          id: trim(row?.id),
          table_id: tableId,
          row_data: row?.row_data ?? {},
          is_active: row?.is_active !== false,
          is_pinned: Boolean(row?.is_pinned),
          priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
          sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
        };
      })
      .filter(Boolean),
  };
};

export const applyPersonaGlobalMemorySnapshot = async ({
  snapshot = null,
  memoryTableStore = null,
  resolveDefaultMemoryTemplateId = async () => '',
  notifyRowsUpdated = null,
} = {}) => {
  if (!snapshot || !memoryTableStore?.getMemories) return false;
  const templateId = trim(snapshot?.templateId) || await resolveDefaultMemoryTemplateId();
  if (!templateId) return false;
  let existing = [];
  try {
    existing = await memoryTableStore.getMemories({ scope: 'global', template_id: templateId });
  } catch {}
  const ids = Array.isArray(existing)
    ? existing.map(row => trim(row?.id)).filter(Boolean)
    : [];
  if (ids.length) {
    try {
      await memoryTableStore.batchDeleteMemories?.(ids);
    } catch {
      for (const id of ids) {
        try {
          await memoryTableStore.deleteMemory?.(id);
        } catch {}
      }
    }
  }
  const inputs = (Array.isArray(snapshot?.rows) ? snapshot.rows : [])
    .map((row) => {
      const tableId = trim(row?.table_id);
      if (!tableId) return null;
      return {
        id: trim(row?.id) || undefined,
        template_id: templateId,
        table_id: tableId,
        contact_id: null,
        group_id: null,
        row_data: row?.row_data ?? {},
        is_active: row?.is_active !== false,
        is_pinned: Boolean(row?.is_pinned),
        priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
        sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
      };
    })
    .filter(Boolean);
  if (inputs.length) {
    if (typeof memoryTableStore.batchCreateMemories === 'function') {
      try {
        await memoryTableStore.batchCreateMemories(inputs);
      } catch {
        for (const input of inputs) {
          await memoryTableStore.createMemory?.(input);
        }
      }
    } else {
      for (const input of inputs) {
        await memoryTableStore.createMemory?.(input);
      }
    }
  }
  try {
    notifyRowsUpdated?.({ sessionId: 'moments', templateId });
  } catch {}
  return true;
};

const hasRoleArchiveSnapshotContent = ({
  globalMemorySnapshot = null,
  momentsSnapshot = null,
  momentSummarySnapshot = null,
} = {}) => {
  if (Array.isArray(globalMemorySnapshot?.rows) && globalMemorySnapshot.rows.length > 0) return true;
  if (Array.isArray(momentsSnapshot?.moments) && momentsSnapshot.moments.length > 0) return true;
  if (Array.isArray(momentSummarySnapshot?.summaries) && momentSummarySnapshot.summaries.length > 0) return true;
  if (momentSummarySnapshot?.compactedSummary) return true;
  return false;
};

const getStorageModeForTarget = ({ target, getMemoryStorageMode }) => {
  const place = target?.sessionMode === 'rp' ? 'rp' : 'chat';
  return trim(getMemoryStorageMode?.(place)).toLowerCase();
};

export const runPersonaNewChatFlow = async ({
  personaId = '',
  personaName = '',
  rpSessionId = '',
  chatStore = null,
  contactsStore = null,
  momentsStore = null,
  momentSummaryStore = null,
  memoryTableStore = null,
  resolveDefaultMemoryTemplateId = async () => '',
  getMemoryStorageMode = () => 'off',
  askMemoryTableNewChatMode = async () => 'cancel',
  promptForArchiveName = () => '',
  buildMemoryTableSnapshot = async () => null,
  captureArchivePointer = async () => null,
  persistArchivePointer = async () => {},
  restoreMemoryForActiveThread = async () => {},
  notifyRowsUpdated = null,
  createRoleArchive = null,
  requireRoleArchiveForExtras = false,
  clearMemoryOnlyTargets = false,
  clearMoments = false,
  clearGlobalMemories = false,
  logger = null,
  deps = {},
} = {}) => {
  const runtimeDeps = {
    collectPersonaNewChatTargets,
    clearPersonaGlobalMemoriesForNewChat,
    buildPersonaGlobalMemorySnapshot,
    clearSessionMemoriesForNewChat,
    runStartNewChatFlow,
    ...deps,
  };
  const targets = runtimeDeps.collectPersonaNewChatTargets({
    chatStore,
    contactsStore,
    rpSessionId,
  });
  const tablePlaces = ['chat', 'rp', 'moments'].filter(
    place => trim(getMemoryStorageMode?.(place)).toLowerCase() === 'table',
  );
  let keepNonSummary = false;
  if (tablePlaces.length && memoryTableStore?.getMemories) {
    const choice = await askMemoryTableNewChatMode?.({
      personaId: trim(personaId),
      personaName: trim(personaName),
      targets,
    });
    if (choice === 'cancel') {
      return { started: false, cancelled: true, targets, archiveIdMap: {} };
    }
    keepNonSummary = choice === 'keep';
  }

  const sessionsWithHistory = targets.filter(target => target.hasSession);
  const memoryOnlyTargetsToClear = targets.filter((target) => {
    const storageMode = getStorageModeForTarget({ target, getMemoryStorageMode });
    return !target.hasSession && storageMode === 'table' && memoryTableStore?.getMemories;
  });
  let archiveName = '';
  if (sessionsWithHistory.length) {
    const rawName = await Promise.resolve(promptForArchiveName?.({
      personaId: trim(personaId),
      personaName: trim(personaName),
      targets: sessionsWithHistory,
    }));
    if (rawName === null) {
      return { started: false, cancelled: true, targets, archiveIdMap: {} };
    }
    archiveName = trim(rawName);
  }

  const momentsSnapshot = clearMoments
    ? clone(momentsStore?.exportState?.() || null, null)
    : null;
  const momentSummarySnapshot = clearMoments
    ? clone(momentSummaryStore?.exportState?.() || null, null)
    : null;
  const globalMemorySnapshot = clearGlobalMemories
    ? await runtimeDeps.buildPersonaGlobalMemorySnapshot({
        memoryTableStore,
        resolveDefaultMemoryTemplateId,
      })
    : null;
  const memoryOnlySnapshots = [];
  if (clearMemoryOnlyTargets) {
    for (const target of memoryOnlyTargetsToClear) {
      const snapshot = await buildMemoryTableSnapshot?.({
        sessionId: target.sessionId,
        isGroup: target.isGroup,
      });
      if (snapshot) {
        memoryOnlySnapshots.push({
          sessionId: target.sessionId,
          isGroup: target.isGroup,
          sessionMode: target.sessionMode,
          snapshot,
        });
      }
    }
  }

  const archiveIdMap = {};
  let startedSessions = 0;
  let memoryOnlyTargets = 0;
  for (const target of targets) {
    const storageMode = getStorageModeForTarget({ target, getMemoryStorageMode });
    if (target.hasSession) {
      const result = await runtimeDeps.runStartNewChatFlow({
        sessionId: target.sessionId,
        isGroup: target.isGroup,
        sessionMode: target.sessionMode,
        getMemoryStorageMode: () => storageMode,
        askMemoryTableNewChatMode: async () => (keepNonSummary ? 'keep' : 'clear'),
        promptForArchiveName: () => archiveName,
        buildMemoryTableSnapshot,
        captureArchivePointer,
        clearSessionMemories: ({ sessionId, isGroup, keepNonSummary, sessionMode }) =>
          runtimeDeps.clearSessionMemoriesForNewChat({
            sessionId,
            isGroup,
            keepNonSummary,
            memoryTableStore,
            resolveDefaultMemoryTemplateId,
            resolveSummaryTableIds: () => resolvePersonaNewChatSummaryTableIds({ sessionId, isGroup, sessionMode }),
            notifyRowsUpdated,
          }),
        startNewChat: (sessionId, nextArchiveName, options) =>
          chatStore?.startNewChat?.(sessionId, nextArchiveName, options),
        persistArchivePointer,
        restoreMemoryForActiveThread,
        logger,
        sourcePrefix: target.sessionMode === 'rp'
          ? 'persona_rp'
          : (target.isGroup ? 'persona_group' : 'persona_contact'),
      });
      if (result?.started) {
        startedSessions += 1;
        archiveIdMap[target.sessionId] = trim(result.archiveId);
      }
      continue;
    }
  }

  const sessionArchives = targets
    .map((target) => {
      const archiveId = trim(archiveIdMap[target.sessionId]);
      if (!target.hasSession || !archiveId) return null;
      return {
        sessionId: target.sessionId,
        archiveId,
        isGroup: target.isGroup,
        sessionMode: target.sessionMode,
      };
    })
    .filter(Boolean);
  let roleArchive = null;
  if (typeof createRoleArchive === 'function') {
    try {
      roleArchive = await createRoleArchive({
        personaId: trim(personaId),
        personaName: trim(personaName),
        name: archiveName,
        sessionArchives,
        memoryOnlySnapshots,
        globalMemorySnapshot,
        momentsSnapshot,
        momentSummarySnapshot,
        stats: {
          sessions: sessionArchives.length,
          memoryOnlyTargets: memoryOnlySnapshots.length,
          moments: Array.isArray(momentsSnapshot?.moments) ? momentsSnapshot.moments.length : 0,
          momentSummaries: Array.isArray(momentSummarySnapshot?.summaries) ? momentSummarySnapshot.summaries.length : 0,
        },
      });
    } catch (err) {
      logger?.warn?.('create persona role archive failed', err);
    }
  }
  const canClearExtras = !requireRoleArchiveForExtras || Boolean(roleArchive);

  if (clearMemoryOnlyTargets && canClearExtras) {
    for (const target of memoryOnlySnapshots) {
      await runtimeDeps.clearSessionMemoriesForNewChat({
        sessionId: target.sessionId,
        isGroup: target.isGroup,
        keepNonSummary,
        memoryTableStore,
        resolveDefaultMemoryTemplateId,
        resolveSummaryTableIds: () => resolvePersonaNewChatSummaryTableIds(target),
        notifyRowsUpdated,
      });
      memoryOnlyTargets += 1;
    }
  }
  const skippedMemoryOnlyTargets = Math.max(0, memoryOnlyTargetsToClear.length - memoryOnlyTargets);

  let clearedMoments = 0;
  if (clearMoments && canClearExtras) {
    try {
      const list = momentsStore?.list?.() || [];
      clearedMoments = Array.isArray(list) ? list.length : 0;
      momentsStore?.clearAll?.();
      await momentsStore?.flush?.();
    } catch (err) {
      logger?.warn?.('clear persona moments for new chat failed', err);
    }
    try {
      momentSummaryStore?.clearSummaries?.();
      momentSummaryStore?.clearCompactedSummary?.();
    } catch (err) {
      logger?.warn?.('clear persona moment summary for new chat failed', err);
    }
  }
  if (clearGlobalMemories && canClearExtras && tablePlaces.length && memoryTableStore?.getMemories) {
    try {
      await runtimeDeps.clearPersonaGlobalMemoriesForNewChat({
        keepNonSummary,
        memoryTableStore,
        resolveDefaultMemoryTemplateId,
        notifyRowsUpdated,
      });
    } catch (err) {
      logger?.warn?.('clear persona global memories for new chat failed', err);
    }
  }

  return {
    started: true,
    cancelled: false,
    targets,
    startedSessions,
    memoryOnlyTargets,
    skippedMemoryOnlyTargets,
    clearedMoments,
    skippedMoments: !clearMoments || !canClearExtras,
    skippedGlobalMemories: !clearGlobalMemories || !canClearExtras,
    keepNonSummary,
    archiveIdMap,
    roleArchive,
  };
};

export const restorePersonaRoleArchive = async ({
  archive = null,
  chatStore = null,
  memoryTableStore = null,
  resolveDefaultMemoryTemplateId = async () => '',
  getMemoryStorageMode = () => 'off',
  buildMemoryTableSnapshot = async () => null,
  captureArchivePointer = async () => null,
  loadArchivedMessages = async () => false,
  getLastArchiveTransition = () => null,
  persistArchivePointer = async () => {},
  applyMemoryTableSnapshot = async () => false,
  applyGlobalMemorySnapshot = null,
  restoreArchivePointerForLoadedThread = async () => {},
  momentsStore = null,
  momentSummaryStore = null,
  notifyRowsUpdated = null,
  currentRoleArchiveId = '',
  createSavedCurrentRoleArchive = null,
  logger = null,
  deps = {},
} = {}) => {
  const runtimeDeps = {
    runArchiveSwitchFlow,
    applyPersonaGlobalMemorySnapshot,
    ...deps,
  };
  if (!archive || typeof archive !== 'object') return { loaded: false, loadedSessions: 0 };
  let loadedSessions = 0;
  const missingSessionArchives = [];
  const savedCurrentSessionArchives = [];
  const canSaveCurrentRoleArchive = typeof createSavedCurrentRoleArchive === 'function';
  const currentMomentsSnapshot = canSaveCurrentRoleArchive
    ? clone(momentsStore?.exportState?.() || null, null)
    : null;
  const currentMomentSummarySnapshot = canSaveCurrentRoleArchive
    ? clone(momentSummaryStore?.exportState?.() || null, null)
    : null;
  const currentGlobalMemorySnapshot = canSaveCurrentRoleArchive
    ? await buildPersonaGlobalMemorySnapshot({
        memoryTableStore,
        resolveDefaultMemoryTemplateId,
      })
    : null;
  const sessionArchives = Array.isArray(archive.sessionArchives) ? archive.sessionArchives : [];
  for (const entry of sessionArchives) {
    const sessionId = trim(entry?.sessionId);
    const archiveId = trim(entry?.archiveId);
    if (!sessionId || !archiveId) continue;
    const targetArchive = (chatStore?.getArchives?.(sessionId) || [])
      .find(item => trim(item?.id) === archiveId);
    if (!targetArchive) {
      missingSessionArchives.push({ sessionId, archiveId });
      continue;
    }
    const sessionMode = trim(entry?.sessionMode) || (isRpSessionId(sessionId) ? 'rp' : 'chat');
    const isGroup = Boolean(entry?.isGroup);
    const result = await runtimeDeps.runArchiveSwitchFlow({
      sessionId,
      isGroup,
      archive: targetArchive,
      getMemoryStorageMode: () => getMemoryStorageMode(sessionMode === 'rp' ? 'rp' : 'chat'),
      buildMemoryTableSnapshot,
      captureArchivePointer,
      loadArchivedMessages,
      getLastArchiveTransition,
      persistArchivePointer,
      applyMemoryTableSnapshot,
      restoreArchivePointerForLoadedThread,
      logger,
      sourcePrefix: sessionMode === 'rp' ? 'persona_rp' : (isGroup ? 'persona_group' : 'persona_contact'),
      restoreWarnMessage: 'restore checkpoint memory after persona role archive load failed',
    });
    if (result?.loaded) loadedSessions += 1;
    const archivedCurrentId = trim(result?.archivedCurrentId);
    if (result?.loaded && archivedCurrentId) {
      savedCurrentSessionArchives.push({
        sessionId,
        archiveId: archivedCurrentId,
        isGroup,
        sessionMode,
      });
    }
  }

  let savedCurrentRoleArchive = null;
  const shouldSaveCurrentRoleArchive = canSaveCurrentRoleArchive && (
    savedCurrentSessionArchives.length > 0 ||
    (trim(currentRoleArchiveId) && hasRoleArchiveSnapshotContent({
      globalMemorySnapshot: currentGlobalMemorySnapshot,
      momentsSnapshot: currentMomentsSnapshot,
      momentSummarySnapshot: currentMomentSummarySnapshot,
    }))
  );
  if (shouldSaveCurrentRoleArchive) {
    try {
      savedCurrentRoleArchive = await createSavedCurrentRoleArchive({
        id: trim(currentRoleArchiveId) || undefined,
        name: trim(currentRoleArchiveId) ? '' : '自动存档',
        sessionArchives: savedCurrentSessionArchives,
        globalMemorySnapshot: currentGlobalMemorySnapshot,
        momentsSnapshot: currentMomentsSnapshot,
        momentSummarySnapshot: currentMomentSummarySnapshot,
        stats: {
          sessions: savedCurrentSessionArchives.length,
          moments: Array.isArray(currentMomentsSnapshot?.moments) ? currentMomentsSnapshot.moments.length : 0,
          momentSummaries: Array.isArray(currentMomentSummarySnapshot?.summaries) ? currentMomentSummarySnapshot.summaries.length : 0,
        },
      });
    } catch (err) {
      logger?.warn?.('save current persona role archive before load failed', err);
    }
  }

  const memoryOnlySnapshots = Array.isArray(archive.memoryOnlySnapshots) ? archive.memoryOnlySnapshots : [];
  let restoredMemoryOnly = 0;
  for (const item of memoryOnlySnapshots) {
    if (!item?.snapshot) continue;
    const ok = await applyMemoryTableSnapshot?.({
      sessionId: trim(item.sessionId),
      isGroup: Boolean(item.isGroup),
      snapshot: item.snapshot,
    });
    if (ok) restoredMemoryOnly += 1;
  }

  let restoredGlobalMemory = false;
  if (archive.globalMemorySnapshot) {
    const applyGlobal = applyGlobalMemorySnapshot || ((payload) =>
      runtimeDeps.applyPersonaGlobalMemorySnapshot({
        ...payload,
        memoryTableStore,
        resolveDefaultMemoryTemplateId,
        notifyRowsUpdated,
      }));
    restoredGlobalMemory = Boolean(await applyGlobal({ snapshot: archive.globalMemorySnapshot }));
  }

  let restoredMoments = false;
  if (archive.momentsSnapshot && momentsStore?.importState) {
    momentsStore.importState(archive.momentsSnapshot);
    restoredMoments = true;
  }
  let restoredMomentSummary = false;
  if (archive.momentSummarySnapshot && momentSummaryStore?.importState) {
    momentSummaryStore.importState(archive.momentSummarySnapshot);
    restoredMomentSummary = true;
  }

  return {
    loaded: loadedSessions > 0 || restoredMoments || restoredMomentSummary || restoredMemoryOnly > 0 || restoredGlobalMemory,
    loadedSessions,
    restoredMemoryOnly,
    restoredGlobalMemory,
    restoredMoments,
    restoredMomentSummary,
    missingSessionArchives,
    savedCurrentSessionArchives,
    savedCurrentRoleArchive,
  };
};
