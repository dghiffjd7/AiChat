export const createReplyDraftUiRuntime = ({
  documentLike,
  normalizeReplyTarget,
  getDefaultReplyAvatar,
  getReplyCancelHandler,
} = {}) => ({
  ensureReplyDraftBar({ inputContainer, composerAttachmentsEl, existingBar } = {}) {
    if (!inputContainer) return existingBar || null;
    if (existingBar) return existingBar;
    const bar = documentLike.createElement('div');
    bar.className = 'chat-reply-draft';
    bar.style.display = 'none';
    inputContainer.insertBefore(bar, composerAttachmentsEl || inputContainer.firstChild || null);
    return bar;
  },
  setReplyTarget(replyDraftEl, target) {
    if (!replyDraftEl) return null;
    const next = normalizeReplyTarget?.(target);
    if (!next) {
      replyDraftEl.style.display = 'none';
      replyDraftEl.innerHTML = '';
      return null;
    }
    const avatar = next.avatar || getDefaultReplyAvatar?.() || '';
    replyDraftEl.style.display = '';
    replyDraftEl.innerHTML = '';
    const main = documentLike.createElement('div');
    main.className = 'chat-reply-draft-main';
    const avatarEl = documentLike.createElement('img');
    avatarEl.className = 'chat-reply-draft-avatar';
    avatarEl.src = avatar;
    avatarEl.alt = '';
    const textWrap = documentLike.createElement('div');
    textWrap.className = 'chat-reply-draft-text';
    const author = documentLike.createElement('div');
    author.className = 'chat-reply-draft-author';
    author.textContent = next.author || '消息';
    const snippet = documentLike.createElement('div');
    snippet.className = 'chat-reply-draft-snippet';
    snippet.textContent = next.content || '...';
    textWrap.appendChild(author);
    textWrap.appendChild(snippet);
    const cancelBtn = documentLike.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'chat-reply-draft-cancel';
    cancelBtn.setAttribute('aria-label', '取消回复');
    cancelBtn.textContent = '×';
    main.appendChild(avatarEl);
    main.appendChild(textWrap);
    main.appendChild(cancelBtn);
    replyDraftEl.appendChild(main);
    cancelBtn.addEventListener('click', (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      getReplyCancelHandler?.()?.();
    });
    return next;
  },
});
