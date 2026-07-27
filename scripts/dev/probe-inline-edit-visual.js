(async () => {
  const wrappers = Array.from(document.querySelectorAll('[data-msg-id]'));
  const userWrapper = wrappers.reverse().find((el) => {
    const bubble = el.querySelector('.QQ_chat_msgdiv');
    return bubble && (el.className || '').includes('user');
  }) || wrappers.find(el => el.querySelector('.QQ_chat_msgdiv'));
  if (!userWrapper) return { ok: false, reason: 'no bubble in current view' };
  const msgId = userWrapper.getAttribute('data-msg-id');
  const bubble = userWrapper.querySelector('.QQ_chat_msgdiv');
  const beforeHtml = bubble.innerHTML;

  const { createInlineEditUiRuntime } = await import('./scripts/ui/chat/inline-edit-ui-utils.js');
  const runtime = createInlineEditUiRuntime({
    documentLike: document,
    windowLike: window,
    schedule: cb => cb(),
    onConfirmEdit: () => false,
  });
  const started = runtime.startInlineEdit({
    scrollEl: document,
    message: { id: msgId, content: bubble.textContent || '' },
  });
  if (!started) return { ok: false, reason: 'startInlineEdit returned false' };

  const ta = bubble.querySelector('.chat-inline-edit-textarea');
  const saveBtn = bubble.querySelector('.chat-inline-edit-save');
  const cancelBtn = bubble.querySelector('.chat-inline-edit-cancel');
  const status = bubble.querySelector('.chat-inline-edit-status');
  const taStyle = ta ? getComputedStyle(ta) : null;
  const saveStyle = saveBtn ? getComputedStyle(saveBtn) : null;
  const snapshot = {
    bubbleBoxShadow: getComputedStyle(bubble).boxShadow.slice(0, 90),
    taBackground: taStyle?.backgroundColor,
    taBorder: taStyle?.borderStyle,
    taFontFamily: (taStyle?.fontFamily || '').slice(0, 40),
    saveBtnRadius: saveStyle?.borderRadius,
    saveBtnBackground: saveStyle?.backgroundColor,
    saveBtnSize: saveStyle ? `${saveStyle.width}x${saveStyle.height}` : '',
    saveHasSvg: Boolean(saveBtn?.querySelector('svg')),
    cancelHasSvg: Boolean(cancelBtn?.querySelector('svg')),
    statusText: status?.textContent || '',
  };

  ta?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  const restored = bubble.innerHTML === beforeHtml;
  return { ok: true, msgId, snapshot, restoredAfterEscape: restored };
})()
