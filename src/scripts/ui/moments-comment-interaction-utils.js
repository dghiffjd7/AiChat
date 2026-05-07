const escapeMomentSelector = (value) => {
  const raw = String(value || '');
  const escape = globalThis.window?.CSS?.escape;
  if (typeof escape === 'function') return escape(raw);
  return raw.replace(/["\\]/g, '\\$&');
};

export const focusMomentComposerInput = ({
  listEl,
  momentId,
  schedule = (handler) => setTimeout(handler, 0),
} = {}) => {
  if (!listEl || !momentId) return false;
  schedule(() => {
    const escId = escapeMomentSelector(momentId);
    const next = listEl.querySelector?.(`.moment-card[data-moment-id="${escId}"] .moment-comment-input`);
    next?.focus?.();
  });
  return true;
};

export const resolveMomentReplyTarget = ({
  comments = [],
  commentId,
} = {}) => {
  const list = Array.isArray(comments) ? comments : [];
  const targetId = String(commentId || '').trim();
  if (!targetId) return null;
  const target = list.find(item => String(item?.id || '').trim() === targetId) || null;
  if (!target) return null;
  return {
    id: targetId,
    author: String(target.author || '').trim(),
    content: String(target.content || ''),
  };
};

export const activateMomentReplyTarget = ({
  momentId,
  commentId,
  comments = [],
  replyTargets,
  openComposer,
  render,
  focusComposerInput,
} = {}) => {
  const target = resolveMomentReplyTarget({ comments, commentId });
  if (!target || !momentId || !replyTargets || !openComposer) return null;
  replyTargets.set(momentId, target);
  openComposer.add(momentId);
  render?.({ preserveScroll: true });
  focusComposerInput?.(momentId);
  return target;
};

export const bindMomentCommentContextMenu = ({
  commentEl,
  momentId,
  commentId,
  showCommentMenu,
  scheduleTimeout = (handler, delay) => setTimeout(handler, delay),
  clearTimeoutFn = (id) => clearTimeout(id),
} = {}) => {
  if (!commentEl || !momentId || !commentId || typeof showCommentMenu !== 'function') return false;
  commentEl.style.userSelect = 'none';
  commentEl.style.webkitUserSelect = 'none';
  let timer = null;
  let startX = 0;
  let startY = 0;
  const clear = () => {
    if (timer) clearTimeoutFn(timer);
    timer = null;
  };
  const schedule = (x, y) => {
    clear();
    startX = x;
    startY = y;
    timer = scheduleTimeout(() => {
      showCommentMenu({ x: startX, y: startY }, momentId, commentId);
    }, 520);
  };
  commentEl.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    event.stopPropagation();
    showCommentMenu({ x: event.clientX || 0, y: event.clientY || 0 }, momentId, commentId);
  });
  commentEl.addEventListener(
    'touchstart',
    (event) => {
      event.stopPropagation();
      const touch = event.touches?.[0];
      if (!touch) return;
      schedule(touch.clientX, touch.clientY);
    },
    { passive: true },
  );
  commentEl.addEventListener('touchmove', clear, { passive: true });
  commentEl.addEventListener('touchend', clear, { passive: true });
  commentEl.addEventListener('touchcancel', clear, { passive: true });
  commentEl.addEventListener('mousedown', (event) => {
    if (event.button !== 0) return;
    schedule(event.clientX, event.clientY);
  });
  commentEl.addEventListener('mouseup', clear);
  commentEl.addEventListener('mouseleave', clear);
  return true;
};
