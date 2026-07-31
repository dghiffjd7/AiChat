import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'v4f-v2-media-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-v4f-v2-media-0731.jsonl',
);

tasks.push(
  {
    id: 'v4f-v2-media-0731-001',
    batch,
    category: 'dynamic_image_profile_contact_avatar',
    prompt: [
      '给霜港调查队长「艾琳·洛」补一张联系人头像。',
      '直接使用当前启用的生图配置；请先自行读取实际渠道与模型要求，再按该渠道自动选择正确的提示词语言、写法和尺寸，不要反问我要 tag 还是自然语言。',
      '画面是单人半身头像：成年女性，银白色低马尾，海蓝色眼睛，深蓝调查队制服，冷静可靠，雾港背景简洁；1:1，只生成一张。',
      '生成成功后立刻把本次返回的 attachmentId 设置为「艾琳·洛」联系人头像并读回确认；失败就如实停止，不能复用旧附件。',
    ].join('\n'),
    expectedFeatures: ['contact.avatar.set'],
    expectedTools: ['media.generate_image', 'contact.set_avatar'],
    expectedAnyTools: [],
    expectedDisposition: 'discover_image_dialect_generate_apply_avatar',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 900_000,
  },
  {
    id: 'v4f-v2-media-0731-002',
    batch,
    category: 'dynamic_image_profile_session_wallpaper',
    prompt: [
      '再给「艾琳·洛」私聊做一张专属横向壁纸。',
      '仍然使用当前启用的生图配置，并自行根据实际渠道采用正确提示词语言与格式，不要让我补模型写法。',
      '画面保持与头像同一人物设定和动画画风：银白色低马尾、海蓝色眼睛、深蓝调查队制服；她站在蓝焰灯塔前的雾港码头，横向远景、人物在右侧、左侧留出聊天文字空间，无文字、无水印；只生成一张。',
      '成功后把这次新返回的 attachmentId 设置为「艾琳·洛」聊天室壁纸，opacity 设为 1，并读回确认；失败就停止，不能使用头像附件或其他旧附件。',
    ].join('\n'),
    expectedFeatures: ['session.wallpaper.set'],
    expectedTools: ['media.generate_image', 'session.set_wallpaper'],
    expectedAnyTools: [],
    expectedDisposition: 'discover_image_dialect_generate_apply_wallpaper',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 900_000,
  },
  {
    id: 'v4f-v2-media-0731-003',
    batch,
    category: 'media_independent_readback',
    prompt: [
      '现在只读核对「艾琳·洛」：联系人头像必须非空，私聊壁纸也必须非空且 opacity 为 1。',
      '请读取真实资源状态，不要根据刚才的成功提示猜测，不要重新生成、不要重新设置，也不要打开聊天室。',
    ].join('\n'),
    expectedFeatures: ['app.resource.read'],
    expectedTools: ['app.read_resource'],
    expectedAnyTools: [],
    expectedDisposition: 'read_only_media_persistence_audit',
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
