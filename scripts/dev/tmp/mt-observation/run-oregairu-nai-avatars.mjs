import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-nai-avatars-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-nai-avatars-0730.jsonl',
);
const negativePrompt = [
  'lowres',
  'blurry',
  'bad anatomy',
  'bad hands',
  'extra fingers',
  'missing fingers',
  'extra limbs',
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

const addAvatarTask = ({
  id,
  category,
  targetLabel,
  targetKind = 'contact',
  prompt,
}) => {
  const setter = targetKind === 'persona' ? 'persona.set_avatar' : 'contact.set_avatar';
  const feature = targetKind === 'persona' ? 'persona.avatar.set' : 'contact.avatar.set';
  tasks.push({
    id,
    batch,
    category,
    prompt: [
      `先把${targetLabel}的头像补上。当前生图配置是 NovelAI nai-diffusion-4-5-full；只生成一张，不要搜索网络图片。`,
      `正向提示词必须直接使用下面这串英文 NAI 逗号标签，不要翻译、不要改写成自然语言，也不要加入中文：\n${prompt}`,
      `负向提示词：\n${negativePrompt}`,
      `生成成功后立刻把返回的 attachmentId 设为${targetLabel}头像；如果生成失败就停下说明，不能拿旧附件或其他人的图片代替。`,
    ].join('\n\n'),
    expectedFeatures: [feature],
    expectedTools: ['media.generate_image', setter],
    expectedAnyTools: [],
    expectedDisposition: 'write_allowed',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 600_000,
  });
};

addAvatarTask({
  id: 'oregairu-nai-avatars-0730-001',
  category: 'natural_user_generate_persona_user_visual',
  targetLabel: '当前“总武高·侍奉部企划”角色卡',
  targetKind: 'persona',
  prompt: [
    '1girl',
    'solo',
    'original character',
    'Japanese high school student',
    'portrait',
    'head and shoulders',
    'looking at viewer',
    'medium dark brown hair',
    'straight hair',
    'gray-green eyes',
    'neat school uniform',
    'dark navy blazer',
    'white shirt',
    'red ribbon',
    'calm reserved expression',
    'subtle gentle smile',
    'soft classroom background',
    'centered composition',
  ].join(', '),
});

addAvatarTask({
  id: 'oregairu-nai-avatars-0730-002',
  category: 'natural_user_generate_hachiman_avatar',
  targetLabel: '比企谷八幡聊天室联系人',
  prompt: [
    '1boy',
    'solo',
    'hikigaya hachiman',
    'yahari ore no seishun lovecome wa machigatteiru',
    'portrait',
    'head and shoulders',
    'looking at viewer',
    'messy short black hair',
    'ahoge',
    'gray eyes',
    'tired eyes',
    'dark navy school blazer',
    'white shirt',
    'red tie',
    'reserved neutral expression',
    'soft classroom background',
    'centered composition',
  ].join(', '),
});

addAvatarTask({
  id: 'oregairu-nai-avatars-0730-003',
  category: 'natural_user_generate_yukino_avatar',
  targetLabel: '雪之下雪乃聊天室联系人',
  prompt: [
    '1girl',
    'solo',
    'yukinoshita yukino',
    'yahari ore no seishun lovecome wa machigatteiru',
    'portrait',
    'head and shoulders',
    'looking at viewer',
    'long straight black hair',
    'blue eyes',
    'dark navy school blazer',
    'white shirt',
    'red ribbon',
    'composed expression',
    'subtle serious gaze',
    'soft clubroom background',
    'centered composition',
  ].join(', '),
});

addAvatarTask({
  id: 'oregairu-nai-avatars-0730-004',
  category: 'natural_user_generate_yui_avatar',
  targetLabel: '由比滨结衣聊天室联系人',
  prompt: [
    '1girl',
    'solo',
    'yuigahama yui',
    'yahari ore no seishun lovecome wa machigatteiru',
    'portrait',
    'head and shoulders',
    'looking at viewer',
    'peach brown hair',
    'side bun',
    'blue eyes',
    'dark navy school blazer',
    'white shirt',
    'red ribbon',
    'warm cheerful smile',
    'soft classroom background',
    'centered composition',
  ].join(', '),
});

addAvatarTask({
  id: 'oregairu-nai-avatars-0730-005',
  category: 'natural_user_generate_shizuka_avatar',
  targetLabel: '平塚静聊天室联系人',
  prompt: [
    '1woman',
    'solo',
    'hiratsuka shizuka',
    'yahari ore no seishun lovecome wa machigatteiru',
    'portrait',
    'head and shoulders',
    'looking at viewer',
    'long black hair',
    'green eyes',
    'white lab coat',
    'black shirt',
    'confident mature expression',
    'subtle caring smile',
    'soft school office background',
    'centered composition',
  ].join(', '),
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
