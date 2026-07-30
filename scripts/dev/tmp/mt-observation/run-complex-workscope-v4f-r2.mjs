import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'complex-workscope-v4f-r2-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-complex-workscope-v4f-r2-0730.jsonl',
);
const prompt = [
  '我想再开一套小型原创校园奇幻企划，所有测试资源的名字都带「星汐验收-R2-0730」，以后比较好整理。请直接从零配好，过程中都在后台做，不要每建一个东西就跳页面。',
  '先建角色卡「星汐学园·观测社·星汐验收-R2-0730」，再建我的用户身份「顾遥·星汐验收-R2-0730」。这是我授权你补写的原创设定，不用上网，也不要说成任何现有作品的原作事实。',
  '主要人物是沉静、银灰短发、蓝紫眼、穿藏青制服的「岑夏·星汐验收-R2-0730」，以及爽朗、深棕长发、金棕眼、穿浅灰针织外套的「唐澄·星汐验收-R2-0730」。分别给两人建立个人世界书和私聊，每个私聊只绑定自己的个人资料，不能互相串资料。',
  '再建立一本「星汐学园创作汇总·星汐验收-R2-0730」，写入学校、观测社、我和两位人物的公开设定，只绑定到新角色卡的创意写作会话。然后建立真群聊「观测社·星汐验收-R2-0730」，成员是岑夏和唐澄，群聊绑定两本人物资料。',
  '请用当前图片配置给岑夏生成头像，再生成一张岑夏本人出镜的私聊壁纸；都用 1:1，并保持同一外貌、服装和画风。提示词请先按当前生图渠道的要求自行组织，不要让我补模型格式；生成后确实写入岑夏的联系人头像和她的聊天室壁纸。',
  '全部完成后再一次性切换到新角色卡和新用户，并只打开「观测社·星汐验收-R2-0730」给我看。最后如实列出已完成、没完成和原创补写；如果一轮步骤不够，请保留可继续状态，继续时不要重做已经成功的资源。',
].join('\n\n');

tasks.push({
  id: 'complex-workscope-v4f-r2-0730-001',
  batch,
  category: 'natural_user_scoped_full_setup',
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
  process.argv.push('--expected-maid-model', 'deepseek-v4-flash');
}
if (!process.argv.includes('--expected-maid-profile')) {
  process.argv.push('--expected-maid-profile', 'Deepseek');
}
if (!process.argv.includes('--expected-maid-provider')) {
  process.argv.push('--expected-maid-provider', 'deepseek');
}

await import('./run-batch.mjs');
