import assert from 'node:assert/strict';

import {
  CHAT_EMIT_COMMIT_CONTRACT_VERSION,
  buildChatEmitCommitContract,
  buildChatEmitProtocolEvent,
} from '../../src/scripts/agent/tools/chat-emit-commit-contract.js';

{
  const protocolEvent = buildChatEmitProtocolEvent({
    toolName: 'chat.emit_private',
    args: {
      targetName: '菲伦',
      speakerName: '菲伦',
      content: '今晚别一个人走。',
      time: '22:12',
    },
  });
  assert.deepEqual(protocolEvent, {
    type: 'private_chat',
    otherName: '菲伦',
    messages: [{
      speaker: '菲伦',
      content: '今晚别一个人走。',
      time: '22:12',
    }],
  });
  console.log('ok - chat emit commit contract builds private protocol events');
}

{
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_group',
    args: {
      groupName: '调查组',
      speakerName: '系统消息',
      content: '菲伦加入了群聊',
      system: true,
      members: ['我', '菲伦'],
    },
  });
  assert.equal(contract.version, CHAT_EMIT_COMMIT_CONTRACT_VERSION);
  assert.equal(contract.status, 'ready');
  assert.equal(contract.currentExecutionWrites, false);
  assert.equal(contract.commitRequiresUserConfirmation, true);
  assert.equal(contract.runtime.adapter, 'protocol_event_apply');
  assert.equal(contract.runtime.requiredMethods.includes('appendMessage'), true);
  assert.equal(contract.undo.strategy, 'delete_created_chat_messages');
  assert.equal(contract.undo.snapshotRequired, false);
  assert.deepEqual(contract.protocolEvent, {
    type: 'group_chat',
    groupName: '调查组',
    members: ['我', '菲伦'],
    messages: [{
      speaker: '系统消息',
      content: '菲伦加入了群聊',
      time: '',
    }],
  });
  console.log('ok - chat emit commit contract describes group chat commit boundary');
}

{
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_moment_comment',
    args: {
      momentId: 'moment-1',
      author: '菲伦',
      content: '我会在楼下等你',
      replyTo: 'comment-1',
      replyToAuthor: '雪',
    },
  });
  assert.equal(contract.runtime.adapter, 'moments_store');
  assert.equal(contract.runtime.requiredMethods.includes('momentsStore.addComments'), true);
  assert.equal(contract.undo.snapshotRequired, true);
  assert.equal(contract.undo.strategy, 'restore_moment_snapshot_then_remove_created_comments');
  assert.deepEqual(contract.protocolEvent, {
    type: 'moment_reply',
    momentId: 'moment-1',
    comments: [{
      author: '菲伦',
      content: '我会在楼下等你',
      replyTo: 'comment-1',
      replyToAuthor: '雪',
      time: '',
    }],
  });
  console.log('ok - chat emit commit contract requires moment comment snapshots');
}

{
  const contract = buildChatEmitCommitContract({
    toolName: 'chat.emit_moment_post',
    args: {
      momentId: 'moment-2',
      author: '雪',
      content: '雾岚洋馆门口多了一双鞋印。',
      likes: 3,
      views: 12,
    },
  });
  assert.equal(contract.runtime.adapter, 'moments_store');
  assert.equal(contract.undo.strategy, 'restore_or_remove_created_moment');
  assert.equal(contract.undo.snapshotRequired, true);
  assert.deepEqual(contract.protocolEvent, {
    type: 'moments',
    moments: [{
      id: 'moment-2',
      author: '雪',
      content: '雾岚洋馆门口多了一双鞋印。',
      time: '',
      likes: 3,
      views: 12,
    }],
  });
  console.log('ok - chat emit commit contract requires moment post snapshots');
}

{
  const contract = buildChatEmitCommitContract({ toolName: 'chat.emit_unknown' });
  assert.equal(contract.status, 'unsupported');
  assert.equal(contract.commitMayWrite, false);
  assert.equal(contract.runtime.adapter, 'unsupported');
  assert.equal(contract.protocolEvent, null);
  console.log('ok - chat emit commit contract fails closed for unknown tools');
}
