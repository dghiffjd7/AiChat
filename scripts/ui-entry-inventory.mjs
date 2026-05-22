import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_ROOTS = Object.freeze([
  'src/index.html',
  'src/scripts/ui',
  'src/styles',
]);

const IGNORED_SEGMENTS = new Set([
  'node_modules',
  'vendor',
  'target',
  'dist',
  'build',
]);

const SUPPORTED_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.js',
  '.mjs',
]);

export const UI_SURFACES = Object.freeze({
  chat: ['chat', 'chatroom', 'rp-', 'group'],
  writing: ['creative', 'writing', 'draft', 'chapter', 'story'],
  moments: ['moment', 'feed', 'comment'],
  prompt: ['prompt', 'preset', 'regex', 'reasoning'],
  image: ['image', 'media-generation', 'generate-image', 'image_prompt', 'sticker'],
  memory: ['memory', 'checkpoint'],
  contact: ['contact', 'profile', 'persona'],
  lineage: ['lineage', 'graph'],
  worldbook: ['world', 'worldbook', 'lorebook'],
  variables: ['variable', 'mvu', 'stat_data'],
  agent: ['agent', 'provider-tool', 'tool-call', 'runner'],
  settings: ['settings', 'config', 'preference'],
  plugin: ['plugin', 'script-runtime'],
  transfer: ['transfer', 'import', 'export', 'bundle'],
  debug: ['debug', 'diagnostic', 'trace', 'audit'],
});

const ROLE_KEYWORDS = Object.freeze({
  navigation: ['nav', 'navigation', 'sidebar', 'tab', 'switch', 'route'],
  action: ['button', 'btn', 'action', 'click', 'submit', 'create', 'generate', 'send', 'run'],
  panel: ['panel', 'drawer', 'sheet', 'sidebar'],
  modal: ['modal', 'dialog', 'overlay', 'popup'],
  settings: ['settings', 'config', 'preference', 'option'],
  prompt: ['prompt', 'preset', 'template'],
  debug: ['debug', 'diagnostic', 'trace', 'audit'],
});

const HIGH_RISK_RE = /(delete|remove|clear|reset|import|export|generate|network|api|token|key|write|upsert|patch|persist|memory|variable|worldbook|runner|provider|image)/i;
const MEDIUM_RISK_RE = /(settings|config|prompt|preset|regex|permission|agent|tool|profile|lineage)/i;
const ENTRY_VALUE_RE = /(?:data-action|data-menu-action|data-panel|data-target|aria-label|title|id|class)\s*=\s*["']([^"']{2,160})["']|(?:textContent|innerText|label|title|summary)\s*[:=]\s*["'`]([^"'`]{2,160})["'`]/g;

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const unique = values => Array.from(new Set((Array.isArray(values) ? values : [values]).map(trim).filter(Boolean)));

const normalizeForMatch = value => trim(value).toLowerCase().replace(/\\/g, '/');

export const normalizePathForInventory = (value = '') => normalizeForMatch(value);

export const classifyByKeywords = (value = '', dictionary = UI_SURFACES) => {
  const text = normalizeForMatch(value);
  const out = [];
  Object.entries(dictionary).forEach(([key, keywords]) => {
    if ((Array.isArray(keywords) ? keywords : []).some(keyword => text.includes(String(keyword).toLowerCase()))) {
      out.push(key);
    }
  });
  return unique(out);
};

export const classifyUiEntry = ({
  filePath = '',
  value = '',
  line = '',
} = {}) => {
  const haystack = `${filePath}\n${value}\n${line}`;
  const surfaces = classifyByKeywords(haystack, UI_SURFACES);
  const roles = classifyByKeywords(haystack, ROLE_KEYWORDS);
  const risk = HIGH_RISK_RE.test(haystack)
    ? 'high'
    : (MEDIUM_RISK_RE.test(haystack) ? 'medium' : 'low');
  const frequency = roles.includes('action') || roles.includes('navigation')
    ? 'high'
    : (roles.includes('settings') || roles.includes('debug') ? 'low' : 'medium');
  const flags = [];
  if (surfaces.length > 1) flags.push('cross_surface');
  if (surfaces.includes('debug') && !normalizePathForInventory(filePath).includes('debug')) flags.push('debug_keyword_in_user_surface');
  if (surfaces.includes('prompt') && (surfaces.includes('image') || surfaces.includes('moments') || surfaces.includes('agent'))) {
    flags.push('prompt_surface_mixed');
  }
  if (risk === 'high' && frequency === 'high') flags.push('high_risk_high_frequency');
  return {
    surfaces,
    roles,
    risk,
    frequency,
    flags,
  };
};

export const extractUiEntriesFromText = ({
  filePath = '',
  text = '',
  maxEntriesPerFile = 120,
} = {}) => {
  const entries = [];
  const lines = String(text || '').split(/\r?\n/);
  lines.forEach((line, index) => {
    ENTRY_VALUE_RE.lastIndex = 0;
    let match = ENTRY_VALUE_RE.exec(line);
    while (match) {
      const value = trim(match[1] || match[2]);
      if (value && !/^(true|false|null|undefined)$/i.test(value)) {
        const classification = classifyUiEntry({ filePath, value, line });
        entries.push({
          filePath,
          lineNumber: index + 1,
          value,
          ...classification,
        });
      }
      if (entries.length >= maxEntriesPerFile) return entries;
      match = ENTRY_VALUE_RE.exec(line);
    }
    return null;
  });
  return entries;
};

const shouldIgnorePath = filePath => normalizePathForInventory(filePath)
  .split('/')
  .some(segment => IGNORED_SEGMENTS.has(segment));

const collectFiles = async (targetPath) => {
  const out = [];
  let stat = null;
  try {
    stat = await fs.stat(targetPath);
  } catch {
    return out;
  }
  if (shouldIgnorePath(targetPath)) return out;
  if (stat.isFile()) {
    if (SUPPORTED_EXTENSIONS.has(path.extname(targetPath))) out.push(targetPath);
    return out;
  }
  if (!stat.isDirectory()) return out;
  const entries = await fs.readdir(targetPath, { withFileTypes: true });
  for (const entry of entries) {
    out.push(...await collectFiles(path.join(targetPath, entry.name)));
  }
  return out;
};

export const scanUiEntries = async ({
  cwd = process.cwd(),
  roots = DEFAULT_ROOTS,
  maxEntriesPerFile = 120,
} = {}) => {
  const files = [];
  for (const root of roots) {
    files.push(...await collectFiles(path.resolve(cwd, root)));
  }
  const uniqueFiles = unique(files).sort((a, b) => a.localeCompare(b));
  const entries = [];
  for (const file of uniqueFiles) {
    let text = '';
    try {
      text = await fs.readFile(file, 'utf8');
    } catch {
      continue;
    }
    const rel = path.relative(cwd, file).replace(/\\/g, '/');
    entries.push(...extractUiEntriesFromText({
      filePath: rel,
      text,
      maxEntriesPerFile,
    }));
  }
  return {
    generatedAt: new Date().toISOString(),
    roots,
    fileCount: uniqueFiles.length,
    entries,
  };
};

const countBy = (entries, readValues) => {
  const counts = new Map();
  entries.forEach((entry) => {
    const values = unique(readValues(entry));
    if (!values.length) values.push('unclassified');
    values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  });
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
};

const renderCountList = (title, rows) => [
  `### ${title}`,
  '',
  '| 名称 | 数量 |',
  '| --- | ---: |',
  ...rows.map(([name, count]) => `| \`${name}\` | ${count} |`),
  '',
].join('\n');

