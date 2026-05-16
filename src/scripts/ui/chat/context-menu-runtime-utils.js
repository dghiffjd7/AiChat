export const createContextMenuShell = ({
  documentLike,
} = {}) => {
  const menu = documentLike.createElement('div');
  menu.id = 'msg-context-menu';
  menu.className = 'chat-message-context-menu';
  menu.style.cssText = `
            position: fixed;
            display: none;
            z-index: 20000;
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
  const inlineImageEl = target?.closest?.(
    'img.chat-inline-generated-image, img.chat-rich-inline-image[data-generated-image-token], img.chat-rich-inline-image[data-inline-image-ref]',
  ) || null;
  const inlineGeneratedImage = inlineImageEl
    ? {
      element: inlineImageEl,
      token: String(inlineImageEl.dataset?.generatedImageToken || '').trim(),
      ref: String(inlineImageEl.dataset?.inlineImageRef || '').trim(),
      src: String(inlineImageEl.currentSrc || inlineImageEl.src || '').trim(),
    }
    : null;
  return {
    target,
    wrapper,
    message: resolvedMessage,
    codeBlock,
    hasCode,
    inlineGeneratedImage,
  };
};
