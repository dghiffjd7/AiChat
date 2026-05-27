const CONTENT_TAG_RE = /<\s*\/?\s*content\b[^>]*(?:>|$)/gi;
const ESCAPED_CONTENT_TAG_RE = /&lt;\s*\/?\s*content\b[\s\S]*?(?:&gt;|$)/gi;
const TRAILING_PARTIAL_CONTENT_TAG_RE = /<\s*\/?\s*c(?:o(?:n(?:t(?:e(?:n(?:t\b[^>]*)?)?)?)?)?)?$/i;
const CONTENT_TAG_TEST_RE = /<\s*\/?\s*content\b[^>]*(?:>|$)/i;

const normalizeComparableText = (value = '') => (
  String(value ?? '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
);

export const hideCreativeContentTagsForDisplay = (value = '') => {
  const text = String(value ?? '');
  if (!text.includes('<') && !text.includes('&lt;')) return text;
  return text
    .replace(CONTENT_TAG_RE, '')
    .replace(ESCAPED_CONTENT_TAG_RE, '')
    .replace(TRAILING_PARTIAL_CONTENT_TAG_RE, '');
};

export const hasCreativeContentTag = (value = '') => CONTENT_TAG_TEST_RE.test(String(value ?? ''));

export const resolveCreativeRichRenderSource = (message = {}, fallbackContent = undefined) => {
  const display = String(fallbackContent ?? message?.content ?? '');
  const candidates = [
    message?.rawSource,
    message?.raw_source,
    message?.rawOriginal,
    message?.raw,
  ]
    .map(value => (typeof value === 'string' ? value : ''))
    .filter(Boolean);
  const taggedSource = candidates.find(value => hasCreativeContentTag(value));
  if (!taggedSource || hasCreativeContentTag(display)) return display;
  const hiddenSource = hideCreativeContentTagsForDisplay(taggedSource);
  if (!normalizeComparableText(display) || normalizeComparableText(hiddenSource) === normalizeComparableText(display)) {
    return taggedSource;
  }
  return display;
};
