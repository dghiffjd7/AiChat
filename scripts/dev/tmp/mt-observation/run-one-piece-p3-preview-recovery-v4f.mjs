import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-p3-preview-recovery-v4f-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-p3-preview-recovery-v4f-0730.jsonl',
);
const prompt = [
  '你刚才只说了“先看看，稍等”，还没有真的把候选清单列给我。',
  '而且「海贼王」世界书一共有 97 条，你上次只拿到了前 50 条；请把剩下的目录也补齐，再给我一份草帽一伙主要成员候选名单。',
  '还是先不要创建聊天室或群聊，不要修改任何世界书和绑定。',
].join('\n\n');

tasks.push({
  id: 'one-piece-p3-preview-recovery-v4f-0730-001',
  batch,
  category: 'natural_user_imported_card_preview_recovery',
  prompt,
  expectedFeatures: [],
  expectedTools: [],
  expectedAnyTools: [],
  expectedDisposition: 'read_only',
  autoConfirm: false,
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
