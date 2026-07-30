import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputIndex = process.argv.indexOf('--output');
const outputPath = resolve(
  outputIndex >= 0
    ? process.argv[outputIndex + 1]
    : 'scripts/dev/tmp/mt-observation/oregairu-natural-before-20260730.json',
);
const expressionPath = resolve(
  'scripts/dev/tmp/mt-observation/inspect-oregairu-natural-baseline.js',
);
const state = await evaluateInApp(readFileSync(expressionPath, 'utf8'), { timeoutMs: 300000 });

if (!state?.ok) throw new Error(state?.reason || 'failed to capture Oregairu test state');
writeFileSync(outputPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: true,
  outputPath,
  maidModel: state.maid?.effectiveModel || '',
  memoryExtractionModel: state.memoryExtraction?.effectiveModel || '',
  personaCount: state.resources?.personas?.length || 0,
  userCount: state.resources?.users?.length || 0,
  contactCount: state.resources?.contacts?.length || 0,
  sessionCount: state.resources?.sessionIds?.length || 0,
  worldbookCount: state.resources?.worldbooks?.length || 0,
}, null, 2));
