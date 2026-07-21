const momentIconSvg = (body) => `
  <svg class="moment-icon" viewBox="0 0 24 24" aria-hidden="true">
    ${body}
  </svg>
`;

const MOMENT_ICONS = Object.freeze({
  comment: momentIconSvg('<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z"></path>'),
  eye: momentIconSvg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle>'),
  like: momentIconSvg('<path d="M12 21s-7.5-4.35-9.5-8.55C.8 8.88 2.63 5 6.35 5c2.1 0 3.43 1.18 4.15 2.24C11.22 6.18 12.55 5 14.65 5c3.72 0 5.55 3.88 3.85 7.45C16.5 16.65 12 21 12 21Z"></path>'),
  more: momentIconSvg('<circle cx="5" cy="12" r="1.6"></circle><circle cx="12" cy="12" r="1.6"></circle><circle cx="19" cy="12" r="1.6"></circle>'),
  send: momentIconSvg('<path d="M22 2 11 13"></path><path d="m22 2-7 20-4-9-9-4Z"></path>'),
});

export const buildMomentThreadedCommentsHtml = ({
  visibleComments = [],
  buildThreadedComments = () => ({ roots: [], repliesByParent: new Map() }),
  escapeHtml = (value) => String(value ?? ''),
  renderMomentTextWithStickers = (value) => String(value ?? ''),
  resolveMomentDisplayText = (value) => String(value?.content ?? ''),
} = {}) => {
  const { roots: commentRoots, repliesByParent } = buildThreadedComments(visibleComments);
  const collectReplies = (parentId, seen = new Set()) => {
    const id = String(parentId || '').trim();
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const directReplies = repliesByParent.get(id) || [];
    return directReplies.flatMap((reply) => {
      const replyId = String(reply?.id || '').trim();
      return [reply, ...collectReplies(replyId, seen)];
    });
  };
  return commentRoots
    .map((comment) => {
      const commentId = String(comment?.id || '').trim();
      const author = String(comment?.author || '').trim();
      const content = resolveMomentDisplayText(comment);
      const replies = commentId ? collectReplies(commentId) : [];
      const replyHtml = replies
        .map((reply) => {
          const replyId = String(reply?.id || '').trim();
          const replyAuthor = String(reply?.author || '').trim();
          const replyContent = resolveMomentDisplayText(reply);
          const replyToName = String(reply?.replyToAuthor || '').trim() || author;
          return `
                        <div class="moment-comment moment-comment-reply" data-comment-id="${escapeHtml(replyId)}">
                            <span class="comment-user"><span class="comment-author moment-comment-author" role="button" tabindex="0" data-comment-id="${escapeHtml(replyId)}">${escapeHtml(replyAuthor)}</span> 回复 <span class="comment-replyto moment-comment-replyto">${escapeHtml(replyToName)}</span>：</span>
                            <span class="comment-text">${renderMomentTextWithStickers(replyContent)}</span>
                        </div>
                    `;
        })
        .join('');
      return `
                        <div class="moment-comment" data-comment-id="${escapeHtml(commentId)}">
                            <span class="comment-user"><span class="comment-author moment-comment-author" role="button" tabindex="0" data-comment-id="${escapeHtml(commentId)}">${escapeHtml(author)}</span>：</span>
                            <span class="comment-text">${renderMomentTextWithStickers(content)}</span>
                        </div>
                        ${replyHtml}
                    `;
    })
    .join('');
};

export const buildMomentCardMarkup = ({
  moment,
  avatar = '',
  userAvatar = '',
  comments = [],
  hiddenCount = 0,
  expanded = false,
  threadedHtml = '',
  replyTarget = null,
  showComposer = false,
  pending = false,
  escapeHtml = (value) => String(value ?? ''),
  resolveMomentDisplayText = (value) => String(value?.content ?? ''),
} = {}) => {
  const target = moment || {};
  const likes = Math.max(0, Number(target.likes || 0) || 0);
  const userLiked = Boolean(target.userLiked);
  return `
                <div class="moment-header">
                    <img src="${escapeHtml(avatar)}" alt="" class="moment-avatar">
                    <div class="moment-user-info">
                        <div class="moment-username">${escapeHtml(target.author || '角色')}</div>
                        <div class="moment-time">${escapeHtml(target.time || '')}</div>
                    </div>
                    <button class="moment-more" aria-label="更多" title="更多">${MOMENT_ICONS.more}</button>
                </div>
                <div class="moment-content">
                    <div class="moment-text"></div>
                </div>
                <div class="moment-stats">
                    <span>${MOMENT_ICONS.eye}<span>浏览${Number(target.views || 0)}次</span></span>
                    <span>${MOMENT_ICONS.comment}<span>评论${comments.length}条</span></span>
                </div>
                <div class="moment-footer">
                    <button type="button" class="moment-likes moment-like-button${userLiked ? ' is-liked' : ''}" data-action="like" aria-pressed="${userLiked ? 'true' : 'false'}" aria-label="${userLiked ? `已点赞，当前 ${likes} 人已赞` : `点赞，当前 ${likes} 人已赞`}" title="${userLiked ? '已点赞' : '点赞'}">
                        ${MOMENT_ICONS.like}<span class="moment-like-count">${likes}</span><span>人已赞</span>
                    </button>
                    <button class="moment-action${showComposer ? ' is-active' : ''}" data-action="comment">${MOMENT_ICONS.comment}<span>评论</span></button>
                </div>
                <div class="moment-comments ${comments.length ? '' : 'empty hidden'}">
                    ${
                      hiddenCount > 0
                        ? `<button type="button" class="moment-comments-toggle ${expanded ? 'is-collapse' : 'is-expand'}" data-action="${expanded ? 'collapse' : 'expand'}">${expanded ? '收起评论' : `展开查看更多评论 (${hiddenCount}条)`}</button>`
                        : ''
                    }
                    ${threadedHtml}
                </div>
                <div class="moment-comment-composer${showComposer ? ' is-open' : ''}">
                    <div class="moment-comment-composer-inner">
                        <div class="moment-replying${replyTarget ? '' : ' hidden'}">
                            <div class="moment-replying-body">
                                <div class="moment-replying-text">
                                    回复 <b>${escapeHtml(replyTarget?.author || '')}</b>：${escapeHtml(resolveMomentDisplayText(replyTarget).slice(0, 120))}
                                </div>
                                <button class="moment-reply-cancel" data-action="cancel-reply" type="button">×</button>
                            </div>
                        </div>
                        <div class="moment-comment-compose-main">
                            <img class="moment-comment-avatar" src="${escapeHtml(userAvatar)}" alt="" aria-hidden="true">
                            <div class="moment-comment-input-row">
                                <input class="moment-comment-input" type="text" placeholder="${replyTarget ? `回复 ${escapeHtml(replyTarget.author || '')}…` : '写评论…'}" ${pending ? 'disabled' : ''} />
                                <button class="moment_comment" data-action="send" ${pending ? 'disabled' : ''}>${MOMENT_ICONS.send}<span>${pending ? '发送中…' : '发送'}</span></button>
                            </div>
                        </div>
                    </div>
                </div>
            `;
};

