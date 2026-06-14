const SESSION_SHARED_VIEW_STYLES = {
  memoryShareOverlay: 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;',
  memorySharePanel: `
    display:none; position:fixed;
    left: calc(12px + env(safe-area-inset-left, 0px));
    right: calc(12px + env(safe-area-inset-right, 0px));
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    max-height: calc(100dvh - 24px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
    background:var(--app-surface-card); border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.28);
    z-index:23000; overflow:hidden; display:flex; flex-direction:column;
  `,
  memoryShareModalHeader: 'padding:12px 14px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; align-items:center; justify-content:space-between; gap:10px;',
  memoryShareModalTitle: 'font-weight:900; color:var(--app-text-primary);',
  memoryShareModalClose: 'border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);',
  memoryShareModalBody: 'padding:12px 14px; flex:1; min-height:0; overflow:auto;',
  memoryShareModalHint: 'font-size:12px; color:var(--app-text-muted); line-height:1.5; margin-bottom:12px;',
  memoryShareModalSourceWrap: 'display:block; margin-bottom:12px;',
  memoryShareModalSourceLabel: 'font-size:12px; color:var(--app-text-secondary); margin-bottom:6px;',
  memoryShareModalSourceSelect: 'display:none;',
  memoryShareModalSourceButton: 'width:100%;',
  memoryShareModalSourceStatic: 'display:none; margin-bottom:12px; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-subtle); color:var(--app-text-secondary); font-size:12px; line-height:1.5;',
  memoryShareModalRows: 'display:flex; flex-direction:column; gap:10px;',
  memoryShareModalFooter: 'padding:12px 14px; border-top:1px solid rgba(0,0,0,0.06); background:var(--app-surface-subtle); display:flex; gap:10px;',
  memoryShareModalCancel: 'flex:1; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); cursor:pointer;',
  memoryShareModalSave: 'flex:1; padding:10px 12px; border:none; border-radius:12px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:900;',
  archiveEmpty: 'padding:12px; color:var(--app-text-muted); text-align:center; font-size:12px;',
  archiveRow: (isCurrent) => `display:block; padding:8px 10px; border-bottom:1px solid var(--app-border-subtle); background:${isCurrent ? 'var(--app-surface-hover)' : 'var(--app-surface-card)'}; border-left:${isCurrent ? '3px solid var(--app-accent-primary, #019aff)' : 'none'};`,
  archiveTopRow: 'display:flex; align-items:center; justify-content:space-between; gap:8px;',
  archiveInfo: 'flex:1; cursor:pointer; min-width:0;',
  archiveTitle: 'font-weight:600; color:var(--app-text-secondary); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
  archiveMeta: 'color:var(--app-text-muted); font-size:11px; margin-top:2px; cursor:pointer;',
  archiveActions: 'display:flex; align-items:center; gap:4px; flex:0 0 auto;',
  archiveActionButton: 'width:28px; height:28px; border:none; background:transparent; color:var(--app-text-muted); font-size:15px; cursor:pointer; border-radius:8px;',
  archiveDeleteButton: 'width:28px; height:28px; border:none; background:transparent; color:var(--app-text-muted); font-size:17px; cursor:pointer; border-radius:8px;',
  archiveManagerOverlay: 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.48); z-index:24000;',
  archiveManagerPanel: 'display:none; position:fixed; left:calc(14px + env(safe-area-inset-left, 0px)); right:calc(14px + env(safe-area-inset-right, 0px)); top:calc(14px + env(safe-area-inset-top, 0px)); bottom:calc(14px + env(safe-area-inset-bottom, 0px)); max-width:760px; margin:0 auto; background:var(--app-surface-card); color:var(--app-text-primary); border-radius:12px; box-shadow:0 18px 48px rgba(0,0,0,0.32); z-index:25000; overflow:hidden; flex-direction:column;',
  archiveManagerHeader: 'padding:12px 14px; border-bottom:1px solid var(--app-border-subtle); display:flex; align-items:center; justify-content:space-between; gap:12px; flex:0 0 auto;',
  archiveManagerTitleWrap: 'min-width:0; flex:1;',
  archiveManagerTitle: 'font-weight:900; color:var(--app-text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
  archiveManagerSubtitle: 'margin-top:2px; font-size:12px; color:var(--app-text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
  archiveManagerClose: 'width:34px; height:34px; border:none; border-radius:8px; background:transparent; color:var(--app-text-secondary); cursor:pointer; font-size:20px; flex:0 0 auto;',
  archiveManagerBody: 'flex:1; min-height:0; overflow:hidden; background:var(--app-surface-subtle);',
  archiveManagerList: 'height:100%; overflow:auto; -webkit-overflow-scrolling:touch; background:var(--app-surface-card);',
  memoryShareEmpty: 'padding:10px; border:1px dashed var(--app-border-default); border-radius:12px; color:var(--app-text-muted); font-size:12px;',
  memoryShareRow: 'padding:10px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card);',
  memoryShareHeader: 'display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer;',
  memoryShareTitle: 'font-weight:700; color:var(--app-text-primary);',
  memoryShareToggle: 'width:18px; height:18px;',
  memoryShareDesc: 'color:var(--app-text-secondary); font-size:12px; margin-top:6px;',
  memoryShareLimitWrap: 'display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; color:var(--app-text-secondary); margin-top:10px;',
  memoryShareLimitInput: 'width:88px; padding:4px 6px; border:1px solid var(--app-border-default); border-radius:8px; font-size:12px; text-align:right; background:var(--app-surface-input); color:var(--app-text-primary);',
  selectableEmpty: 'color:var(--app-text-muted); font-size:13px; padding:10px 6px;',
  selectableRow: (selected) => `
    display:flex; align-items:center; gap:10px;
    padding:10px 10px;
    border:1px solid ${selected ? '#93c5fd' : 'var(--app-border-default)'};
    background:${selected ? 'rgba(59,130,246,0.08)' : 'var(--app-surface-card)'};
    border-radius:12px;
    cursor:pointer;
    text-align:left;
  `,
  selectableAvatar: 'width:36px; height:36px; border-radius:50%; object-fit:cover;',
  selectableName: 'font-weight:700; color:var(--app-text-primary); flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;',
  selectableTag: 'font-size:12px; color:#2563eb;',
  memberManageRow: 'display:flex; align-items:center; gap:10px; padding:10px; border:1px solid var(--app-border-default); border-radius:12px;',
  memberManageAvatar: 'width:32px; height:32px; border-radius:50%; object-fit:cover;',
  memberManageRemoveButton: 'border:none; background:#fee2e2; color:#b91c1c; padding:6px 10px; border-radius:10px; cursor:pointer;',
};

