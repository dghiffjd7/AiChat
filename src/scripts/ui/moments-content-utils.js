import { resolveMediaAsset, isLikelyUrl, isAssetRef } from '../utils/media-assets.js';

export const escapeMomentHtml = (value) =>
  String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));

export const normalizeMomentInlineBreaks = (value) => String(value ?? '')
  .replace(/&lt;br\s*\/?&gt;/gi, '\n')
  .replace(/<br\s*\/?>/gi, '\n');

export const normalizeMomentRegexMode = (mode, fallback = 'output') => {
  const raw = String(mode || '').trim().toLowerCase();
  if (raw === 'input') return 'input';
  if (raw === 'output') return 'output';
  return String(fallback || '').trim().toLowerCase() === 'input' ? 'input' : 'output';
};

const resolveMomentDirectMediaUrl = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const convert =
      g?.__TAURI__?.core?.convertFileSrc || g?.__TAURI__?.convertFileSrc || g?.__TAURI_INTERNALS__?.convertFileSrc;
    if (typeof convert === 'function' && (/^[a-zA-Z]:[\\/]/.test(raw) || raw.startsWith('/'))) {
      const converted = convert(raw);
      if (converted) return converted;
    }
  } catch {}
  if (/^(file|asset|tauri|app|https?|data|blob):/i.test(raw)) return raw;
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return `file:///${raw.replace(/\\/g, '/')}`;
  if (raw.startsWith('/')) return `file://${raw}`;
  return raw;
};

export const applyMomentStoredRegex = (raw = '', { regexMode = 'output' } = {}) => {
  const text = String(raw ?? '');
  try {
    const bridge = window.appBridge;
    const mode = normalizeMomentRegexMode(regexMode);
    if (mode === 'input' && typeof bridge?.applyInputStoredRegex === 'function') {
      return bridge.applyInputStoredRegex(text, { isEdit: false, depth: 0 });
    }
    if (typeof bridge?.applyOutputStoredRegex === 'function') {
      return bridge.applyOutputStoredRegex(text, { isEdit: false, depth: 0 });
    }
  } catch {}
  return text;
};

export const applyMomentDisplayRegex = (raw = '', { regexMode = 'output' } = {}) => {
  const text = String(raw ?? '');
  try {
    const bridge = window.appBridge;
    const mode = normalizeMomentRegexMode(regexMode);
    if (mode === 'input' && typeof bridge?.applyInputDisplayRegex === 'function') {
      return bridge.applyInputDisplayRegex(text, { isEdit: false, depth: 0 });
    }
    if (typeof bridge?.applyOutputDisplayRegex === 'function') {
      return bridge.applyOutputDisplayRegex(text, { isEdit: false, depth: 0 });
    }
  } catch {}
  return text;
};

export const resolveMomentDisplayText = (record, { fallbackMode = 'output' } = {}) => {
  const fallback = fallbackMode === 'input'
    ? 'input'
    : String(record?.author || '').trim() === '我'
      ? 'input'
      : 'output';
  return applyMomentDisplayRegex(String(record?.content ?? ''), {
    regexMode: normalizeMomentRegexMode(record?.regexMode, fallback),
  });
};

