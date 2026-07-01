import {
  collectImageFilesFromDropEvent,
  collectImageFilesFromPasteEvent,
  eventHasImageFiles,
} from './image-attachment-input-utils.js';

const STYLE_ID = 'maid-command-input-runtime-style';
const FIELD_MIN_HEIGHT = 32;
const FIELD_MAX_HEIGHT = 76;
const DEFAULT_MAX_IMAGE_ATTACHMENTS = 4;
const RESULT_VISIBLE_ITEM_LIMIT = 3;

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
  attach: iconSvg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
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
  align-items: flex-end;
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
.maid-command-input.is-dragover {
  border-color: rgba(37, 99, 235, 0.42);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.20), 0 0 0 3px rgba(37, 99, 235, 0.12);
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
  min-height: 32px;
  max-height: 76px;
  flex: 1 1 auto;
  padding: 5px 0;
  box-sizing: border-box;
  border: 0;
  outline: 0;
  resize: none;
  appearance: none;
  -webkit-appearance: none;
  background: transparent;
  box-shadow: none;
  color: inherit;
  font: inherit;
  font-size: 14px;
  line-height: 22px;
  overflow: hidden;
  scrollbar-width: thin;
}
.maid-command-input-field::placeholder {
  color: var(--app-text-muted, rgba(100, 116, 139, 0.78));
}
.maid-command-input-attachments {
  flex: 1 0 100%;
  display: none;
  gap: 6px;
  min-width: 0;
  overflow-x: auto;
  padding: 1px 0 2px;
  scrollbar-width: none;
}
.maid-command-input.has-attachments {
  border-radius: 18px;
}
.maid-command-input.has-attachments .maid-command-input-attachments {
  display: flex;
}
.maid-command-input-attachments::-webkit-scrollbar {
  display: none;
}
.maid-command-input-attachment {
  position: relative;
  flex: 0 0 auto;
  width: 38px;
  height: 38px;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.30);
  background: var(--app-surface-subtle, #f8fafc);
}
.maid-command-input-attachment img {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: cover;
}
.maid-command-input-attachment-remove {
  position: absolute;
  top: -1px;
  right: -1px;
  width: 16px;
  height: 16px;
  border: 0;
  border-radius: 999px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.78);
  color: #fff;
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
}
.maid-command-input-attach,
.maid-command-input-settings,
.maid-command-input-submit {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  cursor: pointer;
  color: var(--app-text-secondary, #475569);
  transition: background 120ms ease, color 120ms ease, transform 90ms ease;
  touch-action: manipulation;
}
.maid-command-input-attach {
  background: var(--app-surface-subtle, #f8fafc);
}
.maid-command-input-settings {
  background: var(--app-surface-subtle, #f8fafc);
}
.maid-command-input-submit {
  background: #2563eb;
  color: #fff;
}
.maid-command-input-attach:hover,
.maid-command-input-settings:hover {
  background: rgba(37, 99, 235, 0.10);
  color: #2563eb;
}
.maid-command-input-submit:hover {
  background: #1d4ed8;
}
.maid-command-input-attach:active,
.maid-command-input-settings:active,
.maid-command-input-submit:active {
  transform: translateY(1px);
}
.maid-command-input-attach:focus-visible,
.maid-command-input-settings:focus-visible,
.maid-command-input-submit:focus-visible {
  outline: 2px solid rgba(37, 99, 235, 0.32);
  outline-offset: 2px;
}
.maid-command-input:focus-within {
  border-color: rgba(37, 99, 235, 0.38);
  box-shadow: 0 16px 40px rgba(15, 23, 42, 0.20), 0 0 0 2px rgba(37, 99, 235, 0.10);
}
.maid-command-input-icon {
  width: 16px;
  height: 16px;
  display: block;
  pointer-events: none;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.9;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.maid-command-input-attach:disabled,
.maid-command-input-settings:disabled,
.maid-command-input-submit:disabled {
  opacity: 0.55;
  cursor: default;
}
.maid-command-input-result {
  position: absolute;
  width: 100%;
  max-height: min(42vh, calc(58px * ${RESULT_VISIBLE_ITEM_LIMIT} + 14px));
  overflow: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 1px 2px;
  box-sizing: border-box;
  border: 0;
  border-radius: 16px;
  background: transparent;
  color: var(--app-text-primary, #111827);
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  box-shadow: none;
  scrollbar-width: thin;
}
.maid-command-input-result::before {
  display: none;
}
.maid-command-input-result-item {
  flex: 0 0 auto;
  max-width: 100%;
  min-height: 38px;
  padding: 9px 11px;
  box-sizing: border-box;
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: 16px 16px 16px 6px;
  background: color-mix(in srgb, var(--app-surface-card, #fff) 94%, rgba(37, 99, 235, 0.08));
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.16);
}
.maid-command-input-result-item[data-tone="thinking"] {
  color: var(--app-text-secondary, #475569);
}
.maid-command-input-result-item[data-tone="error"] {
  border-color: rgba(239, 68, 68, 0.30);
  background: color-mix(in srgb, var(--app-surface-card, #fff) 90%, rgba(239, 68, 68, 0.12));
}
.maid-command-input[data-bubble-side="top"] .maid-command-input-result {
  left: 0;
  bottom: calc(100% + 8px);
}
.maid-command-input[data-bubble-side="bottom"] .maid-command-input-result {
  left: 0;
  top: calc(100% + 8px);
}
@media (max-width: 760px) {
  .maid-command-input[data-bubble-side] .maid-command-input-result {
    left: 0;
    right: 0;
    transform: none;
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
  onAttachFiles = null,
  maxImageAttachments = DEFAULT_MAX_IMAGE_ATTACHMENTS,
  setTimeoutFn = globalThis?.setTimeout || null,
  clearTimeoutFn = globalThis?.clearTimeout || null,
} = {}) => {
  let rootEl = null;
  let inputEl = null;
  let attachBtn = null;
  let fileInputEl = null;
  let attachmentsEl = null;
  let settingsBtn = null;
  let submitBtn = null;
  let resultEl = null;
  let closeTimer = null;
  let isOpen = false;
  let isSubmitting = false;
  let outsidePointerHandler = null;
  let imageAttachments = [];
  let resultMessages = [];
  let restoreResultOnNextOpen = false;

  const createAttachmentId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `maid_img_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  };

  const normalizeIncomingAttachments = (result = null) => {
    const raw = Array.isArray(result)
      ? result
      : Array.isArray(result?.attachments)
        ? result.attachments
        : [];
    return raw
      .filter(item => item && typeof item === 'object' && trim(item.url || item.llmUrl))
      .map(item => ({
        ...item,
        id: trim(item.id) || createAttachmentId(),
        kind: trim(item.kind, 'image'),
      }));
  };

  const getMaxImages = () => Math.max(1, Math.trunc(Number(maxImageAttachments || 0)) || DEFAULT_MAX_IMAGE_ATTACHMENTS);

  const renderAttachments = () => {
    if (!attachmentsEl || !rootEl) return;
    attachmentsEl.innerHTML = '';
    rootEl.classList.toggle('has-attachments', imageAttachments.length > 0);
    if (!imageAttachments.length) {
      position();
      return;
    }
    imageAttachments.forEach((attachment) => {
      const item = documentRef.createElement?.('div');
      if (!item) return;
      item.className = 'maid-command-input-attachment';
      item.dataset.attachmentId = attachment.id || '';
      const img = documentRef.createElement?.('img');
      if (img) {
        img.src = attachment.url || attachment.llmUrl || '';
        img.alt = attachment.name || 'image';
        item.appendChild(img);
      }
      const remove = documentRef.createElement?.('button');
      if (remove) {
        remove.type = 'button';
        remove.className = 'maid-command-input-attachment-remove';
        remove.dataset.attachmentId = attachment.id || '';
        remove.textContent = 'x';
        item.appendChild(remove);
      }
      attachmentsEl.appendChild(item);
    });
    position();
  };

  const appendAttachments = (attachments = []) => {
    const max = getMaxImages();
    const next = imageAttachments.slice();
    for (const attachment of attachments) {
      if (!attachment || next.length >= max) break;
      next.push({
        ...attachment,
        id: trim(attachment.id) || createAttachmentId(),
        kind: trim(attachment.kind, 'image'),
      });
    }
    imageAttachments = next;
    renderAttachments();
    return imageAttachments.length;
  };

  const addFiles = async (files = [], { source = 'picker' } = {}) => {
    const list = Array.from(files || []);
    if (!list.length || typeof onAttachFiles !== 'function') return [];
    const remaining = getMaxImages() - imageAttachments.length;
    if (remaining <= 0) return [];
    const result = await onAttachFiles(list.slice(0, remaining), { source });
    const attachments = normalizeIncomingAttachments(result);
    appendAttachments(attachments);
    return attachments;
  };

  const removeAttachment = (id = '') => {
    const target = trim(id);
    if (!target) return;
    imageAttachments = imageAttachments.filter(item => trim(item.id) !== target);
    renderAttachments();
  };

  const clearAttachments = () => {
    if (!imageAttachments.length) return;
    imageAttachments = [];
    renderAttachments();
  };

  const clearCloseTimer = () => {
    if (closeTimer == null) return;
    clearTimeoutFn?.(closeTimer);
    closeTimer = null;
  };

  const shouldStickResultToBottom = () => {
    if (!resultEl) return true;
    const scrollHeight = Number(resultEl.scrollHeight || 0) || 0;
    const clientHeight = Number(resultEl.clientHeight || 0) || 0;
    const scrollTop = Number(resultEl.scrollTop || 0) || 0;
    if (!scrollHeight || !clientHeight) return true;
    return scrollHeight - scrollTop - clientHeight <= 28;
  };

  const scrollResultToBottom = () => {
    if (!resultEl) return;
    try {
      resultEl.scrollTop = Number(resultEl.scrollHeight || 0) || 0;
    } catch {}
  };

  const renderResultMessages = ({ forceBottom = false } = {}) => {
    if (!rootEl || !documentRef) return;
    if (!resultMessages.length) {
      resultEl?.remove?.();
      resultEl = null;
      rootEl.classList.remove('has-result');
      return;
    }
    const keepBottom = forceBottom || shouldStickResultToBottom();
    const previousScrollTop = Number(resultEl?.scrollTop || 0) || 0;
    if (!resultEl) {
      resultEl = documentRef.createElement?.('div');
      resultEl.className = 'maid-command-input-result';
      resultEl.setAttribute?.('role', 'status');
      resultEl.setAttribute?.('aria-live', 'polite');
      rootEl.appendChild(resultEl);
    }
    rootEl.classList.add('has-result');
    resultEl.innerHTML = '';
    resultMessages.forEach((item) => {
      const bubble = documentRef.createElement?.('div');
      if (!bubble) return;
      bubble.className = 'maid-command-input-result-item';
      bubble.dataset.tone = item.tone;
      bubble.textContent = item.message;
      resultEl.appendChild(bubble);
    });
    const latest = resultMessages[resultMessages.length - 1] || {};
    resultEl.dataset.tone = latest.tone || 'info';
    resultEl.dataset.count = String(resultMessages.length);
    if (keepBottom) scrollResultToBottom();
    else resultEl.scrollTop = previousScrollTop;
  };

  const clearResult = () => {
    resultMessages = [];
    restoreResultOnNextOpen = false;
    renderResultMessages();
  };

  const setResult = (message = '', tone = 'info', options = {}) => {
    const text = trim(message);
    if (!text) {
      clearResult();
      return;
    }
    if (options?.replace) resultMessages = [];
    const normalizedTone = trim(tone, 'info');
    const latest = resultMessages[resultMessages.length - 1];
    if (!latest || latest.message !== text || latest.tone !== normalizedTone) {
      resultMessages.push({
        message: text,
        tone: normalizedTone,
      });
    }
    renderResultMessages({ forceBottom: options?.forceBottom !== false });
  };

  const setSubmitting = (next) => {
    isSubmitting = next === true;
    rootEl?.classList.toggle('is-submitting', isSubmitting);
    if (attachBtn) attachBtn.disabled = isSubmitting;
    if (fileInputEl) fileInputEl.disabled = isSubmitting;
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

  const resizeInput = () => {
    if (!inputEl) return;
    inputEl.style.height = 'auto';
    const scrollHeight = Math.max(FIELD_MIN_HEIGHT, Number(inputEl.scrollHeight || 0) || FIELD_MIN_HEIGHT);
    const nextHeight = Math.min(FIELD_MAX_HEIGHT, scrollHeight);
    inputEl.style.height = `${Math.round(nextHeight)}px`;
    inputEl.style.overflowY = scrollHeight > FIELD_MAX_HEIGHT + 1 ? 'auto' : 'hidden';
    rootEl?.classList.toggle('is-multiline', nextHeight > FIELD_MIN_HEIGHT + 2);
    position();
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
    const rootRect = rootEl.getBoundingClientRect?.() || {};
    const rootHeight = Math.max(44, Number(rootRect.height || 0) || (rootEl.classList.contains('is-multiline') ? 88 : 44));
    const left = w ? clamp(x - width / 2, 12, Math.max(12, w - width - 12)) : x - width / 2;
    const top = h ? clamp(y - rootHeight / 2, 12, Math.max(12, h - rootHeight - 12)) : y - rootHeight / 2;
    rootEl.style.width = `${Math.round(width)}px`;
    rootEl.style.left = `${Math.round(left)}px`;
    rootEl.style.top = `${Math.round(top)}px`;
    const bottomSpace = h ? h - (top + rootHeight) - 12 : 0;
    const topSpace = h ? top - 12 : 0;
    const side = bottomSpace >= 96 || bottomSpace >= topSpace ? 'bottom' : 'top';
    rootEl.dataset.bubbleSide = side;
  };

  const ensure = () => {
    if (rootEl || !documentRef?.body) return rootEl;
    injectStyle(documentRef);
    rootEl = documentRef.createElement?.('form');
    rootEl.className = 'maid-command-input';
    rootEl.setAttribute('role', 'search');
    rootEl.setAttribute('aria-label', '女仆助手输入');
    fileInputEl = documentRef.createElement?.('input');
    if (fileInputEl) {
      fileInputEl.type = 'file';
      fileInputEl.accept = 'image/*';
      fileInputEl.multiple = true;
      fileInputEl.style.display = 'none';
    }
    attachmentsEl = documentRef.createElement?.('div');
    if (attachmentsEl) {
      attachmentsEl.className = 'maid-command-input-attachments';
      attachmentsEl.setAttribute?.('aria-live', 'polite');
    }
    attachBtn = documentRef.createElement?.('button');
    attachBtn.className = 'maid-command-input-attach';
    attachBtn.type = 'button';
    attachBtn.innerHTML = ICONS.attach;
    attachBtn.setAttribute('aria-label', '附加图片');
    inputEl = documentRef.createElement?.('textarea');
    inputEl.className = 'maid-command-input-field';
    inputEl.placeholder = '问女仆...';
    inputEl.autocomplete = 'off';
    inputEl.rows = 1;
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
    if (fileInputEl) rootEl.appendChild(fileInputEl);
    if (attachmentsEl) rootEl.appendChild(attachmentsEl);
    rootEl.appendChild(attachBtn);
    rootEl.appendChild(inputEl);
    rootEl.appendChild(settingsBtn);
    rootEl.appendChild(submitBtn);
    rootEl.addEventListener?.('submit', (event) => {
      event.preventDefault?.();
      void submit();
    });
    inputEl.addEventListener?.('keydown', (event) => {
      if (event.key === 'Escape') {
        event.preventDefault?.();
        close();
        return;
      }
      if (event.key === 'Enter' && event.shiftKey !== true) {
        event.preventDefault?.();
        void submit();
      }
    });
    inputEl.addEventListener?.('input', resizeInput);
    inputEl.addEventListener?.('paste', (event) => {
      const files = collectImageFilesFromPasteEvent(event);
      if (!files.length) return;
      event.preventDefault?.();
      void addFiles(files, { source: 'clipboard-image' });
    });
    rootEl.addEventListener?.('dragover', (event) => {
      if (!eventHasImageFiles(event)) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      rootEl.classList.add('is-dragover');
    });
    rootEl.addEventListener?.('dragleave', (event) => {
      const related = event?.relatedTarget || null;
      if (related && containsNode(rootEl, related)) return;
      rootEl.classList.remove('is-dragover');
    });
    rootEl.addEventListener?.('drop', (event) => {
      const files = collectImageFilesFromDropEvent(event);
      if (!files.length) return;
      event.preventDefault?.();
      event.stopPropagation?.();
      rootEl.classList.remove('is-dragover');
      void addFiles(files, { source: 'drop-image' });
    });
    attachmentsEl?.addEventListener?.('click', (event) => {
      const target = event?.target || null;
      const btn = typeof target?.closest === 'function'
        ? target.closest('.maid-command-input-attachment-remove')
        : target?.className === 'maid-command-input-attachment-remove'
          ? target
          : null;
      if (!btn) return;
      event.preventDefault?.();
      removeAttachment(btn.dataset?.attachmentId || '');
    });
    attachBtn.addEventListener?.('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      if (isSubmitting) return;
      try {
        fileInputEl?.click?.();
      } catch {}
    });
    fileInputEl?.addEventListener?.('change', () => {
      const files = Array.from(fileInputEl.files || []);
      if (files.length) void addFiles(files, { source: 'picker-image' });
      try {
        fileInputEl.value = '';
      } catch {}
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
    const shouldRestoreResult = restoreResultOnNextOpen && resultMessages.length > 0;
    isOpen = true;
    if (!isSubmitting) setSubmitting(false);
    if (!shouldRestoreResult && !isSubmitting) clearResult();
    restoreResultOnNextOpen = false;
    if (!isSubmitting && inputEl) inputEl.value = trim(initialText);
    resizeInput();
    position();
    renderResultMessages({ forceBottom: true });
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
    const shouldPreserveResult = isSubmitting && resultMessages.length > 0;
    isOpen = false;
    if (!isSubmitting) setSubmitting(false);
    rootEl?.classList.remove('is-open');
    rootEl?.classList.remove('is-dragover');
    modeSwitchEl?.classList.remove?.('is-maid-input-open');
    if (shouldPreserveResult) {
      restoreResultOnNextOpen = true;
    } else {
      clearResult();
      clearAttachments();
    }
    unbindOutsidePointer();
    return true;
  };

  const submit = async () => {
    const text = trim(inputEl?.value);
    const attachments = imageAttachments.slice();
    if ((!text && !attachments.length) || isSubmitting) return false;
    clearCloseTimer();
    restoreResultOnNextOpen = false;
    setSubmitting(true);
    setResult('女仆正在回复...', 'thinking', { replace: true });
    try {
      const effectiveText = text || '请看这张图片。';
      const result = await onSubmit(effectiveText, {
        setStatus: (message = '', tone = 'thinking') => setResult(message, tone),
        attachments,
      });
      const ok = result?.ok !== false;
      setResult(result?.message || result?.summary || (ok ? '已完成。' : '执行失败。'), ok ? 'success' : 'error');
      if (ok && inputEl) {
        inputEl.value = '';
        clearAttachments();
        resizeInput();
      }
      return result || { ok };
    } catch (error) {
      setResult(error?.message || '女仆执行失败。', 'error');
      return { ok: false, error };
    } finally {
      setSubmitting(false);
      if (!isOpen && resultMessages.length > 0) restoreResultOnNextOpen = true;
    }
  };

  return {
    open,
    close,
    submit,
    position,
    setStatus: (message = '', tone = 'info') => setResult(message, tone),
    addFiles,
    clearAttachments,
    getAttachments: () => imageAttachments.slice(),
    getResultMessages: () => resultMessages.map(item => ({ ...item })),
    isOpen: () => isOpen,
    isSubmitting: () => isSubmitting,
    getElements: () => ({ rootEl, inputEl, attachBtn, fileInputEl, attachmentsEl, settingsBtn, submitBtn, resultEl }),
  };
};
