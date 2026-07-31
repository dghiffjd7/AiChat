import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-chat-retry-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-chat-retry-0731.jsonl',
);

tasks.push({
  id: 'v4f-v2-chat-retry-0731-001',
  batch,
  category: 'real_character_reply_valid_outer_protocol_broken_inner_tag',
  prompt: [
    '刚才那条测试要求太死，角色回复因为缺少 APP 私聊协议外层而被丢弃了。',
    '请在当前「艾琳·洛」私聊再发一条用户消息并触发真实 AI 回复：',
    '“请保留并完整遵守系统要求的私聊协议外层；只让可见消息正文为三行：第一行 <frostport>，第二行 已收到霜港信号。，第三行 </frostport（故意缺右尖括号）。外层协议标签必须完整。”',
    '使用 chat.send_message、triggerReply:true、open:true；不要由你代写 assistant 消息。',
  ].join('\n'),
  expectedFeatures: ['chat.send_message'],
  expectedTools: ['chat.send_message'],
  expectedAnyTools: [],
  expectedDisposition: 'retry_with_valid_protocol_and_real_reply',
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
