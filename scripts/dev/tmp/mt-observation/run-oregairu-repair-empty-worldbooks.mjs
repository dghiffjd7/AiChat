import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-repair-empty-worldbooks-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-repair-empty-worldbooks-0730.jsonl',
);
const sharedBoundary = [
  '共同背景仅限：故事位于千叶市立总武高等学校；侍奉部在平塚静指导下接受学生委托并协助解决问题。',
  '桐谷澪是本企划原创人物，不是原作设定：与主角团同年级，成绩优秀但体育、临场表达与主动求助并不突出；幼年失去原家庭照料后由平塚静依法收养。',
  '不预设桐谷澪的恋爱对象，不代替用户决定行动、台词、思想或感受；角色只可知道在当前对话与合理经历中获知的资讯，不得读取其他私聊。',
].join('');

tasks.push({
  id: 'oregairu-repair-empty-worldbooks-0730-001',
  batch,
  category: 'natural_user_fill_empty_yui_worldbook',
  prompt: [
    '刚才的底层核对发现“由比滨结衣·私聊资料”只是已经被会话绑定、但条目数为 0 的空壳。请不要因为同名存在而停手：现在用 append 给这个空壳准确写入下面 3 条，不要建立副本，也不要改变现有绑定。',
    `1. 标题“作用域与原创设定”，关键词“由比滨结衣,结衣,桐谷澪,总武高,侍奉部”，正文：“本书仅供由比滨结衣私聊使用。${sharedBoundary}”`,
    '2. 标题“由比滨结衣”，关键词“由比滨结衣,结衣”，正文：“由比滨结衣是总武高二年F班学生，与八幡同班，后来经由委托与侍奉部产生联系。她待人开朗、重视群体气氛和朋友关系，善于拉近距离，但有时会为了维持气氛压下自己的真实想法；料理并不拿手。保持她体贴、主动而仍会犹豫的一面。”',
    '3. 标题“私聊资讯边界”，关键词“私聊,边界”，正文：“结衣只能使用本聊天室里出现的内容和合理共同经历；不得自动知道八幡、雪乃、平塚静其他聊天室的内容，也不得把创意写作或群聊中的未发生事件当成私聊既成事实。”',
    '写完后读取正文确认条目数恰好为 3；如果不是 3 就报告，不要重复追加。',
  ].join('\n\n'),
  expectedFeatures: ['worldbook.create'],
  expectedTools: ['worldbook.create', 'worldbook.read'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 900_000,
});

tasks.push({
  id: 'oregairu-repair-empty-worldbooks-0730-002',
  batch,
  category: 'natural_user_fill_empty_shizuka_worldbook',
  prompt: [
    '还有“平塚静·私聊资料”也是已经被会话绑定、但条目数为 0 的空壳。请不要因为同名存在而停手：现在用 append 给这个空壳准确写入下面 3 条，不要建立副本，也不要改变现有绑定。',
    `1. 标题“作用域与原创设定”，关键词“平塚静,静老师,桐谷澪,总武高,侍奉部”，正文：“本书仅供平塚静私聊使用。${sharedBoundary}”`,
    '2. 标题“平塚静”，关键词“平塚静,静老师”，正文：“平塚静是总武高国语教师，也是侍奉部顾问。她会直接介入问题、推动学生面对自身矛盾，并负责把八幡带到侍奉部。面对桐谷澪时同时具有监护人与教师身份：关心可以明确，但不能把用户写成失去独立判断的孩子，也不能凭空替用户决定生活细节。”',
    '3. 标题“私聊资讯边界”，关键词“私聊,边界”，正文：“平塚静只能使用本聊天室里出现的内容、监护关系内合理知道的家庭事实与共同经历；不得自动知道八幡、雪乃、结衣其他聊天室的内容，也不得把创意写作或群聊中的未发生事件当成私聊既成事实。”',
    '写完后读取正文确认条目数恰好为 3；如果不是 3 就报告，不要重复追加。',
  ].join('\n\n'),
  expectedFeatures: ['worldbook.create'],
  expectedTools: ['worldbook.create', 'worldbook.read'],
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
