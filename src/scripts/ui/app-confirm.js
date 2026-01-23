let confirmOverlay = null;
let confirmModal = null;
let confirmTitleEl = null;
let confirmBodyEl = null;
let confirmCancelBtn = null;
let confirmOkBtn = null;
let confirmCloseBtn = null;
let confirmResolve = null;
let confirmKeyHandler = null;

const closeConfirm = (result) => {
  if (!confirmResolve) return;
  const resolve = confirmResolve;
  confirmResolve = null;
  if (confirmOverlay) confirmOverlay.style.display = 'none';
  if (confirmModal) confirmModal.style.display = 'none';
  if (confirmKeyHandler) {
    document.removeEventListener('keydown', confirmKeyHandler);
    confirmKeyHandler = null;
  }
  resolve(Boolean(result));
};

const ensureConfirmUI = () => {
  if (confirmOverlay && confirmModal) return;
  confirmOverlay = document.createElement('div');
  confirmOverlay.className = 'app-confirm-overlay';
  confirmOverlay.style.display = 'none';
  confirmOverlay.addEventListener('click', () => closeConfirm(false));

  confirmModal = document.createElement('div');
  confirmModal.className = 'app-confirm-modal';
  confirmModal.style.display = 'none';
  confirmModal.innerHTML = `
    <div class="app-confirm-header">
      <div class="app-confirm-title">请确认</div>
      <button type="button" class="app-confirm-close" aria-label="关闭">×</button>
    </div>
    <div class="app-confirm-body"></div>
    <div class="app-confirm-actions">
      <button type="button" class="app-confirm-btn app-confirm-cancel">取消</button>
      <button type="button" class="app-confirm-btn app-confirm-ok">确定</button>
    </div>
  `;
  confirmModal.addEventListener('click', (event) => event.stopPropagation());

  confirmTitleEl = confirmModal.querySelector('.app-confirm-title');
  confirmBodyEl = confirmModal.querySelector('.app-confirm-body');
  confirmCancelBtn = confirmModal.querySelector('.app-confirm-cancel');
  confirmOkBtn = confirmModal.querySelector('.app-confirm-ok');
  confirmCloseBtn = confirmModal.querySelector('.app-confirm-close');

  confirmCloseBtn?.addEventListener('click', () => closeConfirm(false));
  confirmCancelBtn?.addEventListener('click', () => closeConfirm(false));
  confirmOkBtn?.addEventListener('click', () => closeConfirm(true));

  document.body.appendChild(confirmOverlay);
  document.body.appendChild(confirmModal);
};

export const appConfirm = (options = {}) => {
  const {
    title = '请确认',
    message = '',
    confirmText = '确定',
    cancelText = '取消',
    danger = false,
  } = options || {};

  return new Promise((resolve) => {
    ensureConfirmUI();
    if (confirmResolve) {
      confirmResolve(false);
      confirmResolve = null;
    }
    confirmResolve = resolve;

    if (confirmTitleEl) {
      confirmTitleEl.textContent = String(title || '请确认');
    }
    if (confirmBodyEl) {
      confirmBodyEl.textContent = String(message || '');
    }
    if (confirmCancelBtn) {
      confirmCancelBtn.textContent = String(cancelText || '取消');
    }
    if (confirmOkBtn) {
      confirmOkBtn.textContent = String(confirmText || '确定');
      confirmOkBtn.dataset.variant = danger ? 'danger' : 'primary';
    }
    confirmModal?.classList.toggle('is-danger', danger);

    confirmKeyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeConfirm(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        closeConfirm(true);
      }
    };
    document.addEventListener('keydown', confirmKeyHandler);

    if (confirmOverlay) confirmOverlay.style.display = 'block';
    if (confirmModal) confirmModal.style.display = 'block';
    requestAnimationFrame(() => confirmOkBtn?.focus());
  });
};