export const appendMomentCardMedia = ({
  contentEl,
  media,
  documentLike,
  onOpenImage,
} = {}) => {
  if (!contentEl || !media || !documentLike) return false;
  if (Array.isArray(media.images) && media.images.length) {
    const grid = documentLike.createElement('div');
    grid.className = 'moment-images';
    media.images.forEach((img) => {
      const el = documentLike.createElement('img');
      el.src = img.url;
      el.alt = img.label || '';
      el.loading = 'lazy';
      el.addEventListener?.('click', (event) => {
        event.stopPropagation?.();
        onOpenImage?.(img.url);
      });
      grid.appendChild?.(el);
    });
    contentEl.appendChild?.(grid);
  }
  if (Array.isArray(media.audios) && media.audios.length) {
    const list = documentLike.createElement('div');
    list.className = 'moment-audios';
    media.audios.forEach((audio) => {
      const wrap = documentLike.createElement('div');
      wrap.className = 'moment-audio-item';
      wrap.innerHTML = `
              <span class="moment-audio-label">语音</span>
              <audio controls preload="none">
                <source src="${audio.url}">
              </audio>
            `;
      list.appendChild?.(wrap);
    });
    contentEl.appendChild?.(list);
  }
  return true;
};

export const renderMomentCardContent = ({
  cardEl,
  moment,
  avatar = '',
  userAvatar = '',
  expanded = false,
  showComposer = false,
  replyTarget = null,
  pending = false,
  visibleComments = [],
  collapsedCommentLimit = 3,
  documentLike,
  buildThreadedComments = () => ({ roots: [], repliesByParent: new Map() }),
  escapeHtml = (value) => String(value ?? ''),
  renderMomentTextWithStickers = (value) => String(value ?? ''),
  resolveMomentDisplayText = (value) => String(value?.content ?? ''),
  extractMomentMedia = () => ({ text: '', images: [], audios: [] }),
  onOpenImage,
} = {}) => {
  if (!cardEl || !moment) return { hiddenCount: 0, media: { text: '', images: [], audios: [] } };
  const comments = Array.isArray(moment.comments) ? moment.comments : [];
  const baseLimit = Math.max(0, Number(collapsedCommentLimit) || 0);
  const hiddenCount = baseLimit > 0 && comments.length > baseLimit
    ? comments.length - baseLimit
    : comments.length > visibleComments.length ? comments.length - visibleComments.length : 0;
  const threadedHtml = buildMomentThreadedCommentsHtml({
    visibleComments,
    buildThreadedComments,
    escapeHtml,
    renderMomentTextWithStickers,
    resolveMomentDisplayText,
  });
  cardEl.innerHTML = buildMomentCardMarkup({
    moment,
    avatar,
    userAvatar,
    comments,
    hiddenCount,
    expanded,
    threadedHtml,
    replyTarget,
    showComposer,
    pending,
    escapeHtml,
    resolveMomentDisplayText,
  });
  const displayContent = resolveMomentDisplayText(moment, { fallbackMode: 'output' });
  const media = extractMomentMedia(displayContent || '');
  const textEl = cardEl.querySelector?.('.moment-text');
  if (textEl) {
    textEl.innerHTML = '';
    const html = renderMomentTextWithStickers(media.text || '');
    textEl.innerHTML = html;
    textEl.style.display = html ? '' : 'none';
  }
  const contentEl = cardEl.querySelector?.('.moment-content');
  appendMomentCardMedia({
    contentEl,
    media,
    documentLike,
    onOpenImage,
  });
  return { hiddenCount, media };
};
