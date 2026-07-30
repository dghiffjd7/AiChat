import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-nai-group-avatar-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-nai-group-avatar-0730.jsonl',
);
const prompt = [
  '4people',
  '1boy',
  '3girls',
  'hikigaya hachiman',
  'yukinoshita yukino',
  'yuigahama yui',
  'original female high school student',
  'medium dark brown hair',
  'gray-green eyes',
  'yahari ore no seishun lovecome wa machigatteiru',
  'group portrait',
  'upper body',
  'school service club room',
  'dark navy school uniforms',
  'natural restrained friendship',
  'soft afternoon light',
  'balanced square composition',
  'faces clearly visible',
  'centered composition',
].join(', ');
const negativePrompt = [
  'lowres',
  'blurry',
  'bad anatomy',
  'bad hands',
  'extra fingers',
  'missing fingers',
  'extra limbs',
  'duplicate person',
  'deformed',
  'text',
  'logo',
  'watermark',
  'signature',
  'photorealistic',
  '3d',
  'multiple views',
  'character sheet',
  'cropped face',
].join(', ');

tasks.push({
  id: 'oregairu-nai-group-avatar-0730-001',
  batch,
  category: 'natural_user_generate_service_club_group_avatar',
  prompt: [
    '最后给“侍奉部”群聊补一张独立的方形群头像。当前是 NovelAI nai-diffusion-4-5-full 的 1024×1024 临时预设；只生成一张，不要拿刚才的横向壁纸裁切，也不要搜索网络图片。',
    `正向提示词必须直接使用下面这串英文 NAI 逗号标签，不要翻译、不要改写成自然语言，也不要加入中文：\n${prompt}`,
    `负向提示词：\n${negativePrompt}`,
    '生成成功后立刻把返回的 attachmentId 设为“侍奉部”群聊联系人头像；如果生成失败就停下说明，不能拿旧附件或别人的图片代替。',
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
