import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-natural-luna-contact-avatars-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-natural-luna-contact-avatars-0730.jsonl',
);
const prompt = [
  '角色卡头像已经配好了。我的用户头像这次先跳过，世界书和角色卡也都不要再动。',
  '现在只给已经存在的比企谷八幡、雪之下雪乃、由比滨结衣、平塚静四个私聊分别生成并设置人物头像。沿用我现在默认的生图配置就好，不用另外指定模型或助手；保持统一的日系校园动画风格，但四个人要容易分辨。',
  '请完成一个就继续下一个，最后告诉我四个头像各自有没有真正设置成功。',
].join('\n\n');

tasks.push({
  id: 'oregairu-natural-luna-contact-avatars-0730-004',
  batch,
  category: 'natural_user_contact_avatars',
  prompt,
  expectedFeatures: [],
  expectedTools: [],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: true,
  followGuide: false,
  maxMs: 1_800_000,
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
