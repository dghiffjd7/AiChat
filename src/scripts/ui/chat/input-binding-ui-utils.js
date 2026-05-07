export const bindInputAutosizeCore = (inputEl, {
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
} = {}) => {
  if (!inputEl) return null;
  const resize = () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = `${inputEl.scrollHeight}px`;
  };
  inputEl.setAttribute?.('rows', '1');
  inputEl.addEventListener?.('input', resize);
  inputEl.addEventListener?.('focus', resize);
  schedule(() => resize(), 0);
  return resize;
};

export const bindFocusScrollCore = (inputEl, {
  schedule = (handler, delay = 0) => setTimeout(handler, delay),
  onFocusScroll,
} = {}) => {
  if (!inputEl || typeof onFocusScroll !== 'function') return false;
  inputEl.addEventListener?.('focus', () => {
    schedule(() => onFocusScroll(), 120);
  });
  return true;
};

export const createNetworkStatusRuntime = ({
  navigatorLike,
  windowLike,
  onOffline,
  onOnline,
} = {}) => {
  const updateStatus = () => {
    if (typeof navigatorLike !== 'undefined' && !navigatorLike.onLine) {
      onOffline?.();
    } else {
      onOnline?.();
    }
  };
  return {
    bind() {
      windowLike?.addEventListener?.('online', updateStatus);
      windowLike?.addEventListener?.('offline', updateStatus);
      updateStatus();
    },
    updateStatus,
  };
};

export const bindSendCore = (sendBtn, inputEl, handler) => {
  if (typeof handler !== 'function') return false;
  sendBtn?.addEventListener?.('click', handler);
  inputEl?.addEventListener?.('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handler();
    }
  });
  return true;
};

export const bindSendWithModeCore = (sendBtn, inputEl, {
  onEnter,
  onSendButton,
  getSendClickGuard,
} = {}) => {
  if (typeof onSendButton === 'function') {
    sendBtn?.addEventListener?.('click', (event) => {
      event.preventDefault();
      if (typeof getSendClickGuard === 'function' && getSendClickGuard()?.()) return;
      onSendButton();
    });
  }
  if (typeof onEnter === 'function') {
    inputEl?.addEventListener?.('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        onEnter();
      }
    });
  }
};

export const bindOptionalClickCore = (buttonEl, handler) => {
  if (!buttonEl || typeof handler !== 'function') return false;
  buttonEl.addEventListener?.('click', handler);
  return true;
};

export const setSessionLabelCore = (sessionLabelEl, sessionBadgeEl, id) => {
  if (sessionLabelEl) {
    sessionLabelEl.textContent = id;
  }
  if (sessionBadgeEl) {
    sessionBadgeEl.textContent = String(id || '').startsWith('group:') ? '群聊' : '单聊';
  }
};

export const bindDebouncedInputChangeCore = (inputEl, handler, {
  schedule = (nextHandler, delay = 0) => setTimeout(nextHandler, delay),
  clearSchedule = (timerId) => clearTimeout(timerId),
  delay = 500,
} = {}) => {
  if (!inputEl || typeof handler !== 'function') return false;
  let timer = null;
  inputEl.addEventListener?.('input', () => {
    if (timer) clearSchedule(timer);
    timer = schedule(() => {
      handler(inputEl.value);
    }, delay);
  });
  return true;
};
