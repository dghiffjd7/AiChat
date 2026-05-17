const RP_SESSION_PREFIX = 'rp:';

export const isRpSessionId = (sessionId) => String(sessionId || '').trim().startsWith(RP_SESSION_PREFIX);

export const normalizeMemoryTableUsage = (raw) => {
  const value = String(raw || '').trim().toLowerCase();
  if (value === 'chat') return 'chat';
  if (value === 'rp') return 'rp';
  if (value === 'moments' || value === 'moment') return 'moments';
  return 'all';
};

export const resolveMemorySessionMode = ({ uiMode = '', sessionId = '', contextType = '' } = {}) => {
  const mode = String(uiMode || '').trim().toLowerCase();
  const ctx = String(contextType || '').trim().toLowerCase();
  if (mode === 'moments' || mode === 'moment' || ctx === 'moments') return 'moments';
  if (mode === 'rp' || ctx === 'rp' || isRpSessionId(sessionId)) return 'rp';
  return 'chat';
};

export const getMemoryContextType = ({ sessionId = '', isGroup = false, contextType = '' } = {}) => {
  const explicit = String(contextType || '').trim().toLowerCase();
  if (explicit === 'global' || explicit === 'contact' || explicit === 'group' || explicit === 'rp' || explicit === 'moments') {
    return explicit;
  }
  if (isGroup) return 'group';
  if (isRpSessionId(sessionId)) return 'rp';
  return 'contact';
};

export const tableMatchesMemoryContext = (table, options = {}) => {
  const scope = String(table?.scope || '').trim().toLowerCase();
  const contextType = getMemoryContextType(options);
  if (contextType === 'global' && scope !== 'global') return false;
  if (contextType === 'moments' && scope !== 'global') return false;
  if (contextType === 'group' && scope && scope !== 'global' && scope !== 'group') return false;
  if ((contextType === 'contact' || contextType === 'rp') && scope && scope !== 'global' && scope !== 'contact') return false;

  const usage = normalizeMemoryTableUsage(table?.usage);
  const sessionMode = resolveMemorySessionMode({
    uiMode: options?.uiMode,
    sessionId: options?.sessionId,
    contextType,
  });
  if (sessionMode === 'moments') return usage === 'moments';
  return usage === 'all' || usage === sessionMode;
};

export const getMemoryTableUsageLabel = (raw) => {
  const usage = normalizeMemoryTableUsage(raw);
  if (usage === 'chat') return '聊天';
  if (usage === 'rp') return 'RP';
  if (usage === 'moments') return '动态';
  return '通用';
};

export const getSummaryTableIdsForContext = (options = {}) => {
  const contextType = getMemoryContextType(options);
  const sessionMode = resolveMemorySessionMode({
    uiMode: options?.uiMode,
    sessionId: options?.sessionId,
    contextType,
  });
  if (sessionMode === 'rp') {
    return {
      summaryTableId: 'rp_summary',
      outlineTableId: 'rp_outline',
    };
  }
  if (sessionMode === 'moments' || contextType === 'moments') {
    return {
      summaryTableId: 'moment_summary',
      outlineTableId: 'moment_outline',
    };
  }
  if (contextType === 'group') {
    return {
      summaryTableId: 'group_summary',
      outlineTableId: 'group_outline',
    };
  }
  return {
    summaryTableId: 'chat_summary',
    outlineTableId: 'chat_outline',
  };
};
