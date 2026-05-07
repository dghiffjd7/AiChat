export const showContextMenuCore = ({
  event,
  message,
  selectionMode = false,
  contextMenu = null,
  navigatorLike = null,
  scrollEl = null,
  hideReactionPicker = null,
  resolveContextMenuContext = null,
  buildContextMenuActions = null,
  isThreadingEnabledForMessage = null,
  normalizeReactionEntries = null,
  createContextMenuReactionRow = null,
  defaultReactionEmojis = [],
  isSelfReaction = null,
  createContextMenuActionButton = null,
  dispatchContextMenuAction = null,
  getPoint = null,
  positionContextMenu = null,
  actionHandler = null,
  clearLongPress = null,
  openCodeViewer = null,
  getBubbleCopyText = null,
  copyToClipboard = null,
  startInlineEdit = null,
  enterSelectionMode = null,
  successToast = null,
  warningToast = null,
  documentLike = null,
  windowLike = null,
} = {}) => {
  if (selectionMode || !contextMenu) return false;
  try { navigatorLike?.vibrate?.(5); } catch {}
  hideReactionPicker?.();
  const {
    wrapper,
    message: resolvedMessage,
    codeBlock,
    hasCode,
  } = resolveContextMenuContext?.({
    event,
    message,
    scrollEl,
  }) || {};
  const threadingEnabled = Boolean(isThreadingEnabledForMessage?.(resolvedMessage));
  const actions = [
    ...(buildContextMenuActions?.(resolvedMessage, {
      hasCode,
      isThreadingEnabled: threadingEnabled,
    }) || []),
  ];
  contextMenu.innerHTML = '';
  if (threadingEnabled) {
    const currentReactions = normalizeReactionEntries?.(resolvedMessage?.meta?.reactions);
    const reactionRow = createContextMenuReactionRow?.({
      documentLike,
      currentReactions,
      emojis: defaultReactionEmojis,
      isSelfReaction,
      onToggle: (emoji) => {
        contextMenu.style.display = 'none';
        actionHandler?.('toggle-reaction', resolvedMessage, { emoji });
      },
    });
    if (reactionRow) contextMenu.appendChild(reactionRow);
  }
  actions.forEach((action) => {
    const button = createContextMenuActionButton?.({
      documentLike,
      action,
      onClick: async (nextEvent) => {
        nextEvent.stopPropagation?.();
        await dispatchContextMenuAction?.({
          actionKey: action.key,
          message: resolvedMessage,
          wrapper,
          codeBlock,
          hasCode,
          tryAction: async (key, payload, options = {}) => {
            if (typeof actionHandler !== 'function') return false;
            try {
              const handled = await actionHandler(key, resolvedMessage, payload);
              if (options.skipFallback === true) return handled;
              return handled;
            } catch {
              return false;
            }
          },
          hideMenu: () => {
            contextMenu.style.display = 'none';
          },
          clearLongPress,
          openCodeViewer,
          getBubbleCopyText,
          copyToClipboard,
          showCopyToast: (ok) => {
            if (ok) successToast?.('已复制');
            else warningToast?.('复制失败');
          },
          startInlineEdit,
          enterSelectionMode,
        });
      },
    });
    if (button) contextMenu.appendChild(button);
  });
  const { x, y } = getPoint?.(event) || { x: 0, y: 0 };
  positionContextMenu?.(contextMenu, { x, y, windowLike });
  return true;
};
