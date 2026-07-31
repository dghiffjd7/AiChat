import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-chat-v4f-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-chat-v4f-0731.jsonl',
);

tasks.push({
  id: 'one-piece-chat-v4f-0731-001',
  batch,
  category: 'natural_user_chat_followup_with_nami',
  prompt: [
    '娜美刚刚已经回答我了。帮我留在她的私聊里，接着发这句话：',
    '“那就听你的。出发前你能按优先顺序告诉我三样必须准备的东西吗？”',
    '要正常触发她的新回复并打开这个聊天室；不要重复上一句话，也不要发到其他人物房间。',
  ].join('\n'),
  expectedFeatures: ['chat.send_message'],
  expectedTools: ['chat.send_message'],
  expectedAnyTools: [],
  expectedDisposition: 'continue_existing_character_conversation',
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
