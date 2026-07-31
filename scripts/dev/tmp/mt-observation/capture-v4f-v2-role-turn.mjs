import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const readArg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
};
const outputPath = resolve(readArg(
  '--output',
  'scripts/dev/tmp/mt-observation/v4f-v2-role-turn-capture.json',
));
const expression = readFileSync(
  resolve('scripts/dev/tmp/mt-observation/audit-v4f-v2-role-turn.js'),
  'utf8',
);
const result = await evaluateInApp(expression, { timeoutMs: 30_000 });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  outputPath,
  sessionId: result?.sessionId || '',
  markerIndex: result?.markerIndex,
  totalMessageCount: result?.totalMessageCount,
  tailIds: (result?.tail || []).map(item => item.id),
}, null, 2));
