import assert from 'node:assert/strict';

import { buildChatEmitCommitPreview } from '../../src/scripts/agent/tools/chat-emit-commit-plan.js';

{
  const preview = buildChatEmitCommitPreview({
    toolName: 'chat.emit_private',
    args: {
      targetName: '菲伦',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
    },
    sessionId: 'contact:firen',
  });
  assert.equal(preview.currentExecutionWrites, false);
  assert.equal(preview.commitWouldWrite, true);
  assert.equal(preview.confirmationRequired, true);
  assert.equal(preview.operation, 'append_private_message');
  assert.equal(preview.effect, '新增 1 条私聊消息到「菲伦」');
  assert.match(preview.confirmationSummary, /当前 tool call 只捕获候选/);
  console.log('ok - chat emit commit preview describes private message without writing');
}

{
  const preview = buildChatEmitCommitPreview({
    toolName: 'chat.emit_group',
    args: {
      groupName: '调查组',
      speakerName: '系统消息',
      content: '菲伦加入了群聊',
      system: true,
    },
  });
  assert.equal(preview.operation, 'append_group_system_event');
  assert.equal(preview.effect, '新增 1 条群系统事件到「调查组」');
  assert.match(preview.undoSummary, /删除该新增群聊事件/);
  console.log('ok - chat emit commit preview distinguishes group system events');
}

{
  const preview = buildChatEmitCommitPreview({
    toolName: 'chat.emit_moment_comment',
    args: {
      momentId: 'moment-1',
      author: '菲伦',
      content: '我会在楼下等你',
    },
  });
  assert.equal(preview.operation, 'append_moment_comment');
  assert.equal(preview.surface, 'moments');
  assert.equal(preview.effect, '新增 1 条动态评论到「moment-1」');
  console.log('ok - chat emit commit preview describes moment comments');
}

{
  const preview = buildChatEmitCommitPreview({
    toolName: 'chat.emit_moment_post',
    args: {
      author: '雪',
      content: '雾岚洋馆门口多了一双鞋印。',
    },
  });
  assert.equal(preview.operation, 'create_moment_post');
  assert.equal(preview.effect, '新增 1 条动态发布');
  assert.equal(preview.diff.add, 1);
  console.log('ok - chat emit commit preview describes moment posts');
}
