// 硬编码中文扫描 gate：
// 扫描 src/**/*.js 中所有含汉字的字符串/模板字面量，对照 ui-source-catalog（含模板槽位归一化）。
// 未登记且不在忽略配置中的字面量，必须存在带 category/reason 的逐项审核快照：
//   - source scope：一般源码；
//   - content scope：原先整层忽略的 agent/storage 内建内容与语义资料。
// 用法：
//   node scripts/i18n/scan-hardcoded.mjs                  # 检查（CI/release gate 用）
//   node scripts/i18n/scan-hardcoded.mjs --scope=content  # 检查 agent/storage 独立清单
//   node scripts/i18n/scan-hardcoded.mjs --update-baseline # 依审核规则重建逐项快照
//   node scripts/i18n/scan-hardcoded.mjs --full            # 列出全部未登记项（含已审核项）
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SRC_ROOT = path.join(PROJECT_ROOT, 'src');
const CATALOG_FILE = path.join(PROJECT_ROOT, 'scripts/i18n/ui-source-catalog.json');
const IGNORE_FILE = path.join(PROJECT_ROOT, 'scripts/i18n/hardcoded-scan-ignore.json');
const BASELINE_FILE = path.join(PROJECT_ROOT, 'scripts/i18n/hardcoded-scan-baseline.json');
const CONTENT_BASELINE_FILE = path.join(PROJECT_ROOT, 'scripts/i18n/content-hardcoded-review.json');
const REVIEW_RULES_FILE = path.join(PROJECT_ROOT, 'scripts/i18n/hardcoded-scan-review-rules.json');
const CONTENT_PREFIXES = ['src/scripts/agent/', 'src/scripts/storage/'];

