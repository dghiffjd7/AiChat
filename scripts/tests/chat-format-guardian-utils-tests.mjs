import assert from 'node:assert/strict';

import {
  CHAT_FORMAT_EVENT_TYPES,
  extractChatFormatEventDrafts,
  validateChatFormatEventDraft,
} from '../../src/scripts/ui/chat/chat-format-guardian-utils.js';

{
  const result = extractChatFormatEventDrafts([
    'MiPhone_start',
    'msg_start',
    '<我和菲伦的私聊>',
    '菲伦--今晚别一个人走。--22:10',
    '</我和菲伦的私聊>',
    'msg_end',
    'MiPhone_end',
  ].join('\n'), {
    userName: '我',
    sourceMessageId: 'assistant-1',
    resolvePrivateTargetId: name => (name === '菲伦' ? 'contact:firen' : ''),
    resolveSpeakerId: name => (name === '菲伦' ? 'contact:firen' : ''),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.eventDrafts.length, 1);
  assert.equal(result.eventDrafts[0].type, CHAT_FORMAT_EVENT_TYPES.privateMessage);
  assert.equal(result.eventDrafts[0].targetId, 'contact:firen');
  assert.equal(result.eventDrafts[0].speakerName, '菲伦');
  assert.equal(result.eventDrafts[0].content, '今晚别一个人走。');
  assert.equal(result.eventDrafts[0].sourceMessageId, 'assistant-1');
  console.log('ok - chat format guardian extracts private chat event drafts');
}

{
  const result = extractChatFormatEventDrafts([
    '<群聊:调查组>',
    '<成员>我,菲伦,雪</成员>',
    '<聊天内容>',
    '系统消息: 菲伦加入了群聊',
    '雪--我看到了门口的鞋印。--22:11',
    '</聊天内容>',
    '</群聊:调查组>',
  ].join('\n'), {
    resolveGroupTargetId: name => (name === '调查组' ? 'group:case' : ''),
    resolveSpeakerId: name => (name === '雪' ? 'contact:snow' : ''),
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'needs_review');
  assert.equal(result.eventDrafts.length, 2);
  assert.equal(result.eventDrafts[0].type, CHAT_FORMAT_EVENT_TYPES.groupSystemEvent);
  assert.equal(result.eventDrafts[1].type, CHAT_FORMAT_EVENT_TYPES.groupMessage);
  assert.equal(result.eventDrafts[1].targetId, 'group:case');
  assert.equal(result.eventDrafts[1].speakerId, 'contact:snow');
  assert.equal(result.warnings.includes('time is missing'), true);
  console.log('ok - chat format guardian extracts group message and system event drafts');
}

{
  const result = extractChatFormatEventDrafts([
    'moment_reply_start',
    'moment_id:: moment-1',
    '菲伦--我会在楼下等你--reply_to:: comment-1--reply_to_author:: 雪',
    'moment_reply_end',
  ].join('\n'));

  assert.equal(result.ok, true);
  assert.equal(result.status, 'ready');
  assert.equal(result.eventDrafts.length, 1);
  assert.equal(result.eventDrafts[0].type, CHAT_FORMAT_EVENT_TYPES.momentComment);
  assert.equal(result.eventDrafts[0].surface, 'moments');
  assert.equal(result.eventDrafts[0].targetId, 'moment-1');
  assert.equal(result.eventDrafts[0].metadata.replyTo, 'comment-1');
  console.log('ok - chat format guardian extracts moment reply drafts');
}

{
  const result = extractChatFormatEventDrafts('普通正文，没有手机协议');
  assert.equal(result.ok, false);
  assert.equal(result.status, 'no_events');
  assert.equal(result.eventDrafts.length, 0);
  assert.equal(result.summary, 'no chat format events detected');
  console.log('ok - chat format guardian reports no_events without writing');
}

{
  const validation = validateChatFormatEventDraft({
    type: 'private_message',
    surface: 'chat',
    content: '',
  });

  assert.equal(validation.ok, false);
  assert.equal(validation.severity, 'error');
  assert.equal(validation.errors.includes('content is required'), true);
  assert.equal(validation.warnings.includes('target is unresolved'), true);
  console.log('ok - chat format guardian validates missing required draft fields');
}
