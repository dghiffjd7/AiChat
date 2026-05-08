import { BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } from '../storage/builtin-worldbooks.js';
import { normalizeScopeId } from '../storage/store-scope.js';
import { normalizeWorldIdList } from './world-id-utils.js';

const ensureArray = value => (Array.isArray(value) ? value : []);

const cloneJson = (value, fallback = null) => {
  try {
    return structuredClone(value);
  } catch {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }
};

const readMappedValue = (mapLike, key) => {
  if (mapLike instanceof Map) return mapLike.get(key);
  return mapLike?.[key];
};

export const CUSTOM_BUNDLE_SHARED_SCOPE_KEY = '__shared__';

export const getCustomBundleTouchedScopeKey = (scopeId = '') => (
  scopeId || CUSTOM_BUNDLE_SHARED_SCOPE_KEY
);

export const getCustomBundleScopeIdFromTouchedKey = (scopeKey = '') => (
  scopeKey === CUSTOM_BUNDLE_SHARED_SCOPE_KEY ? '' : scopeKey
);

export const markCustomBundleTouchedRuntime = ({
  touchedScopes = null,
  touchedRuntimes = null,
  scopeId = '',
  runtime = null,
} = {}) => {
  const scopeKey = getCustomBundleTouchedScopeKey(scopeId);
  touchedScopes?.add?.(scopeKey);
  if (runtime) touchedRuntimes?.set?.(scopeKey, runtime);
  return scopeKey;
};

export const getCustomBundleRoomSourceSessionId = (roomPackage = {}) => (
  String(roomPackage?.contact?.id || roomPackage?.manifest?.sessionId || '').trim()
);

export const buildCustomBundleRoomRefCounts = (manifestRoles = []) => {
  const counts = new Map();
  ensureArray(manifestRoles).forEach((role) => {
    ensureArray(role?.chats).forEach((roomKeyRaw) => {
      const roomKey = String(roomKeyRaw || '').trim();
      if (!roomKey) return;
      counts.set(roomKey, Number(counts.get(roomKey) || 0) + 1);
    });
  });
  return counts;
};

export const resolveCustomBundlePersonaLockId = ({
  personaId = '',
  currentSharedMode = false,
  roomRefCount = 0,
} = {}) => {
  const id = String(personaId || '').trim();
  if (!id) return '';
  return currentSharedMode === true && Number(roomRefCount || 0) > 1 ? '' : id;
};

export const planCustomBundleChatRoomImports = ({
  chatRoomKeys = [],
  roomMap = null,
  sharedImportedRooms = null,
  currentSharedMode = false,
  allocateSessionId = null,
} = {}) => {
  const plannedChatSessions = new Map();
  const sourceSessionIdMap = new Map();
  const roomEntries = [];
  ensureArray(chatRoomKeys).forEach((roomKeyRaw) => {
    const roomKey = String(roomKeyRaw || '').trim();
    if (!roomKey) return;
    const roomPackage = roomMap?.get?.(roomKey);
    if (!roomPackage) return;
    if (currentSharedMode === true && sharedImportedRooms?.has?.(roomKey)) return;
    const sessionId = String(allocateSessionId?.(roomPackage, roomKey) || '').trim();
    if (sessionId) plannedChatSessions.set(roomKey, sessionId);
    const sourceSessionId = getCustomBundleRoomSourceSessionId(roomPackage);
    if (sourceSessionId && sessionId) sourceSessionIdMap.set(sourceSessionId, sessionId);
    roomEntries.push({ roomKey, roomPackage });
  });
  return {
    plannedChatSessions,
    sourceSessionIdMap,
    roomEntries,
  };
};

export const getCustomBundleRpRoomDisplayName = (persona = {}) => (
  String(persona?.name || '角色').trim() || '角色'
);

export const buildCustomBundleRpRoomName = (persona = {}) => (
  `${getCustomBundleRpRoomDisplayName(persona)}·创意写作`
);

