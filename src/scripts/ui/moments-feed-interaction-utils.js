import {
  buildMomentFeedCommentFinishTraceEvent,
  buildMomentFeedCommentSkippedTraceEvent,
  buildMomentFeedCommentStartTraceEvent,
} from './chat/moments-runtime-utils.js';

export const toggleMomentComposer = ({
  momentId,
  openComposer,
  replyTargets,
  render,
  focusComposerInput,
} = {}) => {
  if (!momentId || !openComposer || !replyTargets) return false;
  if (openComposer.has(momentId)) openComposer.delete(momentId);
  else openComposer.add(momentId);
  replyTargets.delete(momentId);
  render?.({ preserveScroll: true });
  focusComposerInput?.(momentId);
  return openComposer.has(momentId);
};

export const toggleMomentCommentsExpanded = ({
  momentId,
  action,
  expandedComments,
  render,
} = {}) => {
  if (!momentId || !expandedComments) return false;
  if (action === 'expand') expandedComments.add(momentId);
  if (action === 'collapse') expandedComments.delete(momentId);
  render?.({ preserveScroll: true });
  return expandedComments.has(momentId);
};

export const clearMomentReplyTarget = ({
  momentId,
  replyTargets,
  render,
  focusComposerInput,
} = {}) => {
  if (!momentId || !replyTargets) return false;
  replyTargets.delete(momentId);
  render?.({ preserveScroll: true });
  focusComposerInput?.(momentId);
  return true;
};

export const createMomentFeedSendHandler = ({
  moment,
  inputEl,
  pending = false,
  replyTargets,
  openComposer,
  pendingComment,
  store,
  applyMomentStoredRegex,
  render,
  onUserComment,
  loggerWarn,
  recordLifecycleEvent,
  generateCommentId = () => `comment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
} = {}) => async () => {
  const momentId = moment?.id;
  const sessionId = String(moment?.originSessionId || moment?.authorId || '').trim();
  const record = (event) => {
    if (typeof recordLifecycleEvent !== 'function') return;
    try {
      recordLifecycleEvent(event);
    } catch {}
  };
  if (!momentId || pending) {
    record(buildMomentFeedCommentSkippedTraceEvent({
      sessionId,
      momentId: momentId || '',
      reason: !momentId ? 'missing-moment-id' : 'pending',
      pending: Boolean(pending),
    }));
    return false;
  }
  const text = String(inputEl?.value || '').trim();
  if (!text) {
    record(buildMomentFeedCommentSkippedTraceEvent({
      sessionId,
      momentId,
      reason: 'empty-text',
      hasText: false,
    }));
    return false;
  }
  const reply = replyTargets?.get(momentId) || null;
  const userCommentId = generateCommentId();
  const isReplyToComment = Boolean(reply?.id);
  record(buildMomentFeedCommentStartTraceEvent({
    sessionId,
    momentId,
    userCommentId,
    isReplyToComment,
  }));
  store?.addComments?.(momentId, [
    {
      id: userCommentId,
      author: '我',
      content: applyMomentStoredRegex?.(text, { regexMode: 'input' }) || text,
      regexMode: 'input',
      replyTo: String(reply?.id || '').trim(),
      replyToAuthor: String(reply?.author || '').trim(),
    },
  ]);
  openComposer?.delete?.(momentId);
  replyTargets?.delete?.(momentId);
  if (inputEl) inputEl.value = '';
  pendingComment?.add?.(momentId);
  render?.({ preserveScroll: true });
  try {
    await onUserComment?.(momentId, text, {
      userCommentId,
      replyTo: reply ? { ...reply } : null,
    });
    record(buildMomentFeedCommentFinishTraceEvent({
      sessionId,
      momentId,
      userCommentId,
      isReplyToComment,
      status: 'success',
    }));
  } catch (error) {
    loggerWarn?.('onUserComment failed', error);
    record(buildMomentFeedCommentFinishTraceEvent({
      sessionId,
      momentId,
      userCommentId,
      isReplyToComment,
      status: 'error',
      errorMessage: error?.message ? String(error.message) : String(error || ''),
    }));
  } finally {
    pendingComment?.delete?.(momentId);
    render?.({ preserveScroll: true });
  }
  return true;
};

export const bindMomentFeedCardInteractions = ({
  cardEl,
  moment,
  pending = false,
  showMenu,
  bindCommentContextMenu,
  activateReplyTarget,
  toggleComposer,
  toggleExpanded,
  clearReplyTarget,
  createSendHandler,
} = {}) => {
  if (!cardEl || !moment) return false;
  const dotsBtn = cardEl.querySelector?.('.moment-more');
  dotsBtn?.addEventListener?.('click', (event) => {
    event.stopPropagation?.();
    showMenu?.(dotsBtn, moment.id);
  });

  cardEl.querySelector?.('[data-action="comment"]')?.addEventListener?.('click', (event) => {
    event.stopPropagation?.();
    toggleComposer?.(moment.id);
  });

  cardEl.querySelectorAll?.('.moment-comments-toggle')?.forEach((toggleEl) => {
    toggleEl.addEventListener?.('click', (event) => {
      event.stopPropagation?.();
      toggleExpanded?.(moment.id, toggleEl.dataset.action);
    });
  });

  cardEl.querySelectorAll?.('.moment-comment')?.forEach((commentEl) => {
    const commentId = String(commentEl.dataset.commentId || '').trim();
    if (!commentId) return;
    bindCommentContextMenu?.({
      commentEl,
      momentId: moment.id,
      commentId,
    });
  });

  cardEl.querySelectorAll?.('.comment-author')?.forEach((authorEl) => {
    authorEl.addEventListener?.('click', (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      const commentId = String(authorEl.dataset.commentId || '').trim();
      activateReplyTarget?.({
        momentId: moment.id,
        commentId,
        comments: moment.comments,
      });
    });
  });

  cardEl.querySelector?.('.moment-reply-cancel')?.addEventListener?.('click', (event) => {
    event.preventDefault?.();
    event.stopPropagation?.();
    clearReplyTarget?.(moment.id);
  });

  const inputEl = cardEl.querySelector?.('.moment-comment-input');
  const send = createSendHandler?.({ moment, inputEl, pending });
  cardEl.querySelector?.('.moment_comment[data-action="send"]')?.addEventListener?.('click', (event) => {
    event.stopPropagation?.();
    send?.();
  });
  inputEl?.addEventListener?.('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault?.();
      event.stopPropagation?.();
      send?.();
    }
  });
  return true;
};
