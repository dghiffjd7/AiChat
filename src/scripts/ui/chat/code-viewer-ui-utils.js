export const createCodeViewerUiRuntime = ({
  documentLike,
  windowLike,
  schedule,
  onSaveEdit,
} = {}) => {
  const hideViewer = (overlay) => {
    if (!overlay) return;
    overlay.style.display = 'none';
    overlay.__chatappMessage = null;
  };

  const ensureViewer = (existingOverlay = null) => {
    if (existingOverlay) return existingOverlay;
    const overlay = documentLike.createElement('div');
    overlay.id = 'code-viewer-modal';
    overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 22000;
            display: none;
            background: rgba(0,0,0,0.32);
            padding: calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom)) 14px;
            box-sizing: border-box;
        `;

    const panel = documentLike.createElement('div');
    panel.style.cssText = `
            height: 100%;
            background: var(--app-surface-card);
            border-radius: 14px;
            box-shadow: 0 18px 50px rgba(0,0,0,0.18);
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
    panel.addEventListener('click', e => e.stopPropagation());

    const header = documentLike.createElement('div');
    header.style.cssText = `
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            padding: 12px 12px;
            background: var(--app-surface-subtle);
            border-bottom: 1px solid var(--app-border-default);
        `;
    const title = documentLike.createElement('div');
    title.style.cssText = 'font-size:14px; font-weight:700; color:var(--app-text-primary);';
    title.textContent = '原回复';

    const hint = documentLike.createElement('div');
    hint.style.cssText =
      'font-size:12px; color:var(--app-text-muted); margin-left:auto; max-width: 55vw; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;';
    hint.dataset.role = 'hint';
    hint.textContent = '未套用正则';

    const closeBtn = documentLike.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = '取消';
    closeBtn.style.cssText = `
            border: 1px solid var(--app-border-default);
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            border-radius: 10px;
            padding: 6px 10px;
            font-size: 13px;
        `;

    const saveBtn = documentLike.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = '保存';
    saveBtn.dataset.role = 'save';
    saveBtn.style.cssText = `
            border: 1px solid #3b82f6;
            background: #3b82f6;
            color: var(--app-text-inverse);
            border-radius: 10px;
            padding: 6px 10px;
            font-size: 13px;
        `;

    const body = documentLike.createElement('div');
    body.style.cssText = `
            flex: 1;
            overflow: auto;
            -webkit-overflow-scrolling: touch;
            background: #0b1220;
            padding: 12px;
        `;
    const ta = documentLike.createElement('textarea');
    ta.dataset.role = 'code';
    ta.spellcheck = false;
    ta.autocapitalize = 'off';
    ta.autocomplete = 'off';
    ta.autocorrect = 'off';
    ta.style.cssText = `
            width: 100%;
            height: 100%;
            min-height: 100%;
            resize: none;
            border: none;
            outline: none;
            background: transparent;
            color: #e2e8f0;
            font-size: 12px;
            line-height: 1.45;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            word-break: break-word;
        `;
    body.appendChild(ta);

    header.appendChild(title);
    header.appendChild(hint);
    header.appendChild(closeBtn);
    header.appendChild(saveBtn);
    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);

    overlay.__chatappRefs = { saveBtn, closeBtn, codeEl: ta };

    overlay.addEventListener('click', () => hideViewer(overlay));
    closeBtn.addEventListener('click', () => hideViewer(overlay));
    windowLike?.addEventListener?.('keydown', (e) => {
      if (overlay.style.display !== 'none' && e.key === 'Escape') hideViewer(overlay);
    });
    saveBtn.addEventListener('click', async () => {
      const m = overlay.__chatappMessage;
      if (!m || m.role !== 'assistant' || typeof onSaveEdit !== 'function') return;
      const nextText = String(overlay.__chatappRefs?.codeEl?.value ?? '');
      saveBtn.disabled = true;
      closeBtn.disabled = true;
      try {
        await onSaveEdit(m, nextText);
        hideViewer(overlay);
      } finally {
        saveBtn.disabled = false;
        closeBtn.disabled = false;
      }
    });

    documentLike.body.appendChild(overlay);
    return overlay;
  };

  return {
    ensureViewer,
    hideViewer,
    openCodeViewer(existingOverlay, { message = null, text = '', canSave = false } = {}) {
      const overlay = ensureViewer(existingOverlay);
      const refs = overlay.__chatappRefs || {};
      overlay.__chatappMessage = message && typeof message === 'object' ? message : null;
      if (refs.codeEl) refs.codeEl.value = String(text ?? '');
      if (refs.saveBtn) refs.saveBtn.style.display = canSave ? 'inline-block' : 'none';
      overlay.style.display = 'block';
      schedule?.(() => {
        try {
          refs.codeEl?.focus?.();
        } catch {}
      });
      return overlay;
    },
  };
};
