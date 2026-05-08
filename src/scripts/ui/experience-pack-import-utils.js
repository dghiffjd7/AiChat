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

export const getExperiencePackImportBaseName = (packageData = {}) => (
  String(packageData?.character?.contact?.name || packageData?.manifest?.character?.name || '角色').trim() || '角色'
);

export const buildExperiencePackImportedContactRecord = ({
  packageData = {},
  sessionId = '',
  baseName = '',
  avatar = '',
  addedAt = Date.now(),
} = {}) => {
  const contact = packageData?.character?.contact || {};
  return {
    id: String(sessionId || ''),
    name: String(baseName || '').trim() || getExperiencePackImportBaseName(packageData),
    avatar: String(avatar || ''),
    isGroup: false,
    addedAt,
    labels: ensureArray(contact?.labels).map(String),
    description: String(contact?.description || ''),
    source: 'experience_pack',
    isUserCreated: true,
  };
};

export const mapExperiencePackImportedWorldIds = ({
  worldIds = [],
  worldIdMap = {},
} = {}) => (
  ensureArray(worldIds)
    .map(id => String(id || '').trim())
    .filter(Boolean)
    .map(id => worldIdMap[id] || id)
    .filter(Boolean)
    .filter((id, index, list) => list.indexOf(id) === index)
);

export const buildExperiencePackSessionSettings = ({
  sessionSettings = {},
  importedPersona = null,
} = {}) => {
  const settings = {
    ...(sessionSettings && typeof sessionSettings === 'object' ? sessionSettings : {}),
  };
  if (importedPersona?.id) settings.personaLockId = importedPersona.id;
  return settings;
};

export const buildExperiencePackImportSwitchConfirmOptions = ({
  baseName = '',
} = {}) => ({
  title: '导入完成',
  message: `已创建角色副本：${String(baseName || '').trim() || '角色'}。是否切换到这个会话？`,
  confirmText: '切换',
  cancelText: '稍后',
});

export const buildExperiencePackSessionChangedDetail = (sessionId = '') => ({
  id: String(sessionId || ''),
});

export const normalizeExperiencePackSummaryList = (list = []) =>
  ensureArray(list)
    .map(item => {
      if (!item || typeof item !== 'object') return null;
      const text = String(item.text || '').trim();
      if (!text) return null;
      return {
        at: Number(item.at || 0) || 0,
        text,
      };
    })
    .filter(Boolean);

export const normalizeExperiencePackCompactedSummary = (value) => {
  if (!value || typeof value !== 'object') return null;
  const text = String(value.text || '').trim();
  if (!text) return null;
  const out = {
    at: Number(value.at || 0) || 0,
    text,
  };
  const raw = String(value.raw || '').trim();
  if (raw) out.raw = raw;
  return out;
};

export const normalizeExperiencePackChatArchivePayloads = (chatArchives = []) => {
  const map = new Map();
  ensureArray(chatArchives)
    .map(item => ({
      ...item,
      id: String(item?.id || '').trim(),
    }))
    .filter(item => item.id)
    .forEach(item => {
      map.set(item.id, item);
    });
  return Array.from(map.values());
};

export const buildExperiencePackRestoredArchiveMetas = (
  chatSession = {},
  { includeMemoryData = false } = {},
) => (
  ensureArray(chatSession?.archives)
    .map(archive => ({
      id: String(archive?.id || '').trim(),
      name: String(archive?.name || ''),
      timestamp: Number(archive?.timestamp || 0) || 0,
      messageCount: Number(archive?.messageCount || 0) || 0,
      summaries: normalizeExperiencePackSummaryList(archive?.summaries || []),
      compactedSummary: normalizeExperiencePackCompactedSummary(archive?.compactedSummary || null),
      compactedSummaryLastRaw: cloneJson(archive?.compactedSummaryLastRaw || null, null),
      memoryTableSnapshot: includeMemoryData ? cloneJson(archive?.memoryTableSnapshot || null, null) : null,
    }))
    .filter(archive => archive.id)
);

