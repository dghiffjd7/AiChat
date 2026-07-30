import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-apply-last-group-wallpaper-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-apply-last-group-wallpaper-0730.jsonl',
);
const attachmentId = 'generated-1785397244965-7';

tasks.push({
  id: 'oregairu-apply-last-group-wallpaper-0730-001',
  batch,
  category: 'natural_user_apply_existing_group_wallpaper',
  prompt: [
    '刚才图片已经生成成功了，只是你重复生成后忘了设置。现在不要再生图。',
    `请只调用聊天室壁纸设置，把现有附件 ${attachmentId} 覆盖设为“侍奉部”群聊壁纸，opacity 为 1；不要调用 media.generate_image，不要改其他资源。`,
  ].join('\n\n'),
  expectedFeatures: ['session.wallpaper.set'],
  expectedTools: ['session.set_wallpaper'],
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
