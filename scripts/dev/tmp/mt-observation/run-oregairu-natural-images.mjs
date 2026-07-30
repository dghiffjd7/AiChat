import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-natural-luna-images-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-natural-luna-images-0730.jsonl',
);
const prompt = [
  '刚才那次失败了，而且你好像把已经做好的东西忘了一部分。先别从头来，也不要再新建角色卡、用户、世界书或聊天室。',
  '请直接处理现在已经存在的“总武高·桐谷澪企划”角色卡、“桐谷澪”用户，以及比企谷八幡、雪之下雪乃、由比滨结衣、平塚静这四个私聊：给角色卡、用户和四个人物配上统一风格但能明显区分的生成头像，再给四个私聊分别配好生成壁纸。',
  '两本已经建好的世界书和绑定这轮都不要改。你刚才多建的那张空白“总武高·桐谷澪”也先不要动，等其他事情做完后告诉我，我再决定怎么清理。',
  '这轮只把图片补齐并核对实际是否设置成功，后台做就好。',
].join('\n\n');

tasks.push({
  id: 'oregairu-natural-luna-images-0730-003',
  batch,
  category: 'natural_user_recovery_images',
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
