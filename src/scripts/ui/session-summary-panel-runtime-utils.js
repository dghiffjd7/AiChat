import {
  createEditableTextareaModal,
  createReadonlyTextareaModal,
} from './session-summary-modal-utils.js';

export const resolveSessionSummaryInlineModalClasses = ({
  variant = 'contact',
} = {}) => ({
  overlayClass: `app-themed-overlay ${variant}-inline-modal-overlay`,
  panelClass: `app-themed-panel ${variant}-inline-modal-panel`,
});

export const ensureSessionReadonlySummaryModal = ({
  currentModal = null,
  variant = 'contact',
  title = '大总结原始回复',
  copySuccessMessage = '已复制原始回复',
  copyText = async () => {},
  toastr = null,
  createModal = createReadonlyTextareaModal,
} = {}) => {
  if (currentModal) return currentModal;
  const { overlayClass, panelClass } = resolveSessionSummaryInlineModalClasses({ variant });
  return createModal({
    overlayClass,
    panelClass,
    title,
    copySuccessMessage,
    copyText,
    toastr,
  });
};

export const ensureSessionEditableSummaryModal = ({
  currentModal = null,
  variant = 'contact',
  title = '',
  helperText = '',
  minHeight = '200px',
  createModal = createEditableTextareaModal,
} = {}) => {
  if (currentModal) return currentModal;
  const { overlayClass, panelClass } = resolveSessionSummaryInlineModalClasses({ variant });
  return createModal({
    overlayClass,
    panelClass,
    title,
    helperText,
    minHeight,
  });
};

export const openSessionEditableSummaryModal = ({
  modal = null,
  value = '',
  onSave = () => {},
  scheduleFocus = (handler) => setTimeout(handler, 0),
} = {}) => {
  if (!modal) return false;
  modal.setOnSave?.((valueRaw) => {
    try { onSave?.(valueRaw); } catch {}
  });
  modal.setValue?.(value);
  modal.show?.();
  scheduleFocus(() => {
    try { modal.focus?.(); } catch {}
  });
  return true;
};

export const applySessionSummaryBatchMode = ({
  enabled = false,
  batchBarEl = null,
  clearSelectedKeys = () => {},
  renderSummaries = () => {},
} = {}) => {
  const next = Boolean(enabled);
  if (!next) clearSelectedKeys?.();
  if (batchBarEl) batchBarEl.style.display = next ? 'flex' : 'none';
  renderSummaries?.();
  return next;
};
