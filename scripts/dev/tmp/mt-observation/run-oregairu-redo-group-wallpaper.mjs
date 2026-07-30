import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-redo-group-wallpaper-2-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-redo-group-wallpaper-2-0730.jsonl',
);
const prompt = [
  'no humans',
  'scenery',
  'small Japanese high school service club room',
  'one long rectangular wooden table in center',
  'exactly four chairs surrounding one table',
  'exactly four tea cups on table',
  'one open book',
  'small bookshelf',
  'large window',
  'late afternoon sunlight',
  'intimate quiet club atmosphere',
  'soft blue and amber color palette',
  'wide shot',
  'cinematic horizontal composition',
  'single table composition',
  'detailed background',
].join(', ');
const negativePrompt = [
  '1girl',
  '1boy',
  'person',
  'people',
  'human',
  'character',
  'crowd',
  'classroom',
  'rows of desks',
  'many desks',
  'many chairs',
  'lecture room',
  'lowres',
  'blurry',
  'text',
  'logo',
  'watermark',
  'signature',
  'photorealistic',
  '3d',
  'portrait',
  'close-up',
  'vertical composition',
].join(', ');

tasks.push({
  id: 'oregairu-redo-group-wallpaper-2-0730-001',
  batch,
  category: 'natural_user_replace_wrong_group_wallpaper',
  prompt: [
    '刚才重做的“侍奉部”群壁纸太像普通教室，请最后只替换这一张。当前仍是 NovelAI nai-diffusion-4-5-full 的 1344×768 临时预设；这次明确做小型部室的中央围桌空景，只生成一张，不要动其他聊天室。',
    `正向提示词必须直接使用下面这串英文 NAI 逗号标签，不要翻译、不要改写成自然语言，也不要加入中文：\n${prompt}`,
    `负向提示词：\n${negativePrompt}`,
    '生成成功后把新 attachmentId 覆盖设为“侍奉部”群聊壁纸，opacity 为 1，并确认覆盖弹窗；失败就停下，不能沿用那张人数错误的旧图。',
  ].join('\n\n'),
  expectedFeatures: ['session.wallpaper.set'],
  expectedTools: ['media.generate_image', 'session.set_wallpaper'],
  expectedAnyTools: [],
  expectedDisposition: 'write_allowed',
  autoConfirm: true,
  allowSubAgent: false,
  followGuide: false,
  maxMs: 600_000,
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
