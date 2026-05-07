const GROUP_DROPDOWN_STYLE = `
  display:none;
  position: fixed;
  background: white;
  border: 1px solid rgba(0,0,0,0.10);
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0,0,0,0.18);
  z-index: 15000;
  max-height: min(320px, calc(100vh - 140px));
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  min-width: 240px;
`;

const appendChildren = (parent, children = []) => {
  children.forEach((child) => parent?.appendChild?.(child));
  return parent;
};

const createElement = (documentRef, tagName, {
  id = '',
  className = '',
  textContent = '',
  style = '',
  dataset = {},
} = {}) => {
  const element = documentRef?.createElement?.(tagName);
  if (!element) return null;
  if (id) element.id = id;
  if (className) element.className = className;
  if (textContent) element.textContent = textContent;
  if (style) element.style.cssText = style;
  Object.entries(dataset || {}).forEach(([key, value]) => {
    if (value != null) element.dataset[key] = String(value);
  });
  return element;
};

export const ensureGroupManagementDropdown = ({
  documentRef = globalThis.document,
} = {}) => {
  let element = documentRef?.getElementById?.('group-management-dropdown');
  if (element) return element;
  element = createElement(documentRef, 'div', {
    id: 'group-management-dropdown',
    className: 'group-management-dropdown',
    style: GROUP_DROPDOWN_STYLE,
  });
  element?.addEventListener?.('click', (event) => event.stopPropagation?.());
  documentRef?.body?.appendChild?.(element);
  return element;
};

const buildGroupDropdownHeader = ({
  documentRef,
  title = '群聊 · 0人',
} = {}) => {
  const header = createElement(documentRef, 'div', {
    className: 'group-dd-header',
    style: 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); border-radius:12px 12px 0 0;',
  });
  const titleEl = createElement(documentRef, 'div', {
    className: 'group-dd-title',
    textContent: title,
    style: 'font-weight:900; color:var(--app-text-primary); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
  });
  const actions = createElement(documentRef, 'div', {
    style: 'display:flex; align-items:center; gap:6px; flex-shrink:0;',
  });
  const sessionConfigBtn = createElement(documentRef, 'button', {
    id: 'group-dd-session-config',
    textContent: '📋',
    style: 'border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer; font-size:14px;',
  });
  const settingsBtn = createElement(documentRef, 'button', {
    id: 'group-dd-settings',
    className: 'group-dd-settings',
    textContent: '⚙',
    style: 'border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;',
  });

  appendChildren(actions, [sessionConfigBtn, settingsBtn]);
  appendChildren(header, [titleEl, actions]);
  return { header, sessionConfigBtn, settingsBtn };
};

const buildGroupDropdownMemberRow = ({
  documentRef,
  memberId = '',
  name = '',
  avatar = '',
} = {}) => {
  const button = createElement(documentRef, 'button', {
    className: 'group-dd-member',
    style: 'width:100%; display:flex; align-items:center; gap:10px; padding:10px 12px; border:none; background:transparent; cursor:pointer; text-align:left;',
    dataset: { mid: memberId },
  });
  const image = createElement(documentRef, 'img', {
    style: 'width:32px; height:32px; border-radius:50%; object-fit:cover;',
  });
  image.src = avatar;
  image.alt = '';
  const meta = createElement(documentRef, 'div', {
    className: 'group-dd-member-meta',
    style: 'flex:1; min-width:0;',
  });
  const nameEl = createElement(documentRef, 'div', {
    className: 'group-dd-member-name',
    textContent: name,
    style: 'font-weight:700; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
  });
  const subEl = createElement(documentRef, 'div', {
    className: 'group-dd-member-sub',
    textContent: '点击进入私聊',
    style: 'color:var(--app-text-muted); font-size:12px;',
  });

  appendChildren(meta, [nameEl, subEl]);
  appendChildren(button, [image, meta]);
  return button;
};

export const renderGroupManagementDropdown = ({
  groupId = '',
  anchorEl = null,
  documentRef = globalThis.document,
  ensureDropdown = ensureGroupManagementDropdown,
  getGroupContact = () => null,
  resolveAvatar = () => '',
  positionSheet = () => {},
  openSessionConfig = () => {},
  openGroupSettings = () => {},
  openMemberChat = () => {},
} = {}) => {
  const element = ensureDropdown({ documentRef });
  const group = getGroupContact(groupId);
  const members = Array.isArray(group?.members) ? group.members : [];
  const title = `${group?.name || '群聊'} · ${members.length}人`;
  const { header, sessionConfigBtn, settingsBtn } = buildGroupDropdownHeader({ documentRef, title });
  const list = createElement(documentRef, 'div', {
    className: 'group-dd-list',
    style: 'padding:8px 0;',
  });

  if (typeof element?.replaceChildren === 'function') {
    element.replaceChildren();
  } else {
    element.innerHTML = '';
  }

  if (!members.length) {
    list.appendChild(createElement(documentRef, 'div', {
      className: 'group-dd-empty',
      textContent: '暂无成员',
      style: 'color:var(--app-text-muted); font-size:13px; padding:10px 12px;',
    }));
  } else {
    members.forEach((memberId) => {
      const contact = getGroupContact(memberId);
      const name = contact?.name || memberId;
      const button = buildGroupDropdownMemberRow({
        documentRef,
        memberId,
        name,
        avatar: resolveAvatar(memberId, contact),
      });
      button?.addEventListener?.('click', () => {
        element.style.display = 'none';
        openMemberChat(memberId, contact);
      });
      list.appendChild(button);
    });
  }

  appendChildren(element, [header, list]);
  positionSheet(element, anchorEl, 0, 6, false);
  element.style.display = 'block';

  sessionConfigBtn?.addEventListener?.('click', () => {
    element.style.display = 'none';
    openSessionConfig(groupId);
  });
  settingsBtn?.addEventListener?.('click', () => {
    element.style.display = 'none';
    openGroupSettings(groupId);
  });

  return element;
};
