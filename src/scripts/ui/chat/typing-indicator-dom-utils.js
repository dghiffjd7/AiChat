const TYPING_DOTS_HTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

export const createTypingIndicatorShell = ({
  documentLike,
  groupMembers,
} = {}) => {
  const wrap = documentLike.createElement('div');
  wrap.className = 'typing-indicator-wrap';
  wrap.id = 'typing-indicator';

  if (Array.isArray(groupMembers) && groupMembers.length > 0) {
    const avatarStack = documentLike.createElement('div');
    avatarStack.className = 'typing-avatar-stack';

    const labelEl = documentLike.createElement('span');
    labelEl.className = 'typing-group-label';

    const dotsEl = documentLike.createElement('div');
    dotsEl.className = 'typing';
    dotsEl.innerHTML = TYPING_DOTS_HTML;

    const contentWrap = documentLike.createElement('div');
    contentWrap.className = 'typing-group-content';
    contentWrap.appendChild(labelEl);
    contentWrap.appendChild(dotsEl);

    wrap.appendChild(avatarStack);
    wrap.appendChild(contentWrap);
    return {
      wrap,
      kind: 'group',
      avatarStack,
      labelEl,
    };
  }

  const labelEl = documentLike.createElement('span');
  labelEl.className = 'typing-private-label';
  labelEl.textContent = '输入中';

  const dotsEl = documentLike.createElement('div');
  dotsEl.className = 'typing';
  dotsEl.innerHTML = TYPING_DOTS_HTML;

  wrap.appendChild(labelEl);
  wrap.appendChild(dotsEl);
  return {
    wrap,
    kind: 'private',
    labelEl,
  };
};

export const renderTypingGroupMembers = ({
  documentLike,
  avatarStack,
  labelEl,
  members = [],
  getDefaultAvatar,
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
  random = Math.random,
} = {}) => {
  if (!avatarStack || !labelEl || !Array.isArray(members) || !members.length) return [];
  const shuffled = [...members].sort(() => random() - 0.5);
  const count = Math.min(shuffled.length, Math.floor(random() * 3) + 1);
  const selected = shuffled.slice(0, count);
  avatarStack.classList.add('typing-avatar-fade');
  schedule(() => {
    avatarStack.innerHTML = '';
    selected.forEach((member, index) => {
      const img = documentLike.createElement('img');
      img.className = 'typing-avatar-item';
      img.src = member.avatar || getDefaultAvatar();
      img.style.zIndex = String(selected.length - index);
      if (index > 0) img.style.marginLeft = '-8px';
      avatarStack.appendChild(img);
    });
    avatarStack.classList.remove('typing-avatar-fade');
  }, 200);
  labelEl.textContent = `${selected.map(member => member.name).join('、')} 正在输入`;
  return selected;
};
