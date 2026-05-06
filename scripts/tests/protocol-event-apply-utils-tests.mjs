import assert from 'node:assert/strict';

import {
  applyProtocolMomentEvent,
  appendProtocolGroupChatEventImmediate,
  appendProtocolPrivateChatEventImmediate,
} from '../../src/scripts/ui/chat/protocol-event-apply-utils.js';

{
  const calls = [];
  const momentsResult = applyProtocolMomentEvent(
    { type: 'moments', moments: [{ id: 'm1' }] },
    {
      addMoments: items => calls.push(['moments', items]),
      addMomentComments: () => calls.push(['comments']),
      normalizeComments: items => items,
    },
  );
  assert.deepEqual(momentsResult, {
    consumed: true,
    didAnything: true,
    mutatedMoments: true,
    targetSessionId: '',
  });
  const replyResult = applyProtocolMomentEvent(
    { type: 'moment_reply', momentId: 'm1', comments: [{ content: 'hi' }] },
    {
      addMoments: () => {},
      addMomentComments: (momentId, comments) => calls.push(['reply', momentId, comments]),
      normalizeComments: items => items.map(item => ({ ...item, normalized: true })),
    },
  );
  assert.equal(replyResult.didAnything, true);
  assert.deepEqual(calls, [
    ['moments', [{ id: 'm1' }]],
    ['reply', 'm1', [{ content: 'hi', normalized: true }]],
  ]);
  const abortResult = applyProtocolMomentEvent(
    { type: 'moment_reply', momentId: '   ', comments: [] },
    { abortOnMissingMomentId: true },
  );
  assert.equal(abortResult.abortFlow, true);
  console.log('ok - applyProtocolMomentEvent handles moments and reply mutations');
}

{
  const ui = [];
  const appended = [];
  const reads = [];
  const receives = [];
  const systemOps = [];
  const result = await appendProtocolGroupChatEventImmediate(
    {
      type: 'group_chat',
      groupName: '群A',
      messages: [
        { speaker: '系统', content: '系统通知', time: '09:00' },
        { speaker: '角色A', content: '你好', time: '09:01' },
        { speaker: '我', content: '重复回声', time: '09:02' },
      ],
    },
    {
      resolveTargetSessionId: name => (name === '群A' ? 'group:1' : ''),
      normalizeChatMessage: item => item,
      isSystemSpeaker: speaker => speaker === '系统',
      buildSystemMessage: ({ content, time, fallbackTime }) => ({ role: 'system', content, time: time || fallbackTime }),
      isUserSpeakerName: speaker => speaker === '我',
      shouldDropUserEcho: content => content === '重复回声',
      resolveGroupSpeakerContact: speaker => ({ id: `${speaker}-id` }),
      resolveGroupSpeakerAvatar: speaker => `avatar:${speaker}`,
      buildAssistantMessageFromText: async (content, options) => ({ role: 'assistant', content, ...options }),
      buildUserMessageFromAI: (content, time) => ({ role: 'user', content, time }),
      isSessionActive: sessionId => sessionId === 'group:1',
      onAddUiMessage: message => ui.push(message),
      appendMessage: (message, sessionId) => {
        appended.push([sessionId, message]);
        return { ...message, id: `${sessionId}:${appended.length}` };
      },
      autoMarkReadIfActive: (sessionId, messageId) => reads.push([sessionId, messageId]),
      emitPluginAfterReceive: (message, sessionId) => receives.push([sessionId, message.id]),
      maybeApplyGroupSystemOps: (content, sessionId) => systemOps.push([sessionId, content]),
      formatNowTime: () => '10:00',
    },
  );
  assert.deepEqual(result, {
    consumed: true,
    didAnything: true,
    mutatedMoments: false,
    targetSessionId: 'group:1',
  });
  assert.equal(ui.length, 2);
  assert.equal(appended.length, 2);
  assert.deepEqual(reads, [['group:1', 'group:1:2']]);
  assert.deepEqual(systemOps, [['group:1', '系统通知']]);
  assert.deepEqual(receives, [['group:1', 'group:1:1'], ['group:1', 'group:1:2']]);
  console.log('ok - appendProtocolGroupChatEventImmediate handles system assistant and dropped user echo');
}

{
  const ui = [];
  const appended = [];
  const reads = [];
  const receives = [];
  const result = await appendProtocolPrivateChatEventImmediate(
    {
      type: 'private_chat',
      otherName: '角色B',
      messages: [
        '我: 你好',
        '角色B: 回应',
      ],
    },
    {
      resolveTargetSessionId: name => (name === '角色B' ? 'c2' : ''),
      normalizeDialogueMessage: (text) => {
        if (text.startsWith('我:')) return { speaker: '我', content: '你好', time: '11:00' };
        return { speaker: '角色B', content: '回应', time: '11:01' };
      },
      shouldDropUserEcho: () => false,
      isUserSpeakerName: speaker => speaker === '我',
      buildUserMessageFromAI: (content, time) => ({ role: 'user', content, time }),
      buildAssistantMessageFromText: async (content, options) => ({ role: 'assistant', content, ...options }),
      isSessionActive: sessionId => sessionId === 'c2',
      onAddUiMessage: message => ui.push(message),
      appendMessage: (message, sessionId) => {
        appended.push([sessionId, message]);
        return { ...message, id: `${sessionId}:${appended.length}` };
      },
      autoMarkReadIfActive: (sessionId, messageId) => reads.push([sessionId, messageId]),
      emitPluginAfterReceive: (message, sessionId) => receives.push([sessionId, message.id]),
      formatNowTime: () => '11:30',
    },
  );
  assert.deepEqual(result, {
    consumed: true,
    didAnything: true,
    mutatedMoments: false,
    targetSessionId: 'c2',
  });
  assert.equal(ui.length, 2);
  assert.equal(appended.length, 2);
  assert.deepEqual(reads, [['c2', 'c2:2']]);
  assert.deepEqual(receives, [['c2', 'c2:1'], ['c2', 'c2:2']]);
  console.log('ok - appendProtocolPrivateChatEventImmediate handles user and assistant dialogue messages');
}
