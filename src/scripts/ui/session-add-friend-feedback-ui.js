const CLOSE_MOTION_MS = 220;
const SUCCESS_VISIBLE_MS = 3200;

const ICONS = {
  close: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M18 6 6 18"></path>
      <path d="m6 6 12 12"></path>
    </svg>
  `,
  book: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
      <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
    </svg>
  `,
  check: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m5 12 4 4L19 6"></path>
    </svg>
  `,
  spinner: `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-6.22-8.56"></path>
    </svg>
  `,
};

const createElement = (documentRef, tag, className = '', text = '') => {
  const element = documentRef.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
};

export const createSessionAddFriendFeedbackUi = ({
  documentRef = globalThis.document,
  schedule = globalThis.setTimeout,
  cancelSchedule = globalThis.clearTimeout,
  requestFrame = globalThis.requestAnimationFrame,
} = {}) => {
  let confirmOverlay = null;
  let confirmLayer = null;
  let confirmCard = null;
  let confirmButton = null;
  let confirmButtonIcon = null;
  let confirmButtonText = null;
  let cancelButton = null;
  let closeButton = null;
  let pendingResolve = null;
  let pendingReject = null;
  let pendingRun = null;
  let confirmBusy = false;
  let confirmCloseTimer = null;
  let confirmKeyHandler = null;
  let successViewport = null;
  let successTimer = null;
  let successCloseTimer = null;

  const clearConfirmCloseTimer = () => {
    if (!confirmCloseTimer) return;
    cancelSchedule(confirmCloseTimer);
    confirmCloseTimer = null;
  };

  const removeConfirmNodes = () => {
    clearConfirmCloseTimer();
    confirmOverlay?.remove?.();
    confirmLayer?.remove?.();
    confirmOverlay = null;
    confirmLayer = null;
    confirmCard = null;
    confirmButton = null;
    confirmButtonIcon = null;
    confirmButtonText = null;
    cancelButton = null;
    closeButton = null;
  };

  const setConfirmBusy = busy => {
    confirmBusy = Boolean(busy);
    [confirmButton, cancelButton, closeButton].forEach(button => {
      if (button) button.disabled = confirmBusy;
    });
    confirmCard?.classList?.toggle('is-busy', confirmBusy);
    if (confirmButtonIcon) {
      confirmButtonIcon.innerHTML = confirmBusy ? ICONS.spinner : ICONS.check;
    }
    if (confirmButtonText) {
      confirmButtonText.textContent = confirmBusy ? '创建中…' : '确定';
    }
  };

  const finishConfirm = (result, error = null) => {
    if (!pendingResolve) return false;
    const resolve = pendingResolve;
    const reject = pendingReject;
    pendingResolve = null;
    pendingReject = null;
    pendingRun = null;
    confirmBusy = false;
    if (confirmKeyHandler) {
      documentRef.removeEventListener?.('keydown', confirmKeyHandler);
      confirmKeyHandler = null;
    }
    confirmOverlay?.classList?.add('is-leaving');
    confirmLayer?.classList?.add('is-leaving');
    confirmCloseTimer = schedule(removeConfirmNodes, CLOSE_MOTION_MS);
    if (error) reject?.(error);
    else resolve(result ?? null);
    return true;
  };

  const cancelConfirm = () => {
    if (!pendingResolve) return false;
    if (!confirmBusy) finishConfirm(null);
    return true;
  };

  const runConfirm = async () => {
    if (confirmBusy || typeof pendingRun !== 'function') return;
    setConfirmBusy(true);
    try {
      const result = await pendingRun();
      finishConfirm(result ?? null);
    } catch (error) {
      finishConfirm(null, error);
    }
  };

  const appendIcon = (element, icon) => {
    element.innerHTML = icon;
    element.setAttribute?.('aria-hidden', 'true');
  };

  const requestAdd = ({ name = '', source = '', avatarSrc = '', run } = {}) => new Promise((resolve, reject) => {
    if (pendingResolve) finishConfirm(null);
    removeConfirmNodes();
    pendingResolve = resolve;
    pendingReject = reject;
    pendingRun = typeof run === 'function' ? run : null;

    confirmOverlay = createElement(documentRef, 'div', 'session-add-confirm-overlay is-entering');
    confirmLayer = createElement(documentRef, 'div', 'session-add-confirm-layer is-entering');
    confirmOverlay.dataset.maidGuideBack = 'add-friend-confirm';
    confirmLayer.dataset.maidGuideBack = 'add-friend-confirm';
    confirmLayer.setAttribute?.('role', 'presentation');
    confirmCard = createElement(documentRef, 'section', 'session-add-confirm-card');
    confirmCard.setAttribute?.('role', 'dialog');
    confirmCard.setAttribute?.('aria-modal', 'true');
    confirmCard.setAttribute?.('aria-labelledby', 'session-add-confirm-name');

    const accent = createElement(documentRef, 'div', 'session-add-confirm-accent');
    closeButton = createElement(documentRef, 'button', 'session-add-confirm-close');
    closeButton.type = 'button';
    closeButton.dataset.maidGuideBack = 'add-friend-confirm';
    closeButton.setAttribute?.('aria-label', '关闭');
    appendIcon(closeButton, ICONS.close);

    const identity = createElement(documentRef, 'div', 'session-add-confirm-identity');
    const avatarRing = createElement(documentRef, 'div', 'session-add-confirm-avatar-ring');
    const avatar = createElement(documentRef, 'img', 'session-add-confirm-avatar');
    avatar.alt = '';
    avatar.src = String(avatarSrc || '');
    avatarRing.appendChild(avatar);
    const identityCopy = createElement(documentRef, 'div', 'session-add-confirm-identity-copy');
    const eyebrow = createElement(documentRef, 'div', 'session-add-confirm-eyebrow', '添加推荐角色');
    const nameLine = createElement(documentRef, 'div', 'session-add-confirm-name-line');
    const nameElement = createElement(documentRef, 'div', 'session-add-confirm-name', String(name || ''));
    nameElement.id = 'session-add-confirm-name';
    nameLine.appendChild(nameElement);
    if (String(source || '').trim()) {
      nameLine.appendChild(createElement(documentRef, 'span', 'session-add-confirm-source', String(source).trim()));
    }
    identityCopy.appendChild(eyebrow);
    identityCopy.appendChild(nameLine);
    identity.appendChild(avatarRing);
    identity.appendChild(identityCopy);

    const question = createElement(
      documentRef,
      'p',
      'session-add-confirm-question',
      `将「${String(name || '')}」添加为好友？`,
    );
    const info = createElement(documentRef, 'div', 'session-add-confirm-info');
    const infoIcon = createElement(documentRef, 'span', 'session-add-confirm-info-icon');
    appendIcon(infoIcon, ICONS.book);
    const infoText = createElement(
      documentRef,
      'p',
      'session-add-confirm-info-text',
      '确认后会自动创建专属聊天室，并与该角色的「世界书」完成绑定。',
    );
    info.appendChild(infoIcon);
    info.appendChild(infoText);

    const actions = createElement(documentRef, 'div', 'session-add-confirm-actions');
    cancelButton = createElement(documentRef, 'button', 'session-add-confirm-action is-cancel', '取消');
    cancelButton.type = 'button';
    cancelButton.dataset.maidGuideBack = 'add-friend-confirm';
    confirmButton = createElement(documentRef, 'button', 'session-add-confirm-action is-confirm');
    confirmButton.type = 'button';
    confirmButton.dataset.maidGuideTarget = 'add-friend-confirm';
    confirmButtonIcon = createElement(documentRef, 'span', 'session-add-confirm-action-icon');
    confirmButtonText = createElement(documentRef, 'span', '', '确定');
    appendIcon(confirmButtonIcon, ICONS.check);
    confirmButton.appendChild(confirmButtonIcon);
    confirmButton.appendChild(confirmButtonText);
    actions.appendChild(cancelButton);
    actions.appendChild(confirmButton);

    confirmCard.appendChild(accent);
    confirmCard.appendChild(closeButton);
    confirmCard.appendChild(identity);
    confirmCard.appendChild(question);
    confirmCard.appendChild(info);
    confirmCard.appendChild(actions);
    confirmLayer.appendChild(confirmCard);
    documentRef.body.appendChild(confirmOverlay);
    documentRef.body.appendChild(confirmLayer);

    confirmOverlay.addEventListener?.('click', cancelConfirm);
    confirmLayer.addEventListener?.('click', event => {
      if (event?.target === confirmLayer) cancelConfirm();
    });
    closeButton.addEventListener?.('click', cancelConfirm);
    cancelButton.addEventListener?.('click', cancelConfirm);
    confirmButton.addEventListener?.('click', runConfirm);
    confirmKeyHandler = event => {
      if (confirmBusy) return;
      if (event?.key === 'Escape') {
        event.preventDefault?.();
        cancelConfirm();
      } else if (event?.key === 'Enter') {
        event.preventDefault?.();
        runConfirm();
      }
    };
    documentRef.addEventListener?.('keydown', confirmKeyHandler);
    setConfirmBusy(false);
    const focusConfirm = () => confirmButton?.focus?.();
    if (typeof requestFrame === 'function') requestFrame(focusConfirm);
    else schedule(focusConfirm, 0);
  });

  const removeSuccess = () => {
    if (successCloseTimer) {
      cancelSchedule(successCloseTimer);
      successCloseTimer = null;
    }
    successViewport?.remove?.();
    successViewport = null;
  };

  const dismissSuccess = ({ immediate = false } = {}) => {
    if (successTimer) {
      cancelSchedule(successTimer);
      successTimer = null;
    }
    if (!successViewport) return;
    if (immediate) {
      removeSuccess();
      return;
    }
    successViewport.classList?.add('is-leaving');
    successCloseTimer = schedule(removeSuccess, CLOSE_MOTION_MS);
  };

  const showSuccess = ({ name = '', onAction } = {}) => {
    dismissSuccess({ immediate: true });
    successViewport = createElement(documentRef, 'div', 'session-add-success-viewport');
    const toast = createElement(documentRef, 'div', 'session-add-success-toast is-entering');
    toast.setAttribute?.('role', 'status');
    const icon = createElement(documentRef, 'span', 'session-add-success-icon');
    appendIcon(icon, ICONS.check);
    const copy = createElement(documentRef, 'div', 'session-add-success-copy');
    copy.appendChild(createElement(documentRef, 'div', 'session-add-success-title', `已添加「${String(name || '')}」为好友`));
    copy.appendChild(createElement(documentRef, 'div', 'session-add-success-subtitle', '聊天室与世界书已自动创建并绑定'));
    const action = createElement(documentRef, 'button', 'session-add-success-action', '去聊天');
    action.type = 'button';
    action.addEventListener?.('click', () => {
      dismissSuccess();
      onAction?.();
    });
    toast.appendChild(icon);
    toast.appendChild(copy);
    toast.appendChild(action);
    successViewport.appendChild(toast);
    documentRef.body.appendChild(successViewport);
    successTimer = schedule(() => dismissSuccess(), SUCCESS_VISIBLE_MS);
    return toast;
  };

  const destroy = () => {
    if (pendingResolve) finishConfirm(null);
    removeConfirmNodes();
    dismissSuccess({ immediate: true });
  };

  return {
    cancelConfirm,
    destroy,
    dismissSuccess,
    isConfirmOpen: () => Boolean(pendingResolve),
    requestAdd,
    showSuccess,
  };
};
