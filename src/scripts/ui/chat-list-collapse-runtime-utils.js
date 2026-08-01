export const CHAT_LIST_COLLAPSED_STORAGE_KEY = 'phone_chat_list_collapsed_v1';

const readCollapsed = (storage, key) => {
  try {
    return String(storage?.getItem?.(key) || '') === '1';
  } catch {
    return false;
  }
};

const writeCollapsed = (storage, key, collapsed) => {
  try {
    storage?.setItem?.(key, collapsed ? '1' : '0');
    return true;
  } catch {
    return false;
  }
};

const normalizeUnreadCount = value => {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.trunc(count)) : 0;
};

export const createChatListCollapseRuntime = ({
  root = null,
  handle = null,
  storage = null,
  storageKey = CHAT_LIST_COLLAPSED_STORAGE_KEY,
} = {}) => {
  let collapsed = readCollapsed(storage, storageKey);
  let unreadCount = 0;

  const render = () => {
    if (root?.dataset) {
      if (collapsed) root.dataset.chatListCollapsed = 'true';
      else delete root.dataset.chatListCollapsed;
      if (unreadCount > 0) root.dataset.chatListHasUnread = 'true';
      else delete root.dataset.chatListHasUnread;
    }
    handle?.setAttribute?.('aria-expanded', collapsed ? 'false' : 'true');
    const label = collapsed
      ? `展开聊天列表${unreadCount > 0 ? `，有 ${unreadCount} 条未读消息` : ''}`
      : '收合聊天列表';
    handle?.setAttribute?.('aria-label', label);
    handle?.setAttribute?.('title', label);
    return collapsed;
  };

  const setCollapsed = (value, { persist = true } = {}) => {
    collapsed = value === true;
    if (persist) writeCollapsed(storage, storageKey, collapsed);
    render();
    return collapsed;
  };

  const toggle = () => setCollapsed(!collapsed);
  const setUnreadCount = value => {
    unreadCount = normalizeUnreadCount(value);
    render();
    return unreadCount;
  };
  const onClick = () => toggle();
  handle?.addEventListener?.('click', onClick);
  render();

  return {
    isCollapsed: () => collapsed,
    getUnreadCount: () => unreadCount,
    setCollapsed,
    setUnreadCount,
    toggle,
    render,
    destroy() {
      handle?.removeEventListener?.('click', onClick);
    },
  };
};
