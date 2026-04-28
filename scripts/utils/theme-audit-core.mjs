import fs from 'node:fs/promises';
import path from 'node:path';

export const THEME_AUDIT_IGNORE_DIRECTIVE = 'theme-audit-ignore';

const DEFAULT_SCAN_ROOTS = [
  'src/scripts/ui',
  'src/assets/css',
];

const DEFAULT_INCLUDE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.html']);

const DEFAULT_EXCLUDE_PATTERNS = [
  /(^|[/\\])node_modules([/\\]|$)/i,
  /(^|[/\\])dist([/\\]|$)/i,
  /(^|[/\\])src-tauri([/\\]|$)/i,
  /(^|[/\\])theme\.css$/i,
  /(^|[/\\])theme-manager\.js$/i,
  /(^|[/\\])theme-store\.js$/i,
  /(^|[/\\])theme-(?:dark-)?audit/i,
  /(^|[/\\])scripts[/\\]theme-audit/i,
];

const LIGHT_BACKGROUND_TOKENS = [
  '#fff',
  '#ffffff',
  'white',
  '#f8fafc',
  '#f8f9fa',
  '#f5f5f5',
  '#f3f4f6',
  '#f1f5f9',
  '#eff6ff',
  '#eef2ff',
  '#f0f9ff',
  '#fff7ed',
  '#fff5f5',
  'rgba(255, 255, 255',
  'rgba(255,255,255',
  'rgba(248, 250, 252',
  'rgba(248,250,252',
];

const LIGHT_BORDER_TOKENS = [
  '#e2e8f0',
  '#e5e7eb',
  '#dbe3ee',
  '#dbe4ee',
  '#dbe4f0',
  '#cbd5e1',
  '#eef2f7',
  '#f0f0f0',
  '#eee',
];

const DARK_TEXT_TOKENS = [
  '#0f172a',
  '#111827',
  '#1a1a1a',
  '#1f2937',
  '#334155',
  '#333',
  '#475569',
  '#64748b',
  '#666',
  '#999',
  '#94a3b8',
];

const escapeRegex = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildTokenRegex = (token = '') => {
  const raw = String(token || '');
  if (!raw) return '';
  if (/^[a-z]+$/i.test(raw)) {
    return `(?<![a-z-])${escapeRegex(raw)}(?![a-z-])`;
  }
  return escapeRegex(raw);
};

const buildTokenPattern = (tokens = []) => tokens
  .slice()
  .sort((a, b) => String(b).length - String(a).length)
  .map((item) => buildTokenRegex(item))
  .join('|');

const LIGHT_BACKGROUND_PATTERN = buildTokenPattern(LIGHT_BACKGROUND_TOKENS);
const LIGHT_BORDER_PATTERN = buildTokenPattern(LIGHT_BORDER_TOKENS);
const DARK_TEXT_PATTERN = buildTokenPattern(DARK_TEXT_TOKENS);

export const THEME_AUDIT_RULES = Object.freeze([
  {
    id: 'light-background',
    label: '浅色背景',
    severity: 'warn',
    regex: new RegExp(`(?:background(?:-color|Color)?[^\\n]{0,120}?)(?<token>${LIGHT_BACKGROUND_PATTERN})`, 'gi'),
  },
  {
    id: 'light-border',
    label: '浅色边框',
    severity: 'info',
    regex: new RegExp(`(?:border(?:-color|Color)?|outline(?:-color|Color)?)[^\\n]{0,120}?(?<token>${LIGHT_BORDER_PATTERN})`, 'gi'),
  },
  {
    id: 'dark-text',
    label: '深色文字/图标',
    severity: 'warn',
    regex: new RegExp(`(?:color|fill|stroke)(?:-color|Color)?[^\\n]{0,120}?(?<token>${DARK_TEXT_PATTERN})`, 'gi'),
  },
]);

const normalizeSnippet = (value = '') => String(value || '')
  .replace(/\s+/g, ' ')
  .trim();

const buildLineIndex = (content = '') => {
  const starts = [0];
  for (let i = 0; i < content.length; i += 1) {
    if (content[i] === '\n') starts.push(i + 1);
  }
  return starts;
};

const indexToLineColumn = (lineStarts = [], index = 0) => {
  let low = 0;
  let high = lineStarts.length - 1;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (lineStarts[mid] <= index) low = mid + 1;
    else high = mid - 1;
  }
  const lineIndex = Math.max(0, high);
  const lineStart = lineStarts[lineIndex] || 0;
  return {
    line: lineIndex + 1,
    column: index - lineStart + 1,
  };
};

const getLineText = (content = '', lineNumber = 1) => {
  const lines = String(content || '').split('\n');
  return lines[Math.max(0, lineNumber - 1)] || '';
};

