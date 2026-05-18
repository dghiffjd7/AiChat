export const filterMentionMembers = (members, query = '') => {
  const list = Array.isArray(members) ? members : [];
  const term = String(query || '').toLowerCase();
  if (!term) return list;
  return list.filter(member =>
    String(member?.name || '').toLowerCase().includes(term)
    || String(member?.id || '').toLowerCase().includes(term),
  );
};

export const ensureMentionDropdownShell = (documentLike, existingDropdown) => {
  if (existingDropdown) return existingDropdown;
  const dropdown = documentLike.createElement('div');
  dropdown.className = 'mention-dropdown';
  dropdown.style.cssText = [
    'position:absolute', 'z-index:31000',
    'background:var(--app-surface-card)', 'border:1px solid var(--app-border-default)',
    'border-radius:12px', 'box-shadow:var(--app-shadow-md)',
    'max-height:220px', 'overflow-y:auto', 'overflow-x:hidden',
    'padding:4px 0', 'min-width:180px', 'max-width:280px',
  ].join(';');
  documentLike.body?.appendChild?.(dropdown);
  return dropdown;
};

export const updateMentionSelectionCore = (items, selectedIndex) => {
  items.forEach((item, index) => {
    item.style.background = index === selectedIndex ? 'var(--app-accent-soft)' : 'transparent';
  });
  const active = items[selectedIndex];
  if (active?.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
};

export const buildMentionDropdownItems = (documentLike, members, {
  selectedIndex = 0,
  onHover,
  onSelect,
} = {}) => members.map((member, index) => {
  const item = documentLike.createElement('div');
  item.className = 'mention-item';
  item.dataset.memberName = member.name || member.id;
  item.dataset.memberId = member.id || '';
  item.dataset.memberType = member.type || '';
  item.style.cssText = [
    'display:flex', 'align-items:center', 'gap:8px',
    'padding:8px 12px', 'cursor:pointer', 'font-size:14px',
    'color:var(--app-text-primary)', 'transition:background 0.1s',
    index === selectedIndex ? 'background:var(--app-accent-soft)' : 'background:transparent',
  ].join(';');
  if (member.avatar) {
    const img = documentLike.createElement('img');
    img.src = member.avatar;
    img.style.cssText = 'width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0';
    img.onerror = () => {
      img.style.display = 'none';
    };
    item.appendChild(img);
  }
  const nameEl = documentLike.createElement('span');
  nameEl.textContent = member.name || member.id;
  nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0';
  item.appendChild(nameEl);
  item.addEventListener?.('pointerenter', () => {
    onHover?.(index);
  });
  item.addEventListener?.('click', (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    onSelect?.(member.name || member.id, member);
  });
  return item;
});

export const positionMentionDropdownCore = (dropdown, inputContainer, {
  windowHeight,
} = {}) => {
  if (!dropdown || !inputContainer) return false;
  const rect = inputContainer.getBoundingClientRect();
  dropdown.style.left = `${rect.left + 8}px`;
  dropdown.style.bottom = `${Number(windowHeight || 0) - rect.top + 4}px`;
  dropdown.style.top = 'auto';
  return true;
};

export const applyMentionInsertion = ({
  value = '',
  selectionStart = 0,
  mentionStartPos = -1,
  name = '',
} = {}) => {
  const safeStart = Math.max(0, Number(mentionStartPos || 0));
  const safeSelection = Math.max(0, Number(selectionStart || 0));
  const before = String(value).slice(0, safeStart);
  const after = String(value).slice(safeSelection);
  const mention = `@${String(name || '')} `;
  const nextValue = before + mention + after;
  const cursor = before.length + mention.length;
  return {
    value: nextValue,
    cursor,
  };
};
