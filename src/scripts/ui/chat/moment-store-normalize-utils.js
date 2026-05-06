import { applyOutputStoredRegexSafe } from './output-regex-utils.js';

const normalizeRegexMode = (regexMode = 'output') =>
  String(regexMode || '').trim().toLowerCase() === 'input' ? 'input' : 'output';

export const normalizeMomentStoredText = (
  text,
  {
    regexMode = 'output',
    depth = 0,
    appBridge = typeof window !== 'undefined' ? window.appBridge : null,
  } = {},
) => {
  const source = String(text ?? '');
  const mode = normalizeRegexMode(regexMode);
  try {
    if (mode === 'input' && typeof appBridge?.applyInputStoredRegex === 'function') {
      return appBridge.applyInputStoredRegex(source, { isEdit: false, depth });
    }
    return applyOutputStoredRegexSafe(source, { appBridge, depth, isEdit: false });
  } catch {
    return source;
  }
};

export const normalizeMomentCommentForStore = (
  comment,
  {
    regexMode = 'output',
    depth = 0,
    appBridge = typeof window !== 'undefined' ? window.appBridge : null,
  } = {},
) => {
  if (!comment || typeof comment !== 'object') return comment;
  const mode = normalizeRegexMode(regexMode);
  return {
    ...(comment || {}),
    content: normalizeMomentStoredText(comment?.content, { regexMode: mode, depth, appBridge }),
    regexMode: mode,
  };
};

export const normalizeMomentCommentsForStore = (
  comments = [],
  {
    regexMode = 'output',
    depth = 0,
    appBridge = typeof window !== 'undefined' ? window.appBridge : null,
  } = {},
) => (Array.isArray(comments) ? comments : []).map(comment =>
  normalizeMomentCommentForStore(comment, { regexMode, depth, appBridge }),
);

export const normalizeMomentRecordForStore = (
  moment,
  {
    regexMode = 'output',
    depth = 0,
    appBridge = typeof window !== 'undefined' ? window.appBridge : null,
  } = {},
) => {
  if (!moment || typeof moment !== 'object') return moment;
  const mode = normalizeRegexMode(regexMode);
  return {
    ...(moment || {}),
    content: normalizeMomentStoredText(moment?.content, { regexMode: mode, depth, appBridge }),
    comments: normalizeMomentCommentsForStore(moment?.comments, { regexMode: mode, depth, appBridge }),
    regexMode: mode,
  };
};
