export const createContextMenuReactionRow = ({
  documentLike,
  currentReactions = [],
  emojis = [],
  isSelfReaction,
  onToggle,
} = {}) => {
  const row = documentLike.createElement('div');
  row.style.cssText = 'display:flex; justify-content:center; gap:4px; padding:6px 8px; border-bottom:1px solid var(--app-border-light);';
  emojis.forEach((emoji) => {
    const btn = documentLike.createElement('button');
    btn.type = 'button';
    btn.className = 'chat-reaction-option';
    if (currentReactions.some(entry => entry.emoji === emoji && isSelfReaction?.(entry))) {
      btn.classList.add?.('is-active');
    }
    btn.textContent = emoji;
    btn.onclick = (ev) => {
      ev.stopPropagation?.();
      onToggle?.(emoji);
    };
    row.appendChild(btn);
  });
  return row;
};

export const createContextMenuActionButton = ({
  documentLike,
  action,
  onClick,
} = {}) => {
  const btn = documentLike.createElement('button');
  btn.textContent = action?.label || '';
  btn.style.cssText = `
            width: 100%;
            padding: 10px 12px;
            border: none;
            background: transparent;
            text-align: left;
            border-radius: 8px;
            cursor: pointer;
            font-size: 14px;
        `;
  btn.onmouseenter = () => {
    btn.style.background = 'var(--app-surface-hover)';
  };
  btn.onmouseleave = () => {
    btn.style.background = 'transparent';
  };
  btn.onclick = onClick;
  return btn;
};
