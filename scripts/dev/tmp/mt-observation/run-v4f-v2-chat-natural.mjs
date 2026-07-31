import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-chat-natural-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-chat-natural-0731.jsonl',
);

tasks.push({
  id: 'v4f-v2-chat-natural-0731-001',
  batch,
  category: 'natural_character_conversation',
  prompt: [
    '帮我在当前「艾琳·洛」私聊发一句正常的剧情消息：“艾琳，蓝焰灯塔今天有什么异常？我出发前需要准备什么？”',
    '确实触发她的 AI 回复并保持在这个聊天室；使用 chat.send_message、triggerReply:true、open:true。',
    '不要添加任何格式测试说明，也不要由你代写 assistant 消息。',
  ].join('\n'),
  expectedFeatures: ['chat.send_message'],
  expectedTools: ['chat.send_message'],
  expectedAnyTools: [],
  expectedDisposition: 'natural_send_and_real_reply',
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
