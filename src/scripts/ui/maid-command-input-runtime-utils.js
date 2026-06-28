const STYLE_ID = 'maid-command-input-runtime-style';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const containsNode = (container, target) => {
  if (!container || !target) return false;
  if (container === target) return true;
  if (typeof container.contains === 'function') return container.contains(target);
  let node = target;
  while (node) {
    if (node === container) return true;
    node = node.parentNode || node.host || null;
  }
  return false;
};

const iconSvg = body => `
  <svg class="maid-command-input-icon" viewBox="0 0 24 24" aria-hidden="true">
    ${body}
  </svg>
`;

const ICONS = Object.freeze({
  settings: iconSvg('<path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.03.03a2.05 2.05 0 0 1-2.9 2.9l-.03-.03A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .54V20a2 2 0 0 1-4 0v-.06a1.7 1.7 0 0 0-1-.54 1.7 1.7 0 0 0-1.88.34l-.03.03a2.05 2.05 0 0 1-2.9-2.9l.03-.03A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.54-1H4a2 2 0 0 1 0-4h.06a1.7 1.7 0 0 0 .54-1 1.7 1.7 0 0 0-.34-1.88l-.03-.03a2.05 2.05 0 0 1 2.9-2.9l.03.03A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.54V4a2 2 0 0 1 4 0v.06a1.7 1.7 0 0 0 1 .54 1.7 1.7 0 0 0 1.88-.34l.03-.03a2.05 2.05 0 0 1 2.9 2.9l-.03.03A1.7 1.7 0 0 0 19.4 9c.2.35.38.68.54 1H20a2 2 0 0 1 0 4h-.06a1.7 1.7 0 0 0-.54 1Z"/>'),
  send: iconSvg('<path d="M5 12h13"/><path d="m13 6 6 6-6 6"/>'),
});

const injectStyle = (documentRef) => {
  if (!documentRef?.head || documentRef.getElementById?.(STYLE_ID)) return;
  const style = documentRef.createElement?.('style');
  if (!style) return;
  style.id = STYLE_ID;
  style.textContent = `
.maid-command-input {
  position: fixed;
  z-index: 26090;
  width: min(376px, calc(100vw - 24px));
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 7px 6px 14px;
  box-sizing: border-box;
  border: 1px solid var(--app-border-default, rgba(148, 163, 184, 0.30));
  border-radius: 999px;
  background: color-mix(in srgb, var(--app-surface-card, #fff) 94%, var(--app-surface-subtle, #f8fafc));
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.20);
  color: var(--app-text-primary, #111827);
  opacity: 0;
  transform: scale(0.86);
  transform-origin: center;
  pointer-events: none;
  transition: opacity 150ms ease, transform 170ms cubic-bezier(0.2, 0.8, 0.2, 1);
}
.maid-command-input.is-open {
  opacity: 1;
  transform: scale(1);
  pointer-events: auto;
}
.maid-command-input.is-submitting {
  opacity: 0.92;
}
.maid-command-input.has-result {
  z-index: 26095;
}
.maid-command-input-field {
  min-width: 0;
  flex: 1 1 auto;
  border: 0;
  outline: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
}
.maid-command-input-field::placeholder {
  color: var(--app-text-muted, rgba(100, 116, 139, 0.78));
}
.maid-command-input-settings,
.maid-command-input-submit {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  color: var(--app-text-secondary, #475569);
  transition: background 120ms ease, color 120ms ease, transform 90ms ease;
}
.maid-command-input-settings {
  background: var(--app-surface-subtle, #f8fafc);
}
.maid-command-input-submit {
  background: #2563eb;
  color: #fff;
}
.maid-command-input-settings:hover {
  background: rgba(37, 99, 235, 0.10);
  color: #2563eb;
}
.maid-command-input-submit:hover {
  background: #1d4ed8;
}
.maid-command-input-settings:active,
.maid-command-input-submit:active {
  transform: translateY(1px);
}
.maid-command-input-settings:focus-visible,
.maid-command-input-submit:focus-visible,
.maid-command-input-field:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.32);
  outline-offset: 2px;
}
.maid-command-input-icon {
  width: 16px;
  height: 16px;
  display: block;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.maid-command-input-settings:disabled,
.maid-command-input-submit:disabled {
  opacity: 0.55;
  cursor: default;
}
.maid-command-input-result {
  position: absolute;
  width: min(320px, calc(100vw - 24px));
  max-height: min(42vh, 260px);
  overflow: auto;
  padding: 10px 12px;
  box-sizing: border-box;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 16px 16px 16px 5px;
  background: color-mix(in srgb, var(--app-surface-card, #fff) 94%, rgba(37, 99, 235, 0.08));
  color: var(--app-text-primary, #111827);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: 0 16px 36px rgba(15, 23, 42, 0.20);
}
.maid-command-input-result::before {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  background: inherit;
  border-left: inherit;
  border-bottom: inherit;
  transform: rotate(45deg);
}
.maid-command-input[data-bubble-side="right"] .maid-command-input-result {
  left: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
}
.maid-command-input[data-bubble-side="right"] .maid-command-input-result::before {
  left: -6px;
  top: calc(50% - 5px);
}
.maid-command-input[data-bubble-side="left"] .maid-command-input-result {
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%);
  border-radius: 16px 16px 5px 16px;
}
.maid-command-input[data-bubble-side="left"] .maid-command-input-result::before {
  right: -6px;
  top: calc(50% - 5px);
  transform: rotate(225deg);
}
.maid-command-input[data-bubble-side="top"] .maid-command-input-result {
  left: 0;
  bottom: calc(100% + 10px);
}
.maid-command-input[data-bubble-side="top"] .maid-command-input-result::before {
  left: 24px;
  bottom: -6px;
  transform: rotate(-45deg);
}
.maid-command-input[data-bubble-side="bottom"] .maid-command-input-result {
  left: 0;
  top: calc(100% + 10px);
}
.maid-command-input[data-bubble-side="bottom"] .maid-command-input-result::before {
  left: 24px;
  top: -6px;
  transform: rotate(135deg);
}
.maid-command-input-result[data-tone="thinking"] {
  color: var(--app-text-secondary, #475569);
}
.maid-command-input-result[data-tone="error"] {
  border-color: rgba(239, 68, 68, 0.30);
  background: color-mix(in srgb, var(--app-surface-card, #fff) 90%, rgba(239, 68, 68, 0.12));
}
@media (max-width: 760px) {
  .maid-command-input-result {
    width: auto;
    max-width: calc(100vw - 24px);
  }
  .maid-command-input[data-bubble-side] .maid-command-input-result {
    left: 0;
    right: 0;
    top: calc(100% + 10px);
    bottom: auto;
    transform: none;
  }
  .maid-command-input[data-bubble-side] .maid-command-input-result::before {
    left: 24px;
    right: auto;
    top: -6px;
    bottom: auto;
    transform: rotate(135deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .maid-command-input {
    transition: none;
  }
}
`;
  documentRef.head.appendChild(style);
};

