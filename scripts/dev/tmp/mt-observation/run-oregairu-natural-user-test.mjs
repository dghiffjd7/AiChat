import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-natural-luna-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-natural-luna-0730.jsonl',
);
const prompt = [
  '我想开一套能长期玩的《我的青春恋爱物语果然有问题》聊天，懒得自己一个个配了，这次就全交给你吧。',
  '请从零建一张这套企划用的角色卡，也建好我的用户身份：我和八幡他们同年级，是成绩很好的学生，同时也是被平塚静收养的孩子。姓名、外貌、性格和这段收养经历的细节，你先按原作气质合理补全就好，但别写成无敌主角，也别替我锁死恋爱对象，之后我还能自己改。',
  '世界书请至少分成两本：一本放总武高、侍奉部、时间线和包含我在内的世界观；另一本放重要人物资料，八幡、雪乃、结衣、平塚静都要够聊天使用。原作资料拿不准就上网查，不要凭印象硬编。',
  '再给八幡、雪乃、结衣和平塚静分别建私聊，把适合的世界书都绑定好；头像和聊天室壁纸也一起配齐。图片不要直接搬官方图，帮我生成一套统一的日系校园动画风格，人物要能明显区分。',
  '最后建一个“侍奉部”的群聊，成员是八幡、雪乃、结衣和我的这个用户身份，绑定同一套资料，也配一张群聊壁纸。平塚老师保留私聊就好，不用塞进群里。',
  '批量创建时都在后台做，不用每完成一步就把界面跳过去；全部做完以后，再带我看这张角色卡和侍奉部群聊，并告诉我哪些设定是你补写的、还有没有没完成的地方。',
].join('\n\n');

tasks.push({
  id: 'oregairu-natural-luna-0730-001',
  batch,
  category: 'natural_user_full_setup',
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
