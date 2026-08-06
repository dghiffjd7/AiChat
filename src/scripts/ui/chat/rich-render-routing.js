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

export const RICH_SCRIPT_EXECUTION_REQUIRED_EVENT = 'rich-script-execution-required';

const INTERACTIVE_HTML_RE = /<!doctype\s+html|<(script|iframe|html|body)\b/i;
const INTERACTIVE_ESCAPED_HTML_RE = /&lt;!doctype\s+html|&lt;(script|iframe|html|body)\b/i;
const HTML_DOC_RE = /<body[\s>]/i;
const HTML_DOC_CLOSE_RE = /<\/body>/i;
const HTML_LANG_RE = /^(html|htm)$/i;
const HTML_SNIPPET_RE = /<\/(style|div|details|main|section|article|table|ul|ol|p|span|pre|code)>/i;
const STYLE_OPEN_RE = /<style[\s>]/i;
const DETAILS_OPEN_RE = /<details[\s>]/i;
const DIV_OPEN_RE = /<div[\s>]/i;
const EMPTY_MOUNT_SHELL_RE = /<(?:div|main|section)[^>]+id=["'](?:app|root|__next|__nuxt|status|mount|container)[^"']*["'][^>]*>\s*<\/(?:div|main|section)>/i;
const RENDERABLE_STATIC_MARKUP_RE = /<(?:img|svg|table|details|pre|code|p|li|h[1-6]|article|section|main|canvas|video|audio|button|input|select|textarea)\b/i;
const BODY_LOADER_RE = /(?:\$|jQuery)\s*\(\s*["']body["']\s*\)\s*\.load\s*\(/i;
const FRAMEWORK_MOUNT_RE = /\b(?:createApp|createRoot)\s*\(|\bReactDOM(?:Client)?\b|\.mount\s*\(\s*["']?#/i;
const DOM_MOUNT_RE = /\bdocument\.(?:write|writeln)\s*\(|(?:document\.body|querySelector\s*\([^)]*\)|getElementById\s*\([^)]*\))\s*\.\s*(?:innerHTML|outerHTML|textContent)\s*=|\.appendChild\s*\(/i;
const INLINE_SCRIPT_ATTRIBUTE_RE = /\son[a-z][\w:-]*\s*=|\bjavascript\s*:/i;

const stripScriptAndStyleMarkup = (input = '') => String(input ?? '')
  .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
  .replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');

const readVisibleStaticText = (input = '') => stripScriptAndStyleMarkup(input)
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const hasExecutableScriptTag = (input = '') => {
  const raw = String(input ?? '');
  for (const match of raw.matchAll(/<script\b([^>]*)>[\s\S]*?<\/script\s*>/gi)) {
    const attrs = String(match?.[1] || '');
    const typeMatch = attrs.match(/\btype\s*=\s*(?:["']([^"']+)["']|([^\s>]+))/i);
    const type = String(typeMatch?.[1] || typeMatch?.[2] || '').trim().toLowerCase();
    if (!type) return true;
    if (
      type === 'application/json'
      || type === 'application/ld+json'
      || type === 'importmap'
      || type === 'speculationrules'
      || type === 'text/template'
      || type === 'text/x-template'
    ) continue;
    return true;
  }
  return false;
};

export const isLikelyBlankRichStaticDocument = (input = '') => {
  const raw = String(input ?? '');
  if (!raw.trim()) return true;
  const staticMarkup = stripScriptAndStyleMarkup(raw);
  const visibleText = readVisibleStaticText(raw);
  const hasRenderableMarkup = RENDERABLE_STATIC_MARKUP_RE.test(staticMarkup);
  if (EMPTY_MOUNT_SHELL_RE.test(staticMarkup) && !hasRenderableMarkup && visibleText.length < 12) return true;
  return !hasRenderableMarkup && visibleText.length === 0;
};

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

export const detectRichScriptExecutionRequirement = ({
  lang = 'html',
  code,
  allowScripts = false,
  route = null,
} = {}) => {
  const rawCode = String(code ?? '');
  const renderRoute = route || detectRichCodeBlockRoute({ lang, code: rawCode, allowScripts });
  const hasScriptTag = hasExecutableScriptTag(rawCode);
  const hasInlineScript = INLINE_SCRIPT_ATTRIBUTE_RE.test(rawCode);
  const hasExecutableScript = hasScriptTag || hasInlineScript;
  const blocked = (
    allowScripts !== true
    && renderRoute?.level === RICH_RENDER_LEVELS.SANDBOX
    && renderRoute?.execution === RICH_RENDER_EXECUTION.PREVIEW
    && hasExecutableScript
  );
  const hasBodyLoader = hasScriptTag && BODY_LOADER_RE.test(rawCode);
  const hasFrameworkMount = hasScriptTag && FRAMEWORK_MOUNT_RE.test(rawCode);
  const hasDomMount = hasScriptTag && DOM_MOUNT_RE.test(rawCode);
  const hasEmptyMountShell = EMPTY_MOUNT_SHELL_RE.test(stripScriptAndStyleMarkup(rawCode));
  const staticDocumentBlank = isLikelyBlankRichStaticDocument(rawCode);

  let reason = '';
  if (blocked && hasBodyLoader) reason = 'body-loader';
  else if (blocked && hasFrameworkMount) reason = 'framework-mount';
  else if (blocked && hasDomMount && staticDocumentBlank) reason = 'script-dom-mount';
  else if (blocked && hasEmptyMountShell) reason = 'empty-mount-shell';
  else if (blocked && staticDocumentBlank) reason = 'empty-static-document';

  return {
    required: Boolean(reason),
    blocked,
    reason,
    hasExecutableScript,
    hasScriptTag,
    hasInlineScript,
    hasBodyLoader,
    hasFrameworkMount,
    hasDomMount,
    hasEmptyMountShell,
    staticDocumentBlank,
    level: renderRoute?.level || RICH_RENDER_LEVELS.SAFE,
    execution: renderRoute?.execution || RICH_RENDER_EXECUTION.NONE,
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