const HAN_RE = /\p{Script=Han}/u;
const SLOT = '\u0000'; // 占位符：不会出现在真实文本中
const HTML_LITERAL_RE = /^\s*(?:[·•|—-]\s*)?(?:\u0000\s*)*<(?:a|article|aside|button|details|div|footer|form|h[1-6]|header|input|label|li|main|nav|option|p|section|select|small|span|strong|style|summary|svg|textarea|ul)\b/i;
const HTML_ATTRIBUTE_FRAGMENT_RE = /^\s*(?:data-[\w-]+\s*=\s*["'][^"']*["']\s*)*(?:aria-label|placeholder|title|data-help)\s*=/i;
const HTML_TEXT_RE = />([\t\r\n ]*[^<>{}`;=]*\p{Script=Han}[^<>{}`;=]*?)[\t\r\n ]*<(?=[!/A-Za-z])/gu;
const HTML_TRAILING_TEXT_RE = />([\t\r\n ]*[^<>{}`;=]*\p{Script=Han}[^<>{}`;=]*?)[\t\r\n ]*$/gu;
const HTML_ATTRIBUTE_RE = /(?:aria-label|placeholder|title|data-help)\s*=\s*["']([^"'\n]*\p{Script=Han}[^"'\n]*)["']/gu;
const CSS_TEMPLATE_RE = /^\s*(?:#[-\w]+|\.[-\w]+|@(?:media|keyframes|supports)\b)[\s\S]*\{[\s\S]*\}$/i;

// ── 词法扫描：提取字符串/模板字面量（含上下文前缀，用于日志调用判定） ──
const REGEX_PREFIX_RE = /(?:^|[(,=:[!&|?{};+\-*%~^<>]|\breturn|\btypeof|\bcase|\bin|\bof|\bnew|\bdelete|\bvoid|\binstanceof|=>)\s*$/;

const skipQuoted = (source, start, quote) => {
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') { cursor += 2; continue; }
    if (source[cursor] === quote) return cursor + 1;
    cursor += 1;
  }
  return cursor;
};

const skipRegexLiteral = (source, start) => {
  let cursor = start + 1;
  let inClass = false;
  while (cursor < source.length) {
    if (source[cursor] === '\\') { cursor += 2; continue; }
    if (source[cursor] === '[') inClass = true;
    else if (source[cursor] === ']') inClass = false;
    else if (source[cursor] === '/' && !inClass) {
      cursor += 1;
      while (cursor < source.length && /[a-z]/i.test(source[cursor])) cursor += 1;
      return cursor;
    }
    cursor += 1;
  }
  return cursor;
};

const findTemplateLiteralEnd = (source, start) => {
  let cursor = start + 1;
  while (cursor < source.length) {
    if (source[cursor] === '\\') { cursor += 2; continue; }
    if (source[cursor] === '`') return cursor + 1;
    if (source[cursor] === '$' && source[cursor + 1] === '{') {
      cursor = findTemplateExpressionEnd(source, cursor + 2);
      continue;
    }
    cursor += 1;
  }
  return cursor;
};

const findTemplateExpressionEnd = (source, start) => {
  let cursor = start;
  let depth = 1;
  let tail = '';
  const push = value => { tail = (tail + value).slice(-120); };
  while (cursor < source.length && depth > 0) {
    const char = source[cursor];
    if (char === '/' && source[cursor + 1] === '/') {
      cursor += 2;
      while (cursor < source.length && source[cursor] !== '\n') cursor += 1;
      continue;
    }
    if (char === '/' && source[cursor + 1] === '*') {
      cursor += 2;
      while (cursor < source.length && !(source[cursor] === '*' && source[cursor + 1] === '/')) cursor += 1;
      cursor += 2;
      continue;
    }
    if (char === '/' && REGEX_PREFIX_RE.test(tail)) {
      cursor = skipRegexLiteral(source, cursor);
      push('r');
      continue;
    }
    if (char === '\'' || char === '"') {
      cursor = skipQuoted(source, cursor, char);
      push('s');
      continue;
    }
    if (char === '`') {
      cursor = findTemplateLiteralEnd(source, cursor);
      push('s');
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      cursor += 1;
      if (depth === 0) return cursor;
      push(char);
      continue;
    }
    push(char);
    cursor += 1;
  }
  return cursor;
};

export const extractHanLiterals = (source, file = '') => {
  const results = [];
  const stack = []; // 'tpl' 模板层级（模板 → ${表达式} → 嵌套模板）
  let i = 0;
  let line = 1;
  const n = source.length;
  let codeTail = ''; // 最近的代码文本（判断 regex 与日志上下文）
  const pushCode = ch => {
    codeTail = (codeTail + ch).slice(-120);
  };
  const record = (text, startLine, isTemplate) => {
    const value = text.trim();
    if (!value || !HAN_RE.test(value)) return;
    results.push({
      file,
      line: startLine,
      text: value,
      template: isTemplate,
      context: codeTail.slice(-60),
    });
  };
  while (i < n) {
    const ch = source[i];
    if (ch === '\n') { line += 1; pushCode('\n'); i += 1; continue; }
    // 注释
    if (ch === '/' && source[i + 1] === '/') {
      while (i < n && source[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < n && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') line += 1;
        i += 1;
      }
      i += 2;
      continue;
    }
    // 正则字面量（启发式：看前一个有效 token）
    if (ch === '/' && REGEX_PREFIX_RE.test(codeTail)) {
      i += 1;
      let inClass = false;
      while (i < n) {
        const rc = source[i];
        if (rc === '\\') { i += 2; continue; }
        if (rc === '\n') { line += 1; i += 1; continue; } // 容错
        if (rc === '[') inClass = true;
        else if (rc === ']') inClass = false;
        else if (rc === '/' && !inClass) { i += 1; break; }
        i += 1;
      }
      while (i < n && /[a-z]/i.test(source[i])) i += 1; // flags
      pushCode('r');
      continue;
    }
    // 单/双引号
    if (ch === '\'' || ch === '"') {
      const quote = ch;
      const startLine = line;
      let buf = '';
      i += 1;
      while (i < n) {
        const sc = source[i];
        if (sc === '\\') { buf += source[i + 1] === 'n' ? ' ' : source[i + 1] || ''; i += 2; continue; }
        if (sc === quote) { i += 1; break; }
        if (sc === '\n') { line += 1; }
        buf += sc;
        i += 1;
      }
      record(buf, startLine, false);
      pushCode('s');
      continue;
    }
    // 模板字面量
    if (ch === '`') {
      const startLine = line;
      let buf = '';
      i += 1;
      while (i < n) {
        const tc = source[i];
        if (tc === '\\') { buf += ' '; i += 2; continue; }
        if (tc === '`') { i += 1; break; }
        if (tc === '$' && source[i + 1] === '{') {
          // 占位：进入表达式层，扫描其中的嵌套字面量
          buf += SLOT;
          i += 2;
          let depth = 1;
          let expressionTail = '';
          const pushExpressionCode = value => {
            expressionTail = (expressionTail + value).slice(-120);
          };
          stack.push('expr');
          // 表达式内继续主循环逻辑的精简版：只追踪括号深度与嵌套字符串/模板
          while (i < n && depth > 0) {
            const ec = source[i];
            if (ec === '\n') { line += 1; i += 1; continue; }
            if (ec === '/' && source[i + 1] === '/') { while (i < n && source[i] !== '\n') i += 1; continue; }
            if (ec === '/' && source[i + 1] === '*') {
              i += 2;
              while (i < n && !(source[i] === '*' && source[i + 1] === '/')) { if (source[i] === '\n') line += 1; i += 1; }
              i += 2; continue;
            }
            if (ec === '/' && REGEX_PREFIX_RE.test(expressionTail)) {
              i += 1;
              let inClass = false;
              while (i < n) {
                const rc = source[i];
                if (rc === '\\') { i += 2; continue; }
                if (rc === '\n') { line += 1; i += 1; continue; }
                if (rc === '[') inClass = true;
                else if (rc === ']') inClass = false;
                else if (rc === '/' && !inClass) { i += 1; break; }
                i += 1;
              }
              while (i < n && /[a-z]/i.test(source[i])) i += 1;
              pushExpressionCode('r');
              continue;
            }
            if (ec === '\'' || ec === '"') {
              const q = ec; const sl = line; let sb = '';
              i += 1;
              while (i < n) {
                if (source[i] === '\\') { sb += source[i + 1] === 'n' ? ' ' : source[i + 1] || ''; i += 2; continue; }
                if (source[i] === q) { i += 1; break; }
                if (source[i] === '\n') line += 1;
                sb += source[i]; i += 1;
              }
              record(sb, sl, false);
              pushExpressionCode('s');
              continue;
            }
            if (ec === '`') {
              // 嵌套模板：先按完整 JS 字符串/正则/模板语法找到边界，再递归提取。
              const nestedStart = i;
              const nestedStartLine = line;
              i = findTemplateLiteralEnd(source, nestedStart);
              const nested = source.slice(nestedStart, i);
              line += (nested.match(/\n/g) || []).length;
              extractHanLiterals(nested, file).forEach(item => results.push({
                ...item,
                line: nestedStartLine + item.line - 1,
              }));
              pushExpressionCode('s');
              continue;
            }
            if (ec === '{') depth += 1;
            else if (ec === '}') depth -= 1;
            pushExpressionCode(ec);
            i += 1;
          }
          stack.pop();
          continue;
        }
        if (tc === '\n') { line += 1; buf += ' '; i += 1; continue; }
        buf += tc;
        i += 1;
      }
      record(buf, startLine, true);
      pushCode('s');
      continue;
    }
    pushCode(ch);
    i += 1;
  }
  return results;
};

// HTML 模板由运行时 DOM 翻译器按文本节点/属性处理，扫描时也必须按相同粒度核对目录。
// 若把整段模板当成一个 key，任一 `${...}` 或 CSS 都会令基线充满不可翻译的源码碎片。
export const expandHanLiteralCandidates = (item) => {
  if (item?.template && CSS_TEMPLATE_RE.test(item.text || '')) return [];
  if (!item || (!HTML_LITERAL_RE.test(item.text || '') && !HTML_ATTRIBUTE_FRAGMENT_RE.test(item.text || ''))) return [item];
  const output = [];
  const add = (text) => {
    const value = String(text || '').replace(/\s+/g, ' ').trim();
    if (!value || !HAN_RE.test(value) || value.length > 240) return;
    output.push({ ...item, text: value, template: value.includes(SLOT) });
  };
  HTML_TEXT_RE.lastIndex = 0;
  let match;
  while ((match = HTML_TEXT_RE.exec(item.text))) add(match[1]);
  HTML_TRAILING_TEXT_RE.lastIndex = 0;
  while ((match = HTML_TRAILING_TEXT_RE.exec(item.text))) add(match[1]);
  HTML_ATTRIBUTE_RE.lastIndex = 0;
  while ((match = HTML_ATTRIBUTE_RE.exec(item.text))) add(match[1]);
  return output;
};

// ── 归一化与目录匹配 ──
const normalizeText = value => String(value || '').replace(/\s+/g, ' ').trim();
const normalizeTemplate = value => normalizeText(value)
  .replace(/\{[a-zA-Z0-9_.-]+\}/g, SLOT)
  .replace(new RegExp(`${SLOT}+`, 'g'), SLOT);

const DEVLOG_CONTEXT_RE = /(?:logger|console)\s*\.\s*(?:log|info|warn|error|debug|trace)\s*\(\s*$/;

const walkJs = async (root, out = []) => {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) await walkJs(full, out);
    else if (entry.isFile() && entry.name.endsWith('.js')) out.push(full);
  }
  return out;
};

const matchesReviewRule = (rule, scope, file) => {
  if (!rule || rule.scope !== scope) return false;
  const paths = Array.isArray(rule.paths) ? rule.paths : [];
  if (paths.includes(file)) return true;
  const prefixes = Array.isArray(rule.pathPrefixes) ? rule.pathPrefixes : [];
  return prefixes.some(prefix => file.startsWith(prefix));
};

export const classifyReviewedLiteral = ({ scope = 'source', file = '' } = {}, review = {}) => {
  const rule = (Array.isArray(review?.rules) ? review.rules : [])
    .find(candidate => matchesReviewRule(candidate, scope, file));
  if (!rule) return null;
  const category = String(rule.category || '').trim();
  const reason = String(rule.reason || '').trim();
  if (!category || !reason || !review?.categories?.[category]) return null;
  return { category, reason };
};

const main = async () => {
  const args = new Set(process.argv.slice(2));
  const updateBaseline = args.has('--update-baseline');
  const showFull = args.has('--full');
  const scopeArg = [...args].find(arg => arg.startsWith('--scope='));
  const scope = String(scopeArg || '').slice('--scope='.length) === 'content' ? 'content' : 'source';

  const catalog = JSON.parse(await fs.readFile(CATALOG_FILE, 'utf8'));
  const ignore = JSON.parse(await fs.readFile(IGNORE_FILE, 'utf8'));
  const review = JSON.parse(await fs.readFile(REVIEW_RULES_FILE, 'utf8'));
  const baselineFile = scope === 'content' ? CONTENT_BASELINE_FILE : BASELINE_FILE;
  let baseline = [];
  try { baseline = JSON.parse(await fs.readFile(baselineFile, 'utf8')); } catch {}
  const invalidBaseline = baseline.filter(item => (
    !String(item?.category || '').trim()
    || !String(item?.reason || '').trim()
    || !review?.categories?.[item.category]
  ));
  const baselineSet = new Set(baseline.map(item => `${item.file}|${item.text}`));

  const exactSet = new Set(catalog.map(entry => normalizeText(entry.source)));
  const templateSet = new Set(catalog.map(entry => normalizeTemplate(entry.source)).filter(v => v.includes(SLOT)));
  const ignorePaths = (ignore.paths || []).map(p => p.replace(/\\/g, '/'));
  const ignoreStrings = new Set(ignore.strings || []);
  const ignorePatterns = (ignore.patterns || []).map(p => new RegExp(p, 'u'));

  const files = await walkJs(SRC_ROOT);
  const findings = [];
  for (const full of files) {
    const rel = path.relative(PROJECT_ROOT, full).replace(/\\/g, '/');
    const isContentPath = CONTENT_PREFIXES.some(prefix => rel.startsWith(prefix));
    if (scope === 'content' && !isContentPath) continue;
    if (scope === 'source' && (isContentPath || ignorePaths.some(p => rel === p || rel.startsWith(p)))) continue;
    const source = await fs.readFile(full, 'utf8');
    const literals = extractHanLiterals(source, rel).flatMap(expandHanLiteralCandidates);
    for (const item of literals) {
      const text = normalizeText(item.text);
      if (ignoreStrings.has(text)) continue;
      if (ignorePatterns.some(re => re.test(text))) continue;
      if (DEVLOG_CONTEXT_RE.test(item.context || '')) continue;
      if (exactSet.has(text)) continue;
      const normalized = item.template ? normalizeTemplate(item.text) : text;
      if (item.template && templateSet.has(normalized)) continue;
      findings.push({ file: rel, line: item.line, text: text.slice(0, 160) });
    }
  }

  if (updateBaseline) {
    const unreviewed = [];
    const snapshot = findings.map(({ file, text }) => {
      const classification = classifyReviewedLiteral({ scope, file }, review);
      if (!classification) unreviewed.push({ file, text });
      return { file, text, ...(classification || {}) };
    });
    const dedup = Array.from(new Map(snapshot.map(item => [`${item.file}|${item.text}`, item])).values());
    if (unreviewed.length) {
      console.error(`i18n ${scope} review update failed: ${unreviewed.length} literal(s) have no valid category rule.`);
      unreviewed.slice(0, 40).forEach(item => console.error(`  ${item.file}: ${item.text}`));
      process.exitCode = 1;
      return;
    }
    await fs.writeFile(baselineFile, `${JSON.stringify(dedup, null, 2)}\n`);
    console.log(`i18n ${scope} review updated: ${dedup.length} classified literal(s)`);
    return;
  }

  if (invalidBaseline.length) {
    console.error(`i18n ${scope} scan failed: ${invalidBaseline.length} review item(s) lack a valid category/reason.`);
    process.exitCode = 1;
    return;
  }

  const fresh = findings.filter(item => !baselineSet.has(`${item.file}|${item.text}`));
  const report = showFull ? findings : fresh;
  if (report.length) {
    const byFile = new Map();
    report.forEach(item => {
      if (!byFile.has(item.file)) byFile.set(item.file, []);
      byFile.get(item.file).push(item);
    });
    for (const [file, items] of byFile) {
      console.error(`\n${file}`);
      items.slice(0, 40).forEach(item => console.error(`  L${item.line}: ${item.text}`));
      if (items.length > 40) console.error(`  ... ${items.length - 40} more`);
    }
  }
  if (showFull) {
    console.log(`\ni18n ${scope} scan (full): ${findings.length} unregistered literal(s), reviewed snapshot covers ${findings.length - fresh.length}`);
    return;
  }
  if (fresh.length) {
    console.error(`\ni18n ${scope} scan failed: ${fresh.length} new hardcoded Han literal(s) are not cataloged or reviewed.`);
    console.error('用户可见内容登记到 UI catalog；其余内容先补明确审核规则，再以 --update-baseline 更新逐项快照。');
    process.exitCode = 1;
  } else {
    console.log(`i18n ${scope} scan passed: 0 new (reviewed ${baselineSet.size}, catalog ${exactSet.size})`);
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