export const planCustomBundleRpRoomImport = ({
  creativeWritingRoomKey = '',
  roomMap = null,
  importedPersona = {},
  targetScopeId = '',
  currentSharedMode = false,
} = {}) => {
  const roomKey = String(creativeWritingRoomKey || '').trim();
  if (!roomKey) return null;
  const roomPackage = roomMap?.get?.(roomKey);
  if (!roomPackage) return null;
  return {
    roomKey,
    roomPackage,
    scopeId: currentSharedMode === true ? '' : String(targetScopeId || ''),
    sessionId: `rp:${String(importedPersona?.id || '').trim()}`,
    displayName: buildCustomBundleRpRoomName(importedPersona),
    personaLockId: importedPersona?.id,
  };
};

export const buildCustomBundleChatImportedTarget = ({
  importedPersona = {},
  scopeId = '',
  sessionId = '',
  contactPayload = {},
} = {}) => ({
  personaId: importedPersona?.id,
  personaName: importedPersona?.name,
  scopeId,
  sessionId,
  roomName: String(contactPayload?.name || sessionId),
  isRp: false,
});

export const buildCustomBundleRpImportedTarget = ({
  importedPersona = {},
  scopeId = '',
  sessionId = '',
} = {}) => ({
  personaId: importedPersona?.id,
  personaName: importedPersona?.name,
  scopeId,
  sessionId,
  roomName: buildCustomBundleRpRoomName(importedPersona),
  isRp: true,
});

const buildRoomProgress = ({
  label = '',
  completedRoomUnits = 0,
  totalRoomUnits = 1,
  displayName = '',
  fileName = '',
} = {}) => {
  const completed = Number(completedRoomUnits || 0) || 0;
  const total = Number(totalRoomUnits || 0) || 0;
  return {
    phase: 'rooms',
    progress: 30 + Math.round((completed / total) * 56),
    status: `正在恢复${label} ${completed}/${total}：${displayName}`,
    fileName,
  };
};

export const buildCustomBundleChatRoomProgressDetail = ({
  completedRoomUnits = 0,
  totalRoomUnits = 1,
  contactPayload = {},
  sessionId = '',
  fileName = '',
} = {}) => buildRoomProgress({
  label: '聊天室',
  completedRoomUnits,
  totalRoomUnits,
  displayName: String(contactPayload?.name || sessionId),
  fileName,
});

export const buildCustomBundleRpRoomProgressDetail = ({
  completedRoomUnits = 0,
  totalRoomUnits = 1,
  importedPersona = {},
  fileName = '',
} = {}) => buildRoomProgress({
  label: '创意写作',
  completedRoomUnits,
  totalRoomUnits,
  displayName: getCustomBundleRpRoomDisplayName(importedPersona),
  fileName,
});

export const resolveCustomBundleContactAvatar = ({
  contactPayload = {},
  getEntryDataUrl = null,
} = {}) => {
  const avatarFile = String(contactPayload?.avatarFile || '').trim();
  if (avatarFile) return String(getEntryDataUrl?.(avatarFile) || '');
  return String(contactPayload?.avatarValue || '').trim();
};

export const mapCustomBundleImportedMemberIds = ({
  members = [],
  sourceSessionIdMap = null,
} = {}) => (
  ensureArray(members)
    .map((memberId) => {
      const rawMemberId = String(memberId || '').trim();
      if (!rawMemberId) return '';
      return String(readMappedValue(sourceSessionIdMap, rawMemberId) || rawMemberId).trim();
    })
    .filter(Boolean)
);

export const mapCustomBundleImportedWorldIds = ({
  worldIds = [],
  worldIdMap = {},
} = {}) => (
  normalizeWorldIdList(worldIds, { excludeBuiltin: BUILTIN_PHONE_FORMAT_WORLDBOOK_ID })
    .map(id => readMappedValue(worldIdMap, id) || id)
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index)
);

export const buildCustomBundleImportedContactRecord = ({
  contactPayload = {},
  sessionId = '',
  avatar = '',
  mappedMembers = [],
  addedAt = Date.now(),
} = {}) => {
  const sid = String(sessionId || '').trim();
  return {
    id: sid,
    name: String(contactPayload?.name || contactPayload?.id || sid).trim() || sid,
    avatar: String(avatar || ''),
    isGroup: contactPayload?.isGroup === true,
    members: ensureArray(mappedMembers).map(memberId => String(memberId || '').trim()).filter(Boolean),
    description: String(contactPayload?.description || ''),
    labels: ensureArray(contactPayload?.labels).map(String),
    libraryTags: ensureArray(contactPayload?.libraryTags).map(String),
    addedAt,
    source: 'custom_bundle',
    isUserCreated: true,
  };
};

