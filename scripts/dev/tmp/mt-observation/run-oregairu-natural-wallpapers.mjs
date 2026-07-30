import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-natural-luna-wallpapers-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-natural-luna-wallpapers-0730.jsonl',
);
const prompt = [
  '四个人物头像我已经看到了，接着把配套壁纸补上吧。',
  '请给比企谷八幡、雪之下雪乃、由比滨结衣、平塚静这四个现有私聊分别生成并设置一张横向聊天室壁纸。继续沿用默认生图配置，不要另外指定模型或助手；保持同一套日系校园动画美术方向，但场景和色调要能对应各自性格。',
  '这轮只做四张壁纸，不要改头像、角色卡、用户、世界书或聊天室。',
].join('\n\n');

tasks.push({
  id: 'oregairu-natural-luna-wallpapers-0730-005',
  batch,
  category: 'natural_user_session_wallpapers',
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
