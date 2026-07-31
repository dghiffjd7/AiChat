import { resolve } from 'node:path';

import { tasks } from './task-bank.mjs';

const batch = 'one-piece-media-chat-sol-0731';
const defaultOutput = resolve(
  'scripts/dev/tmp/mt-observation/results-one-piece-media-chat-sol-0731.jsonl',
);

tasks.push(
  {
    id: 'one-piece-media-chat-sol-0731-001',
    batch,
    category: 'natural_user_generate_luffy_avatar',
    prompt: [
      '先只处理一个代表样本：请给「蒙奇·D·路飞」这个联系人生成并设置一张头像。',
      '不要联网找图，直接使用我当前启用的生图配置；提示词格式请你根据当前渠道自己判断，不要反问我模型格式。',
      '画面保留草帽、黑色短发、开朗笑容、红色背心等辨识特征，做成 1:1 的单人半身头像。',
      '只生成一张；成功后立即把这次返回的 attachmentId 设为他的联系人头像，并读回确认。失败就停下，不要拿旧附件或别人的图片代替。',
    ].join('\n'),
    expectedFeatures: ['contact.avatar.set'],
    expectedTools: ['media.generate_image', 'contact.set_avatar'],
    expectedAnyTools: [],
    expectedDisposition: 'generate_apply_verify_single_avatar',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 900_000,
  },
  {
    id: 'one-piece-media-chat-sol-0731-002',
    batch,
    category: 'natural_user_search_nami_wallpaper',
    prompt: [
      '接着只处理「娜美」聊天室的壁纸。这次不要生图，请联网搜索适合的横向动漫壁纸。',
      '搜索词请你自己用英文组织，目标是 One Piece 的娜美、横向构图、适合聊天背景；优先选择与人物相符且能直接下载的图片。',
      '从搜索结果选第一张合理的有效 imageUrl，用 media.fetch_image 取得真实 attachmentId，再把它设为「娜美」聊天室壁纸，opacity 设为 1。',
      '不要把网页地址或缩略图地址直接冒充附件；搜索或下载失败就停止并如实说明，不要改其他聊天室。',
    ].join('\n'),
    expectedFeatures: ['web.search', 'session.wallpaper.set'],
    expectedTools: ['web.search_images', 'media.fetch_image', 'session.set_wallpaper'],
    expectedAnyTools: [],
    expectedDisposition: 'search_fetch_apply_verify_single_wallpaper',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 900_000,
  },
  {
    id: 'one-piece-media-chat-sol-0731-003',
    batch,
    category: 'natural_user_chat_with_luffy',
    prompt: [
      '现在帮我进入「蒙奇·D·路飞」的私聊并发出这句话：',
      '“路飞，我刚登上船，先带我认识一下草帽一伙吧。”',
      '这次要 triggerReply:true，确实触发他的 AI 回复并打开目标聊天室；不要发到当前的其他人物房间，也不要只做后台留言。',
    ].join('\n'),
    expectedFeatures: ['chat.send_message'],
    expectedTools: ['chat.send_message'],
    expectedAnyTools: [],
    expectedDisposition: 'send_and_trigger_character_reply',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 600_000,
  },
  {
    id: 'one-piece-media-chat-sol-0731-004',
    batch,
    category: 'natural_user_chat_with_nami',
    prompt: [
      '再帮我进入「娜美」的私聊并发出这句话：',
      '“娜美，我们下一站往哪里走？我需要先准备什么？”',
      '同样要 triggerReply:true，确实触发她的 AI 回复并打开目标聊天室；不要把消息发给路飞或当前的其他人物。',
    ].join('\n'),
    expectedFeatures: ['chat.send_message'],
    expectedTools: ['chat.send_message'],
    expectedAnyTools: [],
    expectedDisposition: 'send_and_trigger_character_reply',
    autoConfirm: true,
    allowSubAgent: false,
    followGuide: false,
    maxMs: 600_000,
  },
);

if (!process.argv.includes('--batch')) process.argv.push('--batch', batch);
if (!process.argv.includes('--output')) process.argv.push('--output', defaultOutput);
if (!process.argv.includes('--expected-maid-model')) {
  process.argv.push('--expected-maid-model', 'gpt-5.6-sol');
}
if (!process.argv.includes('--expected-maid-profile')) {
  process.argv.push('--expected-maid-profile', 'pioneer');
}
if (!process.argv.includes('--expected-maid-provider')) {
  process.argv.push('--expected-maid-provider', 'custom');
}

await import('./run-batch.mjs');
