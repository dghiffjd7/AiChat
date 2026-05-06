export const resolveEnterPageSize = ({
  isGroupSession = false,
  isAndroid = false,
} = {}) => {
  if (!isGroupSession) return 90;
  return isAndroid ? 56 : 72;
};

export const buildInitialHistorySlice = (
  history,
  {
    firstUnreadId = '',
    pageSize = 90,
    unreadLead = 10,
    injectUnreadDivider = null,
  } = {},
) => {
  const list = Array.isArray(history) ? history : [];
  const normalizedUnreadId = String(firstUnreadId || '').trim();
  let start = Math.max(0, list.length - Math.max(0, Number(pageSize) || 0));
  if (normalizedUnreadId) {
    const unreadIndex = list.findIndex(item => String(item?.id || '') === normalizedUnreadId);
    if (unreadIndex !== -1 && unreadIndex < start) {
      start = Math.max(0, unreadIndex - Math.max(0, Number(unreadLead) || 0));
    }
  }
  const initial = list.slice(start, start + Math.max(0, Number(pageSize) || 0));
  const injected = typeof injectUnreadDivider === 'function'
    ? injectUnreadDivider(initial, normalizedUnreadId)
    : null;
  return {
    start,
    initial,
    list: Array.isArray(injected?.list) ? injected.list : initial,
    dividerId: String(injected?.dividerId || '').trim(),
  };
};

export const shouldUseProgressiveInitialRender = ({
  isGroupSession = false,
  isAndroid = false,
  jumpTargetMessageId = '',
  firstUnreadId = '',
  initialCount = 0,
} = {}) => {
  return Boolean(
    isGroupSession &&
    isAndroid &&
    !String(jumpTargetMessageId || '').trim() &&
    !String(firstUnreadId || '').trim() &&
    Number(initialCount) > 28,
  );
};

export const resolveEnterScrollMode = ({
  jumpedToTarget = false,
  suppressInitialAutoScroll = false,
  dividerId = '',
  firstUnreadId = '',
} = {}) => {
  if (jumpedToTarget) return 'target';
  if (suppressInitialAutoScroll) return 'keep';
  if (String(dividerId || '').trim() || String(firstUnreadId || '').trim()) return 'unread';
  return 'bottom';
};

export const resolveEnterHydrationDelay = ({
  isGroupSession = false,
} = {}) => {
  return isGroupSession ? 720 : 480;
};

export const buildEnterRestorePlan = ({
  currentArchiveId = '',
} = {}) => {
  if (String(currentArchiveId || '').trim()) {
    return {
      mode: 'archive',
      source: 'enter_chat_room_archive',
      refreshBaselineWhenNoTail: true,
    };
  }
  return {
    mode: 'tail',
    source: 'enter_chat_room',
    refreshBaselineWhenNoTail: true,
  };
};
