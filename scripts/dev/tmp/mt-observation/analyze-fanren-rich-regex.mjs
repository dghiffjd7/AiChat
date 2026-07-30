import fs from 'node:fs';

const cardPath = process.argv[2];
if (!cardPath) {
  throw new Error('usage: node analyze-fanren-rich-regex.mjs <card-json>');
}

const card = JSON.parse(fs.readFileSync(cardPath, 'utf8'));
const rules = Array.isArray(card?.data?.extensions?.regex_scripts)
  ? card.data.extensions.regex_scripts
  : [];
const rule = rules.find((entry) => (
  entry
  && entry.disabled !== true
  && entry.markdownOnly === true
  && String(entry.replaceString || '').length > 100_000
));
if (!rule) {
  throw new Error('large enabled markdown regex not found');
}

const html = String(rule.replaceString || '');
const count = pattern => (html.match(pattern) || []).length;
const collect = pattern => Array.from(html.matchAll(pattern), match => String(match[1] || '').trim());
const snippets = (needle, radius = 120, limit = 12) => {
  const out = [];
  let cursor = 0;
  while (out.length < limit) {
    const index = html.indexOf(needle, cursor);
    if (index < 0) break;
    out.push(
      html
        .slice(Math.max(0, index - radius), Math.min(html.length, index + needle.length + radius))
        .replace(/\s+/g, ' '),
    );
    cursor = index + needle.length;
  }
  return out;
};

const report = {
  id: String(rule.id || ''),
  name: String(rule.scriptName || ''),
  findRegex: String(rule.findRegex || ''),
  replacementChars: html.length,
  htmlTagsApprox: count(/<([a-z][\w:-]*)\b/gi),
  scriptTags: count(/<script\b/gi),
  inlineScriptChars: collect(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)
    .map(value => value.length),
  externalScripts: collect(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi),
  styleTags: count(/<style\b/gi),
  styleChars: collect(/<style\b[^>]*>([\s\S]*?)<\/style>/gi).map(value => value.length),
  dataImages: count(/data:image\//gi),
  dataImageCharsApprox: collect(/(data:image\/[^"'()\s<>]+)/gi)
    .reduce((sum, value) => sum + value.length, 0),
  setInterval: count(/\bsetInterval\s*\(/g),
  setTimeout: count(/\bsetTimeout\s*\(/g),
  requestAnimationFrame: count(/\brequestAnimationFrame\s*\(/g),
  mutationObserver: count(/\bMutationObserver\b/g),
  resizeObserver: count(/\bResizeObserver\b/g),
  whileLoops: count(/\bwhile\s*\(/g),
  forLoops: count(/\bfor\s*\(/g),
  eventListeners: count(/\baddEventListener\s*\(/g),
  intervals: snippets('setInterval'),
  animationFrames: snippets('requestAnimationFrame'),
  whileSnippets: snippets('while'),
  domContentLoaded: snippets('DOMContentLoaded', 220, 16),
  windowOnload: snippets('window.onload', 220, 8),
  documentReady: snippets('document.ready', 220, 8),
  scriptTails: collect(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi)
    .map(value => value.slice(-1200).replace(/\s+/g, ' ')),
};

console.log(JSON.stringify(report, null, 2));
