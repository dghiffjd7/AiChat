import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-cleanup-followups-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-cleanup-followups-0730.jsonl',
);

tasks.push(
  {
    id: 'oregairu-cleanup-followups-0730-001',
    batch,
    category: 'natural_user_cleanup_sessions',
    prompt: [
      '你刚才已经核对完清单了，但只说“请稍等”就停了，并没有真的删除。',
      '现在先只完成第一步：一次批量删除当前角色卡下的“比企谷八幡”“雪之下雪乃”“由比滨结衣”“平塚静”“侍奉部”五个普通聊天室。不要再重复读列表，也不要处理其他资源。请直接发起结构化批量删除确认，确认后执行完整会话清理链，并在工具结果后明确回报成功、跳过和失败数量。',
    ].join('\n\n'),
    expectedFeatures: ['session.delete_many'],
    expectedTools: ['session.delete_many'],
    expectedAnyTools: [],
    expectedDisposition: 'write_allowed',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 600_000,
  },
  {
    id: 'oregairu-cleanup-followups-0730-002',
    batch,
    category: 'natural_user_cleanup_worldbooks',
    prompt: [
      '聊天室这一步先告一段落。现在只删除两本错误世界书：“总武高与侍奉部世界观”和“总武高重要人物资料”。',
      '请直接发起一次结构化批量删除确认并执行，让共用 lifecycle 同时解除会话、全局和角色卡关联；不要删除其他世界书，也不要开始重建。完成后只按工具结果回报成功、跳过和失败数量。',
    ].join('\n\n'),
    expectedFeatures: ['worldbook.delete_many'],
    expectedTools: ['worldbook.delete_many'],
    expectedAnyTools: [],
    expectedDisposition: 'write_allowed',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 600_000,
  },
  {
    id: 'oregairu-cleanup-followups-0730-003',
    batch,
    category: 'natural_user_cleanup_personas',
    prompt: [
      '最后清理角色卡。请只删除“总武高·桐谷澪企划”和空白重复卡“总武高·桐谷澪”，当前“女仆能力测试”必须保留。',
      '请直接发起一次结构化批量删除确认并执行，不要重建、不要删除其他角色卡。完成后按工具结果回报成功、跳过和失败数量。',
    ].join('\n\n'),
    expectedFeatures: ['persona.delete_many'],
    expectedTools: ['persona.delete_many'],
    expectedAnyTools: [],
    expectedDisposition: 'write_allowed',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 600_000,
  },
);

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
