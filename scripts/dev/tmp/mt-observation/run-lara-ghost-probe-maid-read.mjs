import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'lara-ghost-probe-maid-read-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-lara-ghost-probe-maid-read-0730.jsonl',
);

tasks.push({
  id: 'lara-ghost-probe-maid-read-0730-001',
  batch,
  category: 'natural_user_read_current_scope',
  prompt: '顺手帮我确认一下现在用的是哪张角色卡、哪个用户就好，只读 APP 里的当前资料，什么都不要修改，也不要切换聊天室。',
  expectedFeatures: ['app.resource.read'],
  expectedTools: ['app.read_resource'],
  expectedAnyTools: [],
  expectedDisposition: 'read_only',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 300_000,
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
