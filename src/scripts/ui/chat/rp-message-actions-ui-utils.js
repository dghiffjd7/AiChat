const RP_ACTION_ICON_PATHS = Object.freeze({
  'chevron-left': '<path d="m15 18-6-6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  regenerate: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  'view-code': '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>',
});

export const createRpMessageIconMarkup = (iconName, { size = 15 } = {}) => {
  const paths = RP_ACTION_ICON_PATHS[iconName] || '';
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false">${paths}</svg>`;
};

const createActionButton = (documentLike, action, label) => {
  const button = documentLike.createElement('button');
  button.type = 'button';
  button.className = `rp-message-action rp-message-action-${action}`;
  button.dataset.rpMessageAction = action;
  button.setAttribute?.('aria-label', label);
  button.title = label;
  button.innerHTML = createRpMessageIconMarkup(action);
  return button;
};

export const createRpMessageActionsElement = ({
  documentLike,
  message,
  createSwipeIndicatorElement = null,
  kind = 'assistant',
} = {}) => {
  if (!documentLike?.createElement) return null;
  const isUser = kind === 'user';
  const actions = documentLike.createElement('div');
  actions.className = `rp-message-actions${isUser ? ' is-user' : ''}`;
  actions.dataset.msgId = String(message?.id || '');

  if (!isUser) {
    const swipeIndicator = createSwipeIndicatorElement?.(documentLike, message);
    if (swipeIndicator) actions.appendChild?.(swipeIndicator);
  }

  const buttons = documentLike.createElement('div');
  buttons.className = 'rp-message-action-buttons';
  if (isUser) {
    buttons.appendChild?.(createActionButton(documentLike, 'copy', '复制'));
    buttons.appendChild?.(createActionButton(documentLike, 'edit', '编辑'));
  } else {
    buttons.appendChild?.(createActionButton(documentLike, 'regenerate', '重新生成'));
    buttons.appendChild?.(createActionButton(documentLike, 'view-code', '编辑原回复'));
    buttons.appendChild?.(createActionButton(documentLike, 'copy', '复制'));
  }
  actions.appendChild?.(buttons);
  return actions;
};

export const dispatchRpMessageQuickAction = async ({
  action = '',
  message = null,
  wrapper = null,
  startInlineEdit = null,
  actionHandler = null,
} = {}) => {
  if (action === 'edit' && message?.role === 'user') {
    startInlineEdit?.(message);
    return true;
  }
  const actionKey = action === 'copy' ? 'copy-text' : action;
  if (!actionKey || typeof actionHandler !== 'function') return false;
  await actionHandler(actionKey, message, { wrapper });
  return true;
};

const INTERACTIVE_TAP_SELECTOR = 'a, button, input, textarea, select, audio, video, [contenteditable="true"]';
const RP_MESSAGE_ACTIONS_WRAPPER_SELECTOR = '.has-rp-message-actions';

const getClosestElement = target => (
  typeof target?.closest === 'function' ? target : target?.parentElement
);

const defaultIsTouchLike = event => {
  const pointerType = String(event?.pointerType || '').toLowerCase();
  if (pointerType) return pointerType === 'touch' || pointerType === 'pen';
  try {
    return globalThis.matchMedia?.('(hover: none), (pointer: coarse)')?.matches === true;
  } catch {
    return false;
  }
};

export const createRpMessageActionsUiRuntime = ({
  schedule = (handler, delay) => setTimeout(handler, delay),
  clearSchedule = timerId => clearTimeout(timerId),
  isTouchLike = defaultIsTouchLike,
  revealDuration = 5000,
} = {}) => {
  let visibleWrapper = null;
  let hideTimer = null;

  const clearHideTimer = () => {
    if (hideTimer == null) return;
    clearSchedule(hideTimer);
    hideTimer = null;
  };

  const hide = () => {
    clearHideTimer();
    visibleWrapper?.classList?.remove?.('is-rp-actions-visible');
    visibleWrapper = null;
  };

  const reveal = wrapper => {
    if (!wrapper?.classList?.contains?.('has-rp-message-actions')) return false;
    if (visibleWrapper && visibleWrapper !== wrapper) {
      visibleWrapper.classList?.remove?.('is-rp-actions-visible');
    }
    clearHideTimer();
    visibleWrapper = wrapper;
    wrapper.classList?.add?.('is-rp-actions-visible');
    hideTimer = schedule(() => {
      if (visibleWrapper !== wrapper) return;
      wrapper.classList?.remove?.('is-rp-actions-visible');
      visibleWrapper = null;
      hideTimer = null;
    }, revealDuration);
    return true;
  };

  const bind = ({
    scrollEl,
    onAction = null,
    onError = null,
  } = {}) => {
    if (!scrollEl?.addEventListener) return () => hide();
    const handleClick = event => {
      const target = getClosestElement(event?.target);
      if (!target) return;

      const actionButton = target.closest?.('[data-rp-message-action]');
      if (actionButton && !actionButton.disabled) {
        const wrapper = actionButton.closest?.(RP_MESSAGE_ACTIONS_WRAPPER_SELECTOR);
        const message = wrapper?.__chatappMessage;
        const action = String(actionButton.dataset?.rpMessageAction || '').trim();
        if (!wrapper || !message || !action) return;
        try {
          const result = onAction?.(action, { wrapper, message, event });
          result?.catch?.(error => onError?.(error));
        } catch (error) {
          onError?.(error);
        }
        return;
      }

      if (!isTouchLike(event)) return;
      if (target.closest?.(INTERACTIVE_TAP_SELECTOR)) return;
      const bubble = target.closest?.('.QQ_chat_msgdiv');
      const wrapper = bubble?.closest?.(RP_MESSAGE_ACTIONS_WRAPPER_SELECTOR);
      if (wrapper) reveal(wrapper);
    };

    scrollEl.addEventListener('click', handleClick);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      scrollEl.removeEventListener?.('click', handleClick);
      hide();
    };
  };

  return {
    bind,
    hide,
    isTouchLike,
    reveal,
  };
};
