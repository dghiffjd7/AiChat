import { hideCreativeContentTagsForDisplay } from './creative-content-display-utils.js';

const DEFAULT_STREAM_FPS = 18;
const DEFAULT_MIN_CHARS = 6;
const DEFAULT_MAX_WAIT_MS = 220;

const normalizeText = (value) => String(value ?? '');

const countToken = (text, token) => {
  if (!token) return 0;
  const source = String(text ?? '');
  if (!source) return 0;
  if (token.length === 1) {
    let count = 0;
    for (let i = 0; i < source.length; i += 1) {
      if (source[i] === token) count += 1;
    }
    return count;
  }
  let count = 0;
  let index = 0;
  while (index < source.length) {
    const next = source.indexOf(token, index);
    if (next < 0) break;
    count += 1;
    index = next + token.length;
  }
  return count;
};

export const balanceCreativeStreamPreview = (text) => {
  let next = normalizeText(text);
  const balances = [
    { token: '```', separator: '\n' },
    { token: '*', separator: '' },
    { token: '"', separator: '' },
  ];
  for (const { token, separator } of balances) {
    if ((countToken(next, token) % 2) !== 1) continue;
    next = `${next.trimEnd()}${separator}${token}`;
  }
  return next;
};

export class CreativeStreamProcessor {
  constructor(options = {}) {
    this.options = options && typeof options === 'object' ? options : {};
    this.fullText = '';
    this.lastEmitAt = 0;
    this.lastPreviewLength = 0;
    this.lastSnapshot = null;
    this.now = typeof this.options.now === 'function' ? this.options.now : () => Date.now();
    this.frameMs = Math.max(
      16,
      Math.round(1000 / Math.max(1, Number(this.options.fps) || DEFAULT_STREAM_FPS)),
    );
    this.minChars = Math.max(1, Math.trunc(Number(this.options.minChunkChars) || DEFAULT_MIN_CHARS));
    this.maxWaitMs = Math.max(
      this.frameMs,
      Math.trunc(Number(this.options.maxWaitMs) || DEFAULT_MAX_WAIT_MS),
    );
  }

  append(chunk) {
    const nextChunk = normalizeText(chunk);
    if (!nextChunk) return null;
    this.fullText += nextChunk;
    const now = Number(this.now()) || Date.now();
    const sinceLast = now - this.lastEmitAt;
    const deltaChars = this.fullText.length - this.lastPreviewLength;
    if (this.lastEmitAt > 0) {
      if (sinceLast < this.frameMs) return null;
      if (deltaChars < this.minChars && sinceLast < this.maxWaitMs) return null;
    }
    return this.buildSnapshot({ final: false, emittedAt: now });
  }

  finalize() {
    return this.buildSnapshot({ final: true, emittedAt: Number(this.now()) || Date.now() });
  }

  getRawText() {
    return this.fullText;
  }

  buildSnapshot({ final = false, emittedAt = Date.now() } = {}) {
    const sourceRaw = normalizeText(this.fullText);
    const normalize = typeof this.options.normalizeText === 'function'
      ? this.options.normalizeText
      : normalizeText;
    const stripRaw = typeof this.options.stripRaw === 'function'
      ? this.options.stripRaw
      : (value => value);
    const extractReasoning = typeof this.options.extractReasoning === 'function'
      ? this.options.extractReasoning
      : (value => ({ content: value, reasoning: '', reasoningDisplay: '' }));
    const applyStored = typeof this.options.applyStored === 'function'
      ? this.options.applyStored
      : (value => value);
    const applyDisplay = typeof this.options.applyDisplay === 'function'
      ? this.options.applyDisplay
      : (value => value);
    const balancePreview = typeof this.options.balancePreview === 'function'
      ? this.options.balancePreview
      : balanceCreativeStreamPreview;
    const protectRegexSource = typeof this.options.protectRegexSource === 'function'
      ? this.options.protectRegexSource
      : (value => ({ text: value, replacements: [] }));
    const restoreRegexOutput = typeof this.options.restoreRegexOutput === 'function'
      ? this.options.restoreRegexOutput
      : (value => value);

    const strippedRaw = normalize(stripRaw(sourceRaw));
    const reasoningState = extractReasoning(strippedRaw, { final }) || {};
    const contentSource = normalize(reasoningState.content);
    const reasoning = normalize(reasoningState.reasoning);
    const reasoningDisplay = normalize(reasoningState.reasoningDisplay || reasoning);
    const protectedSource = protectRegexSource(contentSource) || { text: contentSource, replacements: [] };

    let stored = String(protectedSource.text ?? contentSource);
    let display = String(protectedSource.text ?? contentSource);
    try {
      stored = normalize(applyStored(protectedSource.text, { final }));
    } catch {}
    try {
      display = normalize(applyDisplay(stored, { final }));
    } catch {}
    stored = normalize(restoreRegexOutput(stored, protectedSource));
    display = normalize(hideCreativeContentTagsForDisplay(restoreRegexOutput(display, protectedSource)));
    if (!final && !display.trim() && contentSource.trim()) {
      stored = contentSource;
      display = hideCreativeContentTagsForDisplay(contentSource);
    }
    if (!final) display = normalize(balancePreview(display));

    const snapshot = {
      raw: sourceRaw,
      strippedRaw,
      contentSource,
      stored,
      display,
      reasoning,
      reasoningDisplay,
      final: Boolean(final),
    };
    this.lastEmitAt = emittedAt;
    this.lastPreviewLength = this.fullText.length;
    this.lastSnapshot = snapshot;
    return snapshot;
  }
}
