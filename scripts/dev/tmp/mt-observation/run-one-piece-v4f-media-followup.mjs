import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-v4f-media-followup-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-v4f-media-followup-0731.jsonl',
);

tasks.push({
  id: 'one-piece-v4f-media-followup-0731-001',
  batch,
  category: 'natural_user_generate_nami_avatar',
  prompt: [
    '娜美的聊天室壁纸已经有了，不过联系人头像还是空的。请帮她补一张头像。',
    '直接使用当前启用的生图配置，并根据实际渠道自动采用正确的提示词语言与格式；不要问我该写 tag 还是自然语言。',
    '画面要是 1:1 单人半身头像，保留橘色长发、棕色眼睛、聪明自信的神情和航海士气质，背景简洁。',
    '只生成一张；成功后立刻把本次返回的 attachmentId 设置为「娜美」联系人头像，再读回确认。失败就如实停止，不能复用旧附件。',
  ].join('\n'),
  expectedFeatures: ['contact.avatar.set'],
  expectedTools: ['media.generate_image', 'contact.set_avatar'],
  expectedAnyTools: [],
  expectedDisposition: 'generate_apply_verify_single_avatar',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 900_000,
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
