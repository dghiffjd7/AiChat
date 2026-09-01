import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '../..');
const UI_ROOT = path.join(PROJECT_ROOT, 'src/scripts/ui');
const MANUAL_SOURCE_FILE = path.join(PROJECT_ROOT, 'scripts/i18n/manual-ui-source-keys.json');
const EXTRA_UI_FILES = [
  path.join(PROJECT_ROOT, 'src/scripts/agent/agent-feature-settings.js'),
  path.join(PROJECT_ROOT, 'src/scripts/variables/variable-templates.js'),
];
const FULL_UI_DEFINITION_FILES = new Set([
  path.join(PROJECT_ROOT, 'src/scripts/agent/agent-feature-settings.js'),
  path.join(UI_ROOT, 'agent-center-card-catalog.js'),
]);
const HAN_RE = /\p{Script=Han}/u;

const EXCLUDED_FILE_PATTERNS = [
  /\/vendor\//,
  /theme-dark-batch-audit\.js$/,
];

const PROTOCOL_ONLY_PATTERNS = [
  /^<\/?(?:群聊|私聊|content|tableEdit|image_prompt)/i,
  /^(?:moment_reply_start|moment_start|MiPhone_start|msg_start|reply_to::)$/i,
];

const normalizeCandidate = (value = '') => String(value || '')
  .replace(/\\n/g, '\n')
  .replace(/\\r/g, '\r')
  .replace(/\\t/g, '\t')
  .replace(/\\([\\'"`])/g, '$1')
  .trim();

const isUiCandidate = (value = '') => {
  const text = normalizeCandidate(value);
  if (!text || !HAN_RE.test(text)) return false;
  if (text.length > 240 || text.split('\n').length > 4) return false;
  if (text.includes('${')) return false;
  if (PROTOCOL_ONLY_PATTERNS.some(pattern => pattern.test(text))) return false;
  return true;
};

const addMatch = (map, value, file, kind) => {
  const normalized = normalizeCandidate(value);
  const text = kind === 'html-text' ? normalized.replace(/\s+/g, ' ').trim() : normalized;
  if (!isUiCandidate(text)) return;
  if (!map.has(text)) map.set(text, { source: text, references: [] });
  const entry = map.get(text);
  const ref = `${path.relative(PROJECT_ROOT, file).replace(/\\/g, '/')}#${kind}`;
  if (!entry.references.includes(ref)) entry.references.push(ref);
};

const collectMatches = (map, source, file, regex, groupIndex, kind) => {
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(source))) addMatch(map, match[groupIndex], file, kind);
};

const extractFromSource = (source, file, map) => {
  collectMatches(
    map,
    source,
    file,
    />([\t\r\n ]*[^<>{}`;=]*\p{Script=Han}[^<>{}`;=]*?)[\t\r\n ]*<(?=[!/A-Za-z])/gu,
    1,
    'html-text',
  );
  collectMatches(
    map,
    source,
    file,
    /(?:aria-label|placeholder|title|data-help)\s*=\s*["']([^"'\n]*\p{Script=Han}[^"'\n]*)["']/gu,
    1,
    'html-attribute',
  );
  collectMatches(
    map,
    source,
    file,
    /(?:textContent|innerText|ariaLabel|placeholder)\s*=\s*(['"])([^\n]*?\p{Script=Han}[^\n]*?)\1/gu,
    2,
    'dom-assignment',
  );
  collectMatches(
    map,
    source,
    file,
    /(?:title|label|description|message|confirmText|cancelText|placeholder|emptyText|helpText|subtitle|statusText)\s*:\s*(['"])([^\n]*?\p{Script=Han}[^\n]*?)\1/gu,
    2,
    'ui-property',
  );
  collectMatches(
    map,
    source,
    file,
    /(?:toastr\?*\.(?:success|error|warning|info)|toastr\[[^\]]+\]|t)(?:\?\.)?\(\s*(['"])([^\n]*?\p{Script=Han}[^\n]*?)\1/gu,
    2,
    'ui-call',
  );
  collectMatches(
    map,
    source,
    file,
    /renderFoldButton\(\s*(['"])[^\n]*?\1\s*,\s*(['"])([^\n]*?\p{Script=Han}[^\n]*?)\2/gu,
    3,
    'fold-label',
  );
  if (FULL_UI_DEFINITION_FILES.has(file)) {
    collectMatches(
      map,
      source,
      file,
      /'([^'\n]*?\p{Script=Han}[^'\n]*?)'/gu,
      1,
      'ui-definition',
    );
    collectMatches(
      map,
      source,
      file,
      /"([^"\n]*?\p{Script=Han}[^"\n]*?)"/gu,
      1,
      'ui-definition',
    );
  }
};

const walkJsFiles = async (root) => {
  const output = [];
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) output.push(...await walkJsFiles(fullPath));
    else if (entry.isFile() && entry.name.endsWith('.js')) output.push(fullPath);
  }
  return output;
};

export const extractUiStrings = async () => {
  const files = [path.join(PROJECT_ROOT, 'src/index.html'), ...await walkJsFiles(UI_ROOT), ...EXTRA_UI_FILES]
    .filter(file => !EXCLUDED_FILE_PATTERNS.some(pattern => pattern.test(file.replace(/\\/g, '/'))));
  const map = new Map();
  for (const file of files) {
    const source = await fs.readFile(file, 'utf8');
    extractFromSource(source, file, map);
  }
  const manualSources = JSON.parse(await fs.readFile(MANUAL_SOURCE_FILE, 'utf8'));
  manualSources.forEach(source => addMatch(map, source, MANUAL_SOURCE_FILE, 'manual'));
  return Array.from(map.values())
    .map(entry => ({ ...entry, references: entry.references.sort() }))
    .sort((a, b) => a.source.localeCompare(b.source, 'zh-Hans-CN'));
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const entries = await extractUiStrings();
  const outputPath = path.join(PROJECT_ROOT, 'scripts/i18n/ui-source-catalog.json');
  await fs.writeFile(outputPath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');
  console.log(`i18n extract: ${entries.length} UI strings -> ${path.relative(PROJECT_ROOT, outputPath)}`);
}
