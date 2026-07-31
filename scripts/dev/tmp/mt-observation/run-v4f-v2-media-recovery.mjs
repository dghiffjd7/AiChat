import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-media-recovery-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-media-recovery-0731.jsonl',
);

tasks.push({
  id: 'v4f-v2-media-recovery-0731-001',
  batch,
  category: 'natural_user_accept_current_image_aspect',
  prompt: [
    '明白，那就不要切换生图配置，方形壁纸也可以。',
    '请沿用当前 NAI 配置重新生成一张新的艾琳·洛场景图：银白色低马尾、海蓝色眼睛、深蓝调查队制服，她站在蓝焰灯塔前的雾港码头，动画画风，无文字无水印。',
    '提示词请继续按当前渠道自动组织；只生成一张，成功后把这次新 attachmentId 设置为「艾琳·洛」聊天室壁纸，opacity 为 1。',
    '不要复用头像附件；写回后读取真实状态确认。',
  ].join('\n'),
  expectedFeatures: ['session.wallpaper.set'],
  expectedTools: ['media.generate_image', 'session.set_wallpaper'],
  expectedAnyTools: [],
  expectedDisposition: 'recover_after_aspect_constraint',
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
