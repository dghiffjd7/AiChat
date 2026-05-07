import { createSessionContactPickerModal } from './session-contact-picker-modal-utils.js';
import {
  createMemberManageRow,
  createSelectableContactEmptyState,
  createSelectableContactRow,
} from './session-shared-view-utils.js';

export const createGroupMemberManagementRuntime = ({
  getPanel,
  getMembers,
  setMembers,
  getContactsStore,
  getAddOverlay,
  setAddOverlay,
  getAddPanel,
  setAddPanel,
  getAddSelected,
  documentRef,
  bodyEl,
  normalize = (value) => String(value || '').trim(),
  normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/\s+/g, ''),
  resolveContactAvatar,
  notifyInfo = () => {},
  deps = {},
} = {}) => {
  const createPickerModal = deps.createSessionContactPickerModal || createSessionContactPickerModal;
  const createEmptyState = deps.createSelectableContactEmptyState || createSelectableContactEmptyState;
  const createSelectableRow = deps.createSelectableContactRow || createSelectableContactRow;
  const createManageRow = deps.createMemberManageRow || createMemberManageRow;

  const getMembersListEl = () => getPanel?.()?.querySelector?.('#group-settings-members') || null;
  const getAddListEl = () => getAddPanel?.()?.querySelector?.('#group-add-list') || null;
  const getAddSearchEl = () => getAddPanel?.()?.querySelector?.('#group-add-search') || null;

  const closeAddModal = () => {
    const overlay = getAddOverlay?.();
    const panel = getAddPanel?.();
    if (overlay?.style) overlay.style.display = 'none';
    if (panel?.style) panel.style.display = 'none';
  };

  const renderMembers = () => {
    const listEl = getMembersListEl();
    if (!listEl) return;
    listEl.innerHTML = '';
    listEl.style.maxHeight = '260px';
    listEl.style.overflowY = 'auto';
    listEl.style.paddingRight = '4px';

    const members = Array.isArray(getMembers?.()) ? getMembers() : [];
    if (!members.length) {
      listEl.appendChild(createEmptyState({ text: '暂无成员' }));
      return;
    }

    members.forEach((memberId) => {
      const contact = getContactsStore?.()?.getContact?.(memberId);
      const { row } = createManageRow({
        memberId,
        name: contact?.name || memberId,
        avatar: resolveContactAvatar?.(contact, memberId),
        onRemove: () => {
          setMembers?.(members.filter((id) => id !== memberId));
          renderMembers();
        },
      });
      listEl.appendChild(row);
    });
  };

  const renderAddCandidates = () => {
    const panel = getAddPanel?.();
    const listEl = getAddListEl();
    if (!panel || !listEl) return;

    const currentMembers = Array.isArray(getMembers?.()) ? getMembers() : [];
    const addSelected = getAddSelected?.();
    const query = normalizeKey(getAddSearchEl()?.value);
    const friends = getContactsStore?.()?.listFriends?.() || [];
    const candidates = friends.filter((friend) => friend?.id && !currentMembers.includes(friend.id) && !String(friend.id).startsWith('rp:'));
    const filtered = query
      ? candidates.filter((friend) => normalizeKey(friend?.name || friend?.id).includes(query))
      : candidates;

    listEl.innerHTML = '';
    if (!filtered.length) {
      listEl.appendChild(createEmptyState({ text: '暂无可添加联系人' }));
      return;
    }

    filtered.forEach((friend) => {
      const id = normalize(friend?.id);
      if (!id) return;
      const { row } = createSelectableRow({
        id,
        name: friend?.name || id,
        avatar: resolveContactAvatar?.(friend, id),
        selected: addSelected?.has?.(id),
        selectedText: '已选',
        onClick: () => {
          if (addSelected?.has?.(id)) addSelected.delete(id);
          else addSelected?.add?.(id);
          renderAddCandidates();
        },
      });
      listEl.appendChild(row);
    });
  };

  const ensureAddModal = () => {
    if (getAddPanel?.()) return;

    const modal = createPickerModal({
      documentRef,
      overlayId: 'group-add-overlay',
      panelId: 'group-add-panel',
      title: '添加成员',
      subtitle: '从联系人中选择',
      closeId: 'group-add-close',
      cancelId: 'group-add-cancel',
      confirmId: 'group-add-confirm',
      confirmLabel: '添加',
      searchId: 'group-add-search',
      listId: 'group-add-list',
      searchPlaceholder: '搜索联系人...',
      headerBackground: 'linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08))',
      overlayOpacity: 0.45,
      overlayZIndex: 22000,
      panelZIndex: 23000,
      inset: 18,
      radius: 14,
    });

    setAddOverlay?.(modal.overlay);
    setAddPanel?.(modal.panel);

    modal.overlay?.addEventListener?.('click', () => closeAddModal());
    bodyEl?.appendChild?.(modal.overlay);
    bodyEl?.appendChild?.(modal.panel);

    modal.panel?.querySelector?.('#group-add-close') && (modal.panel.querySelector('#group-add-close').onclick = () => closeAddModal());
    modal.panel?.querySelector?.('#group-add-cancel') && (modal.panel.querySelector('#group-add-cancel').onclick = () => closeAddModal());
    modal.panel?.querySelector?.('#group-add-search')?.addEventListener?.('input', () => renderAddCandidates());
    modal.panel?.querySelector?.('#group-add-confirm') && (modal.panel.querySelector('#group-add-confirm').onclick = () => {
      const addSelected = getAddSelected?.();
      const picks = [...(addSelected || [])].map(normalize).filter(Boolean);
      if (!picks.length) {
        notifyInfo?.('未选择任何成员');
        return;
      }
      const nextMembers = [...new Set([...(getMembers?.() || []), ...picks])];
      setMembers?.(nextMembers);
      renderMembers();
      closeAddModal();
    });
  };

  const openAddMembers = () => {
    ensureAddModal();
    getAddSelected?.()?.clear?.();
    renderAddCandidates();
    const overlay = getAddOverlay?.();
    const panel = getAddPanel?.();
    if (overlay?.style) overlay.style.display = 'block';
    if (panel?.style) panel.style.display = 'flex';
  };

  return {
    closeAddModal,
    ensureAddModal,
    openAddMembers,
    renderAddCandidates,
    renderMembers,
  };
};
