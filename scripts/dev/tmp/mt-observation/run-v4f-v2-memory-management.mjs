import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-memory-management-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-memory-management-0731.jsonl',
);

tasks.push(
  {
    id: 'v4f-v2-memory-management-0731-001',
    batch,
    category: 'natural_user_list_maid_memory',
    prompt: [
      '你还记得我刚才说的 V4F-V2 测试汇报偏好吗？',
      '请用 maid.memory.list 查看你自己的生效中长期记忆，找到对应的明确记忆 ID，并把 kind、key、内容和置信度告诉我。',
      '不要打开聊天室记忆表格，也不要修改或归档任何记忆。',
    ].join('\n'),
    expectedFeatures: ['maid.memory.list'],
    expectedTools: ['maid.memory.list'],
    expectedAnyTools: [],
    expectedDisposition: 'list_active_semantic_memory',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 600_000,
  },
  {
    id: 'v4f-v2-memory-management-0731-002',
    batch,
    category: 'natural_user_archive_specific_maid_memory',
    prompt: [
      '这条只是批量测试留下的探针偏好，请把它归档。',
      '先再次用 maid.memory.list 精确找到“完成名字含 V4F-V2 的测试任务时先说霜港核对完成”这一条，再用 maid.memory.archive 软归档；不要物理删除，也不要碰其他偏好、决定或任务状态。',
      '确认列表出现时，只应包含这一条记忆。',
    ].join('\n'),
    expectedFeatures: ['maid.memory.archive'],
    expectedTools: ['maid.memory.list', 'maid.memory.archive'],
    expectedAnyTools: [],
    expectedDisposition: 'archive_one_specific_semantic_memory',
    autoConfirm: true,
    confirmButtonLabels: ['确认归档'],
    allowSubAgent: false,
    followGuide: false,
    maxMs: 600_000,
  },
);

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
