const INLINE_MEDIA_TOKEN_RE = /\[(img-error|bqb|img)-([\s\S]+?)\]/gi;

const resolveLocalFileLikeUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const convert = g?.__TAURI__?.core?.convertFileSrc || g?.__TAURI__?.convertFileSrc || g?.__TAURI_INTERNALS__?.convertFileSrc;
    if (typeof convert === 'function') {
      const converted = convert(raw);
      if (converted) return converted;
    }
  } catch {}
  if (/^(file|asset|tauri|app|https?|data:image\/|blob):/i.test(raw)) return raw;
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return `file:///${raw.replace(/\\/g, '/')}`;
  if (raw.startsWith('/')) return `file://${raw}`;
  return '';
};

const isRenderableInlineImageRef = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  return /^(file|asset|tauri|app|https?|data:image\/|blob):/i.test(raw)
    || /^[a-zA-Z]:[\\/]/.test(raw)
    || raw.startsWith('/')
    || raw.startsWith('./')
    || raw.startsWith('../');
};

export const decodeInlineImageErrorPayload = (encoded = '') => {
  const raw = String(encoded || '').trim();
  if (!raw) return { brief: '图片生成失败', detail: '', prompt: '' };
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    return {
      brief: String(parsed?.brief || '图片生成失败').trim() || '图片生成失败',
      detail: String(parsed?.detail || '').trim(),
      prompt: String(parsed?.prompt || '').trim(),
      source: String(parsed?.source || '').trim(),
      index: Number.isFinite(Number(parsed?.index)) ? Number(parsed.index) : undefined,
    };
  } catch {
    return { brief: raw || '图片生成失败', detail: '', prompt: '' };
  }
};

const appendInlineImageError = (frag, documentLike, fullToken = '', body = '') => {
  const payload = decodeInlineImageErrorPayload(body);
  const chip = documentLike.createElement('span');
  chip.className = 'chat-inline-image-error';
  if (!chip.dataset) chip.dataset = {};
  chip.dataset.imgErrorToken = fullToken;
  chip.dataset.retryable = '1';
  if (payload.prompt) chip.dataset.prompt = payload.prompt;
  if (payload.detail) chip.title = payload.detail;

  const label = documentLike.createElement('span');
  label.className = 'chat-inline-image-error-label';
  label.textContent = `图片生成失败：${payload.brief}`;
  chip.appendChild(label);

  const retry = documentLike.createElement('button');
  retry.type = 'button';
  retry.className = 'chat-inline-image-error-retry';
  if (!retry.dataset) retry.dataset = {};
  retry.dataset.imgErrorToken = fullToken;
  retry.textContent = '重试图片';
  chip.appendChild(retry);

  frag.appendChild(chip);
};

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
  const re = INLINE_MEDIA_TOKEN_RE;
  re.lastIndex = 0;
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

    const tokenType = String(match[1] || '').toLowerCase();
    const tokenBody = String(match[2] || '').trim();
    if (tokenType === 'img-error') {
      appendInlineImageError(frag, documentLike, match[0], tokenBody);
      lastIndex = match.index + match[0].length;
      continue;
    }
    if (tokenType === 'img') {
      const resolved = resolveMediaAsset?.('image', tokenBody);
      const src = resolved?.url || (isRenderableInlineImageRef(tokenBody) ? resolveLocalFileLikeUrl(tokenBody) || tokenBody : '');
      if (src) {
        if (frag.childNodes.length) ensureBreak();
        const img = documentLike.createElement('img');
        img.alt = 'image';
        img.className = 'previewable chat-rich-inline-image chat-inline-generated-image';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = src;
        img.addEventListener?.('click', () => onPreview?.(img.currentSrc || img.src || src));
        frag.appendChild(img);
        const remaining = raw.slice(match.index + match[0].length);
        if (remaining && !remaining.startsWith('\n')) frag.appendChild(documentLike.createElement('br'));
        lastIndex = match.index + match[0].length;
        continue;
      }
      appendText(match[0]);
      lastIndex = match.index + match[0].length;
      continue;
    }

    const keyword = tokenBody;
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
