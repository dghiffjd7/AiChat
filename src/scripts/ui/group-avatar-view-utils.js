const normalize = value => String(value || '').trim();

export const resolveGroupCollageLayout = (count = 0) => {
  const safeCount = Math.max(0, Number(count) || 0);
  if (safeCount === 0) return 'empty';
  if (safeCount === 1) return 'single';
  if (safeCount === 2) return 'split';
  if (safeCount === 3) return 'trio';
  return 'quad';
};

export const resolveContactAvatarView = ({
  sessionId = '',
  contact = null,
  getContact = () => null,
  resolveAvatar = () => '',
} = {}) => {
  const id = normalize(sessionId || contact?.id);
  const resolvedContact = contact || getContact?.(id) || {};
  const name = normalize(resolvedContact?.name || id) || '未知';
  const isGroup = resolvedContact?.isGroup === true || id.startsWith('group:');
  const manualAvatar = normalize(resolvedContact?.avatar);

  if (!isGroup || manualAvatar) {
    return {
      kind: 'image',
      src: normalize(resolveAvatar?.(id, resolvedContact)) || manualAvatar,
      alt: name,
      isGroup,
      isManualGroupAvatar: Boolean(isGroup && manualAvatar),
    };
  }

  const memberIds = [];
  const seen = new Set();
  (Array.isArray(resolvedContact?.members) ? resolvedContact.members : []).forEach((rawId) => {
    const memberId = normalize(rawId);
    if (!memberId || seen.has(memberId)) return;
    seen.add(memberId);
    memberIds.push(memberId);
  });

  const cells = memberIds.slice(0, 4).map((memberId) => {
    const member = getContact?.(memberId) || { id: memberId, name: memberId, avatar: '' };
    return {
      id: memberId,
      name: normalize(member?.name || memberId) || memberId,
      src: normalize(resolveAvatar?.(memberId, member)),
    };
  });

  return {
    kind: 'collage',
    alt: name,
    isGroup: true,
    isManualGroupAvatar: false,
    layout: resolveGroupCollageLayout(cells.length),
    cells,
    totalMembers: memberIds.length,
  };
};

const applyElementIdentity = (element, { id = '', className = '', alt = '' } = {}) => {
  if (id) element.id = id;
  if (className) element.className = className;
  if (alt) element.setAttribute?.('aria-label', alt);
  return element;
};

const createEmptyCollageIcon = (documentRef) => {
  const empty = documentRef.createElement('span');
  empty.className = 'group-avatar-collage-empty';
  empty.setAttribute?.('aria-hidden', 'true');
  empty.innerHTML = `
    <svg viewBox="0 0 24 24" focusable="false">
      <path d="M16 20v-1.6c0-1.9-1.8-3.4-4-3.4s-4 1.5-4 3.4V20"></path>
      <circle cx="12" cy="9" r="3"></circle>
      <path d="M18.5 10.2c1.5.4 2.5 1.5 2.5 2.8v1.2M5.5 10.2C4 10.6 3 11.7 3 13v1.2"></path>
      <path d="M17.2 5.5a2.4 2.4 0 0 1 0 4.5M6.8 5.5a2.4 2.4 0 0 0 0 4.5"></path>
    </svg>
  `;
  return empty;
};

export const createContactAvatarElement = ({
  documentRef = globalThis.document,
  sessionId = '',
  contact = null,
  getContact = () => null,
  resolveAvatar = () => '',
  id = '',
  className = '',
} = {}) => {
  const view = resolveContactAvatarView({
    sessionId,
    contact,
    getContact,
    resolveAvatar,
  });

  if (view.kind === 'image') {
    const image = documentRef.createElement('img');
    applyElementIdentity(image, { id, className, alt: view.alt });
    image.src = view.src;
    image.alt = '';
    image.draggable = false;
    if (view.isManualGroupAvatar) image.dataset.groupAvatar = 'manual';
    return image;
  }

  const collage = documentRef.createElement('div');
  applyElementIdentity(collage, {
    id,
    className: `${className} group-avatar-collage`.trim(),
    alt: view.alt,
  });
  collage.dataset.layout = view.layout;
  collage.dataset.groupAvatar = 'collage';
  collage.dataset.memberCount = String(view.totalMembers);

  if (!view.cells.length) {
    collage.appendChild(createEmptyCollageIcon(documentRef));
    return collage;
  }

  view.cells.forEach((cell, index) => {
    const image = documentRef.createElement('img');
    image.className = 'group-avatar-collage-cell';
    image.src = cell.src;
    image.alt = '';
    image.draggable = false;
    image.dataset.memberId = cell.id;
    if (view.layout === 'trio' && index === 0) image.dataset.collageLead = 'true';
    collage.appendChild(image);
  });
  return collage;
};

export const replaceContactAvatarElement = ({
  target = null,
  ...options
} = {}) => {
  if (!target?.replaceWith) return null;
  const next = createContactAvatarElement(options);
  target.replaceWith(next);
  return next;
};
