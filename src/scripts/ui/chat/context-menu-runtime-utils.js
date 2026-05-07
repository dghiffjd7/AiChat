export const createContextMenuShell = ({
  documentLike,
} = {}) => {
  const menu = documentLike.createElement('div');
  menu.id = 'msg-context-menu';
  menu.style.cssText = `
            position: fixed;
            background: var(--app-surface-card);
            border: 1px solid var(--app-border-default);
            border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            padding: 6px;
            display: none;
            z-index: 20000;
            min-width: 120px;
        `;
  documentLike.body.appendChild(menu);
  documentLike.addEventListener?.(
    'pointerdown',
    e => {
      if (menu.style.display === 'none') return;
      if (menu.contains?.(e.target)) return;
      menu.style.display = 'none';
    },
    { passive: true },
  );
  return menu;
};

export const resolveContextMenuContext = ({
  event,
  message,
  scrollEl,
} = {}) => {
  const target = event?.target;
  const wrapper =
    target?.closest?.('[data-msg-id]') ||
    (message?.id ? scrollEl?.querySelector?.(`[data-msg-id="${message.id}"]`) : null);
  const resolvedMessage =
    wrapper && wrapper.__chatappMessage && typeof wrapper.__chatappMessage === 'object'
      ? wrapper.__chatappMessage
      : message;
  const directCodeBlock = target?.closest?.('.chat-codeblock') || null;
  const codeBlock = directCodeBlock || wrapper?.querySelector?.('.chat-codeblock') || null;
  const hasCode = Boolean(codeBlock && typeof codeBlock.__chatappCode === 'string' && codeBlock.__chatappCode.length);
  return {
    target,
    wrapper,
    message: resolvedMessage,
    codeBlock,
    hasCode,
  };
};
