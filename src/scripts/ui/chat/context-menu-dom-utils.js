const ACTION_ICON_MAP = {
  reply: '↩',
  'view-code': '<>',
  download: '↓',
  'cancel-media-generation': '×',
  'generate-image': '图',
  'copy-text': '⧉',
  regenerate: '↻',
  'send-to-here': '➤',
  edit: '✎',
  delete: '⌫',
};

const DANGER_ACTIONS = new Set(['delete', 'cancel-media-generation']);

export const createContextMenuReactionRow = ({
  documentLike,
  currentReactions = [],
  emojis = [],
  isSelfReaction,
  onToggle,
} = {}) => {
  const row = documentLike.createElement('div');
  row.className = 'chat-context-reaction-row';
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

export const createContextMenuDivider = ({
  documentLike,
} = {}) => {
  const divider = documentLike.createElement('div');
  divider.className = 'chat-context-menu-section-divider';
  return divider;
};

export const createContextMenuActionButton = ({
  documentLike,
  action,
  onClick,
} = {}) => {
  const btn = documentLike.createElement('button');
  const key = String(action?.key || '');
  const isDanger = action?.tone === 'danger' || DANGER_ACTIONS.has(key);
  btn.type = 'button';
  btn.className = `chat-context-menu-action${isDanger ? ' is-danger' : ''}`;
  if (btn.dataset) btn.dataset.actionKey = key;
  btn.setAttribute?.('aria-label', action?.label || key);

  const icon = documentLike.createElement('span');
  icon.className = 'chat-context-menu-action-icon';
  icon.setAttribute?.('aria-hidden', 'true');
  icon.textContent = String(action?.icon || ACTION_ICON_MAP[key] || '');

  const label = documentLike.createElement('span');
  label.className = 'chat-context-menu-action-label';
  label.textContent = action?.label || '';

  btn.appendChild(icon);
  btn.appendChild(label);
  btn.onclick = onClick;
  return btn;
};
