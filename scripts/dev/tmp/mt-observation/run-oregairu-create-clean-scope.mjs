import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-create-clean-scope-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-create-clean-scope-0730.jsonl',
);
const prompt = [
  '旧资料已经清干净了，我们现在重新开始。请这轮只建立干净的角色卡 scope 和我的用户身份，不要创建聊天室、群聊、世界书或图片。',
  '第一步，新建唯一角色卡“总武高·侍奉部企划”，并在创建参数里直接设为当前角色卡。它是整套《我的青春恋爱物语果然有问题》长期聊天的工作区：用户角色与八幡、雪乃、结衣同年级，是成绩优秀但有明确短板的普通学生，幼年失去原家庭照料后由平塚静依法收养；不预设恋爱对象，也不替用户决定行动。角色卡暂时不要绑定任何世界书。',
  '第二步，新建用户“桐谷澪”，并直接设为当前用户。固定视觉设定为：深棕色中长发、灰绿色眼睛、清秀克制的气质、整洁的总武高校服；性格理性慢热、观察力好，但体育、临场表达和主动求助都不突出。之后所有图片必须沿用这套视觉规格。',
  '完成后读取角色卡和用户列表，确认当前角色卡只能是“总武高·侍奉部企划”，当前用户只能是“桐谷澪”。如果创建失败就停下说明，不要用相近名字重试或建立重复项。',
].join('\n\n');

tasks.push({
  id: 'oregairu-create-clean-scope-0730-001',
  batch,
  category: 'natural_user_create_clean_scope',
  prompt,
  expectedFeatures: ['persona.create', 'user.create'],
  expectedTools: ['persona.create', 'user.create'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 900_000,
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
