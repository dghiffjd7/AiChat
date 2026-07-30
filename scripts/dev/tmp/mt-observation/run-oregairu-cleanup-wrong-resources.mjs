import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-cleanup-wrong-resources-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-cleanup-wrong-resources-0730.jsonl',
);
const prompt = [
  '刚才那套《我的青春恋爱物语果然有问题》资料建错角色卡位置了，我想先把这批错误资源彻底清干净，再重新来。',
  '请严格按下面顺序处理，而且只碰我明确列出的名字：',
  '1. 在当前“女仆能力测试”角色卡下，一次删除普通聊天室“比企谷八幡”“雪之下雪乃”“由比滨结衣”“平塚静”“侍奉部”。这些都是刚才的测试房，连同它们各自的联系人头像、聊天室壁纸和会话清理链一起处理。',
  '2. 删除世界书“总武高与侍奉部世界观”“总武高重要人物资料”，并清掉这两本书现有的所有绑定。',
  '3. 删除错误角色卡“总武高·桐谷澪企划”和空白重复卡“总武高·桐谷澪”。当前“女仆能力测试”角色卡必须保留。',
  '每一类都使用一次结构化批量确认，不要逐个弹确认，也不要模糊匹配或顺手清理其他同类资源。暂时不要重建任何东西。全部处理完后，重新读取聊天室、世界书和角色卡列表，逐项告诉我哪些确实已经不存在；如果用户“桐谷澪”无法通过现有工具删除，也请直接说明，绝对不要假装成功。',
].join('\n\n');

tasks.push({
  id: 'oregairu-cleanup-wrong-resources-0730-001',
  batch,
  category: 'natural_user_cleanup_wrong_resources',
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
  process.argv.push('--expected-maid-model', 'gpt-5.6-luna');
}
if (!process.argv.includes('--expected-maid-profile')) {
  process.argv.push('--expected-maid-profile', 'pioneer');
}
if (!process.argv.includes('--expected-maid-provider')) {
  process.argv.push('--expected-maid-provider', 'custom');
}

await import('./run-batch.mjs');
