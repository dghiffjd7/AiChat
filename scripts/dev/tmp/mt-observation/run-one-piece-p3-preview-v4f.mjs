import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-p3-preview-v4f-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-p3-preview-v4f-0730.jsonl',
);
const prompt = [
  '我刚切到「海贼王」这张角色卡，里面自带的世界书资料很多。',
  '你先帮我看看这张卡关联的世界书，从里面挑出适合建立长期聊天室的草帽一伙主要成员，给我一份候选清单，并简单说说你为什么选这些人。',
  '这一步先只看和整理，别创建聊天室或群聊，也别修改世界书、绑定和角色卡，页面也不用打开。',
  '另外，这种导入角色卡的聊天室直接共用角色卡自带的世界书就好，不需要为每个人新建或绑定独立世界书。',
].join('\n\n');

tasks.push({
  id: 'one-piece-p3-preview-v4f-0730-001',
  batch,
  category: 'natural_user_imported_card_character_preview',
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
