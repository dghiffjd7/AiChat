import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-set-user-avatar-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-set-user-avatar-0730.jsonl',
);
const attachmentId = 'generated-1785395962583-7';

tasks.push({
  id: 'oregairu-set-user-avatar-0730-001',
  batch,
  category: 'natural_user_reuse_generated_user_avatar',
  prompt: [
    '刚才为企划卡生成的桐谷澪视觉就是我的固定形象，也请把同一张图设为当前用户“桐谷澪”的头像，不要再生图。',
    `请直接使用刚才成功生成的附件 ID：${attachmentId}。只调用用户头像设置，不要改角色卡、联系人或聊天室。完成后读取用户资料确认头像已经存在。`,
  ].join('\n\n'),
  expectedFeatures: ['user.avatar.set'],
  expectedTools: ['user.set_avatar'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 300_000,
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
