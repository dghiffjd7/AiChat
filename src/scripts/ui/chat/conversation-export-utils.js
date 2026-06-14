import { pickSavePath as pickNativeSavePath } from '../../utils/save-dialog.js';
import { safeInvoke } from '../../utils/tauri.js';
import { hideCreativeContentTagsForDisplay } from './creative-content-display-utils.js';

const REASONING_KEYS = ['reasoning', 'reasoningDisplay', 'reasoningSource', 'reasoningHidden', 'reasoningLabel'];

const normalizeText = value => String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const escapeMarkdown = value => String(value ?? '').replace(/\\/g, '\\\\').replace(/`/g, '\\`');

const stripBasicHtml = value => String(value ?? '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/p\s*>/gi, '\n\n')
  .replace(/<[^>]+>/g, '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&amp;/gi, '&')
  .replace(/&quot;/gi, '"')
  .replace(/&#39;/g, "'");

const formatDateTime = (value, { fallback = '' } = {}) => {
  const n = Number(value || 0);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  try {
    return new Date(n).toLocaleString();
  } catch {
    return fallback;
  }
};

const getRoleLabel = (message = {}) => {
  if (message.role === 'user') return message.name || '用户';
  if (message.role === 'assistant') return message.name || 'AI';
  if (message.role === 'system') return '系统';
  return message.role || '消息';
};

export const resolveConversationExportMessage = (message = {}) => {
  if (!message || typeof message !== 'object') return {};
  const meta = message.meta && typeof message.meta === 'object' ? message.meta : {};
  const swipes = Array.isArray(meta.swipes) && meta.swipes.length ? meta.swipes : null;
  if (!swipes) return { ...message, meta: { ...meta } };

  const rawIndex = Math.trunc(Number(meta.activeSwipe));
  const active = Number.isFinite(rawIndex) ? Math.min(Math.max(0, rawIndex), swipes.length - 1) : 0;
  const branch = swipes[active] && typeof swipes[active] === 'object' ? swipes[active] : {};
  const nextMeta = { ...meta, activeSwipe: active };
  const branchHasReasoning = REASONING_KEYS.some(key => hasOwn(branch, key));

  if (branchHasReasoning) {
    for (const key of REASONING_KEYS) {
      if (hasOwn(branch, key)) nextMeta[key] = branch[key];
      else delete nextMeta[key];
    }
  } else if (active > 0) {
    for (const key of REASONING_KEYS) delete nextMeta[key];
  }

  const out = {
    ...message,
    content: branch.content !== undefined ? branch.content : message.content,
    meta: nextMeta,
  };
  if (branch.raw !== undefined) out.raw = branch.raw;
  if (branch.rawSource !== undefined) out.rawSource = branch.rawSource;
  if (branch.rawOriginal !== undefined) out.rawOriginal = branch.rawOriginal;
  else if (active > 0) delete out.rawOriginal;
  return out;
};

export const getConversationMessageText = (message = {}, { mode = 'body' } = {}) => {
  const msg = resolveConversationExportMessage(message);
  const isFull = mode === 'full';
  let value = '';
  if (msg.role === 'assistant') {
    value = isFull
      ? (msg.rawOriginal ?? msg.rawSource ?? msg.raw_source ?? msg.raw ?? msg.content ?? '')
      : (msg.content ?? msg.raw ?? '');
    if (!isFull) value = hideCreativeContentTagsForDisplay(stripBasicHtml(value));
  } else if (msg.role === 'user') {
    value = isFull
      ? (msg.rawOriginal ?? msg.rawSource ?? msg.raw_source ?? msg.raw ?? msg.content ?? '')
      : (msg.content ?? msg.raw ?? '');
  } else {
    value = msg.content ?? msg.raw ?? '';
  }
  return normalizeText(value);
};

export const getConversationReasoningText = (message = {}) => {
  const msg = resolveConversationExportMessage(message);
  const meta = msg.meta && typeof msg.meta === 'object' ? msg.meta : {};
  return normalizeText(meta.reasoningDisplay ?? meta.reasoning ?? '');
};

export const formatConversationExport = ({
  messages = [],
  title = '聊天记录',
  sourceLabel = '当前聊天',
  mode = 'body',
  format = 'md',
  exportedAt = new Date(),
} = {}) => {
  const list = Array.isArray(messages) ? messages.filter(Boolean) : [];
  const isFull = mode === 'full';
  const isMarkdown = format === 'md';
  const exportedAtText = exportedAt instanceof Date ? exportedAt.toLocaleString() : String(exportedAt || '');
  const modeLabel = isFull ? '完整' : '正文';

  if (isMarkdown) {
    const lines = [
      `# ${escapeMarkdown(title || '聊天记录')}`,
      '',
      `- 来源：${escapeMarkdown(sourceLabel || '当前聊天')}`,
      `- 导出模式：${modeLabel}`,
      `- 导出时间：${escapeMarkdown(exportedAtText)}`,
      `- 消息数：${list.length}`,
      '',
      '---',
      '',
    ];
    list.forEach((message, index) => {
      const msg = resolveConversationExportMessage(message);
      const role = getRoleLabel(msg);
      const time = msg.time || formatDateTime(msg.timestamp);
      const text = getConversationMessageText(msg, { mode });
      const reasoning = isFull ? getConversationReasoningText(msg) : '';
      lines.push(`## ${index + 1}. ${escapeMarkdown(role)}${time ? ` · ${escapeMarkdown(time)}` : ''}`);
      if (reasoning) {
        lines.push('', '**请求推理**', '', reasoning);
      }
      lines.push('', text || '（空）', '');
    });
    return lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
  }

  const lines = [
    title || '聊天记录',
    `来源：${sourceLabel || '当前聊天'}`,
    `导出模式：${modeLabel}`,
    `导出时间：${exportedAtText}`,
    `消息数：${list.length}`,
    '='.repeat(32),
    '',
  ];
  list.forEach((message, index) => {
    const msg = resolveConversationExportMessage(message);
    const role = getRoleLabel(msg);
    const time = msg.time || formatDateTime(msg.timestamp);
    const text = getConversationMessageText(msg, { mode });
    const reasoning = isFull ? getConversationReasoningText(msg) : '';
    lines.push(`[${index + 1}] ${role}${time ? ` · ${time}` : ''}`);
    if (reasoning) {
      lines.push('', '【请求推理】', reasoning);
    }
    lines.push('', text || '（空）', '', '-'.repeat(32), '');
  });
  return lines.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd() + '\n';
};

const safeFilenamePart = value => String(value || '')
  .trim()
  .replace(/[\\/:*?"<>|]+/g, '_')
  .replace(/\s+/g, '_')
  .replace(/_+/g, '_')
  .slice(0, 72) || 'chat';

export const buildConversationExportFilename = ({
  title = 'chat',
  mode = 'body',
  format = 'md',
  now = new Date(),
} = {}) => {
  const stamp = now instanceof Date
    ? [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('')
    : String(Date.now());
  const ext = format === 'txt' ? 'txt' : 'md';
  const modePart = mode === 'full' ? 'full' : 'body';
  return `${safeFilenamePart(title)}-${modePart}-${stamp}.${ext}`;
};

const bytesToBase64 = (bytes, encodeToBase64 = globalThis.btoa) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return encodeToBase64(binary);
};

export const buildTextDataUrl = (text, {
  mime = 'text/plain',
  TextEncoderRef = globalThis.TextEncoder,
  encodeToBase64 = globalThis.btoa,
} = {}) => {
  const bytes = new TextEncoderRef().encode(String(text || ''));
  return `data:${mime};charset=utf-8;base64,${bytesToBase64(bytes, encodeToBase64)}`;
};

export const exportConversationTextFile = async ({
  text = '',
  filename = '',
  format = 'md',
  globalRef = globalThis,
  navigatorRef = globalThis.navigator,
  documentRef = globalThis.document,
  BlobRef = globalThis.Blob,
  URLRef = globalThis.URL,
  pickSavePath = pickNativeSavePath,
  safeInvokeFn = safeInvoke,
  onSuccess = () => {},
} = {}) => {
  const content = String(text || '');
  if (!content.trim()) return false;
  const ext = format === 'txt' ? 'txt' : 'md';
  const mime = ext === 'md' ? 'text/markdown' : 'text/plain';
  const fileName = filename || `chat.${ext}`;
  const hasTauri = Boolean(globalRef?.__TAURI__ || globalRef?.__TAURI_INTERNALS__ || globalRef?.__TAURI_INVOKE__);
  const isAndroid = /android/i.test(String(navigatorRef?.userAgent || ''));

  if (!hasTauri) {
    const blob = new BlobRef([content], { type: `${mime};charset=utf-8` });
    const url = URLRef.createObjectURL(blob);
    const link = documentRef.createElement('a');
    link.href = url;
    link.download = fileName;
    link.style.display = 'none';
    documentRef.body.appendChild(link);
    link.click();
    link.remove();
    URLRef.revokeObjectURL(url);
    onSuccess?.(`聊天记录已导出：${fileName}`);
    return true;
  }

  let savedPath = '';
  const dataUrl = buildTextDataUrl(content, { mime });
  if (!isAndroid) {
    const pick = await pickSavePath({
      defaultName: fileName,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (pick.cancelled) return false;
    if (!pick.fallback && pick.path) {
      const resp = await safeInvokeFn('export_attachment', { dataUrl, fileName, path: pick.path });
      savedPath = String(resp?.path || pick.path || '').trim();
    }
  }
  if (!savedPath) {
    const resp = await safeInvokeFn('export_attachment', { dataUrl, fileName });
    savedPath = String(resp?.path || '').trim();
  }
  onSuccess?.(`聊天记录已导出：${savedPath || fileName}`);
  return true;
};
