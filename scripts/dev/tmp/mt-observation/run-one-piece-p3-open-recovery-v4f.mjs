import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-p3-open-recovery-v4f-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-p3-open-recovery-v4f-0730.jsonl',
);
const prompt = [
  '刚才「草帽一伙」其实没有打开，活动里显示 session.open 参数错误。',
  '请不要重建聊天室，也不要做任何世界书操作。',
  '先重新读取一次「草帽一伙」并明确取得成员列表和真实会话 ID；确认十名成员没问题后，再只用这个 sessionId 打开群聊。必须等打开工具成功后才能说已经打开。',
].join('\n\n');

tasks.push({
  id: 'one-piece-p3-open-recovery-v4f-0730-001',
  batch,
  category: 'natural_user_imported_card_open_recovery',
  prompt,
  expectedFeatures: [],
  expectedTools: [],
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
  process.argv.push('--expected-maid-model', 'deepseek-v4-flash');
}
if (!process.argv.includes('--expected-maid-profile')) {
  process.argv.push('--expected-maid-profile', 'Deepseek');
}
if (!process.argv.includes('--expected-maid-provider')) {
  process.argv.push('--expected-maid-provider', 'deepseek');
}

await import('./run-batch.mjs');