export const createMaidCommandInputRuntime = ({
  documentRef = globalThis?.document || null,
  modeSwitchEl = null,
  getViewportSize = () => ({ w: 0, h: 0 }),
  onSubmit = async () => ({}),
  onSettings = null,
  setTimeoutFn = globalThis?.setTimeout || null,
  clearTimeoutFn = globalThis?.clearTimeout || null,
} = {}) => {
  let rootEl = null;
  let inputEl = null;
  let settingsBtn = null;
  let submitBtn = null;
  let resultEl = null;
  let closeTimer = null;
  let isOpen = false;
  let isSubmitting = false;
  let outsidePointerHandler = null;

  const clearCloseTimer = () => {
    if (closeTimer == null) return;
    clearTimeoutFn?.(closeTimer);
    closeTimer = null;
  };

  const setResult = (message = '', tone = 'info') => {
    if (!rootEl || !documentRef) return;
    const text = trim(message);
    if (!text) {
      resultEl?.remove?.();
      resultEl = null;
      rootEl.classList.remove('has-result');
      return;
    }
    if (!resultEl) {
      resultEl = documentRef.createElement?.('div');
      resultEl.className = 'maid-command-input-result';
      resultEl.setAttribute?.('role', 'status');
      resultEl.setAttribute?.('aria-live', 'polite');
      rootEl.appendChild(resultEl);
    }
    rootEl.classList.add('has-result');
    resultEl.dataset.tone = tone;
    resultEl.textContent = text;
  };

  const setSubmitting = (next) => {
    isSubmitting = next === true;
    rootEl?.classList.toggle('is-submitting', isSubmitting);
    if (settingsBtn) settingsBtn.disabled = isSubmitting;
    if (submitBtn) submitBtn.disabled = isSubmitting;
    if (inputEl) inputEl.disabled = isSubmitting;
  };

  const unbindOutsidePointer = () => {
    if (!outsidePointerHandler) return;
    documentRef?.removeEventListener?.('pointerdown', outsidePointerHandler, true);
    outsidePointerHandler = null;
  };

  const bindOutsidePointer = () => {
    if (outsidePointerHandler || !documentRef?.addEventListener) return;
    outsidePointerHandler = (event) => {
      if (!isOpen) return;
      const path = typeof event?.composedPath === 'function' ? event.composedPath() : null;
      const target = path?.[0] || event?.target || null;
      if ((Array.isArray(path) && (path.includes(rootEl) || path.includes(modeSwitchEl)))
        || containsNode(rootEl, target)
        || containsNode(modeSwitchEl, target)) {
        return;
      }
      close();
    };
    documentRef.addEventListener('pointerdown', outsidePointerHandler, true);
  };

  const position = () => {
    if (!rootEl) return;
    const viewport = getViewportSize?.() || {};
    const w = Number(viewport.w || globalThis?.innerWidth || 0) || 0;
    const h = Number(viewport.h || globalThis?.innerHeight || 0) || 0;
    const rect = modeSwitchEl?.getBoundingClientRect?.() || {
      left: Math.max(12, w / 2 - 13),
      top: Math.max(12, h / 2 - 13),
      width: 26,
      height: 26,
    };
    const width = Math.min(376, Math.max(220, w - 24 || 376));
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const left = w ? clamp(x - width / 2, 12, Math.max(12, w - width - 12)) : x - width / 2;
    const top = h ? clamp(y - 22, 12, Math.max(12, h - 66)) : y - 22;
    rootEl.style.width = `${Math.round(width)}px`;
    rootEl.style.left = `${Math.round(left)}px`;
    rootEl.style.top = `${Math.round(top)}px`;
    const rightSpace = w ? w - (left + width) - 12 : 0;
    const leftSpace = w ? left - 12 : 0;
    const bottomSpace = h ? h - (top + 42) - 12 : 0;
    const side = rightSpace >= 232
      ? 'right'
      : leftSpace >= 232
        ? 'left'
        : bottomSpace >= 96
          ? 'bottom'
          : 'top';
    rootEl.dataset.bubbleSide = side;
  };

  const ensure = () => {
    if (rootEl || !documentRef?.body) return rootEl;
    injectStyle(documentRef);
    rootEl = documentRef.createElement?.('form');
    rootEl.className = 'maid-command-input';
    rootEl.setAttribute('role', 'search');
    rootEl.setAttribute('aria-label', '女仆助手输入');
    inputEl = documentRef.createElement?.('input');
    inputEl.className = 'maid-command-input-field';
    inputEl.type = 'text';
    inputEl.placeholder = '问女仆...';
    inputEl.autocomplete = 'off';
    settingsBtn = documentRef.createElement?.('button');
    settingsBtn.className = 'maid-command-input-settings';
    settingsBtn.type = 'button';
    settingsBtn.innerHTML = ICONS.settings;
    settingsBtn.setAttribute('aria-label', '女仆设置');
    submitBtn = documentRef.createElement?.('button');
    submitBtn.className = 'maid-command-input-submit';
    submitBtn.type = 'submit';
    submitBtn.innerHTML = ICONS.send;
    submitBtn.setAttribute('aria-label', '发送给女仆');
    rootEl.appendChild(inputEl);
    rootEl.appendChild(settingsBtn);
    rootEl.appendChild(submitBtn);
    rootEl.addEventListener?.('submit', (event) => {
      event.preventDefault?.();
      void submit();
    });
    inputEl.addEventListener?.('keydown', (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault?.();
      close();
    });
    settingsBtn.addEventListener?.('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      if (isSubmitting) return;
      void onSettings?.({ source: 'command_input' });
    });
    documentRef.body.appendChild(rootEl);
    return rootEl;
  };

  const open = ({ initialText = '' } = {}) => {
    const el = ensure();
    if (!el) return false;
    clearCloseTimer();
    isOpen = true;
    setSubmitting(false);
    setResult('');
    if (inputEl) inputEl.value = trim(initialText);
    position();
    el.classList.add('is-open');
    modeSwitchEl?.classList.add?.('is-maid-input-open');
    bindOutsidePointer();
    setTimeoutFn?.(() => {
      try {
        inputEl?.focus?.();
      } catch {}
    }, 0);
    return true;
  };

  const close = () => {
    clearCloseTimer();
    isOpen = false;
    setSubmitting(false);
    rootEl?.classList.remove('is-open');
    modeSwitchEl?.classList.remove?.('is-maid-input-open');
    setResult('');
    unbindOutsidePointer();
    return true;
  };

  const submit = async () => {
    const text = trim(inputEl?.value);
    if (!text || isSubmitting) return false;
    clearCloseTimer();
    setSubmitting(true);
    setResult('女仆正在回复...', 'thinking');
    try {
      const result = await onSubmit(text);
      const ok = result?.ok !== false;
      setResult(result?.message || result?.summary || (ok ? '已完成。' : '执行失败。'), ok ? 'success' : 'error');
      if (ok && inputEl) inputEl.value = '';
      return result || { ok };
    } catch (error) {
      setResult(error?.message || '女仆执行失败。', 'error');
      return { ok: false, error };
    } finally {
      setSubmitting(false);
    }
  };

  return {
    open,
    close,
    submit,
    position,
    isOpen: () => isOpen,
    isSubmitting: () => isSubmitting,
    getElements: () => ({ rootEl, inputEl, settingsBtn, submitBtn, resultEl }),
  };
};