const renderEntryRow = entry => [
  `\`${entry.filePath}:${entry.lineNumber}\``,
  entry.value.replace(/\|/g, '\\|'),
  unique(entry.surfaces).join(', ') || '-',
  unique(entry.roles).join(', ') || '-',
  entry.risk,
  entry.frequency,
  unique(entry.flags).join(', ') || '-',
].join(' | ');

export const renderUiEntryInventoryMarkdown = (scan = {}) => {
  const entries = Array.isArray(scan.entries) ? scan.entries : [];
  const flagged = entries.filter(entry => Array.isArray(entry.flags) && entry.flags.length);
  const highRisk = entries.filter(entry => entry.risk === 'high');
  const lines = [
    '# UI Entrance Inventory',
    '',
    `生成时间：${trim(scan.generatedAt, new Date().toISOString())}`,
    '',
    '## 摘要',
    '',
    `- 扫描文件数：${Number(scan.fileCount || 0)}`,
    `- 入口候选数：${entries.length}`,
    `- 带风险/混杂标记：${flagged.length}`,
    `- 高风险候选：${highRisk.length}`,
    '',
    renderCountList('按 Surface 统计', countBy(entries, entry => entry.surfaces)),
    renderCountList('按角色统计', countBy(entries, entry => entry.roles)),
    renderCountList('按风险统计', countBy(entries, entry => [entry.risk])),
    '## 需要人工复核的入口',
    '',
    '| 文件 | 值 | Surface | 角色 | 风险 | 频率 | 标记 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...(flagged.length ? flagged.slice(0, 180).map(renderEntryRow) : ['| - | - | - | - | - | - | - |']),
    '',
    '## 高风险高频入口',
    '',
    '| 文件 | 值 | Surface | 角色 | 风险 | 频率 | 标记 |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...(
      entries
        .filter(entry => entry.flags.includes('high_risk_high_frequency'))
        .slice(0, 120)
        .map(renderEntryRow)
    ),
    '',
    '## 使用方式',
    '',
    '```bash',
    'npm run audit:ui',
    '```',
    '',
    '本清单是静态启发式扫描，不是最终 UI 决策。每个入口后续仍要人工确认：是否用户可见、是否 debug-only、是否应迁移到 Prompt Library / Agent Center / 资料库 / 设置。',
    '',
  ];
  return lines.join('\n');
};

const parseArgs = (argv = []) => {
  const args = {
    out: '../UI_Entrance_Inventory.generated.md',
    roots: DEFAULT_ROOTS.slice(),
    maxEntriesPerFile: 120,
  };
  argv.forEach((arg, index) => {
    if (arg === '--out') args.out = argv[index + 1] || args.out;
    if (arg === '--root') args.roots = [argv[index + 1]].filter(Boolean);
    if (arg === '--roots') args.roots = String(argv[index + 1] || '').split(',').map(trim).filter(Boolean);
    if (arg === '--max') args.maxEntriesPerFile = Math.max(1, Math.trunc(Number(argv[index + 1])) || args.maxEntriesPerFile);
  });
  return args;
};

const isMain = () => {
  const current = fileURLToPath(import.meta.url);
  return process.argv[1] && path.resolve(process.argv[1]) === current;
};

if (isMain()) {
  const args = parseArgs(process.argv.slice(2));
  const scan = await scanUiEntries({
    roots: args.roots,
    maxEntriesPerFile: args.maxEntriesPerFile,
  });
  const markdown = renderUiEntryInventoryMarkdown(scan);
  const outPath = path.resolve(process.cwd(), args.out);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, markdown, 'utf8');
  console.log(`UI entrance inventory written: ${outPath}`);
}