export const buildExperiencePackRestoredSessionChatState = (
  chatSession = {},
  { includeMemoryData = false } = {},
) => ({
  draft: String(chatSession?.draft || ''),
  detachedSummaries: normalizeExperiencePackSummaryList(chatSession?.current?.detachedSummaries || []),
  compactedSummary: normalizeExperiencePackCompactedSummary(chatSession?.current?.compactedSummary || null),
  compactedSummaryLastRaw: cloneJson(chatSession?.current?.compactedSummaryLastRaw || null, null),
  currentArchiveId: null,
  archives: buildExperiencePackRestoredArchiveMetas(chatSession, { includeMemoryData }),
});

export const buildExperiencePackLegacyRestoredArchives = (
  archiveMetas = [],
  archivePayloads = [],
) => {
  const archiveMessageMap = new Map(
    ensureArray(archivePayloads).map(archive => [archive?.id, ensureArray(archive?.messages)])
  );
  return ensureArray(archiveMetas).map(archive => ({
    ...archive,
    messages: archiveMessageMap.get(archive.id) || [],
  }));
};

export const buildExperiencePackArchiveMessageRestoreJobs = (
  archiveMetas = [],
  archivePayloads = [],
) => (
  ensureArray(archiveMetas).map(archive => {
    const payload = ensureArray(archivePayloads).find(item => item?.id === archive?.id);
    return {
      archiveId: String(archive?.id || ''),
      messages: ensureArray(payload?.messages),
    };
  })
);

export const buildExperiencePackRoomBaseSettings = (roomConfig = {}) => {
  const settings = cloneJson(roomConfig?.sessionSettings || {}, {});
  delete settings.personaLockId;
  return settings;
};

const buildExperiencePackWallpaperMetaSettings = (wallpaper = {}) => ({
  name: String(wallpaper?.meta?.name || ''),
  zoom: Number(wallpaper?.meta?.zoom || 1) || 1,
  rotate: Number(wallpaper?.meta?.rotate || 0) || 0,
  offsetX: Number(wallpaper?.meta?.offsetX || 0) || 0,
  offsetY: Number(wallpaper?.meta?.offsetY || 0) || 0,
  width: Number(wallpaper?.meta?.width || 0) || 0,
  height: Number(wallpaper?.meta?.height || 0) || 0,
});

export const buildExperiencePackWallpaperSaveRequest = ({
  sessionId = '',
  dataUrl = '',
  wallpaper = {},
} = {}) => ({
  sessionId: String(sessionId || ''),
  dataUrl: String(dataUrl || ''),
  fileName: wallpaper?.meta?.name || String(wallpaper?.file || '').split('/').pop() || 'wallpaper',
});

export const buildExperiencePackSavedWallpaperSettings = ({
  wallpaper = {},
  savedPath = '',
} = {}) => ({
  path: String(savedPath || '').trim(),
  ...buildExperiencePackWallpaperMetaSettings(wallpaper),
  saveOriginal: wallpaper?.meta?.saveOriginal === true,
});

export const buildExperiencePackRemoteWallpaperSettings = ({
  currentWallpaper = null,
  wallpaper = {},
} = {}) => ({
  ...(currentWallpaper && typeof currentWallpaper === 'object' ? currentWallpaper : {}),
  url: String(wallpaper?.remoteUrl || ''),
  ...buildExperiencePackWallpaperMetaSettings(wallpaper),
});

export const buildExperiencePackImportedPresetNameBase = ({
  packageData = {},
  settings = {},
  presetPayload = {},
  type = '',
} = {}) => (
  `${String(packageData?.manifest?.character?.name || settings?.name || '角色').trim() || '角色'}·${String(presetPayload?.name || type)}`
);

export const buildExperiencePackPresetUpsertPayload = ({
  presetPayload = {},
  presetName = '',
} = {}) => ({
  name: String(presetName || ''),
  data: cloneJson(presetPayload?.data || {}, {}),
  makeActive: false,
});

export const buildExperiencePackImportedConnectionProfileNameBase = (packageData = {}) => (
  `${String(packageData?.manifest?.character?.name || '角色').trim() || '角色'}·连线`
);
