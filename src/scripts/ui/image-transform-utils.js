const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const estimateDataUrlBytes = (dataUrl = '') => {
  const raw = trim(dataUrl);
  const comma = raw.indexOf(',');
  const payload = comma >= 0 ? raw.slice(comma + 1) : raw;
  return Math.ceil((payload.length * 3) / 4);
};

const inferDataUrlMime = (dataUrl = '', fallback = 'image/jpeg') => {
  const match = trim(dataUrl).match(/^data:([^;,]+)[;,]/i);
  return trim(match?.[1], fallback);
};

const loadImageFromDataUrl = (dataUrl = '', { ImageCtor = globalThis?.Image } = {}) => (
  new Promise((resolve, reject) => {
    if (typeof ImageCtor !== 'function') {
      reject(new Error('Image constructor unavailable'));
      return;
    }
    const image = new ImageCtor();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('image load failed'));
    image.src = dataUrl;
  })
);

const canvasToDataUrl = (canvas, { mime = 'image/jpeg', quality = 0.86 } = {}) => {
  try {
    const out = canvas.toDataURL(mime, quality);
    if (trim(out).startsWith('data:')) return out;
  } catch {}
  try {
    const out = canvas.toDataURL('image/jpeg', quality);
    if (trim(out).startsWith('data:')) return out;
  } catch {}
  return '';
};

const compressToLimit = (canvas, {
  mime = 'image/jpeg',
  quality = 0.86,
  maxBytes = 1_200_000,
  minQuality = 0.42,
} = {}) => {
  let q = clamp(Number(quality) || 0.86, minQuality, 0.95);
  let out = canvasToDataUrl(canvas, { mime, quality: q });
  for (let index = 0; index < 6 && out; index += 1) {
    if (estimateDataUrlBytes(out) <= maxBytes) break;
    q = clamp(q - 0.11, minQuality, 0.95);
    out = canvasToDataUrl(canvas, { mime, quality: q }) || out;
    if (q <= minQuality + 0.001) break;
  }
  return out;
};

export const prepareImageDataUrlForAsset = async (dataUrl = '', {
  purpose = 'image',
  fit = '',
  maxDim = 1280,
  quality = 0.86,
  maxBytes = 1_200_000,
  mime = '',
  documentRef = globalThis?.document || null,
  ImageCtor = globalThis?.Image,
} = {}) => {
  const raw = trim(dataUrl);
  if (!raw.startsWith('data:image/')) {
    return {
      dataUrl: raw,
      width: 0,
      height: 0,
      mime: inferDataUrlMime(raw, 'image/jpeg'),
      bytes: estimateDataUrlBytes(raw),
      transformed: false,
    };
  }
  if (/^data:image\/gif[;,]/i.test(raw)) {
    return {
      dataUrl: raw,
      width: 0,
      height: 0,
      mime: 'image/gif',
      bytes: estimateDataUrlBytes(raw),
      transformed: false,
      animated: true,
    };
  }
  if (!documentRef?.createElement) {
    return {
      dataUrl: raw,
      width: 0,
      height: 0,
      mime: inferDataUrlMime(raw, 'image/jpeg'),
      bytes: estimateDataUrlBytes(raw),
      transformed: false,
    };
  }

  const image = await loadImageFromDataUrl(raw, { ImageCtor });
  const iw = image.naturalWidth || image.width || 1;
  const ih = image.naturalHeight || image.height || 1;
  const usage = trim(purpose, 'image').toLowerCase();
  const limit = Math.max(32, Math.trunc(Number(maxDim || 0)) || (usage === 'avatar' ? 256 : 1280));
  const targetMime = trim(mime, usage === 'avatar' ? 'image/webp' : 'image/jpeg');
  const canvas = documentRef.createElement('canvas');
  const mode = trim(fit, usage === 'avatar' ? 'cover' : 'contain').toLowerCase();

  if (usage === 'avatar' || mode === 'cover-square') {
    const size = Math.max(1, Math.min(limit, Math.max(iw, ih)));
    canvas.width = size;
    canvas.height = size;
    const scale = Math.max(size / iw, size / ih);
    const sw = iw * scale;
    const sh = ih * scale;
    const dx = (size - sw) / 2;
    const dy = (size - sh) / 2;
    const ctx = canvas.getContext('2d', { alpha: targetMime !== 'image/jpeg' });
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.drawImage(image, dx, dy, sw, sh);
  } else {
    const scale = Math.min(1, limit / Math.max(iw, ih));
    canvas.width = Math.max(1, Math.round(iw * scale));
    canvas.height = Math.max(1, Math.round(ih * scale));
    const ctx = canvas.getContext('2d', { alpha: targetMime !== 'image/jpeg' });
    if (!ctx) throw new Error('canvas context unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  }

  const output = compressToLimit(canvas, {
    mime: targetMime,
    quality,
    maxBytes: Math.max(32_000, Math.trunc(Number(maxBytes || 0)) || 1_200_000),
    minQuality: usage === 'avatar' ? 0.5 : 0.42,
  }) || raw;

  return {
    dataUrl: output,
    width: Number(canvas.width || 0) || 0,
    height: Number(canvas.height || 0) || 0,
    mime: inferDataUrlMime(output, targetMime),
    bytes: estimateDataUrlBytes(output),
    transformed: output !== raw,
  };
};

export const __imageTransformUtilsInternals = {
  estimateDataUrlBytes,
  inferDataUrlMime,
};