const isThemeVarFallbackToken = (lineText = '', token = '') => {
  const line = String(lineText || '').toLowerCase();
  const value = String(token || '').trim().toLowerCase();
  if (!line || !value) return false;
  let start = line.indexOf('var(');
  while (start >= 0) {
    const end = line.indexOf(')', start + 4);
    if (end < 0) break;
    const chunk = line.slice(start, end + 1);
    const commaIndex = chunk.indexOf(',');
    if (chunk.startsWith('var(--app-') && commaIndex >= 0) {
      const fallback = chunk.slice(commaIndex + 1);
      if (fallback.includes(value)) return true;
    }
    start = line.indexOf('var(', start + 4);
  }
  return false;
};

const shouldSkipFile = (relativePath = '', excludePatterns = DEFAULT_EXCLUDE_PATTERNS) =>
  (excludePatterns || []).some((pattern) => pattern.test(relativePath));

async function collectFiles(rootDir, currentDir, acc = []) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(currentDir, entry.name);
    const relPath = path.relative(rootDir, fullPath).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      if (shouldSkipFile(relPath)) continue;
      await collectFiles(rootDir, fullPath, acc);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!DEFAULT_INCLUDE_EXTENSIONS.has(ext)) continue;
    if (shouldSkipFile(relPath)) continue;
    acc.push(fullPath);
  }
  return acc;
}

export function analyzeThemeAuditContent(content = '', {
  filePath = '',
  rules = THEME_AUDIT_RULES,
} = {}) {
  const source = String(content || '');
  const lineStarts = buildLineIndex(source);
  const findings = [];
  const seen = new Set();

  for (const rule of rules || []) {
    const regex = new RegExp(rule.regex.source, rule.regex.flags);
    let match = regex.exec(source);
    while (match) {
      const token = String(match.groups?.token || match[0] || '').trim();
      const tokenIndex = source.indexOf(token, match.index);
      const pos = indexToLineColumn(lineStarts, tokenIndex >= 0 ? tokenIndex : match.index);
      const lineText = getLineText(source, pos.line);
      if (lineText.includes(THEME_AUDIT_IGNORE_DIRECTIVE)) {
        match = regex.exec(source);
        continue;
      }
      if (isThemeVarFallbackToken(lineText, token)) {
        match = regex.exec(source);
        continue;
      }
      const fingerprint = [
        String(filePath || ''),
        String(rule.id || ''),
        token.toLowerCase(),
        normalizeSnippet(lineText),
      ].join('|');
      if (seen.has(fingerprint)) {
        match = regex.exec(source);
        continue;
      }
      seen.add(fingerprint);
      findings.push({
        file: String(filePath || ''),
        line: pos.line,
        column: pos.column,
        category: String(rule.id || ''),
        categoryLabel: String(rule.label || rule.id || ''),
        severity: String(rule.severity || 'info'),
        token,
        lineText: normalizeSnippet(lineText),
        fingerprint,
      });
      match = regex.exec(source);
    }
  }

  return findings;
}

export function summarizeThemeAuditFindings(findings = []) {
  const summary = {
    total: Array.isArray(findings) ? findings.length : 0,
    byCategory: {},
    byFile: {},
  };
  (Array.isArray(findings) ? findings : []).forEach((item) => {
    const category = String(item?.category || 'unknown');
    const file = String(item?.file || 'unknown');
    summary.byCategory[category] = (summary.byCategory[category] || 0) + 1;
    summary.byFile[file] = (summary.byFile[file] || 0) + 1;
  });
  return summary;
}

export function compareThemeAuditBaseline(currentFindings = [], baselineFingerprints = []) {
  const current = new Set((Array.isArray(currentFindings) ? currentFindings : []).map((item) => String(item?.fingerprint || '')));
  const baseline = new Set(Array.isArray(baselineFingerprints) ? baselineFingerprints.map((item) => String(item || '')) : []);
  const added = [...current].filter((item) => item && !baseline.has(item)).sort();
  const removed = [...baseline].filter((item) => item && !current.has(item)).sort();
  return { added, removed };
}

export async function runThemeSourceAudit(rootDir, {
  scanRoots = DEFAULT_SCAN_ROOTS,
  rules = THEME_AUDIT_RULES,
} = {}) {
  const resolvedRoot = path.resolve(rootDir);
  const files = [];
  for (const relRoot of scanRoots || []) {
    const absRoot = path.resolve(resolvedRoot, relRoot);
    try {
      const stat = await fs.stat(absRoot);
      if (!stat.isDirectory()) continue;
      await collectFiles(resolvedRoot, absRoot, files);
    } catch {
      continue;
    }
  }

  const findings = [];
  for (const filePath of files.sort()) {
    const relPath = path.relative(resolvedRoot, filePath).replace(/\\/g, '/');
    const content = await fs.readFile(filePath, 'utf8');
    findings.push(...analyzeThemeAuditContent(content, { filePath: relPath, rules }));
  }

  return {
    rootDir: resolvedRoot,
    scannedFiles: files.length,
    findings: findings.sort((a, b) => {
      if (a.file !== b.file) return a.file.localeCompare(b.file);
      if (a.line !== b.line) return a.line - b.line;
      if (a.column !== b.column) return a.column - b.column;
      return a.category.localeCompare(b.category);
    }),
    summary: summarizeThemeAuditFindings(findings),
  };
}