export const createSessionMemoryShareModal = ({
  documentRef = globalThis.document,
  variant = 'contact',
  title = '记忆共享',
  hintText = '',
  sourceLabel = '来源聊天 / 群聊',
  sourceButtonLabel = '所有聊天室（默认仅注入大纲）',
} = {}) => {
  const overlay = documentRef.createElement('div');
  overlay.className = `app-themed-overlay ${variant === 'group' ? 'group-inline-modal-overlay' : 'contact-inline-modal-overlay'}`;
  overlay.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareOverlay;

  const panel = documentRef.createElement('div');
  panel.className = `app-themed-panel ${variant === 'group' ? 'group-inline-modal-panel' : 'contact-inline-modal-panel'}`;
  panel.style.cssText = SESSION_SHARED_VIEW_STYLES.memorySharePanel;
  panel.addEventListener('click', (event) => event.stopPropagation());

  const header = documentRef.createElement('div');
  header.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalHeader;

  const titleEl = documentRef.createElement('div');
  titleEl.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalTitle;
  titleEl.textContent = title;

  const closeButton = documentRef.createElement('button');
  closeButton.type = 'button';
  closeButton.textContent = '×';
  closeButton.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalClose;

  header.appendChild(titleEl);
  header.appendChild(closeButton);

  const body = documentRef.createElement('div');
  body.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalBody;

  const hint = documentRef.createElement('div');
  hint.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalHint;
  hint.textContent = hintText;
  body.appendChild(hint);

  let sourceWrap = null;
  let sourceSelect = null;
  let sourceButton = null;
  let sourceStatic = null;

  if (variant === 'contact') {
    sourceWrap = documentRef.createElement('label');
    sourceWrap.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalSourceWrap;

    const sourceLabelEl = documentRef.createElement('div');
    sourceLabelEl.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalSourceLabel;
    sourceLabelEl.textContent = sourceLabel;

    sourceSelect = documentRef.createElement('select');
    sourceSelect.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalSourceSelect;

    sourceButton = documentRef.createElement('button');
    sourceButton.type = 'button';
    sourceButton.className = 'world-app-select-btn';
    sourceButton.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalSourceButton;

    const sourceButtonText = documentRef.createElement('span');
    sourceButtonText.className = 'pp-custom-select-label';
    sourceButtonText.setAttribute('data-custom-select-label', '');
    sourceButtonText.textContent = sourceButtonLabel;

    const sourceButtonChevron = documentRef.createElement('span');
    sourceButtonChevron.className = 'world-app-select-btn-chevron';
    sourceButtonChevron.textContent = '▾';

    sourceButton.appendChild(sourceButtonText);
    sourceButton.appendChild(sourceButtonChevron);

    sourceWrap.appendChild(sourceLabelEl);
    sourceWrap.appendChild(sourceSelect);
    sourceWrap.appendChild(sourceButton);
    body.appendChild(sourceWrap);
  }

  sourceStatic = documentRef.createElement('div');
  sourceStatic.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalSourceStatic;
  if (variant === 'group') sourceStatic.style.display = 'block';
  body.appendChild(sourceStatic);

  const rows = documentRef.createElement('div');
  rows.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalRows;
  body.appendChild(rows);

  const footer = documentRef.createElement('div');
  footer.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalFooter;

  const cancelButton = documentRef.createElement('button');
  cancelButton.type = 'button';
  cancelButton.textContent = '取消';
  cancelButton.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalCancel;

  const saveButton = documentRef.createElement('button');
  saveButton.type = 'button';
  saveButton.textContent = '保存';
  saveButton.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareModalSave;

  footer.appendChild(cancelButton);
  footer.appendChild(saveButton);

  panel.appendChild(header);
  panel.appendChild(body);
  panel.appendChild(footer);

  return {
    overlay,
    panel,
    header,
    titleEl,
    hint,
    sourceWrap,
    sourceSelect,
    sourceButton,
    sourceStatic,
    rows,
    footer,
    closeButton,
    cancelButton,
    saveButton,
  };
};

