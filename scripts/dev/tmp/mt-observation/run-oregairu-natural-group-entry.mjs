import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-natural-luna-group-entry-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-natural-luna-group-entry-0730.jsonl',
);
const prompt = [
  '头像和壁纸先这样。最后请把我带到创建群聊的入口，不要再创建一个普通的“侍奉部”聊天室，也不要改其他资料。',
  '如果你能打开新建群聊的界面，就直接帮我打开；如果目前只能打开联系人页，也可以停在那里，然后清楚告诉我还需要手动做哪一步，以及后台为什么没法直接建群。',
].join('\n\n');

tasks.push({
  id: 'oregairu-natural-luna-group-entry-0730-006',
  batch,
  category: 'natural_user_group_ui_entry',
  prompt,
  expectedFeatures: [],
  expectedTools: [],
  expectedAnyTools: [],
  expectedDisposition: 'read_only',
  autoConfirm: true,
  allowSubAgent: true,
  followGuide: true,
  maxMs: 600_000,
});

if (!process.argv.includes('--batch')) process.argv.push('--batch', batch);
if (!process.argv.includes('--output')) process.argv.push('--output', defaultOutput);
if (!process.argv.includes('--expected-maid-model')) {
  process.argv.push('--expected-maid-model', 'gpt-5.6-luna');
}
if (!process.argv.includes('--expected-maid-profile')) {
  process.argv.push('--expected-maid-profile', 'pioneer');
}
if (!process.argv.includes('--expected-maid-provider')) {
  process.argv.push('--expected-maid-provider', 'custom');
}

await import('./run-batch.mjs');
