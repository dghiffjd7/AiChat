import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-v4f-zoro-chat-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-v4f-zoro-chat-0731.jsonl',
);

tasks.push({
  id: 'one-piece-v4f-zoro-chat-0731-001',
  batch,
  category: 'natural_user_chat_with_zoro',
  prompt: [
    '帮我去「罗罗诺亚·索隆」的私聊发这句话：',
    '“索隆，船上如果突然遇到袭击，我应该先学会怎么保护自己？”',
    '正常触发他的回复并打开这个聊天室；只发一次，不要发到娜美或其他人物那里。',
  ].join('\n'),
  expectedFeatures: ['chat.send_message'],
  expectedTools: ['chat.send_message'],
  expectedAnyTools: [],
  expectedDisposition: 'send_and_trigger_character_reply',
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
