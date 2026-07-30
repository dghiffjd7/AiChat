import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-cleanup-v4f-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-cleanup-v4f-0730.jsonl',
);
const prompt = [
  '刚才「海贼王」这轮测试已经看完了，麻烦帮我把这轮新增的测试聊天室清理掉。',
  '要删除的范围只有这 11 个：路飞、索隆、娜美、乌索普、山治、乔巴、罗宾、弗兰奇、布鲁克、甚平这十个私聊，以及群聊「草帽一伙」。',
  '请走正式的批量删除列表让我一次确认，确认后再删除，并在删除完成后重新列出当前角色卡的聊天室，核对这 11 个名字都已经不存在。',
  '只删除这些聊天室和它们自己的聊天记录。一定保留原本的「海贼王」角色卡，以及它自带的「海贼王」世界书、正则、脚本和其他关联资料；也不要动任何其他角色卡、世界书、用户或聊天室。',
].join('\n\n');

tasks.push({
  id: 'one-piece-cleanup-v4f-0730-001',
  batch,
  category: 'natural_user_one_piece_exact_session_cleanup',
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
