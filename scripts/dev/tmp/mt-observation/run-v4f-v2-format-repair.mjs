import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-format-repair-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-format-repair-0731.jsonl',
);

tasks.push({
  id: 'v4f-v2-format-repair-0731-001',
  batch,
  category: 'latest_multi_bubble_raw_format_repair_cancel',
  prompt: [
    '检查并修复「艾琳·洛」最新一轮 AI 回复的格式。',
    '这轮有多个连续气泡，必须以同一轮完整 rawOriginal 为目标，不能只拿最后一个图片气泡，也不能检查更早轮次。',
    '该会话已有 <frostport> 格式画像，请直接使用；允许模型生成行级补丁与 diff，但自动化测试会在真正应用前取消，原回复不得写回变化。',
  ].join('\n'),
  expectedFeatures: ['chat.format.repair'],
  expectedTools: ['chat.repair_message_format'],
  expectedAnyTools: [],
  expectedDisposition: 'latest_turn_full_raw_diff_cancelled',
  autoConfirm: true,
  confirmButtonLabels: ['取消'],
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
