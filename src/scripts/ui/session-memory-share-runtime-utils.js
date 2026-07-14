import {
  createMemoryShareEmptyState,
  createMemoryShareEntryRow,
} from './session-shared-view-utils.js';

const normalizeSessionId = (value) => String(value || '').trim();

const clearContainerChildren = (container) => {
  if (!container) return;
  container.innerHTML = '';
  if (Array.isArray(container.children)) container.children.length = 0;
};

const formatMemoryShareSummaryText = ({
  context = null,
  disabledText = '未启用跨模式记忆注入',
  formatEntryText = (entry) => `${entry.shortLabel}${entry.actualCount}条`,
} = {}) => {
  const entries = Array.isArray(context?.entries) ? context.entries : [];
  const enabledEntries = entries.filter((entry) => entry?.enabled);
  if (!enabledEntries.length) {
    return `${context?.summarySourceText || ''}；${disabledText}`;
  }
  const parts = enabledEntries.map((entry) => formatEntryText(entry));
  return `${context?.summarySourceText || ''}；注入记忆：${parts.join('、')}`;
};

export const refreshSessionMemoryShareSummary = async ({
  summaryEl = null,
  sessionId = '',
  resolveContext = async () => null,
  loadingText = '正在计算注入记忆...',
  errorText = '记忆共享状态读取失败',
  disabledText = '未启用跨模式记忆注入',
  formatEntryText = (entry) => `${entry.shortLabel}${entry.actualCount}条`,
} = {}) => {
  if (!summaryEl) return false;
  const sid = normalizeSessionId(sessionId);
  if (!sid) {
    summaryEl.textContent = '';
    return false;
  }
  summaryEl.textContent = loadingText;
  const context = await resolveContext({ sessionId: sid }).catch(() => null);
  if (!context) {
    summaryEl.textContent = errorText;
    return false;
  }
  summaryEl.textContent = formatMemoryShareSummaryText({
    context,
    disabledText,
    formatEntryText,
  });
  return true;
};

export const renderSessionMemoryShareManager = async ({
  draft = null,
  rowsEl = null,
  resolveContext = async () => ({ entries: [] }),
  hintEl = null,
  sourceWrapEl = null,
  sourceStaticEl = null,
  sourceSelectEl = null,
  sourceButtonEl = null,
  isRpTarget = false,
  listSourceSessionIds = () => [],
  getSourceSessionLabel = (id) => id,
  getSourceStaticLabel = () => '',
  getHintText = () => '',
  sourceStaticPrefix = '来源创意写作会话：',
  defaultSourceButtonLabel = '所有聊天室（默认仅注入大纲）',
  refreshSourceButton = () => {},
  createEmptyState = createMemoryShareEmptyState,
  createEntryRow = createMemoryShareEntryRow,
  showEmptyState = true,
  normalizeLimit = (value, fallback) => fallback,
  documentRef = globalThis.document,
} = {}) => {
  if (!draft || !rowsEl) return false;
  const sessionId = normalizeSessionId(draft.sessionId);
  if (!sessionId) return false;

  if (hintEl) hintEl.textContent = String(getHintText({ sessionId, isRpTarget }) || '');
  if (sourceWrapEl) sourceWrapEl.style.display = isRpTarget ? 'block' : 'none';
  if (sourceStaticEl) sourceStaticEl.style.display = isRpTarget ? 'none' : 'block';

  if (isRpTarget && sourceSelectEl && documentRef?.createElement) {
    const sessionIds = Array.isArray(listSourceSessionIds?.()) ? listSourceSessionIds() : [];
    clearContainerChildren(sourceSelectEl);
    const appendOption = (value, label) => {
      const option = documentRef.createElement('option');
      option.value = value;
      option.textContent = label;
      sourceSelectEl.appendChild(option);
    };
    appendOption('', defaultSourceButtonLabel);
    sessionIds.forEach((id) => appendOption(id, getSourceSessionLabel(id)));
    sourceSelectEl.value = normalizeSessionId(draft.sourceId);
    refreshSourceButton({
      sourceButtonEl,
      sourceSelectEl,
      fallbackLabel: defaultSourceButtonLabel,
    });
  } else if (sourceStaticEl) {
    const sourceLabel = String(getSourceStaticLabel(sessionId) || '').trim() || '当前为空';
    sourceStaticEl.textContent = `${sourceStaticPrefix}${sourceLabel}`;
  }

  const context = await resolveContext({
    sessionId,
    sourceId: normalizeSessionId(draft.sourceId),
    tableSettings: draft.tableSettings || {},
  });
  clearContainerChildren(rowsEl);

  const entries = Array.isArray(context?.entries) ? context.entries : [];
  if (!entries.length) {
    if (showEmptyState) rowsEl.appendChild(createEmptyState());
    return context;
  }

  entries.forEach((entry) => {
    const { row } = createEntryRow({
      entry,
      onToggle: ({ toggle, limitInput }) => {
        const current = draft.tableSettings?.[entry.tableId] || {};
        draft.tableSettings = {
          ...(draft.tableSettings || {}),
          [entry.tableId]: {
            ...current,
            enabled: toggle.checked === true,
            limit: normalizeLimit(current.limit, entry.limit),
          },
        };
        limitInput.disabled = toggle.checked !== true;
      },
      onLimitInput: ({ limitInput }) => {
        const safe = normalizeLimit(limitInput.value, 0);
        limitInput.value = String(safe);
        const current = draft.tableSettings?.[entry.tableId] || {};
        draft.tableSettings = {
          ...(draft.tableSettings || {}),
          [entry.tableId]: {
            ...current,
            enabled: current.enabled === true,
            limit: safe,
          },
        };
      },
    });
    if (row) rowsEl.appendChild(row);
  });
  return context;
};