export const getCustomBundleRoomMemoryFailureLogMessage = (restoreFailureKind = 'chat') => (
  restoreFailureKind === 'rp'
    ? 'import memory snapshot for custom bundle rp failed'
    : 'import memory snapshot for custom bundle chat failed'
);

export const getCustomBundleRoomRestoreFailureLogMessage = (restoreFailureKind = 'chat') => (
  restoreFailureKind === 'rp'
    ? 'import chat history for custom bundle rp failed'
    : 'import chat history for custom bundle chat failed'
);

export const buildCustomBundleRoomRestoreFailureNote = ({
  restoreFailureKind = 'chat',
  restoreFailureName = '',
  sessionId = '',
  error = null,
} = {}) => (
  `${String(restoreFailureKind)} restore failed: ${String(restoreFailureName || sessionId)} -> ${String(error?.message || error || 'unknown error')}`
);

export const buildCustomBundleRoomDiagnosticExtra = ({
  roomKey = '',
  restoreMs = 0,
  mappedWorldIds = [],
  isGroup = false,
  mappedMembers,
} = {}) => {
  const extra = {
    roomKey,
    restoreMs,
    mappedWorldIds,
    isGroup,
  };
  if (mappedMembers !== undefined) extra.mappedMembers = mappedMembers;
  return extra;
};

export const buildCustomBundleRoomImportDiagnostic = ({
  runtime = null,
  sessionId = '',
  roomPackage = {},
  extra = {},
  getSessionWorldIds = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const scopeId = normalizeScopeId(runtime?.chatStore?.scopeId || runtime?.scopeId || '');
  const session = sid ? runtime?.chatStore?.state?.sessions?.[sid] || null : null;
  const contact = sid ? runtime?.contactsStore?.getContact?.(sid) || null : null;
  const expectedArchives = ensureArray(roomPackage?.archives).map((archive) => ({
    id: String(archive?.id || '').trim(),
    name: String(archive?.name || ''),
    expectedMessages: ensureArray(archive?.messages).length,
  })).filter(archive => archive.id);
  const storedArchives = ensureArray(session?.archives).map((archive) => {
    const archiveId = String(archive?.id || '').trim();
    return {
      id: archiveId,
      name: String(archive?.name || ''),
      storedMetaMessages: Number(archive?.messageCount || 0) || 0,
      v2Messages: sid ? Number(runtime?.chatStore?._v2?.getThreadTotal?.(sid, archiveId) || 0) || 0 : 0,
    };
  }).filter(archive => archive.id);
  return {
    ...cloneJson(extra, {}),
    scopeId,
    sessionId: sid,
    sourceSessionId: String(roomPackage?.contact?.id || roomPackage?.manifest?.sessionId || '').trim(),
    roomName: String(roomPackage?.contact?.name || roomPackage?.manifest?.displayName || sid),
    uiMode: String(roomPackage?.manifest?.uiMode || '').trim() || 'chat',
    hasContact: Boolean(contact),
    contactMembers: ensureArray(contact?.members).map(memberId => String(memberId || '').trim()).filter(Boolean),
    currentExpectedMessages: ensureArray(roomPackage?.chatCurrent?.messages).length,
    currentStoredMessages: sid ? Number(runtime?.chatStore?._v2?.getThreadTotal?.(sid, '') || 0) || 0 : 0,
    currentLoadedThreadKey: String(session?._loadedThreadKey || ''),
    stateArchiveCount: storedArchives.length,
    expectedArchives,
    storedArchives,
    expectedWorldIds: normalizeWorldIdList(roomPackage?.roomConfig?.world?.worldIds || [], {
      excludeBuiltin: BUILTIN_PHONE_FORMAT_WORLDBOOK_ID,
    }),
    storedWorldIds: ensureArray(getSessionWorldIds?.(runtime, sid)).map(worldId => String(worldId || '').trim()).filter(Boolean),
  };
};
