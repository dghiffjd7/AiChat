export const createInlineEditUiRuntime = ({
  documentLike,
  schedule,
  onConfirmEdit,
} = {}) => ({
  startInlineEdit({ scrollEl, message, initialText } = {}) {
    const wrapper = scrollEl?.querySelector?.(`[data-msg-id="${message?.id}"]`);
    const bubble = wrapper?.querySelector?.('.QQ_chat_msgdiv');
    if (!bubble || !documentLike?.createElement) return false;
    if (wrapper?.classList?.contains?.('is-inline-editing')) return false;

    const originalText = initialText == null
      ? String(message?.content || '')
      : String(initialText);
    const originalNodes = Array.from(bubble.childNodes || []);
    const originalWhiteSpace = bubble.style?.whiteSpace || '';
    let settled = false;
    wrapper?.classList?.add?.('is-inline-editing');
    bubble.classList?.add?.('is-inline-editing');
    const ta = documentLike.createElement('textarea');
    ta.className = 'chat-inline-edit-textarea';
    ta.value = originalText;
    ta.style.cssText = `
            width: 100%;
            min-width: min(640px, calc(100vw - 64px));
            max-width: 100%;
            height: auto;
            min-height: 120px;
            max-height: 56vh;
            border: 1px solid #019aff;
            border-radius: 10px;
            padding: 10px 12px;
            font: inherit;
            line-height: 1.55;
            resize: vertical;
            outline: none;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            box-sizing: border-box;
        `;

    const cleanupEditState = () => {
      wrapper?.classList?.remove?.('is-inline-editing');
      bubble.classList?.remove?.('is-inline-editing');
    };

    const restoreOriginal = () => {
      if (settled) return;
      settled = true;
      cleanupEditState();
      bubble.innerHTML = '';
      if (originalNodes.length) {
        originalNodes.forEach(node => bubble.appendChild?.(node));
        bubble.style.whiteSpace = originalWhiteSpace;
      } else {
        bubble.textContent = originalText;
        bubble.style.whiteSpace = 'pre-wrap';
      }
    };

    const resize = () => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    };
    ta.addEventListener('input', resize);

    const save = () => {
      if (settled) return;
      const newText = ta.value.trim();
      if (newText && newText !== originalText) {
        settled = true;
        cleanupEditState();
        onConfirmEdit?.(message, newText);
      } else {
        restoreOriginal();
      }
    };

    ta.addEventListener('blur', save);
    ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ta.blur?.();
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        restoreOriginal();
      }
    });

    bubble.innerHTML = '';
    bubble.appendChild(ta);
    schedule?.(() => {
      resize();
      ta.focus?.();
      ta.setSelectionRange?.(ta.value.length, ta.value.length);
    });
    return true;
  },
});
