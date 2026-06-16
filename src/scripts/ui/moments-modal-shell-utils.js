export const ensureMomentDetailModalShell = ({
  existingModal = null,
  documentLike,
  onSendComment,
} = {}) => {
  if (existingModal) return existingModal;
  const overlay = documentLike.createElement('div');
  overlay.id = 'moments-detail-overlay';
  overlay.className = 'moment-detail-overlay';
  const panel = documentLike.createElement('div');
  panel.className = 'moment-detail-panel';
  panel.addEventListener?.('click', event => event.stopPropagation?.());
  panel.innerHTML = `
            <div class="moment-detail-header">
                <div class="moment-detail-title">动态</div>
                <div id="moment-detail-meta" class="moment-detail-meta"></div>
                <button id="moment-detail-close" class="moment-detail-close" type="button">关闭</button>
            </div>
            <div id="moment-detail-body" class="moment-detail-body"></div>
            <div class="moment-detail-footer">
                <input id="moment-comment-input" class="moment-detail-input" type="text" placeholder="写评论…">
                <button id="moment-comment-send" class="moment-detail-send" type="button">发送</button>
            </div>
        `;
  overlay.appendChild?.(panel);
  overlay.addEventListener?.('click', () => hideMomentDetailModal(overlay));
  panel.querySelector?.('#moment-detail-close')?.addEventListener?.('click', () => hideMomentDetailModal(overlay));
  panel.querySelector?.('#moment-comment-send')?.addEventListener?.('click', () => onSendComment?.());
  documentLike.body?.appendChild?.(overlay);
  return overlay;
};

export const hideMomentDetailModal = (modalEl) => {
  if (!modalEl) return false;
  modalEl.style.display = 'none';
  return true;
};

export const showMomentDetailModal = (modalEl) => {
  if (!modalEl) return false;
  modalEl.style.display = 'block';
  return true;
};

export const openMomentImagePreview = ({
  documentLike,
  url,
} = {}) => {
  const src = String(url || '').trim();
  if (!src) return null;
  const overlay = documentLike.createElement('div');
  overlay.className = 'lightbox';
  overlay.innerHTML = `<img src="${src}" alt="preview">`;
  overlay.addEventListener?.('click', () => overlay.remove?.());
  documentLike.body?.appendChild?.(overlay);
  return overlay;
};
