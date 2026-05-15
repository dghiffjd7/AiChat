export const refreshChatAndContactsListNow = ({
  chatScopeId = '',
  contactsScopeId = '',
  logger = null,
  listSessions = () => [],
  isRpSessionId = () => false,
  ensureContactsFromSessions = () => {},
  defaultAvatar = '',
  renderChatList = () => {},
  renderGroupsList = () => {},
  renderContactsUngrouped = () => {},
  contactsSearchTerm = '',
  applyContactsSearchFilter = () => {},
  updateChatContentSearchVisibility = () => {},
} = {}) => {
  if (chatScopeId !== contactsScopeId) {
    logger?.debug?.(
      `[Persona_test] refreshChatAndContacts skip scope mismatch chat=${chatScopeId || 'default'} contacts=${
        contactsScopeId || 'default'
      }`,
    );
    return false;
  }
  const socialSessions = listSessions().filter((sessionId) => !isRpSessionId(sessionId));
  ensureContactsFromSessions(socialSessions, {
    defaultAvatar,
    includeGroups: false,
  });
  renderChatList();
  renderGroupsList();
  renderContactsUngrouped();
  if (contactsSearchTerm && String(contactsSearchTerm).trim()) {
    try {
      applyContactsSearchFilter();
    } catch {}
  }
  try {
    updateChatContentSearchVisibility();
  } catch {}
  return true;
};

export const createChatAndContactsRefreshRuntime = ({
  refreshNow = () => {},
  requestAnimationFrameFn = null,
  cancelAnimationFrameFn = null,
  setTimeoutFn = (fn, delay) => setTimeout(fn, delay),
  clearTimeoutFn = (handle) => clearTimeout(handle),
} = {}) => {
  let queued = false;
  let handle = null;

  const cancelPending = () => {
    if (handle == null) return;
    try {
      if (typeof cancelAnimationFrameFn === 'function') {
        cancelAnimationFrameFn(handle);
      } else {
        clearTimeoutFn(handle);
      }
    } catch {}
    handle = null;
  };

  const schedule = (runner) => {
    try {
      if (typeof requestAnimationFrameFn === 'function') {
        return requestAnimationFrameFn(runner);
      }
    } catch {}
    return setTimeoutFn(runner, 16);
  };

  const refresh = ({ immediate = false } = {}) => {
    if (immediate) {
      queued = false;
      cancelPending();
      return refreshNow();
    }
    if (queued) return undefined;
    queued = true;
    handle = schedule(() => {
      queued = false;
      handle = null;
      refreshNow();
    });
    return handle;
  };

  return {
    cancelPending,
    refresh,
  };
};
