import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-natural-luna-followup-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-natural-luna-followup-0730.jsonl',
);
const prompt = [
  '好，那就继续把刚才没做完的补齐吧，图片生成慢一点没关系。',
  '群聊如果现在确实没有后台创建能力，就不要拿那个同名普通聊天室冒充群聊；先把角色卡、我的用户身份、四个私聊的头像和壁纸都配好，再核对两本世界书和绑定有没有遗漏。',
  '其他都完成后，你可以把我带到创建群聊的界面，告诉我最后还需要手动做什么。群聊做不了就如实留成一个明确缺口，但能做的部分请先全部完成。',
].join('\n\n');

tasks.push({
  id: 'oregairu-natural-luna-followup-0730-002',
  batch,
  category: 'natural_user_continue',
  prompt,
  expectedFeatures: [],
  expectedTools: [],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: true,
  followGuide: true,
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
