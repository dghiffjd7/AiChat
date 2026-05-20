export const normalizeRequestConfigUiMode = (value = '', { sessionId = '', taskType = '' } = {}) => {
  const token = String(value || '').trim().toLowerCase();
  if (token === 'moments' || token === 'moment' || token === 'dynamic' || token === 'space') return 'moments';
  if (token === 'rp' || token === 'creative') return 'rp';
  if (token === 'chat' || token === 'social') return 'chat';
  const task = String(taskType || '').trim().toLowerCase();
  if (task === 'moment_comment') return 'moments';
  const sid = String(sessionId || '').trim().toLowerCase();
  return sid.startsWith('rp:') ? 'rp' : 'chat';
};

export const resolveRequestConfigProfileId = ({
  presetStore = null,
  sessionId = '',
  uiMode = '',
  taskType = '',
} = {}) => {
  const sid = String(sessionId || '').trim();
  const mode = normalizeRequestConfigUiMode(uiMode, { sessionId: sid, taskType });
  const sessionProfileId = sid
    ? String(presetStore?.getSessionProfileId?.('openai', sid) || '').trim()
    : '';
  if (sessionProfileId) {
    return {
      profileId: sessionProfileId,
      source: 'session',
      sessionId: sid,
      uiMode: mode,
    };
  }
  const modeProfileId = String(presetStore?.getModeProfileId?.('openai', mode) || '').trim();
  if (modeProfileId) {
    return {
      profileId: modeProfileId,
      source: 'mode',
      sessionId: sid,
      uiMode: mode,
    };
  }
  return {
    profileId: '',
    source: 'global',
    sessionId: sid,
    uiMode: mode,
  };
};
