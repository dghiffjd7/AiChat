import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-cleanup-apply-v4f-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-cleanup-apply-v4f-0730.jsonl',
);
const prompt = [
  '我确认，就按刚才预览里冻结的那 11 个目标删掉。',
  '这次请直接执行，不要再停在预览；范围不能增加或替换。',
  '删除完成后再看一遍当前「海贼王」角色卡的聊天室，确认那十个私聊和「草帽一伙」都已经不存在，同时保留原角色卡及其自带的世界书、正则、脚本。',
].join('\n\n');

tasks.push({
  id: 'one-piece-cleanup-apply-v4f-0730-001',
  batch,
  category: 'natural_user_one_piece_confirmed_session_cleanup_apply',
  prompt,
  expectedFeatures: [],
  expectedTools: [],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
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
