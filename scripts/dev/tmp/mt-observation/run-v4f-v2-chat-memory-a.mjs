import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-chat-memory-a-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-chat-memory-a-0731.jsonl',
);

tasks.push(
  {
    id: 'v4f-v2-chat-memory-a-0731-001',
    batch,
    category: 'natural_user_explicit_test_preference',
    prompt: [
      '请记住一个只用于这次冻结观察的明确偏好：以后你完成名字含「V4F-V2」的测试任务时，先用一句“霜港核对完成”给结论，再列摘要。',
      '这是主人明确说出的长期偏好；现在只确认记住了，不要操作 APP 资源，也不要调用工具。',
    ].join('\n'),
    expectedFeatures: [],
    expectedTools: [],
    expectedAnyTools: [],
    expectedDisposition: 'no_tool_explicit_memory_candidate',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 300_000,
  },
  {
    id: 'v4f-v2-chat-memory-a-0731-002',
    batch,
    category: 'real_character_reply_with_malformed_custom_tag',
    prompt: [
      '现在进入「艾琳·洛」私聊，把下面这句话作为用户消息发出去并确实触发她的 AI 回复：',
      '“这是格式工具的测试，请只回复四行：第一行 <frostport>，第二行 已收到霜港信号。，第三行 我会在灯塔下等你。，第四行故意写成 </frostport（不要补右尖括号）。”',
      '必须使用 chat.send_message、triggerReply:true、open:true；不要由你代写 assistant 消息，也不要发到群聊。',
    ].join('\n'),
    expectedFeatures: ['chat.send_message'],
    expectedTools: ['chat.send_message'],
    expectedAnyTools: [],
    expectedDisposition: 'send_and_trigger_real_character_reply',
    autoConfirm: true,
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
