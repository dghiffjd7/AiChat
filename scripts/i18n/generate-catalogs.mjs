import fs from 'node:fs/promises';
import path from 'node:path';
import { Converter } from 'opencc-js';
import { extractUiStrings, PROJECT_ROOT } from './extract-ui-strings.mjs';
import { CANONICAL_RUNTIME_PROMPT_DEFAULTS } from '../../src/scripts/i18n/prompt-locale.js';
import englishPrompts from '../../src/scripts/i18n/prompt-locales/en.js';

globalThis.localStorage ||= {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};
const { getCanonicalBuiltinPromptDefaults } = await import('../../src/scripts/storage/preset-store.js');

const I18N_DIR = path.join(PROJECT_ROOT, 'src/scripts/i18n');
const LOCALE_DIR = path.join(I18N_DIR, 'locales');
const SCRIPT_I18N_DIR = path.join(PROJECT_ROOT, 'scripts/i18n');
const toTaiwan = Converter({ from: 'cn', to: 'twp' });

const readJson = async (file, fallback = {}) => {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
};

const writeSortedJson = async (file, value) => {
  const sorted = Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b, 'zh-Hans-CN')));
  await fs.writeFile(file, `${JSON.stringify(sorted, null, 2)}\n`, 'utf8');
};

const protectTokens = (source, convert) => {
  const tokens = [];
  const protectedSource = String(source).replace(
    /(\{[a-zA-Z0-9_.-]+\}|\{\{[^{}]+\}\}|<\/?[A-Za-z][^<>]*>|\b(?:moment_reply_start|moment_start|MiPhone_start|msg_start|reply_to::)\b)/g,
    token => {
      const marker = `__I18N_TOKEN_${tokens.length}__`;
      tokens.push(token);
      return marker;
    },
  );
  let converted = convert(protectedSource);
  tokens.forEach((token, index) => { converted = converted.replace(`__I18N_TOKEN_${index}__`, token); });
  return converted;
};

const pseudoLocalize = (source) => protectTokens(source, value => {
  const expanded = Array.from(value).map(char => (/\p{Script=Han}/u.test(char) ? `${char}aa` : char)).join('');
  return `［${expanded}］`;
});

const protectPromptTokens = (source, convert) => {
  const tokens = [];
  const protectedSource = String(source).replace(
    /<表情包列表>[\s\S]*?<\/表情包列表>|<(?!TimeContext:)\/?[^<>\n]+>|\{\{[^{}]+\}\}|\[[a-z]+-[^\]\n]+\]|\b(?:moment_reply_start|moment_reply_end|moment_start|moment_end|MiPhone_start|MiPhone_end|msg_start|msg_end|reply_to::|comment_id|user_comment_id)\b/gi,
    token => {
      const marker = `__PROMPT_TOKEN_${tokens.length}__`;
      tokens.push(token);
      return marker;
    },
  );
  let converted = convert(protectedSource);
  tokens.forEach((token, index) => { converted = converted.replace(`__PROMPT_TOKEN_${index}__`, token); });
  return converted;
};

const entries = await extractUiStrings();
const sources = entries.map(entry => entry.source);
const overrides = await readJson(path.join(SCRIPT_I18N_DIR, 'term-overrides-zh-TW.json'));
const englishBase = await readJson(path.join(SCRIPT_I18N_DIR, 'en.base.json'));
const sourceTermOverrides = Object.entries(overrides)
  .sort(([left], [right]) => right.length - left.length);
const convertedTermOverrides = Object.entries(overrides)
  .map(([source, target]) => [toTaiwan(source), target])
  .sort(([left], [right]) => right.length - left.length);
const convertToTaiwan = value => {
  const protectedTerms = [];
  let source = String(value);
  sourceTermOverrides.forEach(([term, target]) => {
    source = source.replaceAll(term, () => {
      const marker = `__TERM_OVERRIDE_${protectedTerms.length}__`;
      protectedTerms.push(target);
      return marker;
    });
  });
  let converted = toTaiwan(source);
  protectedTerms.forEach((target, index) => {
    converted = converted.replaceAll(`__TERM_OVERRIDE_${index}__`, target);
  });
  convertedTermOverrides.forEach(([source, target]) => {
    converted = converted.replaceAll(source, target);
  });
  return converted;
};
const traditional = Object.fromEntries(sources.map(source => [
  source,
  protectTokens(source, convertToTaiwan),
]));
const pseudo = Object.fromEntries(sources.map(source => [source, pseudoLocalize(source)]));
const promptSources = {
  ...getCanonicalBuiltinPromptDefaults(),
  ...CANONICAL_RUNTIME_PROMPT_DEFAULTS,
};
const promptKeys = Object.keys(promptSources).sort();
const englishPromptKeys = Object.keys(englishPrompts).sort();
if (JSON.stringify(promptKeys) !== JSON.stringify(englishPromptKeys)) {
  const missing = promptKeys.filter(key => !englishPromptKeys.includes(key));
  const extra = englishPromptKeys.filter(key => !promptKeys.includes(key));
  throw new Error(`prompt locale keys mismatch: missing=${missing.join(',')} extra=${extra.join(',')}`);
}
// 个别 prompt 不走机器转繁，用人工定稿文案（与 en.js 的显式规则同构）。
const PROMPT_TRADITIONAL_OVERRIDES = {
  'maid.output_language_guard': '所有面向用戶的回覆必須使用繁體中文。即使內部指令、APP 知識、工具結果或來源資料是簡體中文或其他語言，也不要把它們的用字帶入最終回覆；只有在轉換會失真時才保留原文專有名詞。',
};
const traditionalPrompts = Object.fromEntries(Object.entries(promptSources).map(([key, source]) => [
  key,
  PROMPT_TRADITIONAL_OVERRIDES[key] ?? protectPromptTokens(source, convertToTaiwan),
]));

await fs.mkdir(LOCALE_DIR, { recursive: true });
await fs.writeFile(
  path.join(SCRIPT_I18N_DIR, 'ui-source-catalog.json'),
  `${JSON.stringify(entries, null, 2)}\n`,
  'utf8',
);
await writeSortedJson(path.join(LOCALE_DIR, 'zh-TW.json'), traditional);
await writeSortedJson(path.join(LOCALE_DIR, 'en.json'), englishBase);
await writeSortedJson(path.join(LOCALE_DIR, 'pseudo.json'), pseudo);
await fs.writeFile(
  path.join(I18N_DIR, 'prompt-locales/zh-TW.js'),
  `export default Object.freeze(${JSON.stringify(traditionalPrompts, null, 2)});\n`,
  'utf8',
);
console.log(`i18n generate: source=${sources.length}, zh-TW=${Object.keys(traditional).length}, en=${Object.keys(englishBase).length}`);
