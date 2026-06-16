const createMenuButton = (documentLike, { action = '', label = '', danger = false } = {}) => {
  const button = documentLike.createElement('button');
  button.type = 'button';
  button.className = `moment-menu-item${danger ? ' danger' : ''}`;
  button.dataset.action = String(action || '');
  button.textContent = String(label || '');
  return button;
};

const createMenuShell = (documentLike) => {
  const menu = documentLike.createElement('div');
  menu.className = 'moment-menu-dropdown hidden';
  menu.addEventListener('click', event => event.stopPropagation());
  return menu;
};

const positionMenuFromAnchor = (menuEl, anchorEl, windowLike, documentLike) => {
  if (!menuEl || !anchorEl) return false;
  const rect = anchorEl.getBoundingClientRect?.();
  if (!rect) return false;
  const vw = windowLike?.innerWidth || documentLike?.documentElement?.clientWidth || 360;
  const vh = windowLike?.innerHeight || documentLike?.documentElement?.clientHeight || 640;
  const mw = menuEl.offsetWidth || 140;
  const mh = menuEl.offsetHeight || 80;
  const margin = 8;
  const top = Math.min(vh - mh - margin, rect.bottom + 6);
  const left = Math.max(margin, Math.min(vw - mw - margin, rect.right - mw));
  menuEl.style.top = `${Math.max(margin, top)}px`;
  menuEl.style.left = `${left}px`;
  return true;
};

const positionMenuFromPoint = (menuEl, { x = 0, y = 0 } = {}, windowLike, documentLike) => {
  if (!menuEl) return false;
  const vw = windowLike?.innerWidth || documentLike?.documentElement?.clientWidth || 360;
  const vh = windowLike?.innerHeight || documentLike?.documentElement?.clientHeight || 640;
  const mw = menuEl.offsetWidth || 160;
  const mh = menuEl.offsetHeight || 88;
  const margin = 8;
  const left = Math.max(margin, Math.min(vw - mw - margin, Number(x || 0) - mw + 18));
  const top = Math.max(margin, Math.min(vh - mh - margin, Number(y || 0) + 8));
  menuEl.style.left = `${left}px`;
  menuEl.style.top = `${top}px`;
  return true;
};

export const createMomentsMenuRuntime = ({
  documentLike = document,
  windowLike = window,
  appConfirmFn = async () => true,
} = {}) => ({
  ensureMomentMenu({
    existingMenu = null,
    onDeleteMoment = async () => {},
  } = {}) {
    if (existingMenu) return existingMenu;
    const menu = createMenuShell(documentLike);
    const deleteButton = createMenuButton(documentLike, {
      action: 'delete',
      label: '删除动态',
      danger: true,
    });
    const cancelButton = createMenuButton(documentLike, {
      action: 'cancel',
      label: '取消',
    });
    const hide = () => this.hideMomentMenu(menu);
    documentLike.addEventListener?.('click', hide);
    deleteButton.addEventListener('click', async () => {
      const momentId = String(menu.dataset.momentId || '');
      hide();
      if (!momentId) return;
      const ok = await appConfirmFn({
        title: '删除动态',
        message: '删除后无法恢复，确定要删除这条动态吗？',
        danger: true,
      });
      if (!ok) return;
      await onDeleteMoment(momentId);
    });
    cancelButton.addEventListener('click', hide);
    menu.appendChild(deleteButton);
    menu.appendChild(cancelButton);
    documentLike.body?.appendChild?.(menu);
    return menu;
  },

  hideMomentMenu(menuEl) {
    if (!menuEl) return false;
    menuEl.classList?.add?.('hidden');
    menuEl.dataset.momentId = '';
    return true;
  },

  showMomentMenu({
    menuEl,
    anchorEl,
    momentId,
  } = {}) {
    if (!menuEl || !anchorEl) return false;
    menuEl.dataset.momentId = String(momentId || '');
    menuEl.classList?.remove?.('hidden');
    return positionMenuFromAnchor(menuEl, anchorEl, windowLike, documentLike);
  },

  ensureCommentMenu({
    existingMenu = null,
    onDeleteComment = async () => {},
  } = {}) {
    if (existingMenu) return existingMenu;
    const menu = createMenuShell(documentLike);
    const deleteButton = createMenuButton(documentLike, {
      action: 'delete-comment',
      label: '删除评论',
      danger: true,
    });
    const cancelButton = createMenuButton(documentLike, {
      action: 'cancel',
      label: '取消',
    });
    const hide = () => this.hideCommentMenu(menu);
    documentLike.addEventListener?.('click', hide);
    deleteButton.addEventListener('click', async () => {
      const momentId = String(menu.dataset.momentId || '');
      const commentId = String(menu.dataset.commentId || '');
      hide();
      if (!momentId || !commentId) return;
      const ok = await appConfirmFn({
        title: '删除评论',
        message: '删除这条评论？',
        danger: true,
      });
      if (!ok) return;
      await onDeleteComment(momentId, commentId);
    });
    cancelButton.addEventListener('click', hide);
    menu.appendChild(deleteButton);
    menu.appendChild(cancelButton);
    documentLike.body?.appendChild?.(menu);
    return menu;
  },

  hideCommentMenu(menuEl) {
    if (!menuEl) return false;
    menuEl.classList?.add?.('hidden');
    menuEl.dataset.momentId = '';
    menuEl.dataset.commentId = '';
    return true;
  },

  showCommentMenu({
    menuEl,
    point,
    momentId,
    commentId,
  } = {}) {
    if (!menuEl) return false;
    menuEl.dataset.momentId = String(momentId || '');
    menuEl.dataset.commentId = String(commentId || '');
    menuEl.classList?.remove?.('hidden');
    return positionMenuFromPoint(menuEl, point, windowLike, documentLike);
  },
});
