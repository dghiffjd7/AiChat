const RP_TO_CHAT_TABLE_IDS = [
  'rp_important_people',
  'rp_tasks',
  'rp_summary',
  'rp_outline',
];

const CHAT_TO_RP_CONTACT_TABLE_IDS = [
  'character_profile',
  'relationship',
  'events',
  'items',
  'chat_summary',
  'chat_outline',
];

const CHAT_TO_RP_GROUP_TABLE_IDS = [
  'important_people',
  'group_consensus',
  'group_summary',
  'group_outline',
];

const CHAT_TO_RP_ALL_SOCIAL_TABLE_IDS = [
  ...CHAT_TO_RP_CONTACT_TABLE_IDS,
  ...CHAT_TO_RP_GROUP_TABLE_IDS,
];

const CHAT_TO_RP_GROUP_TABLE_ID_SET = new Set(CHAT_TO_RP_GROUP_TABLE_IDS);

export const normalizeBridgeLimit = (raw, fallback = 0) => {
  const num = Math.trunc(Number(raw));
  if (Number.isFinite(num)) return Math.max(0, num);
  const fallbackNum = Math.trunc(Number(fallback));
  return Number.isFinite(fallbackNum) ? Math.max(0, fallbackNum) : 0;
};

export const getBridgeTableShortLabel = (table) => {
  const raw = String(table?.name || table?.id || '').trim();
  if (!raw) return '记忆表格';
  return raw
    .replace(/^(私聊|群聊|RP)/, '')
    .replace(/^互动/, '')
    .trim() || raw;
};

export const getRpToChatBridgeTableIds = () => RP_TO_CHAT_TABLE_IDS.slice();

export const getDefaultRpToChatBridgeTableId = () => 'rp_outline';

export const resolveRpToChatBridgeTableSettings = ({
  sessionSettings = {},
  fallbackEnabled = true,
  fallbackLimit = 0,
} = {}) => {
  const tableIds = getRpToChatBridgeTableIds();
  const rawSettings = sessionSettings?.rpBridgeTableSettings && typeof sessionSettings.rpBridgeTableSettings === 'object'
    ? sessionSettings.rpBridgeTableSettings
    : {};
  const defaultTableId = getDefaultRpToChatBridgeTableId();
  const legacyEnabled = typeof sessionSettings?.rpBridgeEnabled === 'boolean'
    ? sessionSettings.rpBridgeEnabled
    : Boolean(fallbackEnabled);
  const legacyLimit = normalizeBridgeLimit(sessionSettings?.rpBridgeOutlineLimit, fallbackLimit);
  return Object.fromEntries(tableIds.map((tableId) => {
    const raw = rawSettings?.[tableId] && typeof rawSettings[tableId] === 'object'
      ? rawSettings[tableId]
      : null;
    const enabled = typeof raw?.enabled === 'boolean'
      ? raw.enabled
      : (tableId === defaultTableId ? legacyEnabled : false);
    const limit = normalizeBridgeLimit(raw?.limit, tableId === defaultTableId ? legacyLimit : 0);
    return [tableId, { enabled, limit }];
  }));
};

export const pruneRpToChatBridgeTableSettings = (rawSettings = {}) => {
  const tableIds = getRpToChatBridgeTableIds();
  return Object.fromEntries(tableIds.map((tableId) => {
    const raw = rawSettings?.[tableId] && typeof rawSettings[tableId] === 'object'
      ? rawSettings[tableId]
      : {};
    return [
      tableId,
      {
        enabled: raw.enabled === true,
        limit: normalizeBridgeLimit(raw.limit, 0),
      },
    ];
  }));
};

export const getChatToRpBridgeSourceMeta = (rawSourceId = '') => {
  const sourceId = String(rawSourceId || '').trim();
  if (!sourceId) {
    return {
      sourceMode: 'all_social',
      sourceId: '',
      sourceIsGroup: false,
    };
  }
  return {
    sourceMode: 'single',
    sourceId,
    sourceIsGroup: sourceId.startsWith('group:'),
  };
};

export const getChatToRpBridgeTableIds = ({ sourceIsGroup = false, sourceMode = 'single' } = {}) => (
  sourceMode === 'all_social'
    ? CHAT_TO_RP_ALL_SOCIAL_TABLE_IDS.slice()
    : (sourceIsGroup ? CHAT_TO_RP_GROUP_TABLE_IDS.slice() : CHAT_TO_RP_CONTACT_TABLE_IDS.slice())
);

export const isChatToRpGroupTableId = (tableId = '') => CHAT_TO_RP_GROUP_TABLE_ID_SET.has(String(tableId || '').trim());

export const getDefaultChatToRpBridgeTableId = ({ sourceIsGroup = false, sourceMode = 'single' } = {}) => (
  sourceMode === 'all_social'
    ? ''
    : (sourceIsGroup ? 'group_outline' : 'chat_outline')
);

export const resolveChatToRpBridgeTableSettings = ({
  sessionSettings = {},
  sourceIsGroup = false,
  sourceMode = 'single',
  fallbackEnabled = true,
  fallbackLimit = 0,
} = {}) => {
  const tableIds = getChatToRpBridgeTableIds({ sourceIsGroup, sourceMode });
  const settingsKey = sourceMode === 'all_social' ? 'chatBridgeAllSocialTableSettings' : 'chatBridgeTableSettings';
  const rawSettings = sessionSettings?.[settingsKey] && typeof sessionSettings[settingsKey] === 'object'
    ? sessionSettings[settingsKey]
    : {};
  const defaultTableId = getDefaultChatToRpBridgeTableId({ sourceIsGroup, sourceMode });
  const defaultAllSocialTableIds = new Set(['chat_outline', 'group_outline']);
  const legacyEnabled = typeof sessionSettings?.chatBridgeEnabled === 'boolean'
    ? sessionSettings.chatBridgeEnabled
    : Boolean(fallbackEnabled);
  const legacyLimit = normalizeBridgeLimit(sessionSettings?.chatBridgeOutlineLimit, fallbackLimit);
  return Object.fromEntries(tableIds.map((tableId) => {
    const raw = rawSettings?.[tableId] && typeof rawSettings[tableId] === 'object'
      ? rawSettings[tableId]
      : null;
    const enabled = typeof raw?.enabled === 'boolean'
      ? raw.enabled
      : (sourceMode === 'all_social'
          ? (legacyEnabled && defaultAllSocialTableIds.has(tableId))
          : (tableId === defaultTableId ? legacyEnabled : false));
    const limit = normalizeBridgeLimit(raw?.limit, sourceMode === 'all_social'
      ? (defaultAllSocialTableIds.has(tableId) ? legacyLimit : 0)
      : (tableId === defaultTableId ? legacyLimit : 0));
    return [tableId, { enabled, limit }];
  }));
};

export const pruneChatToRpBridgeTableSettings = (rawSettings = {}, { sourceIsGroup = false, sourceMode = 'single' } = {}) => {
  const tableIds = getChatToRpBridgeTableIds({ sourceIsGroup, sourceMode });
  return Object.fromEntries(tableIds.map((tableId) => {
    const raw = rawSettings?.[tableId] && typeof rawSettings[tableId] === 'object'
      ? rawSettings[tableId]
      : {};
    return [
      tableId,
      {
        enabled: raw.enabled === true,
        limit: normalizeBridgeLimit(raw.limit, 0),
      },
    ];
  }));
};
