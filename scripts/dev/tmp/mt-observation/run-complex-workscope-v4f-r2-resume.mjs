import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'complex-workscope-v4f-r2-resume-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-complex-workscope-v4f-r2-resume-0730.jsonl',
);

tasks.push({
  id: 'complex-workscope-v4f-r2-resume-0730-001',
  batch,
  category: 'natural_user_resume_interrupted_setup',
  prompt: [
    '继续这条已中断的女仆任务。',
    'runId: run:65210e96-bfc3-4602-9e03-f543db55f823',
  ].join('\n'),
  expectedFeatures: [],
  expectedTools: [],
  expectedAnyTools: [],
  expectedDisposition: '',
  autoConfirm: true,
  allowSubAgent: true,
  followGuide: false,
  maxMs: 1_200_000,
});

if (!process.argv.includes('--batch')) process.argv.push('--batch', batch);
if (!process.argv.includes('--output')) process.argv.push('--output', defaultOutput);
if (!process.argv.includes('--expected-maid-model')) {
  process.argv.push('--expected-maid-model', 'deepseek-v4-flash');
}
if (!process.argv.includes('--expected-maid-profile')) {
  process.argv.push('--expected-maid-profile', 'Deepseek');
}
if (!process.argv.includes('--expected-maid-provider')) {
  process.argv.push('--expected-maid-provider', 'deepseek');
}

await import('./run-batch.mjs');
