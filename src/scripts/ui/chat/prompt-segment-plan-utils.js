export const PROMPT_SEGMENT_ANCHORS = Object.freeze({
  BEFORE_LATEST_USER: 'before_latest_user',
  AFTER_LATEST_USER: 'after_latest_user',
});

const ANCHOR_RANK = Object.freeze({
  [PROMPT_SEGMENT_ANCHORS.BEFORE_LATEST_USER]: 0,
  [PROMPT_SEGMENT_ANCHORS.AFTER_LATEST_USER]: 1,
});

export const normalizePromptSegmentAnchor = (value, fallback = PROMPT_SEGMENT_ANCHORS.AFTER_LATEST_USER) => {
  const token = String(value || '').trim().toLowerCase();
  if (token === PROMPT_SEGMENT_ANCHORS.BEFORE_LATEST_USER) return PROMPT_SEGMENT_ANCHORS.BEFORE_LATEST_USER;
  if (token === PROMPT_SEGMENT_ANCHORS.AFTER_LATEST_USER) return PROMPT_SEGMENT_ANCHORS.AFTER_LATEST_USER;
  return fallback === PROMPT_SEGMENT_ANCHORS.BEFORE_LATEST_USER
    ? PROMPT_SEGMENT_ANCHORS.BEFORE_LATEST_USER
    : PROMPT_SEGMENT_ANCHORS.AFTER_LATEST_USER;
};

const numberOr = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

export const sortPromptSegments = (segments = []) => {
  const list = Array.isArray(segments) ? [...segments] : [];
  return list.sort((a, b) => {
    const ar = ANCHOR_RANK[normalizePromptSegmentAnchor(a?.anchor)] ?? 999;
    const br = ANCHOR_RANK[normalizePromptSegmentAnchor(b?.anchor)] ?? 999;
    if (ar !== br) return ar - br;
    const ao = numberOr(a?.order, 0);
    const bo = numberOr(b?.order, 0);
    if (ao !== bo) return ao - bo;
    return numberOr(a?.seq, 0) - numberOr(b?.seq, 0);
  });
};

export const toPromptSegment = (msg, {
  fallbackAnchor = PROMPT_SEGMENT_ANCHORS.AFTER_LATEST_USER,
  fallbackOrder = 0,
  fallbackSeq = 0,
} = {}) => {
  if (!msg || typeof msg !== 'object') return null;
  const content = msg.content;
  if (content == null || String(content).trim() === '') return null;
  const anchor = normalizePromptSegmentAnchor(
    msg.promptAnchor || msg.anchor || msg._anchor || msg.latestUserAnchor,
    fallbackAnchor,
  );
  return {
    role: msg.role || 'system',
    content,
    anchor,
    order: numberOr(msg.promptOrder ?? msg.order ?? msg._order, fallbackOrder),
    seq: numberOr(msg.promptSeq ?? msg.seq ?? msg._seq, fallbackSeq),
    source: String(msg.promptSource || msg.source || '').trim(),
  };
};

export const splitDepthPromptMessagesForLatest = (depthMessages = [], {
  hasPendingLatest = false,
  defaultDepthZeroAnchor = PROMPT_SEGMENT_ANCHORS.AFTER_LATEST_USER,
} = {}) => {
  const historyMessages = [];
  const beforeLatestMessages = [];
  const afterLatestMessages = [];
  const list = Array.isArray(depthMessages) ? depthMessages : [];
  list.forEach((msg, idx) => {
    if (!msg) return;
    const rawDepth = Math.max(0, Math.trunc(Number(msg.depth || 0)));
    const normalized = {
      ...msg,
      depth: rawDepth,
      _seq: Number.isFinite(Number(msg._seq)) ? Number(msg._seq) : idx,
    };
    if (hasPendingLatest && rawDepth === 0) {
      const segment = toPromptSegment(normalized, {
        fallbackAnchor: defaultDepthZeroAnchor,
        fallbackSeq: idx,
      });
      if (!segment) return;
      if (segment.anchor === PROMPT_SEGMENT_ANCHORS.BEFORE_LATEST_USER) {
        beforeLatestMessages.push(segment);
      } else {
        afterLatestMessages.push(segment);
      }
      return;
    }
    historyMessages.push({
      ...normalized,
      depth: hasPendingLatest ? Math.max(0, rawDepth - 1) : rawDepth,
    });
  });
  return {
    historyMessages,
    beforeLatestMessages: sortPromptSegments(beforeLatestMessages),
    afterLatestMessages: sortPromptSegments(afterLatestMessages),
  };
};
