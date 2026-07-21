const invoke = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);

export const registerAppSessionEventListeners = ({
  windowLike = globalThis.window,
  onOpenSessionConfig = null,
  onPresetChanged = null,
  onRegexChanged = null,
  onSessionPanelClosed = null,
  onSessionChanged = null,
} = {}) => {
  windowLike?.addEventListener?.('open-session-config', () => {
    invoke(onOpenSessionConfig);
  });
  windowLike?.addEventListener?.('preset-changed', async () => {
    await invoke(onPresetChanged);
  });
  windowLike?.addEventListener?.('regex-changed', () => {
    invoke(onRegexChanged);
  });
  windowLike?.addEventListener?.('session-panel-closed', (event) => {
    invoke(onSessionPanelClosed, event?.detail);
  });
  windowLike?.addEventListener?.('session-changed', async (event) => {
    await invoke(onSessionChanged, event?.detail?.id, event);
  });
};

export const bindAppSessionEntryNavigation = ({
  chatListEl = null,
  contactsUngroupedEl = null,
  contactsGroupsEl = null,
  getActivePage = () => 'chat',
  switchPage = () => {},
  enterChatRoom = () => {},
  onSelectContact = null,
} = {}) => {
  chatListEl?.addEventListener?.('click', (event) => {
    const item = event?.target?.closest?.('.chat-list-item');
    if (!item) return;
    const id = item.dataset?.session || 'default';
    const name = item.dataset?.name || id;
    enterChatRoom(id, name);
    switchPage('chat');
  });

  const bindContactList = (listEl) => {
    listEl?.addEventListener?.('click', (event) => {
      const item = event?.target?.closest?.('.contact-item');
      if (!item || !item.dataset?.session) return;
      const id = item.dataset.session;
      const name = item.dataset?.name || id;
      const origin = getActivePage();
      if (typeof onSelectContact === 'function') {
        onSelectContact({ id, name, item, originPage: origin });
        return;
      }
      switchPage('chat', { animate: false });
      enterChatRoom(id, name, origin);
    });
  };

  bindContactList(contactsUngroupedEl);
  bindContactList(contactsGroupsEl);
};
