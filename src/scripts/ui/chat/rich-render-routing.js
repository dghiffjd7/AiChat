export const RICH_RENDER_LEVELS = Object.freeze({
  SAFE: 'level0',
  CARD: 'level1',
  SANDBOX: 'level2',
});

export const RICH_RENDER_EXECUTION = Object.freeze({
  NONE: 'none',
  PREVIEW: 'preview',
  EXECUTE: 'execute',
});

const INTERACTIVE_HTML_RE = /<!doctype\s+html|<(script|iframe|html|body)\b/i;
const INTERACTIVE_ESCAPED_HTML_RE = /&lt;!doctype\s+html|&lt;(script|iframe|html|body)\b/i;
const HTML_DOC_RE = /<body[\s>]/i;
const HTML_DOC_CLOSE_RE = /<\/body>/i;
const HTML_LANG_RE = /^(html|htm)$/i;
const HTML_SNIPPET_RE = /<\/(style|div|details|main|section|article|table|ul|ol|p|span|pre|code)>/i;
const STYLE_OPEN_RE = /<style[\s>]/i;
const DETAILS_OPEN_RE = /<details[\s>]/i;
const DIV_OPEN_RE = /<div[\s>]/i;

export const hasInteractiveHtmlRouteHint = (input) => {
  const raw = String(input ?? '');
  return Boolean(raw) && (INTERACTIVE_HTML_RE.test(raw) || INTERACTIVE_ESCAPED_HTML_RE.test(raw));
};

export const detectRichCodeBlockRoute = ({ lang, code, allowScripts = false } = {}) => {
  const rawLang = String(lang || '').trim().toLowerCase();
  const rawCode = String(code ?? '');
  const looksLikeHtmlDoc = HTML_DOC_RE.test(rawCode) && HTML_DOC_CLOSE_RE.test(rawCode);
  const isHtmlLang = HTML_LANG_RE.test(rawLang);
  const looksLikeHtmlSnippet = HTML_SNIPPET_RE.test(rawCode) ||
    STYLE_OPEN_RE.test(rawCode) ||
    DETAILS_OPEN_RE.test(rawCode) ||
    DIV_OPEN_RE.test(rawCode);
  const shouldRenderHtml = looksLikeHtmlDoc || isHtmlLang || looksLikeHtmlSnippet;
  const hasInteractiveHtml = hasInteractiveHtmlRouteHint(rawCode);
  const shouldRenderScopedFragment = shouldRenderHtml && !hasInteractiveHtml && !looksLikeHtmlDoc;
  const level = !shouldRenderHtml
    ? RICH_RENDER_LEVELS.SAFE
    : shouldRenderScopedFragment
      ? RICH_RENDER_LEVELS.CARD
      : RICH_RENDER_LEVELS.SANDBOX;
  const execution = level !== RICH_RENDER_LEVELS.SANDBOX
    ? RICH_RENDER_EXECUTION.NONE
    : allowScripts
      ? RICH_RENDER_EXECUTION.EXECUTE
      : RICH_RENDER_EXECUTION.PREVIEW;

  return {
    lang: rawLang,
    code: rawCode,
    level,
    execution,
    looksLikeHtmlDoc,
    isHtmlLang,
    looksLikeHtmlSnippet,
    shouldRenderHtml,
    hasInteractiveHtml,
    shouldRenderScopedFragment,
  };
};

export const detectPlainTextRichRoute = (input) => {
  const raw = String(input ?? '');
  return {
    text: raw,
    level: hasInteractiveHtmlRouteHint(raw) ? RICH_RENDER_LEVELS.SAFE : RICH_RENDER_LEVELS.CARD,
    hasInteractiveHtml: hasInteractiveHtmlRouteHint(raw),
  };
};
