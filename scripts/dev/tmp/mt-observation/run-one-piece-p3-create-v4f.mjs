import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-p3-create-v4f-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-p3-create-v4f-0730.jsonl',
);
const prompt = [
  '候选范围我直接确认好了：路飞、索隆、娜美、乌索普、山治、乔巴、罗宾、弗兰奇、布鲁克、甚平，就这十位。',
  '请在当前「海贼王」角色卡里一次性给这十个人建立私聊，再建立一个真群聊「草帽一伙」，把这十个人全部加入群聊。已经存在的就复用，不要重复创建。',
  '这是导入角色卡，所有新聊天室都直接继承角色卡已经启用的「海贼王」世界书。不要新建、修改或复制任何世界书，也不要给私聊或群聊增加 session 级世界书绑定。',
  '过程中都在后台做，全部创建并核对完成后，只打开「草帽一伙」群聊给我看。头像和壁纸这轮先不用处理。',
].join('\n\n');

tasks.push({
  id: 'one-piece-p3-create-v4f-0730-001',
  batch,
  category: 'natural_user_imported_card_batch_chat_group_create',
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
