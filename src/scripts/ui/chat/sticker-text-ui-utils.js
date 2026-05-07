export const renderTextWithStickersCore = ({
  bubble,
  text,
  documentLike,
  resolveMediaAsset,
  resolveStickerFrames,
  resolveStickerFps,
  applyImageFallback,
  registerStickerAnimation,
  toastOnce,
  onPreview,
} = {}) => {
  const raw = String(text ?? '');
  const re = /\[bqb-([\s\S]+?)\]/gi;
  let match = null;
  let lastIndex = 0;
  let hasToken = false;
  const frag = documentLike.createDocumentFragment();

  const appendText = (segment) => {
    if (!segment) return;
    const parts = segment.split(/\n/);
    parts.forEach((part, idx) => {
      if (part) frag.appendChild(documentLike.createTextNode(part));
      if (idx < parts.length - 1) frag.appendChild(documentLike.createElement('br'));
    });
  };

  const ensureBreak = () => {
    const last = frag.lastChild;
    if (last && last.nodeName !== 'BR') frag.appendChild(documentLike.createElement('br'));
  };

  while ((match = re.exec(raw))) {
    hasToken = true;
    const before = raw.slice(lastIndex, match.index);
    appendText(before);

    const keyword = String(match[1] || '').trim();
    if (frag.childNodes.length) ensureBreak();
    const resolved = resolveMediaAsset?.('sticker', keyword) || resolveMediaAsset?.('image', keyword);
    if (resolved) {
      const img = documentLike.createElement('img');
      img.alt = keyword || 'sticker';
      img.className = 'previewable sticker-image sticker-inline';
      img.loading = 'lazy';
      img.decoding = 'async';
      const frames = resolveStickerFrames?.(resolved, keyword) || [];
      const fps = resolveStickerFps?.(resolved, keyword);
      const loaded = applyImageFallback?.(img, resolved, {
        onFail: () => {
          img.classList?.add?.('broken');
          img.alt = '表情包加载失败';
          toastOnce?.('表情包加载失败');
        },
      });
      if (loaded) {
        if (frames.length > 1) registerStickerAnimation?.(img, frames, fps);
        img.addEventListener?.('click', () => onPreview?.(img.currentSrc || img.src));
        frag.appendChild(img);
      } else {
        const chip = documentLike.createElement('span');
        chip.className = 'chip';
        chip.textContent = keyword ? `表情包：${keyword}` : '表情包';
        frag.appendChild(chip);
      }
    } else {
      const chip = documentLike.createElement('span');
      chip.className = 'chip';
      chip.textContent = keyword ? `表情包：${keyword}` : '表情包';
      frag.appendChild(chip);
    }
    const remaining = raw.slice(match.index + match[0].length);
    if (remaining && !remaining.startsWith('\n')) frag.appendChild(documentLike.createElement('br'));
    lastIndex = match.index + match[0].length;
  }

  if (!hasToken) return false;
  appendText(raw.slice(lastIndex));
  bubble.innerHTML = '';
  bubble.appendChild(frag);
  bubble.style.whiteSpace = 'pre-wrap';
  return true;
};
