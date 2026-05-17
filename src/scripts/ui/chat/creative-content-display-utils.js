const CONTENT_TAG_RE = /<\s*\/?\s*content\b[^>]*(?:>|$)/gi;
const TRAILING_PARTIAL_CONTENT_TAG_RE = /<\s*\/?\s*c(?:o(?:n(?:t(?:e(?:n(?:t\b[^>]*)?)?)?)?)?)?$/i;

export const hideCreativeContentTagsForDisplay = (value = '') => {
  const text = String(value ?? '');
  if (!text.includes('<')) return text;
  return text
    .replace(CONTENT_TAG_RE, '')
    .replace(TRAILING_PARTIAL_CONTENT_TAG_RE, '');
};
