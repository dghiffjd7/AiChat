export const buildMomentThreadedCommentsHtml = ({
  visibleComments = [],
  buildThreadedComments = () => ({ roots: [], repliesByParent: new Map() }),
  escapeHtml = (value) => String(value ?? ''),
  renderMomentTextWithStickers = (value) => String(value ?? ''),
  resolveMomentDisplayText = (value) => String(value?.content ?? ''),
} = {}) => {
  const { roots: commentRoots, repliesByParent } = buildThreadedComments(visibleComments);
  return commentRoots
    .map((comment) => {
      const commentId = String(comment?.id || '').trim();
      const author = String(comment?.author || '').trim();
      const content = resolveMomentDisplayText(comment);
      const replies = commentId ? (repliesByParent.get(commentId) || []) : [];
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
  return `
                <div class="moment-header">
                    <img src="${escapeHtml(avatar)}" alt="" class="moment-avatar">
                    <div class="moment-user-info">
                        <div class="moment-username">${escapeHtml(target.author || '角色')}</div>
                        <div class="moment-time">${escapeHtml(target.time || '')}</div>
                    </div>
                    <button class="moment-more" aria-label="更多" title="更多">⋯</button>
                </div>
                <div class="moment-content">
                    <div class="moment-text"></div>
                </div>
                <div class="moment-stats">
                    <span>👁 浏览${Number(target.views || 0)}次</span>
                    <span>💬 评论${comments.length}条</span>
                </div>
                <div class="moment-footer">
                    <span class="moment-likes">👍 ${Number(target.likes || 0)}人已赞</span>
                    <button class="moment-action" data-action="comment">评论</button>
                </div>
                <div class="moment-comments ${comments.length ? '' : 'empty hidden'}">
                    ${
                      !expanded && hiddenCount > 0
                        ? `<div class="moment-comments-toggle" data-action="expand">展开查看更多评论 (${hiddenCount}条)</div>`
                        : ''
                    }
                    ${threadedHtml}
                    ${
                      expanded && hiddenCount > 0
                        ? `<div class="moment-comments-toggle" data-action="collapse">收起评论</div>`
                        : ''
                    }
                </div>
                <div class="moment-comment-composer${showComposer ? ' is-open' : ''}">
                    <div class="moment-replying${replyTarget ? '' : ' hidden'}">
                        <div class="moment-replying-body">
                            <div class="moment-replying-text">
                                回复 <b>${escapeHtml(replyTarget?.author || '')}</b>：${escapeHtml(resolveMomentDisplayText(replyTarget).slice(0, 120))}
                            </div>
                            <button class="moment-reply-cancel" data-action="cancel-reply" type="button">×</button>
                        </div>
                    </div>
                    <div class="moment-comment-input-row">
                        <input class="moment-comment-input" type="text" placeholder="${replyTarget ? `回复 ${escapeHtml(replyTarget.author || '')}...` : '写评论...'}" ${pending ? 'disabled' : ''} />
                        <button class="moment_comment" data-action="send" ${pending ? 'disabled' : ''}>${pending ? '发送中…' : '发送'}</button>
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
  expanded = false,
  showComposer = false,
  replyTarget = null,
  pending = false,
  visibleComments = [],
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
  const hiddenCount = comments.length > visibleComments.length ? comments.length - visibleComments.length : 0;
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