export const mountSessionMemoryShareModal = ({
  modal = null,
  bodyEl = globalThis.document?.body,
  bindSourceButton = () => {},
  sourceButtonEl = null,
  sourceSelectEl = null,
  sourceButtonFallback = '所有聊天室（默认仅注入大纲）',
  onClose = () => {},
  onSave = () => {},
  onSourceChange = null,
} = {}) => {
  if (!modal?.overlay || !modal?.panel || !bodyEl?.appendChild) return false;
  modal.overlay.addEventListener?.('click', () => onClose?.());
  bodyEl.appendChild(modal.overlay);
  bodyEl.appendChild(modal.panel);

  if (sourceButtonEl && sourceSelectEl) {
    bindSourceButton({
      buttonEl: sourceButtonEl,
      selectEl: sourceSelectEl,
      fallback: sourceButtonFallback,
    });
  }

  modal.closeButton.onclick = () => onClose?.();
  modal.cancelButton.onclick = () => onClose?.();
  if (sourceSelectEl && typeof onSourceChange === 'function') {
    sourceSelectEl.addEventListener?.('change', () => onSourceChange());
  }
  modal.saveButton?.addEventListener?.('click', () => onSave?.());
  return true;
};

export const closeSessionMemoryShareModal = ({
  overlayEl = null,
  panelEl = null,
  beforeClose = () => {},
  onClosed = () => {},
} = {}) => {
  beforeClose?.();
  if (overlayEl) overlayEl.style.display = 'none';
  if (panelEl) panelEl.style.display = 'none';
  onClosed?.();
  return Boolean(overlayEl || panelEl);
};

export const openSessionMemoryShareManager = async ({
  ensureModal = () => {},
  buildDraft = () => null,
  assignDraft = () => {},
  renderManager = async () => {},
  overlayEl = null,
  panelEl = null,
  panelDisplay = 'flex',
} = {}) => {
  ensureModal?.();
  const draft = await buildDraft?.();
  assignDraft?.(draft);
  await renderManager?.();
  if (overlayEl) overlayEl.style.display = 'block';
  if (panelEl) panelEl.style.display = panelDisplay;
  return draft;
};

export const finalizeSessionMemoryShareSave = async ({
  closeManager = () => {},
  refreshSummary = async () => {},
  notifySuccess = () => {},
} = {}) => {
  closeManager?.();
  await refreshSummary?.();
  notifySuccess?.();
  return true;
};