export const createSessionArchiveEmptyState = ({
  documentRef = globalThis.document,
  text = '暂无历史存档',
} = {}) => {
  const empty = documentRef.createElement('div');
  empty.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveEmpty;
  empty.textContent = text;
  return empty;
};

export const createSessionArchiveManagerModal = ({
  documentRef = globalThis.document,
  title = '历史存档',
  subtitle = '',
} = {}) => {
  const overlay = documentRef.createElement('div');
  overlay.className = 'app-themed-overlay session-archive-manager-overlay';
  overlay.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerOverlay;

  const panel = documentRef.createElement('div');
  panel.className = 'app-themed-panel session-archive-manager-panel';
  panel.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerPanel;
  panel.addEventListener('click', (event) => event.stopPropagation());

  const header = documentRef.createElement('div');
  header.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerHeader;

  const titleWrap = documentRef.createElement('div');
  titleWrap.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerTitleWrap;

  const titleEl = documentRef.createElement('div');
  titleEl.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerTitle;
  titleEl.textContent = title;

  const subtitleEl = documentRef.createElement('div');
  subtitleEl.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerSubtitle;
  subtitleEl.textContent = subtitle;

  titleWrap.appendChild(titleEl);
  titleWrap.appendChild(subtitleEl);

  const closeButton = documentRef.createElement('button');
  closeButton.type = 'button';
  closeButton.title = '关闭';
  closeButton.setAttribute?.('aria-label', '关闭存档管理');
  closeButton.textContent = '×';
  closeButton.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerClose;

  header.appendChild(titleWrap);
  header.appendChild(closeButton);

  const body = documentRef.createElement('div');
  body.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerBody;

  const listEl = documentRef.createElement('div');
  listEl.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveManagerList;
  body.appendChild(listEl);

  panel.appendChild(header);
  panel.appendChild(body);

  return {
    overlay,
    panel,
    header,
    titleEl,
    subtitleEl,
    closeButton,
    body,
    listEl,
  };
};

