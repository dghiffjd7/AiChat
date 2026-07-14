let confirmOverlay = null;
let confirmModal = null;
let confirmTitleEl = null;
let confirmBodyEl = null;
let confirmCancelBtn = null;
let confirmOkBtn = null;
let confirmCloseBtn = null;
let confirmResolve = null;
let confirmKeyHandler = null;

let choiceOverlay = null;
let choiceModal = null;
let choiceTitleEl = null;
let choiceBodyEl = null;
let choiceActionsEl = null;
let choiceResolve = null;
let choiceKeyHandler = null;

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

const closeChoice = (result) => {
  if (!choiceResolve) return;
  const resolve = choiceResolve;
  choiceResolve = null;
  if (choiceOverlay) choiceOverlay.style.display = 'none';
  if (choiceModal) choiceModal.style.display = 'none';
  if (choiceKeyHandler) {
    document.removeEventListener('keydown', choiceKeyHandler);
    choiceKeyHandler = null;
  }
  resolve(result ?? null);
};

const ensureChoiceUI = () => {
  if (choiceOverlay && choiceModal) return;
  choiceOverlay = document.createElement('div');
  choiceOverlay.className = 'app-confirm-overlay';
  choiceOverlay.style.display = 'none';
  choiceOverlay.addEventListener('click', () => closeChoice(null));

  choiceModal = document.createElement('div');
  choiceModal.className = 'app-confirm-modal is-choice';
  choiceModal.style.display = 'none';
  choiceModal.innerHTML = `
    <div class="app-confirm-header">
      <div class="app-confirm-title">请选择</div>
      <button type="button" class="app-confirm-close" aria-label="关闭">×</button>
    </div>
    <div class="app-confirm-body"></div>
    <div class="app-confirm-actions"></div>
  `;
  choiceModal.addEventListener('click', (event) => event.stopPropagation());

  choiceTitleEl = choiceModal.querySelector('.app-confirm-title');
  choiceBodyEl = choiceModal.querySelector('.app-confirm-body');
  choiceActionsEl = choiceModal.querySelector('.app-confirm-actions');
  const closeBtn = choiceModal.querySelector('.app-confirm-close');
  closeBtn?.addEventListener('click', () => closeChoice(null));

  document.body.appendChild(choiceOverlay);
  document.body.appendChild(choiceModal);
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
      confirmBodyEl.scrollTop = 0;
    }
    if (confirmCancelBtn) {
      confirmCancelBtn.textContent = String(cancelText || '取消');
    }
    if (confirmOkBtn) {
      confirmOkBtn.textContent = String(confirmText || '确定');
      confirmOkBtn.dataset.variant = danger ? 'danger' : 'primary';
    }
    confirmModal?.classList.remove('is-choice');
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
    if (confirmModal) confirmModal.style.display = 'flex';
    requestAnimationFrame(() => confirmOkBtn?.focus());
  });
};

export const appChoice = (options = {}) => {
  const {
    title = '请选择',
    message = '',
    actions = [],
    defaultActionId = '',
    danger = false,
  } = options || {};

  return new Promise((resolve) => {
    ensureChoiceUI();
    if (choiceResolve) {
      choiceResolve(null);
      choiceResolve = null;
    }
    choiceResolve = resolve;

    if (choiceTitleEl) choiceTitleEl.textContent = String(title || '请选择');
    if (choiceBodyEl) {
      choiceBodyEl.textContent = String(message || '');
      choiceBodyEl.scrollTop = 0;
    }
    if (choiceActionsEl) {
      choiceActionsEl.innerHTML = '';
      choiceActionsEl.scrollTop = 0;
      const list = Array.isArray(actions) ? actions : [];
      list.forEach((action, idx) => {
        const id = String(action?.id || `action_${idx}`);
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app-confirm-btn';
        if (action?.primary) btn.classList.add('app-confirm-ok');
        if (action?.variant) btn.dataset.variant = String(action.variant);
        btn.textContent = String(action?.label || id);
        btn.addEventListener('click', () => closeChoice(id));
        choiceActionsEl.appendChild(btn);
      });
      if (!list.length) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'app-confirm-btn app-confirm-ok';
        btn.textContent = '确定';
        btn.addEventListener('click', () => closeChoice('ok'));
        choiceActionsEl.appendChild(btn);
      }
    }
    choiceModal?.classList.add('is-choice');
    choiceModal?.classList.toggle('is-danger', danger);

    choiceKeyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeChoice(null);
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        const list = Array.isArray(actions) ? actions : [];
        const targetId = defaultActionId || list.find(a => a?.primary)?.id || list[0]?.id;
        closeChoice(targetId || null);
      }
    };
    document.addEventListener('keydown', choiceKeyHandler);

    if (choiceOverlay) choiceOverlay.style.display = 'block';
    if (choiceModal) choiceModal.style.display = 'flex';
    requestAnimationFrame(() => {
      const btn = choiceActionsEl?.querySelector?.('.app-confirm-ok') || choiceActionsEl?.querySelector?.('button');
      btn?.focus?.();
    });
  });
};

