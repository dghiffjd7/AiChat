import { stripAutoImagePromptTags } from './auto-image-prompt-utils.js';

export const sanitizeThinkingForProtocolParse = (text) => {
  const raw = String(text ?? '');
  // More tolerant fallback: if model echoed "<content>" inside (possibly unclosed) thinking,
  // we drop everything before the last </thinking> or </think> then parse the remaining tail once.
  const lower = raw.toLowerCase();
  const closeThinking = '</thinking>';
  const closeThink = '</think>';
  const i1 = lower.lastIndexOf(closeThinking);
  const i2 = lower.lastIndexOf(closeThink);
  const idx = Math.max(i1, i2);
  if (idx === -1) return raw;
  const cut = idx + (idx === i1 ? closeThinking.length : closeThink.length);
  return raw.slice(cut);
};

export const normalizeMiPhoneMarkers = (text) => {
  const raw = String(text ?? '');
  if (!raw) return raw;
  return raw
    .replace(/&lt;\s*\/?\s*MiPhone_(start|end)\s*\/?\s*&gt;/gi, (_match, token) => `MiPhone_${token}`)
    .replace(/<\s*\/?\s*MiPhone_(start|end)\s*\/?\s*>/gi, (_match, token) => `MiPhone_${token}`);
};

export const extractMiPhoneBlock = (text) => {
  const raw = String(text ?? '');
  const startRe = /<\s*MiPhone_start\s*>|MiPhone_start/i;
  const endRe = /<\s*MiPhone_end\s*>|MiPhone_end/i;
  const start = startRe.exec(raw);
  if (!start) return '';
  const afterStart = raw.slice(start.index + start[0].length);
  const end = endRe.exec(afterStart);
  if (!end) return raw.slice(start.index);
  const endIdx = start.index + start[0].length + end.index + end[0].length;
  return raw.slice(start.index, endIdx);
};

export const buildProtocolRetryCandidates = (text) => {
  const retryText = sanitizeThinkingForProtocolParse(text);
  const miPhoneText = normalizeMiPhoneMarkers(retryText);
  const miPhoneBlock = extractMiPhoneBlock(miPhoneText);
  return {
    retryText,
    miPhoneText,
    miPhoneBlock,
  };
};

export const normalizeProtocolChatMessage = (
  message,
  { normalizeSpeaker = value => String(value || '').trim() } = {},
) => ({
  speaker: typeof normalizeSpeaker === 'function'
    ? normalizeSpeaker(message?.speaker)
    : String(message?.speaker || '').trim(),
  rawContent: String(message?.content || '').replace(/<br\s*\/?>/gi, '\n'),
  content: stripAutoImagePromptTags(String(message?.content || '').replace(/<br\s*\/?>/gi, '\n')),
  time: String(message?.time || '').trim(),
});

export const buildProtocolSystemMetaMessage = ({
  content = '',
  time = '',
  fallbackTime = '',
  name = '系统',
  sanitizeContent = value => String(value ?? ''),
} = {}) => ({
  role: 'system',
  type: 'meta',
  content: typeof sanitizeContent === 'function'
    ? sanitizeContent(content)
    : String(content ?? ''),
  name: String(name || '系统'),
  time: String(time || fallbackTime || '').trim(),
});
