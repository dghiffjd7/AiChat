import {
  hideMentionDropdownCore,
  resolveMentionKeyAction,
  resolveMentionQueryContext,
} from './chat/mention-input-ui-utils.js';
import {
  applyMentionInsertion,
  buildMentionDropdownItems,
  ensureMentionDropdownShell,
  filterMentionMembers,
  positionMentionDropdownCore,
  updateMentionSelectionCore,
} from './chat/mention-dropdown-ui-utils.js';

const normalizeMentionMember = (contact = {}, resolveAvatar = null) => {
  const id = String(contact?.id || '').trim();
  const name = String(contact?.name || id).trim();
  if (!id && !name) return null;
  const type = contact?.type === 'group' || contact?.isGroup === true || id.startsWith('group:')
    ? 'group'
    : 'contact';
  const avatar = typeof resolveAvatar === 'function'
    ? String(resolveAvatar(contact) || '').trim()
    : String(contact?.avatar || '').trim();
  return { id, name: name || id, avatar, type };
};

export const buildMentionMembersFromContacts = ({
  contactsStore = null,
  resolveAvatar = null,
  includeGroups = false,
} = {}) => {
  const groups = includeGroups && Array.isArray(contactsStore?.listGroups?.())
    ? contactsStore.listGroups()
    : [];
  const contacts = [
    ...(contactsStore?.listContacts?.() || []),
    ...(includeGroups
      ? groups.map((group) => {
          const rawId = String(group?.id || '').trim();
          return {
            ...(group || {}),
            id: rawId && !rawId.startsWith('group:') ? `group:${rawId}` : rawId,
            isGroup: true,
          };
        })
      : []),
  ];
  const seen = new Set();
  return contacts
    .filter(contact => contact && (includeGroups || !contact.isGroup) && !String(contact.id || '').trim().startsWith('rp:'))
    .map(contact => normalizeMentionMember(contact, resolveAvatar))
    .filter((member) => {
      const key = String(member?.id || member?.name || '').trim();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const containsNode = (root, target) => {
  if (!root || !target) return false;
  if (root === target) return true;
  if (typeof root.contains === 'function') return root.contains(target);
  let current = target;
  while (current) {
    if (current === root) return true;
    current = current.parentElement || current.parentNode || null;
  }
  return false;
};

export const bindMentionInputControl = ({
  inputEl = null,
  anchorEl = null,
  documentLike = typeof document !== 'undefined' ? document : null,
  windowLike = typeof window !== 'undefined' ? window : null,
  getMembers = () => [],
  getDropdown = () => null,
  setDropdown = () => {},
  onMentionSelected = null,
} = {}) => {
  if (!inputEl || !documentLike) return null;
  try {
    inputEl.__chatappMentionBinding?.destroy?.();
  } catch {}

  let mentionStartPos = -1;
  let mentionQuery = '';
  let mentionSelectedIndex = 0;
  let hideTimer = null;
  const getWindowHeight = () => Number(windowLike?.innerHeight || documentLike?.documentElement?.clientHeight || 0);
  const clearHideTimer = () => {
    if (hideTimer == null) return;
    try {
      windowLike?.clearTimeout?.(hideTimer);
    } catch {
      clearTimeout(hideTimer);
    }
    hideTimer = null;
  };
  const hide = () => {
    clearHideTimer();
    const next = hideMentionDropdownCore(getDropdown?.());
    mentionStartPos = next.mentionStartPos;
    mentionQuery = next.mentionQuery;
    mentionSelectedIndex = next.mentionSelectedIndex;
  };
  const updateSelection = () => {
    updateMentionSelectionCore(getDropdown?.()?.querySelectorAll?.('.mention-item') || [], mentionSelectedIndex);
  };
  const insertMention = (memberOrName) => {
    const member = memberOrName && typeof memberOrName === 'object'
      ? memberOrName
      : { name: String(memberOrName || '') };
    const name = String(member?.name || member?.id || '').trim();
    const value = String(inputEl.value || '');
    const { value: nextValue, cursor } = applyMentionInsertion({
      value,
      selectionStart: inputEl.selectionStart ?? value.length,
      mentionStartPos,
      name,
    });
    inputEl.value = nextValue;
    try {
      inputEl.setSelectionRange?.(cursor, cursor);
    } catch {}
    inputEl.focus?.();
    hide();
    inputEl.dispatchEvent?.(new Event('input', { bubbles: true }));
    if (name && typeof onMentionSelected === 'function') {
      onMentionSelected({
        id: String(member?.id || '').trim(),
        name,
        type: String(member?.type || '').trim(),
      });
    }
  };
  const show = (query = '') => {
    const members = filterMentionMembers(getMembers?.() || [], query);
    if (!members.length) {
      hide();
      return;
    }
    const dropdown = ensureMentionDropdownShell(documentLike, getDropdown?.());
    setDropdown?.(dropdown);
    mentionSelectedIndex = 0;
    dropdown.innerHTML = '';
    buildMentionDropdownItems(documentLike, members, {
      selectedIndex: mentionSelectedIndex,
      onHover: index => {
        mentionSelectedIndex = index;
        updateSelection();
      },
      onSelect: (_name, member) => insertMention(member),
    }).forEach(item => dropdown.appendChild(item));
    positionMentionDropdownCore(dropdown, anchorEl || inputEl.parentElement || inputEl, {
      windowHeight: getWindowHeight(),
    });
    dropdown.style.display = 'block';
  };
  const handleInput = () => {
    if (inputEl.disabled) {
      hide();
      return;
    }
    const next = resolveMentionQueryContext(inputEl.value, inputEl.selectionStart ?? inputEl.value.length);
    if (!next) {
      hide();
      return;
    }
    mentionStartPos = next.mentionStartPos;
    mentionQuery = next.query;
    show(mentionQuery);
  };
  const handleKeydown = (event) => {
    const dropdown = getDropdown?.();
    if (!dropdown || dropdown.style.display === 'none') return;
    const items = dropdown.querySelectorAll?.('.mention-item') || [];
    if (!items.length) return;
    const action = resolveMentionKeyAction({
      key: event.key,
      shiftKey: event.shiftKey,
      selectedIndex: mentionSelectedIndex,
      itemCount: items.length,
    });
    if (action.type === 'move') {
      event.preventDefault?.();
      mentionSelectedIndex = action.selectedIndex;
      updateSelection();
      return;
    }
    if (action.type === 'select') {
      const selected = items[action.selectedIndex];
      if (!selected) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
      insertMention({
        id: selected.dataset.memberId,
        name: selected.dataset.memberName,
        type: selected.dataset.memberType,
      });
      return;
    }
    if (action.type === 'hide') {
      event.preventDefault?.();
      hide();
    }
  };
  const handleBlur = () => {
    clearHideTimer();
    const delay = 120;
    hideTimer = typeof windowLike?.setTimeout === 'function'
      ? windowLike.setTimeout(hide, delay)
      : setTimeout(hide, delay);
  };
  const handleFocus = () => {
    clearHideTimer();
    handleInput();
  };
  const handleDocumentPointerDown = (event) => {
    const dropdown = getDropdown?.();
    if (!dropdown || dropdown.style.display === 'none') return;
    const target = event?.target || null;
    if (containsNode(dropdown, target) || containsNode(inputEl, target)) return;
    hide();
  };

  inputEl.addEventListener?.('input', handleInput);
  inputEl.addEventListener?.('keydown', handleKeydown);
  inputEl.addEventListener?.('focus', handleFocus);
  inputEl.addEventListener?.('blur', handleBlur);
  documentLike.addEventListener?.('pointerdown', handleDocumentPointerDown, true);

  const binding = {
    hide,
    destroy() {
      clearHideTimer();
      inputEl.removeEventListener?.('input', handleInput);
      inputEl.removeEventListener?.('keydown', handleKeydown);
      inputEl.removeEventListener?.('focus', handleFocus);
      inputEl.removeEventListener?.('blur', handleBlur);
      documentLike.removeEventListener?.('pointerdown', handleDocumentPointerDown, true);
      hide();
      if (inputEl.__chatappMentionBinding === binding) {
        delete inputEl.__chatappMentionBinding;
      }
    },
  };
  inputEl.__chatappMentionBinding = binding;
  return binding;
};
