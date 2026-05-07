import assert from 'node:assert/strict';

import {
  buildCancelledAssistantPartial,
  buildCancelledAssistantPartialMessage,
  commitCancelledGenerationPartial,
  createActiveGenerationRecord,
} from '../../src/scripts/ui/chat/generation-state-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('createActiveGenerationRecord keeps caller ownership fields and initializes runtime slots', () => {
  const partialCommitHandler = () => true;
  const swipeTarget = { msgId: 'assistant-1' };
  const result = createActiveGenerationRecord({
    id: 3,
    sessionId: 'session-a',
    userMsgId: 'user-1',
    partialCommitHandler,
    swipeTarget,
  });

  assert.deepEqual(result, {
    id: 3,
    sessionId: 'session-a',
    userMsgId: 'user-1',
    streamCtrl: null,
    streamText: '',
    streamPayload: null,
    streamMeta: null,
    reattachStream: null,
    partialCommitHandler,
    swipeTarget,
    cancelled: false,
  });
});

test('buildCancelledAssistantPartial returns null when there is no cached stream text', () => {
  assert.equal(
    buildCancelledAssistantPartial({
      generation: {
        streamText: '   ',
      },
      assistantAvatar: 'fallback.png',
      fallbackTime: '10:00',
    }),
    null,
  );
});

test('buildCancelledAssistantPartial uses cached meta first and falls back to runtime defaults', () => {
  const partial = buildCancelledAssistantPartial({
    generation: {
      streamText: '部分回复',
      streamCtrl: { id: 'stream-1' },
      streamMeta: {
        id: 'assistant-2',
        name: '小助手',
        avatar: 'assistant.png',
        time: '11:11',
      },
    },
    assistantAvatar: 'fallback.png',
    fallbackTime: '10:00',
  });

  assert.deepEqual(partial, {
    role: 'assistant',
    type: 'text',
    id: 'assistant-2',
    name: '小助手',
    avatar: 'assistant.png',
    time: '11:11',
    content: '部分回复',
    raw: '部分回复',
    rawOriginal: '部分回复',
    meta: {
      partial: true,
      cancelled: true,
    },
  });
});

test('buildCancelledAssistantPartial falls back to stream controller id and provided avatar/time', () => {
  const partial = buildCancelledAssistantPartial({
    generation: {
      streamText: '中断内容',
      streamCtrl: { id: 'stream-3' },
      streamMeta: {},
    },
    assistantAvatar: 'fallback.png',
    fallbackTime: '12:34',
  });

  assert.equal(partial.id, 'stream-3');
  assert.equal(partial.avatar, 'fallback.png');
  assert.equal(partial.time, '12:34');
  assert.equal(partial.content, '中断内容');
});

test('buildCancelledAssistantPartialMessage preserves cancel append payload shape', () => {
  const message = buildCancelledAssistantPartialMessage({
    partial: {
      id: ' assistant-1 ',
      name: '助手A',
      avatar: 'assistant.png',
      time: '13:00',
      content: '已生成部分',
      raw: 'raw 部分',
      rawOriginal: 'raw original 部分',
      meta: { partial: false, custom: true },
    },
    assistantAvatar: 'fallback.png',
    fallbackTime: '12:00',
  });

  assert.deepEqual(message, {
    role: 'assistant',
    type: 'text',
    id: 'assistant-1',
    name: '助手A',
    avatar: 'assistant.png',
    time: '13:00',
    content: '已生成部分',
    raw: 'raw 部分',
    rawOriginal: 'raw original 部分',
    meta: {
      partial: true,
      custom: true,
      cancelled: true,
    },
  });
});

test('buildCancelledAssistantPartialMessage falls back to content raw avatar and time', () => {
  const message = buildCancelledAssistantPartialMessage({
    partial: {
      content: 'fallback content',
    },
    assistantAvatar: 'fallback.png',
    fallbackTime: '12:00',
  });

  assert.equal(message.id, undefined);
  assert.equal(message.raw, 'fallback content');
  assert.equal(message.rawOriginal, 'fallback content');
  assert.equal(message.avatar, 'fallback.png');
  assert.equal(message.time, '12:00');
  assert.equal(buildCancelledAssistantPartialMessage({ partial: { content: '   ' } }), null);
});

test('commitCancelledGenerationPartial appends unhandled user partials and refreshes contacts', () => {
  const appended = [];
  let refreshed = 0;
  const result = commitCancelledGenerationPartial({
    generation: { sessionId: 'session-a' },
    partial: { id: 'partial-1', content: '部分回复' },
    reason: 'user',
    chatStore: {
      findMessage: () => null,
      appendMessage: (message, sessionId) => appended.push({ message, sessionId }),
    },
    getAssistantAvatarForSession: sid => `${sid}.png`,
    formatNowTime: () => '12:00',
    refreshChatAndContacts: () => { refreshed += 1; },
  });

  assert.deepEqual(result, {
    attempted: true,
    sessionId: 'session-a',
    messageId: 'partial-1',
    hasContent: true,
    handledPartial: false,
    appended: true,
    skippedExisting: false,
  });
  assert.equal(refreshed, 1);
  assert.equal(appended[0].sessionId, 'session-a');
  assert.equal(appended[0].message.content, '部分回复');
  assert.equal(appended[0].message.avatar, 'session-a.png');
});

test('commitCancelledGenerationPartial keeps existing handler precedence semantics', () => {
  const calls = [];
  const appended = [];
  const result = commitCancelledGenerationPartial({
    generation: {
      sessionId: 'session-a',
      partialCommitHandler: () => {
        calls.push('partial');
        return true;
      },
      swipeTarget: {
        onPartial() {
          calls.push('swipe');
          return false;
        },
      },
    },
    partial: { content: '会被 swipe false 覆盖为未处理' },
    reason: 'user',
    chatStore: {
      findMessage: () => false,
      appendMessage: (message) => appended.push(message),
    },
  });

  assert.deepEqual(calls, ['partial', 'swipe']);
  assert.equal(result.handledPartial, false);
  assert.equal(result.appended, true);
  assert.equal(appended.length, 1);
});

test('commitCancelledGenerationPartial skips existing messages and non-user cancellations', () => {
  const appended = [];
  const existing = commitCancelledGenerationPartial({
    generation: { sessionId: 'session-a' },
    partial: { id: 'partial-1', content: '已存在' },
    reason: 'user',
    chatStore: {
      findMessage: () => true,
      appendMessage: message => appended.push(message),
    },
  });
  const nonUser = commitCancelledGenerationPartial({
    generation: { sessionId: 'session-a' },
    partial: { content: '不会处理' },
    reason: 'navigation',
  });

  assert.equal(existing.skippedExisting, true);
  assert.equal(existing.appended, false);
  assert.deepEqual(appended, []);
  assert.deepEqual(nonUser, {
    attempted: false,
    sessionId: '',
    messageId: '',
    hasContent: false,
    handledPartial: false,
    appended: false,
    skippedExisting: false,
  });
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
