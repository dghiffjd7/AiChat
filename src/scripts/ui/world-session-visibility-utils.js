const normalizeList = (value, normalizeWorldIds) => (
  typeof normalizeWorldIds === 'function'
    ? normalizeWorldIds(value)
    : (Array.isArray(value) ? value : [value]).map(item => String(item || '').trim()).filter(Boolean)
);

export const resolveVisibleSessionWorldIds = ({
  uiMode = 'chat',
  sessionId = '',
  isGroupChat = false,
  groupMemberIds = [],
  worldSessionMap = {},
  normalizeWorldIds = null,
} = {}) => {
  const sid = String(sessionId || '').trim();
  const mode = String(uiMode || '').trim().toLowerCase() === 'rp' ? 'rp' : 'chat';
  if (mode === 'rp' || !isGroupChat) {
    return normalizeList(worldSessionMap?.[sid], normalizeWorldIds);
  }
  const out = [];
  (Array.isArray(groupMemberIds) ? groupMemberIds : []).forEach(memberSessionId => {
    normalizeList(worldSessionMap?.[memberSessionId], normalizeWorldIds).forEach(worldId => {
      if (!out.includes(worldId)) out.push(worldId);
    });
  });
  return out;
};
