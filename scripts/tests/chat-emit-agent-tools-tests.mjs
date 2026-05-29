import assert from 'node:assert/strict';

import {
  AGENT_PERMISSION_DECISIONS,
  createAgentPermissionEvaluator,
} from '../../src/scripts/agent/agent-permissions.js';
import {
  AgentToolPermissionError,
  createAgentToolRegistry,
} from '../../src/scripts/agent/agent-tool-registry.js';
import { createChatEmitAgentTools } from '../../src/scripts/agent/tools/chat-emit-tools.js';

{
  const tools = createChatEmitAgentTools();
  assert.deepEqual(tools.map(tool => tool.name), [
    'chat.emit_private',
    'chat.emit_group',
    'chat.emit_moment_comment',
    'chat.emit_moment_post',
  ]);
  assert.equal(tools[0].capabilities.modelContext, 'allowlist');
  assert.equal(tools[0].capabilities.write, false);
  assert.equal(tools[0].metadata.writesChat, false);
  assert.equal(tools[0].schema.required.includes('targetName'), true);
  console.log('ok - chat emit agent tools expose review-only provider-native tools');
}

{
  const [privateTool, groupTool, momentCommentTool, momentPostTool] = createChatEmitAgentTools();
  const privateResult = await privateTool.execute({
    targetName: '菲伦',
    speakerName: '菲伦',
    content: '今晚别一个人走。',
    time: '22:12',
  }, { sessionId: 'contact:firen' });
  assert.equal(privateResult.writesChat, false);
  assert.equal(privateResult.requiresUserReview, true);
  assert.equal(privateResult.eventDraft.type, 'private_message');
  assert.equal(privateResult.eventDraft.targetName, '菲伦');
  assert.equal(privateResult.eventDraft.content, '今晚别一个人走。');
  assert.equal(privateResult.commitPreview.currentExecutionWrites, false);
  assert.equal(privateResult.commitPreview.commitWouldWrite, true);
  assert.equal(privateResult.commitPreview.effect, '新增 1 条私聊消息到「菲伦」');
  assert.equal(privateResult.commitContract.status, 'ready');
  assert.equal(privateResult.commitContract.runtime.adapter, 'protocol_event_apply');
  assert.equal(privateResult.commitContract.undo.strategy, 'delete_created_chat_messages');

  const groupResult = await groupTool.execute({
    groupName: '调查组',
    speakerName: '系统消息',
    content: '菲伦加入了群聊',
    system: true,
    members: ['我', '菲伦', '雪'],
  });
  assert.equal(groupResult.eventDraft.type, 'group_system_event');
  assert.deepEqual(groupResult.eventDraft.metadata.members, ['我', '菲伦', '雪']);

  const commentResult = await momentCommentTool.execute({
    momentId: 'moment-1',
    author: '菲伦',
    content: '我会在楼下等你',
    replyTo: 'comment-1',
    replyToAuthor: '雪',
  });
  assert.equal(commentResult.eventDraft.type, 'moment_comment');
  assert.equal(commentResult.eventDraft.metadata.replyToAuthor, '雪');

  const postResult = await momentPostTool.execute({
    author: '雪',
    content: '雾岚洋馆门口多了一双鞋印。',
    likes: 3,
    views: 12,
  });
  assert.equal(postResult.eventDraft.type, 'moment_post');
  assert.equal(postResult.eventDraft.metadata.likes, 3);
  assert.equal(postResult.eventDraft.metadata.views, 12);
  console.log('ok - chat emit agent tools return normalized candidates without writing chat');
}

{
  const registry = createAgentToolRegistry({
    permissionEvaluator: createAgentPermissionEvaluator({
      defaultDecision: AGENT_PERMISSION_DECISIONS.ask,
    }),
    logger: { warn: () => {} },
  });
  registry.registerMany(createChatEmitAgentTools());
  await assert.rejects(
    () => registry.executeTool('chat.emit_private', {
      targetName: '菲伦',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
    }),
    err => err instanceof AgentToolPermissionError && err.code === 'agent_tool_permission_required',
  );
  const result = await registry.executeTool('chat.emit_private', {
    targetName: '菲伦',
    speakerName: '菲伦',
    content: '今晚别一个人走。',
  }, {
    requestPermission: request => (
      request.permissions.includes('chat:emit_candidate')
        ? AGENT_PERMISSION_DECISIONS.allow
        : AGENT_PERMISSION_DECISIONS.deny
    ),
  });
  assert.equal(result.status, 'succeeded');
  assert.equal(result.result.writesChat, false);
  assert.equal(result.result.requiresUserReview, true);
  assert.equal(result.result.commitPreview.confirmationRequired, true);
  assert.equal(result.result.commitContract.currentExecutionWrites, false);
  console.log('ok - chat emit agent tools require explicit permission before capture');
}