export const createSessionArchiveRow = ({
  documentRef = globalThis.document,
  archiveId = '',
  archiveName = '',
  isCurrent = false,
  dateText = '',
  messageCount = 0,
  onSelect = async () => {},
  onExport = null,
  onRename = async () => {},
  onDelete = async () => {},
  canRename = true,
  canDelete = true,
} = {}) => {
  const row = documentRef.createElement('div');
  row.className = 'session-archive-row';
  row.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveRow(isCurrent);
  if (archiveId) row.setAttribute('data-archive-id', String(archiveId));

  const topRow = documentRef.createElement('div');
  topRow.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveTopRow;

  const info = documentRef.createElement('div');
  info.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveInfo;
  info.title = archiveId ? `${archiveName || '未命名存档'}\nID: ${archiveId}` : (archiveName || '未命名存档');

  const title = documentRef.createElement('div');
  title.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveTitle;
  title.textContent = `${archiveName || '未命名存档'}${isCurrent ? ' (当前)' : ''}`;

  const meta = documentRef.createElement('div');
  meta.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveMeta;
  meta.textContent = `${dateText} · ${messageCount}条消息`;

  info.appendChild(title);
  info.onclick = onSelect;
  meta.onclick = onSelect;

  const actions = documentRef.createElement('div');
  actions.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveActions;

  let exportButton = null;
  if (typeof onExport === 'function') {
    exportButton = documentRef.createElement('button');
    exportButton.type = 'button';
    exportButton.textContent = '⇩';
    exportButton.title = '导出聊天记录';
    exportButton.setAttribute?.('aria-label', '导出聊天记录');
    exportButton.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveActionButton;
    exportButton.onclick = onExport;
    actions.appendChild(exportButton);
  }

  const renameButton = documentRef.createElement('button');
  renameButton.type = 'button';
  renameButton.textContent = '✎';
  renameButton.title = '重命名存档';
  renameButton.setAttribute?.('aria-label', '重命名存档');
  renameButton.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveActionButton;
  renameButton.onclick = onRename;

  const deleteButton = documentRef.createElement('button');
  deleteButton.type = 'button';
  deleteButton.textContent = '×';
  deleteButton.title = '删除存档';
  deleteButton.setAttribute?.('aria-label', '删除存档');
  deleteButton.style.cssText = SESSION_SHARED_VIEW_STYLES.archiveDeleteButton;
  deleteButton.onclick = onDelete;

  if (canRename) actions.appendChild(renameButton);
  if (canDelete) actions.appendChild(deleteButton);
  topRow.appendChild(info);
  topRow.appendChild(actions);
  row.appendChild(topRow);
  row.appendChild(meta);

  return {
    row,
    topRow,
    info,
    title,
    meta,
    actions,
    exportButton,
    renameButton,
    deleteButton,
  };
};

export const createMemoryShareEmptyState = ({
  documentRef = globalThis.document,
  text = '当前来源没有可配置的跨模式记忆表格。',
} = {}) => {
  const empty = documentRef.createElement('div');
  empty.className = 'memory-share-empty';
  empty.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareEmpty;
  empty.textContent = text;
  return empty;
};

