import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'complex-postfix-v4f-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-complex-postfix-v4f-0730.jsonl',
);
const prompt = [
  '我想顺手开一套原创的现代奇幻聊天企划，名字统一带上「月影验收-0730」，这样以后我比较好整理。你直接帮我从零配好，过程中都放在后台做，不要每建一个东西就跳页面。',
  '先建一张「月影港·夜航社·月影验收-0730」角色卡，再建我的用户身份「林澄·月影验收-0730」。我是刚转进月影港高中的学生，性格冷静但不是万能主角。这里完全是我授权你补写的原创设定，不用上网，也不要把它冒充成任何作品的原作事实。',
  '主要人物只有两位：寡言、黑色短发、灰蓝眼、总穿深蓝校服外套的女生「沈岚·月影验收-0730」，以及开朗、栗色长发、琥珀眼、穿米白针织衫的女生「苏绮·月影验收-0730」。分别给她们建个人世界书和私聊；每个私聊只绑定自己的个人资料，不要让另一人的私密资料串进来。',
  '再建一本「月影港创作汇总·月影验收-0730」，汇总城市、夜航社、我和两位人物的公开设定，但只绑定到这张角色卡的创意写作会话，不能通过角色卡全局绑定泄漏到两个私聊。然后建立真群聊「夜航社·月影验收-0730」，成员是沈岚和苏绮（我作为当前用户参与即可），群聊绑定两本人物资料。',
  '请用当前图片配置给沈岚生成一个头像，再生成一张有沈岚本人出镜的私聊壁纸；两张都接受 1:1，但必须保持同一套外貌、服装和画风。提示词要自己按当前生图渠道要求写，不要让我再告诉你模型格式。生成后确实写到沈岚的头像和她的聊天室壁纸。',
  '全部完成后再一次性切换到新角色卡和新用户，并只打开「夜航社·月影验收-0730」给我看。最后如实列出已完成、没完成和你补写的原创内容；如果一轮步骤不够，就保留可继续状态，继续时不要重做已经成功的资源。',
].join('\n\n');

tasks.push({
  id: 'complex-postfix-v4f-0730-001',
  batch,
  category: 'natural_user_original_full_setup',
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
