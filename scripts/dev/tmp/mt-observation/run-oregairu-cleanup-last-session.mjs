import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-cleanup-last-session-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-cleanup-last-session-0730.jsonl',
);

tasks.push({
  id: 'oregairu-cleanup-last-session-0730-001',
  batch,
  category: 'natural_user_cleanup_current_session',
  prompt: [
    '刚才“由比滨结衣”因为是当前会话而被保护，这是正确的。现在请先打开现有的“Lara Croft”聊天室，让它成为当前会话；然后再单独批量删除测试聊天室“由比滨结衣”。',
    '只做这两件事，不要重建或改其他资源。删除仍走一次结构化确认与完整清理链，最后按工具结果确认它是否真正不存在。',
  ].join('\n\n'),
  expectedFeatures: ['session.open', 'session.delete_many'],
  expectedTools: ['session.open', 'session.delete_many'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 600_000,
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
