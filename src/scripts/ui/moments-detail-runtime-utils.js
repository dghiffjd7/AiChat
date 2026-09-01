const momentDetailIconSvg = (body) => `
  <svg class="moment-icon" viewBox="0 0 24 24" aria-hidden="true">
    ${body}
  </svg>
`;

const MOMENT_DETAIL_ICONS = Object.freeze({
  eye: momentDetailIconSvg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle>'),
  like: momentDetailIconSvg('<path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path><path d="M7 11l4-8a3 3 0 0 1 3 3v4h4.5a2.5 2.5 0 0 1 2.45 3l-1.2 6A3 3 0 0 1 16.8 22H7Z"></path>'),
});

export const buildMomentDetailBodyMarkup = ({
  moment,
  avatar = '',
  escapeHtml = (value) => String(value ?? ''),
  renderMomentTextWithStickers = (value) => String(value ?? ''),
  resolveMomentDisplayText = (value) => String(value?.content ?? ''),
} = {}) => {
  const target = moment || {};
  const comments = Array.isArray(target.comments) ? target.comments : [];
  const commentHtml = comments.length
    ? comments
        .map(comment => `
                        <div class="moment-detail-comment" data-comment-id="${escapeHtml(comment?.id || '')}">
                            <div class="moment-detail-author" role="button" tabindex="0" data-i18n-skip data-comment-id="${escapeHtml(comment?.id || '')}">${escapeHtml(comment?.author || '')}</div>
                            <div class="moment-detail-comment-body" data-i18n-skip>${renderMomentTextWithStickers(resolveMomentDisplayText(comment))}</div>
                        </div>
                    `)
        .join('')
    : `<div class="moment-detail-empty">（暂无评论）</div>`;
  return `
                <div class="moment-detail-summary">
                    <img src="${escapeHtml(avatar)}" alt="" class="moment-detail-summary-avatar">
                    <div class="moment-detail-summary-main">
                        <div class="moment-detail-summary-author" data-i18n-skip>${escapeHtml(target.author || '角色')}</div>
                        <div class="moment-detail-summary-meta">
                          <span>${escapeHtml(target.time || '')}</span>
                          <span>${MOMENT_DETAIL_ICONS.eye}${Number(target.views || 0)}</span>
                          <span>${MOMENT_DETAIL_ICONS.like}${Number(target.likes || 0)}</span>
                        </div>
                        <div class="moment-detail-text"></div>
                    </div>
                </div>
                <div class="moment-detail-comments-title">评论</div>
                <div class="moment-detail-comments-list">
                    ${commentHtml}
                </div>
            `;
};

export const appendMomentDetailMedia = ({
  detailTextEl,
  media,
  documentLike,
  onOpenImage,
} = {}) => {
  if (!detailTextEl || !media || !documentLike) return false;
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
    detailTextEl.appendChild?.(grid);
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
    detailTextEl.appendChild?.(list);
  }
  return true;
};

export const bindMomentDetailInteractions = ({
  bodyEl,
  moment,
  bindCommentContextMenu,
  activateReplyTarget,
} = {}) => {
  if (!bodyEl || !moment) return false;
  bodyEl.querySelectorAll?.('.moment-detail-comment')?.forEach((commentEl) => {
    const commentId = String(commentEl.dataset.commentId || '').trim();
    if (!commentId) return;
    bindCommentContextMenu?.({
      commentEl,
      momentId: moment.id,
      commentId,
    });
  });
  bodyEl.querySelectorAll?.('.moment-detail-author')?.forEach((authorEl) => {
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
  return true;
};

export const renderMomentDetailBody = ({
  bodyEl,
  moment,
  avatar = '',
  documentLike,
  escapeHtml = (value) => String(value ?? ''),
  renderMomentTextWithStickers = (value) => String(value ?? ''),
  resolveMomentDisplayText = (value) => String(value?.content ?? ''),
  extractMomentMedia = () => ({ text: '', images: [], audios: [] }),
  onOpenImage,
  bindCommentContextMenu,
  activateReplyTarget,
} = {}) => {
  if (!bodyEl || !moment) return false;
  bodyEl.innerHTML = buildMomentDetailBodyMarkup({
    moment,
    avatar,
    escapeHtml,
    renderMomentTextWithStickers,
    resolveMomentDisplayText,
  });
  const displayContent = resolveMomentDisplayText(moment, { fallbackMode: 'output' });
  const media = extractMomentMedia(displayContent || '');
  const detailTextEl = bodyEl.querySelector?.('.moment-detail-text');
  if (detailTextEl) {
    detailTextEl.innerHTML = '';
    const html = renderMomentTextWithStickers(media.text || '');
    detailTextEl.innerHTML = html;
    const hasMedia = Boolean(media.images?.length || media.audios?.length);
    detailTextEl.style.display = html || hasMedia ? '' : 'none';
    appendMomentDetailMedia({
      detailTextEl,
      media,
      documentLike,
      onOpenImage,
    });
  }
  bindMomentDetailInteractions({
    bodyEl,
    moment,
    bindCommentContextMenu,
    activateReplyTarget,
  });
  return true;
};
