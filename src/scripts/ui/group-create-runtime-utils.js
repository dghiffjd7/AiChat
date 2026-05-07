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
  notifySuccess = () => {},
  notifyError = () => {},
  logger = console,
  deps = {},
} = {}) => {
  const createEmptyState = deps.createSelectableContactEmptyState || createSelectableContactEmptyState;
  const createSelectableRow = deps.createSelectableContactRow || createSelectableContactRow;

  const updateCreateEnabled = () => {
    const panel = getPanel?.();
    if (!panel) return;
    const button = panel.querySelector?.('#group-create');
    const hint = panel.querySelector?.('#group-name-hint');
    const name = normalize(panel.querySelector?.('#group-name')?.value);
    const selected = getSelected?.();
    const membersCount = selected?.size || 0;
    const nameKey = normalizeKey(name);

    let error = '';
    if (!name) error = '请输入群组名称';
    else {
      const groups = getContactsStore?.()?.listGroups?.() || [];
      const dup = groups.find((group) => normalizeKey(group?.name) === nameKey);
      if (dup) error = '已存在同名群组';
    }
    if (!error && membersCount < 2) error = '请至少选择 2 位成员';

    if (hint) {
      hint.textContent = error || `已选择 ${membersCount} 位成员`;
      hint.style.color = error ? '#ef4444' : 'var(--app-text-muted)';
    }
    if (button) button.disabled = Boolean(error);
  };

  const renderContacts = () => {
    const panel = getPanel?.();
    const listEl = panel?.querySelector?.('#group-contacts');
    if (!listEl) return;

    const query = normalizeKey(panel.querySelector?.('#group-search')?.value);
    const selected = getSelected?.();
    const friends = (getContactsStore?.()?.listFriends?.() || []).filter((friend) => !String(friend?.id || '').startsWith('rp:'));
    const filtered = query
      ? friends.filter((friend) => normalizeKey(friend?.name || friend?.id).includes(query))
      : friends;

    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.appendChild(createEmptyState());
      updateCreateEnabled();
      return;
    }

    filtered.forEach((friend) => {
      const id = normalize(friend?.id);
      if (!id) return;
      const { row } = createSelectableRow({
        id,
        name: friend?.name || id,
        avatar: resolveContactAvatar?.(friend, id),
        selected: selected?.has?.(id),
        selectedText: '已选',
        onClick: () => {
          if (selected?.has?.(id)) selected.delete(id);
          else selected?.add?.(id);
          renderContacts();
        },
      });
      listEl.appendChild(row);
    });
    updateCreateEnabled();
  };

  const createGroup = () => {
    try {
      const panel = getPanel?.();
      const name = normalize(panel?.querySelector?.('#group-name')?.value);
      if (!name) return false;

      const selected = getSelected?.();
      const members = [...(selected || [])].map(normalize).filter(Boolean);
      if (members.length < 2) return false;

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
    renderContacts,
    updateCreateEnabled,
  };
};
