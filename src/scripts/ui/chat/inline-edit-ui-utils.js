export const createInlineEditUiRuntime = ({
  documentLike,
  schedule,
  onConfirmEdit,
} = {}) => ({
  startInlineEdit({ scrollEl, message } = {}) {
    const wrapper = scrollEl?.querySelector?.(`[data-msg-id="${message?.id}"]`);
    const bubble = wrapper?.querySelector?.('.QQ_chat_msgdiv');
    if (!bubble || !documentLike?.createElement) return false;

    const originalText = String(message?.content || '');
    const ta = documentLike.createElement('textarea');
    ta.value = originalText;
    ta.style.cssText = `
            width: 100%;
            min-width: 200px;
            max-width: 100%;
            height: auto;
            min-height: 40px;
            border: 1px solid #019aff;
            border-radius: 4px;
            padding: 6px;
            font: inherit;
            resize: none;
            outline: none;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            box-sizing: border-box;
        `;

    const restoreOriginal = () => {
      bubble.textContent = originalText;
      bubble.style.whiteSpace = 'pre-wrap';
    };

    const resize = () => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    };
    ta.addEventListener('input', resize);

    const save = () => {
      const newText = ta.value.trim();
      if (newText && newText !== originalText) {
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
