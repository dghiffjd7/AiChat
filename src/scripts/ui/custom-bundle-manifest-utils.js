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

const ensureArray = value => (Array.isArray(value) ? value : []);

export const buildCustomBundleRoleManifest = (role = {}) => ({
  id: role?.id,
  name: role?.name,
  scopeId: role?.scopeId,
  sharedContacts: role?.sharedContacts === true,
  hasMoments: false,
  chats: [],
  creativeWriting: '',
});

export const buildCustomBundlePersonaPayload = ({
  role = {},
  avatarFile = '',
  avatarValue = '',
} = {}) => ({
  id: role?.id,
  name: role?.name,
  description: role?.description,
  avatarFile,
  avatarValue,
  source: cloneJson(role?.source || null, null),
  userBubbleColor: role?.userBubbleColor,
  userTextColor: role?.userTextColor,
  position: role?.position,
  depth: role?.depth,
  role: role?.roleValue,
  created: role?.created,
  updated: role?.updated,
});

export const buildCustomBundleRoomManifestEntries = (rooms = []) => (
  ensureArray(rooms).map(room => ({
    key: room?.key,
    sessionId: room?.sessionId,
    scopeId: room?.scopeId,
    uiMode: room?.uiMode,
  }))
);

export const buildCustomBundleManifest = ({
  format,
  formatVersion,
  exportedAt,
  exportedBy = 'AiChat',
  mode = '',
  options = {},
  summary = {},
  roles = [],
  rooms = [],
} = {}) => ({
  format,
  formatVersion,
  exportedAt,
  exportedBy,
  mode,
  options: cloneJson(options, {}),
  summary: {
    roles: summary?.roles,
    chats: summary?.chats,
    creative: summary?.creative,
    archives: summary?.archives,
    moments: summary?.momentScopes,
    momentEntries: summary?.moments,
    momentSummaries: summary?.momentSummaries,
    momentCompacted: summary?.momentCompacted,
    includeConversationContent: options?.includeConversationContent === true,
    includeMemoryData: options?.includeMemoryData === true,
    includeVariableState: options?.includeVariableState === true,
    hideServiceAddresses: options?.hideServiceAddresses === true,
  },
  roles,
  rooms: buildCustomBundleRoomManifestEntries(rooms),
});
