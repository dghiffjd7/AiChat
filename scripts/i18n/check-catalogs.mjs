import fs from 'node:fs/promises';
import path from 'node:path';
import { PROJECT_ROOT } from './extract-ui-strings.mjs';

const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const localeDir = path.join(PROJECT_ROOT, 'src/scripts/i18n/locales');
const sourceEntries = await readJson(path.join(PROJECT_ROOT, 'scripts/i18n/ui-source-catalog.json'));
const firstHourManifest = await readJson(path.join(PROJECT_ROOT, 'scripts/i18n/first-hour-manifest.json'));
const sourceSet = new Set(sourceEntries.map(entry => entry.source));
const catalogs = {
  en: await readJson(path.join(localeDir, 'en.json')),
  'zh-TW': await readJson(path.join(localeDir, 'zh-TW.json')),
};
const errors = [];
const tokenSet = value => Array.from(String(value || '').matchAll(/\{([a-zA-Z0-9_.-]+)\}/g), match => match[1]).sort();
const protocolMarkers = [
  'moment_reply_start',
  'moment_start',
  'MiPhone_start',
  'msg_start',
  '<content>',
  '<tableEdit>',
  '<image_prompt>',
  'reply_to::',
  '<群聊',
  '<私聊',
  '<group_chat',
  '<private_chat',
];
for (const [locale, catalog] of Object.entries(catalogs)) {
  for (const [source, translated] of Object.entries(catalog)) {
    if (!sourceSet.has(source)) errors.push(`${locale}: unknown source key: ${source}`);
    const values = translated && typeof translated === 'object' ? Object.values(translated) : [translated];
    values.forEach(value => {
      if (JSON.stringify(tokenSet(source)) !== JSON.stringify(tokenSet(value))) {
        errors.push(`${locale}: placeholder mismatch: ${source}`);
      }
    });
  }
  for (const [source, translated] of Object.entries(catalog)) {
    const serialized = `${source}\n${JSON.stringify(translated)}`;
    protocolMarkers.forEach(marker => {
      if (serialized.includes(marker)) errors.push(`${locale}: protocol marker in catalog: ${marker}`);
    });
  }
}
for (const source of sourceSet) {
  if (!Object.prototype.hasOwnProperty.call(catalogs['zh-TW'], source)) errors.push(`zh-TW: missing source key: ${source}`);
}
// en 全覆盖硬门槛：除显式豁免（提取噪声/装饰字）外，每个 source key 都必须有英译，
// 否则英文模式必然吐中文。新增 UI 字串时同步补 en.base.json。
const enExempt = await readJson(path.join(PROJECT_ROOT, 'scripts/i18n/en-exempt-keys.json'));
const enExemptSet = new Set(enExempt.keys || []);
for (const source of sourceSet) {
  if (enExemptSet.has(source)) continue;
  if (!Object.prototype.hasOwnProperty.call(catalogs.en, source)) errors.push(`en: missing source key: ${source}`);
}
for (const key of enExemptSet) {
  if (!sourceSet.has(key)) errors.push(`en-exempt: unknown source key: ${key}`);
}
const firstHourSources = new Set(firstHourManifest.requiredKeys || []);
for (const file of firstHourManifest.files || []) {
  sourceEntries.forEach(entry => {
    if (entry.references.some(reference => reference.startsWith(`${file}#`))) firstHourSources.add(entry.source);
  });
}
for (const source of firstHourSources) {
  if (!sourceSet.has(source)) errors.push(`first-hour: unknown source key: ${source}`);
  else if (!Object.prototype.hasOwnProperty.call(catalogs.en, source)) errors.push(`en first-hour: missing source key: ${source}`);
}
const uiRoot = path.join(PROJECT_ROOT, 'src/scripts/ui');
const scanDynamicKeys = async root => {
  const entries = await fs.readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) await scanDynamicKeys(fullPath);
    else if (entry.isFile() && entry.name.endsWith('.js')) {
      const source = await fs.readFile(fullPath, 'utf8');
      if (/\bt\s*\(\s*`[^`]*\$\{/s.test(source)) {
        errors.push(`dynamic t() key: ${path.relative(PROJECT_ROOT, fullPath).replace(/\\/g, '/')}`);
      }
    }
  }
};
await scanDynamicKeys(uiRoot);
if (errors.length) {
  console.error(errors.slice(0, 100).join('\n'));
  console.error(`i18n check failed: ${errors.length} error(s)`);
  process.exitCode = 1;
} else {
  console.log(`i18n check passed: source=${sourceSet.size}, en=${Object.keys(catalogs.en).length}, zh-TW=${Object.keys(catalogs['zh-TW']).length}, first-hour=${firstHourSources.size}`);
}
