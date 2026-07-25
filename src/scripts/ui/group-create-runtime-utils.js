import {
  createSelectableContactEmptyState,
  createSelectableContactRow,
} from './session-shared-view-utils.js';

export const createGroupCreateRuntime = ({
  getPanel,
  getSelected,
  getContactsStore,
  getChatStore,
  getAvatar,
  normalize = (value) => String(value || '').trim(),
  normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ''),
  resolveContactAvatar,
  genGroupId,
  hide = () => {},
  onCreated = null,
  onSelectionChanged = () => {},
  onValidationError = () => {},
  notifySuccess = () => {},
  notifyError = () => {},
  logger = console,
  deps = {},
} = {}) => {
  const createEmptyState = deps.createSelectableContactEmptyState || createSelectableContactEmptyState;
  const createSelectableRow = deps.createSelectableContactRow || createSelectableContactRow;
  const syncSelectableRow = deps.syncSelectableContactRow || ((row, selected) => {
    const nextSelected = Boolean(selected);
    row?.classList?.toggle?.('is-selected', nextSelected);
    row?.setAttribute?.('aria-pressed', nextSelected ? 'true' : 'false');
    if (row && Object.prototype.hasOwnProperty.call(row, 'selected')) row.selected = nextSelected;
  });

  const listFriends = () =>
    (getContactsStore?.()?.listFriends?.() || [])
      .filter((friend) => !String(friend?.id || '').startsWith('rp:'));

  const emitSelectionChanged = (friends = listFriends()) => {
    const selected = getSelected?.();
    updateCreateEnabled();
    onSelectionChanged?.({ selected: [...(selected || [])], friends });
  };

  const getValidationState = () => {
    const panel = getPanel?.();
    if (!panel) return { valid: false, error: '', nameError: '', memberError: '', membersCount: 0 };
    const name = normalize(panel.querySelector?.('#group-name')?.value);
    const selected = getSelected?.();
    const membersCount = selected?.size || 0;
    const nameKey = normalizeKey(name);

    let nameError = '';
    if (!name) nameError = '给群组起个名字吧，伙伴们才好认出它';
    else {
      const groups = getContactsStore?.()?.listGroups?.() || [];
      const dup = groups.find((group) => normalizeKey(group?.name) === nameKey);
      if (dup) nameError = '这个群组名已经存在啦，换一个试试';
    }
    const memberError = membersCount < 2
      ? '再挑至少 2 位伙伴，群组才热闹得起来'
      : '';
    const error = nameError || memberError;
    return {
      valid: !error,
      error,
      nameError,
      memberError,
      membersCount,
    };
  };

  const updateCreateEnabled = () => {
    const panel = getPanel?.();
    if (!panel) return getValidationState();
    const button = panel.querySelector?.('#group-create');
    const hint = panel.querySelector?.('#group-name-hint');
    const memberHint = panel.querySelector?.('#group-member-hint');
    const state = getValidationState();

    if (hint) {
      hint.textContent = memberHint
        ? state.nameError
        : (state.error || `已选择 ${state.membersCount} 位成员`);
      hint.style.color = state.nameError || (!memberHint && state.error)
        ? 'var(--app-danger-text, #ef4444)'
        : 'var(--app-text-muted)';
    }
    if (memberHint) {
      memberHint.textContent = state.memberError || `已选择 ${state.membersCount} 位成员`;
      memberHint.style.color = state.memberError
        ? 'var(--app-danger-text, #ef4444)'
        : 'var(--app-text-muted)';
    }
    if (button) {
      button.disabled = false;
      button.setAttribute?.('aria-disabled', state.valid ? 'false' : 'true');
      button.classList?.toggle?.('is-disabled', !state.valid);
    }
    return state;
  };

  const renderContacts = () => {
    const panel = getPanel?.();
    const listEl = panel?.querySelector?.('#group-contacts');
    if (!listEl) return;

    const query = normalizeKey(panel.querySelector?.('#group-search')?.value);
    const selected = getSelected?.();
    const friends = listFriends();
    const filtered = query
      ? friends.filter((friend) => normalizeKey(friend?.name || friend?.id).includes(query))
      : friends;

    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.appendChild(createEmptyState());
      emitSelectionChanged(friends);
      return;
    }

    filtered.forEach((friend, index) => {
      const id = normalize(friend?.id);
      if (!id) return;
      let row = null;
      ({ row } = createSelectableRow({
        id,
        name: friend?.name || id,
        avatar: resolveContactAvatar?.(friend, id),
        contact: friend,
        index,
        selected: selected?.has?.(id),
        selectedText: '已选',
        onClick: () => {
          if (selected?.has?.(id)) selected.delete(id);
          else selected?.add?.(id);
          syncSelectableRow(row, selected?.has?.(id));
          emitSelectionChanged(friends);
        },
      }));
      syncSelectableRow(row, selected?.has?.(id));
      listEl.appendChild(row);
    });
    emitSelectionChanged(friends);
  };

  const syncRenderedSelection = () => {
    const panel = getPanel?.();
    const listEl = panel?.querySelector?.('#group-contacts');
    const selected = getSelected?.();
    listEl?.querySelectorAll?.('[data-contact-id]')?.forEach?.((row) => {
      syncSelectableRow(row, selected?.has?.(normalize(row?.dataset?.contactId)));
    });
    emitSelectionChanged();
  };

  const createGroup = () => {
    try {
      const panel = getPanel?.();
      const name = normalize(panel?.querySelector?.('#group-name')?.value);
      const validation = updateCreateEnabled();
      if (!validation?.valid) {
        onValidationError?.(validation);
        return false;
      }

      const selected = getSelected?.();
      const members = [...(selected || [])].map(normalize).filter(Boolean);

      const id = genGroupId?.();
      logger?.info?.(
        `[group-chat] create scope=${getContactsStore?.()?.scopeId || 'default'} id=${id} name=${name} members=${members.length} avatarLen=${String(getAvatar?.() || '').trim().length}`
      );

      getContactsStore?.()?.upsertContact?.({
        id,
        name,
        avatar: getAvatar?.() || '',
        isGroup: true,
        members,
        addedAt: Date.now(),
      });

      const memberNames = members
        .map((memberId) => getContactsStore?.()?.getContact?.(memberId)?.name || memberId)
        .filter(Boolean);
      const time = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const sys1 = { role: 'system', type: 'meta', content: `你创建了群聊「${name}」`, name: '系统', avatar: '', time };
      const sys2 = { role: 'system', type: 'meta', content: `你邀请了：${memberNames.join('、')} 加入群聊`, name: '系统', avatar: '', time };
      getChatStore?.()?.appendMessage?.(sys1, id);
      getChatStore?.()?.appendMessage?.(sys2, id);

      hide?.();
      notifySuccess?.('群组已创建');
      onCreated?.({ id, name });
      return { id, name, members };
    } catch (error) {
      logger?.error?.('创建群组失败', error);
      notifyError?.(error?.message || '创建失败');
      return false;
    }
  };

  return {
    createGroup,
    getValidationState,
    renderContacts,
    syncRenderedSelection,
    updateCreateEnabled,
  };
};
