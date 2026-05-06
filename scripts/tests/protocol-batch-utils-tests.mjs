import assert from 'node:assert/strict';

import {
  buildProtocolGroupChatBatch,
  buildProtocolPrivateChatBatch,
  dispatchProtocolGroupChatBatch,
  dispatchProtocolPrivateChatBatch,
} from '../../src/scripts/ui/chat/protocol-batch-utils.js';

{
  const batch = await buildProtocolGroupChatBatch(
    {
      groupName: '群A',
      messages: [
        { speaker: '系统', content: '系统通知', time: '09:00' },
        { speaker: '角色A', content: '你好', time: '09:01' },
        { speaker: '我', content: '回声', time: '09:02' },
      ],
    },
    {
      resolveTargetSessionId: name => (name === '群A' ? 'group:1' : ''),
      normalizeChatMessage: item => item,
      isSystemSpeaker: speaker => speaker === '系统',
      isUserSpeakerName: speaker => speaker === '我',
      shouldDropUserEcho: content => content === '回声',
      resolveGroupSpeakerContact: speaker => ({ id: `${speaker}-id` }),
      resolveGroupSpeakerAvatar: speaker => `avatar:${speaker}`,
      buildSystemMessage: ({ content, time }) => ({ role: 'system', content, time }),
      buildAssistantMessageFromText: async (content, options) => ({ role: 'assistant', content, ...options }),
      buildUserMessageFromAI: (content, time) => ({ role: 'user', content, time }),
      formatNowTime: () => '10:00',
    },
  );
  assert.equal(batch.targetSessionId, 'group:1');
  assert.equal(batch.items.length, 2);
  assert.equal(batch.uniqueAssistantSpeakerCount, 1);
  console.log('ok - buildProtocolGroupChatBatch normalizes system assistant and dropped echo messages');
}

{
  const appended = [];
  const reads = [];
  const receives = [];
  const systemOps = [];
  const ui = [];
  await dispatchProtocolGroupChatBatch(
    {
      targetSessionId: 'group:1',
      uniqueAssistantSpeakerCount: 1,
      items: [
        { parsed: { role: 'system', content: '系统通知' }, isSystem: true, role: 'system' },
        { parsed: { role: 'assistant', name: '角色A', content: '你好' }, isSystem: false, role: 'assistant' },
      ],
    },
    {
      isActive: true,
      animEnabled: false,
      onAddUiMessage: (message, options) => ui.push([message, options]),
      appendMessage: (message, sessionId) => {
        appended.push([sessionId, message]);
        return { ...message, id: `${sessionId}:${appended.length}` };
      },
      autoMarkReadIfActive: (sessionId, messageId) => reads.push([sessionId, messageId]),
      emitPluginAfterReceive: (message, sessionId) => receives.push([sessionId, message.id]),
      maybeApplyGroupSystemOps: (content, sessionId) => systemOps.push([sessionId, content]),
      bumpReadCount: count => reads.push(['bump', count]),
    },
  );
  assert.equal(ui.length, 2);
  assert.equal(appended.length, 2);
  assert.deepEqual(systemOps, [['group:1', '系统通知']]);
  assert.deepEqual(receives, [['group:1', 'group:1:1'], ['group:1', 'group:1:2']]);
  assert.deepEqual(reads, [['group:1', 'group:1:2'], ['bump', 1]]);
  console.log('ok - dispatchProtocolGroupChatBatch handles immediate ui append save and read count');
}

{
  const batch = await buildProtocolPrivateChatBatch(
    {
      otherName: '角色B',
      messages: ['我: 你好', '角色B: 回复'],
    },
    {
      resolveTargetSessionId: name => (name === '角色B' ? 'c2' : ''),
      normalizeDialogueMessage: text => (
        text.startsWith('我:')
          ? { speaker: '我', content: '你好', time: '11:00' }
          : { speaker: '角色B', content: '回复', time: '11:01' }
      ),
      shouldDropUserEcho: () => false,
      isUserSpeakerName: speaker => speaker === '我',
      buildUserMessageFromAI: (content, time) => ({ role: 'user', content, time }),
      buildAssistantMessageFromText: async (content, options) => ({ role: 'assistant', content, ...options }),
      formatNowTime: () => '11:30',
    },
  );
  assert.equal(batch.targetSessionId, 'c2');
  assert.equal(batch.items.length, 2);
  console.log('ok - buildProtocolPrivateChatBatch normalizes dialogue messages into parsed batch');
}

{
  const appended = [];
  const reads = [];
  const receives = [];
  let queued = 0;
  await dispatchProtocolPrivateChatBatch(
    {
      targetSessionId: 'c2',
      items: [
        { parsed: { role: 'user', content: '你好' }, isMe: true },
        { parsed: { role: 'assistant', content: '回复' }, isMe: false },
      ],
    },
    {
      isActive: true,
      animEnabled: true,
      enqueueMessages: (items) => {
        queued += 1;
        return {
          promise: Promise.resolve().then(() => {
            items.forEach(item => item.callback());
          }),
        };
      },
      appendMessage: (message, sessionId) => {
        appended.push([sessionId, message]);
        return { ...message, id: `${sessionId}:${appended.length}` };
      },
      autoMarkReadIfActive: (sessionId, messageId) => reads.push([sessionId, messageId]),
      emitPluginAfterReceive: (message, sessionId) => receives.push([sessionId, message.id]),
      onQueueCreated: () => {},
      queueAvatarUrl: 'assistant',
      queueTypingOptions: {},
    },
  );
  assert.equal(queued, 1);
  assert.equal(appended.length, 2);
  assert.deepEqual(reads, [['c2', 'c2:2']]);
  assert.deepEqual(receives, [['c2', 'c2:1'], ['c2', 'c2:2']]);
  console.log('ok - dispatchProtocolPrivateChatBatch supports queued append flow');
}
