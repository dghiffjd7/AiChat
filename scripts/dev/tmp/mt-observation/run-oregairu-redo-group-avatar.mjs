import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-redo-group-avatar-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-redo-group-avatar-0730.jsonl',
);
const prompt = [
  'no humans',
  'still life',
  'school service club room table',
  'one open book in center',
  'exactly four tea cups around the book',
  'four simple chairs',
  'notebooks',
  'large classroom window',
  'soft afternoon light',
  'quiet welcoming atmosphere',
  'soft blue and amber color palette',
  'balanced square composition',
  'centered composition',
  'detailed',
].join(', ');
const negativePrompt = [
  '1girl',
  '1boy',
  'person',
  'people',
  'human',
  'character',
  'crowd',
  'lowres',
  'blurry',
  'text',
  'logo',
  'watermark',
  'signature',
  'photorealistic',
  '3d',
  'multiple views',
  'character sheet',
].join(', ');

tasks.push({
  id: 'oregairu-redo-group-avatar-0730-001',
  batch,
  category: 'natural_user_replace_wrong_group_avatar',
  prompt: [
    '“侍奉部”群头像也因为多人重复画错了，请只替换这一张。当前是 NovelAI nai-diffusion-4-5-full 的 1024×1024 临时预设；这次用无人静物象征社团，只生成一张，不要动个人头像。',
    `正向提示词必须直接使用下面这串英文 NAI 逗号标签，不要翻译、不要改写成自然语言，也不要加入中文：\n${prompt}`,
    `负向提示词：\n${negativePrompt}`,
    '生成成功后把新 attachmentId 覆盖设为“侍奉部”群聊联系人头像，并确认覆盖弹窗；失败就停下，不能沿用那张人数错误的旧图。',
  ].join('\n\n'),
  expectedFeatures: ['contact.avatar.set'],
  expectedTools: ['media.generate_image', 'contact.set_avatar'],
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
