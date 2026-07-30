import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-p3-finish-v4f-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-p3-finish-v4f-0730.jsonl',
);
const prompt = [
  '刚才虽然最后回复中断了，但十个私聊和「草帽一伙」群聊其实都已经创建成功。',
  '不要重新创建任何聊天室，也不要做任何世界书操作。',
  '请只读确认「草帽一伙」确实是包含刚才十个人的群聊，然后只打开这个群聊给我看，最后简短汇报即可。',
].join('\n\n');

tasks.push({
  id: 'one-piece-p3-finish-v4f-0730-001',
  batch,
  category: 'natural_user_imported_card_idempotent_finish',
  prompt,
  expectedFeatures: [],
  expectedTools: [],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 600_000,
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
