import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'oregairu-nai-wallpapers-clean-0730';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-oregairu-nai-wallpapers-clean-0730.jsonl',
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
  'portrait',
  'close-up',
  'vertical composition',
  'split screen',
  'character sheet',
].join(', ');

const addWallpaperTask = ({ id, category, target, prompt }) => {
  tasks.push({
    id,
    batch,
    category,
    prompt: [
      `再给“${target}”聊天室做一张专属横向壁纸。当前是 NovelAI nai-diffusion-4-5-full 的 1344×768 临时预设；只生成一张，不要搜索网络图片。`,
      `正向提示词必须直接使用下面这串英文 NAI 逗号标签，不要翻译、不要改写成自然语言，也不要加入中文：\n${prompt}`,
      `负向提示词：\n${negativePrompt}`,
      `生成成功后立刻把返回的 attachmentId 设为“${target}”聊天室壁纸，opacity 设为 1；如果生成失败就停下说明，不能拿旧附件或别人的图片代替。`,
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
};

addWallpaperTask({
  id: 'oregairu-nai-wallpapers-clean-0730-001',
  category: 'natural_user_generate_hachiman_wallpaper',
  target: '比企谷八幡',
  prompt: [
    '1boy',
    'hikigaya hachiman',
    'yahari ore no seishun lovecome wa machigatteiru',
    'wide shot',
    'school service club room',
    'sitting near window',
    'messy short black hair',
    'dark navy school uniform',
    'quiet thoughtful mood',
    'late afternoon sunlight',
    'empty desks',
    'soft blue and amber color palette',
    'cinematic horizontal composition',
    'detailed background',
  ].join(', '),
});

addWallpaperTask({
  id: 'oregairu-nai-wallpapers-clean-0730-002',
  category: 'natural_user_generate_yukino_wallpaper',
  target: '雪之下雪乃',
  prompt: [
    '1girl',
    'yukinoshita yukino',
    'yahari ore no seishun lovecome wa machigatteiru',
    'wide shot',
    'school service club room',
    'sitting by window',
    'reading a book',
    'long straight black hair',
    'dark navy school uniform',
    'tea cup on table',
    'calm elegant mood',
    'cool afternoon light',
    'soft blue color palette',
    'cinematic horizontal composition',
    'detailed background',
  ].join(', '),
});

addWallpaperTask({
  id: 'oregairu-nai-wallpapers-clean-0730-003',
  category: 'natural_user_generate_yui_wallpaper',
  target: '由比滨结衣',
  prompt: [
    '1girl',
    'yuigahama yui',
    'yahari ore no seishun lovecome wa machigatteiru',
    'wide shot',
    'school service club room',
    'standing beside table',
    'peach brown hair',
    'side bun',
    'dark navy school uniform',
    'warm cheerful smile',
    'paper bag with homemade cookies',
    'golden afternoon sunlight',
    'warm peach color palette',
    'cinematic horizontal composition',
    'detailed background',
  ].join(', '),
});

addWallpaperTask({
  id: 'oregairu-nai-wallpapers-clean-0730-004',
  category: 'natural_user_generate_shizuka_wallpaper',
  target: '平塚静',
  prompt: [
    '1woman',
    'hiratsuka shizuka',
    'yahari ore no seishun lovecome wa machigatteiru',
    'wide shot',
    'quiet Japanese high school corridor',
    'standing near service club door',
    'long black hair',
    'white lab coat',
    'black shirt',
    'confident caring expression',
    'sunset through classroom windows',
    'mature calm mood',
    'cinematic horizontal composition',
    'detailed background',
  ].join(', '),
});

addWallpaperTask({
  id: 'oregairu-nai-wallpapers-clean-0730-005',
  category: 'natural_user_generate_service_club_group_wallpaper',
  target: '侍奉部',
  prompt: [
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
    'wide group shot',
    'school service club room',
    'sitting around table',
    'dark navy school uniforms',
    'books and tea cups',
    'natural restrained friendship',
    'late afternoon sunlight',
    'cinematic horizontal composition',
    'balanced composition',
    'detailed background',
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
