import fs from 'node:fs/promises';
import { evaluateInApp } from './cdp-client.mjs';

const expression = await fs.readFile(new URL('./i18n-dom-audit.js', import.meta.url), 'utf8');
const result = await evaluateInApp(expression);
console.log(JSON.stringify(result, null, 2));

const failed = Boolean(
  result?.fatalError
  || Number(result?.overflowCount || 0) > 0
  || (result?.locale === 'en' && result?.pseudo !== true && Number(result?.visibleHanCount || 0) > 0)
  || (result?.locale !== 'zh-CN' && Number(result?.skipZoneUiCount || 0) > 0)
);
if (failed) process.exitCode = 1;