/* 应用内文本输入弹窗（替代原生 prompt()）：返回输入字符串，取消返回 null */
let promptOverlay = null;
let promptModal = null;
let promptTitleEl = null;
let promptMessageEl = null;
let promptInputEl = null;
let promptResolve = null;
let promptKeyHandler = null;

const closePromptText = (submitted) => {
  if (!promptResolve) return;
  const resolve = promptResolve;
  promptResolve = null;
  const value = submitted ? String(promptInputEl?.value ?? '') : null;
  if (promptOverlay) promptOverlay.style.display = 'none';
  if (promptModal) promptModal.style.display = 'none';
  if (promptKeyHandler) {
    document.removeEventListener('keydown', promptKeyHandler);
    promptKeyHandler = null;
  }
  resolve(value);
};

const ensurePromptUI = () => {
  if (promptOverlay && promptModal) return;
  promptOverlay = document.createElement('div');
  promptOverlay.className = 'app-confirm-overlay';
  promptOverlay.style.display = 'none';
  promptOverlay.addEventListener('click', () => closePromptText(false));

  promptModal = document.createElement('div');
  promptModal.className = 'app-confirm-modal';
  promptModal.style.display = 'none';
  promptModal.innerHTML = `
    <div class="app-confirm-header">
      <div class="app-confirm-title">请输入</div>
      <button type="button" class="app-confirm-close" aria-label="关闭">×</button>
    </div>
    <div class="app-confirm-body">
      <div class="app-prompt-message" style="margin-bottom:8px;"></div>
      <input type="text" class="app-prompt-input" style="width:100%; box-sizing:border-box; padding:9px 10px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-input, var(--app-surface-card)); color:var(--app-text-primary); font-size:14px;">
    </div>
    <div class="app-confirm-actions">
      <button type="button" class="app-confirm-btn app-confirm-cancel">取消</button>
      <button type="button" class="app-confirm-btn app-confirm-ok">确定</button>
    </div>
  `;
  promptModal.addEventListener('click', (event) => event.stopPropagation());

  promptTitleEl = promptModal.querySelector('.app-confirm-title');
  promptMessageEl = promptModal.querySelector('.app-prompt-message');
  promptInputEl = promptModal.querySelector('.app-prompt-input');
  promptModal.querySelector('.app-confirm-close')?.addEventListener('click', () => closePromptText(false));
  promptModal.querySelector('.app-confirm-cancel')?.addEventListener('click', () => closePromptText(false));
  promptModal.querySelector('.app-confirm-ok')?.addEventListener('click', () => closePromptText(true));

  document.body.appendChild(promptOverlay);
  document.body.appendChild(promptModal);
};

export const appPromptText = (options = {}) => {
  const {
    title = '请输入',
    message = '',
    placeholder = '',
    defaultValue = '',
    confirmText = '确定',
    cancelText = '取消',
  } = options || {};

  return new Promise((resolve) => {
    ensurePromptUI();
    if (promptResolve) {
      promptResolve(null);
      promptResolve = null;
    }
    promptResolve = resolve;

    if (promptTitleEl) promptTitleEl.textContent = String(title || '请输入');
    if (promptMessageEl) {
      promptMessageEl.textContent = String(message || '');
      promptMessageEl.style.display = message ? '' : 'none';
    }
    if (promptInputEl) {
      promptInputEl.value = String(defaultValue ?? '');
      promptInputEl.placeholder = String(placeholder ?? '');
    }
    const cancelBtn = promptModal?.querySelector('.app-confirm-cancel');
    const okBtn = promptModal?.querySelector('.app-confirm-ok');
    if (cancelBtn) cancelBtn.textContent = String(cancelText || '取消');
    if (okBtn) okBtn.textContent = String(confirmText || '确定');

    promptKeyHandler = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closePromptText(false);
      } else if (event.key === 'Enter') {
        event.preventDefault();
        closePromptText(true);
      }
    };
    document.addEventListener('keydown', promptKeyHandler);

    if (promptOverlay) promptOverlay.style.display = 'block';
    if (promptModal) promptModal.style.display = 'flex';
    requestAnimationFrame(() => {
      promptInputEl?.focus();
      promptInputEl?.select?.();
    });
  });
};