export const createMemoryShareEntryRow = ({
  documentRef = globalThis.document,
  entry = {},
  onToggle = () => {},
  onLimitInput = () => {},
} = {}) => {
  const row = documentRef.createElement('div');
  row.className = 'memory-share-row';
  row.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareRow;

  const headerLabel = documentRef.createElement('label');
  headerLabel.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareHeader;

  const title = documentRef.createElement('span');
  title.className = 'memory-share-row-title';
  title.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareTitle;
  title.textContent = String(entry?.shortLabel || '');

  const toggle = documentRef.createElement('input');
  toggle.type = 'checkbox';
  toggle.setAttribute('data-role', 'enabled');
  toggle.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareToggle;
  toggle.checked = entry?.enabled === true;

  headerLabel.appendChild(title);
  headerLabel.appendChild(toggle);

  const desc = documentRef.createElement('div');
  desc.className = 'memory-share-row-desc';
  desc.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareDesc;
  desc.textContent = `当前可注入 ${Number(entry?.rowCount || 0)} 条；0 代表全部注入。`;

  const limitWrap = documentRef.createElement('label');
  limitWrap.className = 'memory-share-row-limit';
  limitWrap.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareLimitWrap;

  const limitLabel = documentRef.createElement('span');
  limitLabel.className = 'memory-share-row-limit-label';
  limitLabel.textContent = '注入条数';

  const limitInput = documentRef.createElement('input');
  limitInput.type = 'number';
  limitInput.setAttribute('data-role', 'limit');
  limitInput.min = '0';
  limitInput.step = '1';
  limitInput.style.cssText = SESSION_SHARED_VIEW_STYLES.memoryShareLimitInput;
  limitInput.value = String(entry?.limit ?? 0);
  limitInput.disabled = entry?.enabled !== true;

  limitWrap.appendChild(limitLabel);
  limitWrap.appendChild(limitInput);

  toggle.addEventListener('change', () => {
    limitInput.disabled = toggle.checked !== true;
    onToggle?.({ entry, row, toggle, limitInput });
  });
  limitInput.addEventListener('input', () => {
    onLimitInput?.({ entry, row, toggle, limitInput });
  });

  row.appendChild(headerLabel);
  row.appendChild(desc);
  row.appendChild(limitWrap);

  return {
    row,
    toggle,
    limitInput,
    title,
    desc,
    limitLabel,
  };
};

export const createSelectableContactEmptyState = ({
  documentRef = globalThis.document,
  text = '暂无联系人',
} = {}) => {
  const empty = documentRef.createElement('div');
  empty.textContent = text;
  empty.style.cssText = SESSION_SHARED_VIEW_STYLES.selectableEmpty;
  return empty;
};

export const createSelectableContactRow = ({
  documentRef = globalThis.document,
  id = '',
  name = '',
  avatar = '',
  selected = false,
  selectedText = '已选',
  onClick = () => {},
} = {}) => {
  const row = documentRef.createElement('button');
  row.type = 'button';
  row.style.cssText = SESSION_SHARED_VIEW_STYLES.selectableRow(selected);

  const img = documentRef.createElement('img');
  img.src = avatar;
  img.alt = '';
  img.style.cssText = SESSION_SHARED_VIEW_STYLES.selectableAvatar;

  const nameEl = documentRef.createElement('div');
  nameEl.textContent = name || id;
  nameEl.style.cssText = SESSION_SHARED_VIEW_STYLES.selectableName;

  const tag = documentRef.createElement('div');
  tag.textContent = selected ? selectedText : '';
  tag.style.cssText = SESSION_SHARED_VIEW_STYLES.selectableTag;

  row.appendChild(img);
  row.appendChild(nameEl);
  row.appendChild(tag);
  row.onclick = onClick;

  return {
    row,
    img,
    nameEl,
    tag,
  };
};

export const createMemberManageRow = ({
  documentRef = globalThis.document,
  memberId = '',
  name = '',
  avatar = '',
  removeLabel = '移除',
  onRemove = () => {},
} = {}) => {
  const row = documentRef.createElement('div');
  row.style.cssText = SESSION_SHARED_VIEW_STYLES.memberManageRow;

  const img = documentRef.createElement('img');
  img.src = avatar;
  img.alt = '';
  img.style.cssText = SESSION_SHARED_VIEW_STYLES.memberManageAvatar;

  const nameEl = documentRef.createElement('div');
  nameEl.textContent = name || memberId;
  nameEl.style.cssText = SESSION_SHARED_VIEW_STYLES.selectableName;

  const removeButton = documentRef.createElement('button');
  removeButton.type = 'button';
  removeButton.textContent = removeLabel;
  removeButton.style.cssText = SESSION_SHARED_VIEW_STYLES.memberManageRemoveButton;
  removeButton.onclick = onRemove;

  row.appendChild(img);
  row.appendChild(nameEl);
  row.appendChild(removeButton);

  return {
    row,
    img,
    nameEl,
    removeButton,
  };
};