export const renderMomentTextWithStickers = (raw = '') => {
  const input = normalizeMomentInlineBreaks(raw);
  if (!input) return '';
  const tokenRe = /\[(bqb|img-error)-([\s\S]+?)\]/gi;
  let output = '';
  let lastIndex = 0;

  const appendText = (text) => {
    if (!text) return;
    output += escapeMomentHtml(text).replace(/\n/g, '<br>');
  };

  const appendSticker = (payload, fallback) => {
    const resolved = resolveMediaAsset('sticker', payload);
    const url = resolved?.url || '';
    if (!url) {
      appendText(fallback);
      return;
    }
    if (output && !output.endsWith('<br>')) output += '<br>';
    output += `<span class="moment-sticker-wrap"><img class="moment-sticker" src="${escapeMomentHtml(url)}" alt="${escapeMomentHtml(payload)}"></span>`;
    output += '<br>';
  };

  const appendImageError = (payload) => {
    let data = null;
    try {
      const parsed = JSON.parse(decodeURIComponent(String(payload || '')));
      if (parsed && typeof parsed === 'object') data = parsed;
    } catch {}
    const brief = String(data?.brief || '图片生成失败').trim();
    const detail = String(data?.detail || brief).trim();
    output += `<details class="moment-media-error"><summary>${escapeMomentHtml(`图片生成失败：${brief}`)}</summary><pre>${escapeMomentHtml(detail)}</pre></details>`;
  };

  let match;
  while ((match = tokenRe.exec(input))) {
    appendText(input.slice(lastIndex, match.index));
    const type = String(match[1] || '').toLowerCase();
    const payload = String(match[2] || '').trim();
    if (type === 'img-error') appendImageError(payload);
    else if (payload) appendSticker(payload, match[0]);
    else appendText(match[0]);
    lastIndex = tokenRe.lastIndex;
  }
  appendText(input.slice(lastIndex));
  return output;
};

export const extractMomentMedia = (raw = '') => {
  const text = normalizeMomentInlineBreaks(raw);
  const images = [];
  const audios = [];
  const tokenRe = /\[(img|yy)-([\s\S]+?)\]|<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let output = '';
  let lastIndex = 0;

  const pushImage = (payload, kind = 'image') => {
    const resolved = resolveMediaAsset(kind, payload) || resolveMediaAsset('image', payload);
    const url = resolved?.url
      ? resolveMomentDirectMediaUrl(resolved.url)
      : (isLikelyUrl(payload) ? resolveMomentDirectMediaUrl(payload) : '');
    if (!url) return false;
    images.push({ url, label: String(payload || '').trim() });
    return true;
  };

  const pushAudio = (payload) => {
    const resolved = resolveMediaAsset('audio', payload);
    const url = resolved?.url || (isLikelyUrl(payload) ? payload : '');
    if (!url) return false;
    audios.push({ url, label: String(payload || '').trim() });
    return true;
  };

  let match;
  while ((match = tokenRe.exec(text))) {
    output += text.slice(lastIndex, match.index);
    lastIndex = tokenRe.lastIndex;
    if (match[3]) {
      const ok = pushImage(match[3], 'image');
      if (!ok) output += match[0];
      continue;
    }
    const type = String(match[1] || '').toLowerCase();
    const payload = String(match[2] || '').trim();
    if (!payload) {
      output += match[0];
      continue;
    }
    if (type === 'yy') {
      const ok = pushAudio(payload);
      if (!ok) output += match[0];
      continue;
    }
    const ok = pushImage(payload, 'image');
    if (!ok) output += match[0];
  }
  output += text.slice(lastIndex);

  const stripEmptyWrappers = (input = '') => {
    let next = String(input ?? '');
    let prev = '';
    while (next !== prev) {
      prev = next;
      next = next
        .replace(/<\s*(div|p|span|figure|center)\b[^>]*>\s*<\/\s*\1\s*>/gi, '')
        .replace(/\n{3,}/g, '\n\n');
    }
    return next.trim();
  };
  output = stripEmptyWrappers(output);

  const trimmed = output.trim();
  if (trimmed && (isAssetRef(trimmed) || isLikelyUrl(trimmed))) {
    const image = resolveMediaAsset('image', trimmed);
    const imageUrl = image?.url ? resolveMomentDirectMediaUrl(image.url) : '';
    if (imageUrl) {
      images.push({ url: imageUrl, label: trimmed });
      output = '';
    } else {
      const audio = resolveMediaAsset('audio', trimmed);
      if (audio?.url) {
        audios.push({ url: audio.url, label: trimmed });
        output = '';
      }
    }
  }

  return { text: output, images, audios };
};
