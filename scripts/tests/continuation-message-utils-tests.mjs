import assert from 'node:assert/strict';

import {
  buildContinuationMessageUpdate,
  commitContinuationMessageToStore,
} from '../../src/scripts/ui/chat/continuation-message-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildContinuationMessageUpdate merges assistant payload and clears partial flags on final commit', () => {
  const result = buildContinuationMessageUpdate({
    existing: {
      id: 'assistant-1',
      role: 'assistant',
      type: 'text',
      name: '旧助手',
      avatar: 'old.png',
      time: '10:00',
      content: '旧内容',
      raw: 'old-raw',
      rawOriginal: 'old-original',
      rawSource: 'old-source',
      meta: {
        partial: true,
        cancelled: true,
        note: 'keep',
      },
    },
    message: {
      content: '新内容',
      raw: 'new-raw',
      meta: {
        renderRich: true,
      },
    },
    targetId: 'assistant-1',
    fallbackTime: '11:11',
    partial: false,
  });

  assert.equal(result.id, 'assistant-1');
  assert.equal(result.role, 'assistant');
  assert.equal(result.name, '旧助手');
  assert.equal(result.avatar, 'old.png');
  assert.equal(result.time, '10:00');
  assert.equal(result.content, '新内容');
  assert.equal(result.raw, 'new-raw');
  assert.equal(result.rawOriginal, 'old-original');
  assert.equal(result.rawSource, 'old-source');
  assert.deepEqual(result.meta, {
    note: 'keep',
    renderRich: true,
  });
});

test('buildContinuationMessageUpdate marks partial cancellations and updates active swipe content', () => {
  const result = buildContinuationMessageUpdate({
    existing: {
      id: 'assistant-2',
      type: 'text',
      meta: {
        activeSwipe: 3,
        swipes: [
          { content: 'swipe-0', raw: 'raw-0' },
          { content: 'swipe-1', raw: 'raw-1' },
        ],
      },
    },
    message: {
      content: '部分续写',
    },
    targetId: 'assistant-2',
    fallbackTime: '12:00',
    partial: true,
  });

  assert.equal(result.time, '12:00');
  assert.equal(result.raw, '部分续写');
  assert.deepEqual(result.meta, {
    partial: true,
    cancelled: true,
    swipes: [
      { content: 'swipe-0', raw: 'raw-0' },
      { content: '部分续写', raw: '部分续写' },
    ],
    activeSwipe: 1,
  });
});

test('buildContinuationMessageUpdate falls back to message fields when existing assistant payload is sparse', () => {
  const result = buildContinuationMessageUpdate({
    existing: {},
    message: {
      type: 'image',
      name: '新助手',
      avatar: 'new.png',
      time: '09:09',
      content: '消息内容',
      rawOriginal: '原始内容',
      rawSource: 'stored-source',
    },
    targetId: 'assistant-3',
    fallbackTime: '13:00',
    partial: false,
  });

  assert.deepEqual(result, {
    id: 'assistant-3',
    role: 'assistant',
    type: 'image',
    name: '新助手',
    avatar: 'new.png',
    time: '09:09',
    content: '消息内容',
    raw: '消息内容',
    rawOriginal: '原始内容',
    rawSource: 'stored-source',
    meta: {},
  });
});

test('commitContinuationMessageToStore updates store and active session ui with final payload', () => {
  const calls = [];
  const existing = {
    id: 'assistant-4',
    role: 'assistant',
    content: '旧续写',
    meta: { partial: true, cancelled: true },
  };
  const savedFromStore = {
    id: 'assistant-4',
    role: 'assistant',
    content: '完成续写',
    persisted: true,
  };

  const result = commitContinuationMessageToStore({
    message: {
      content: '完成续写',
      raw: '完成续写 raw',
      meta: { renderRich: true },
    },
    partial: false,
    continueTarget: { messageId: 'assistant-4' },
    sessionId: 'session-continue',
    chatStore: {
      findMessage: (targetId, sessionId) => {
        calls.push(['find', targetId, sessionId]);
        return existing;
      },
      updateMessage: (targetId, payload, sessionId) => {
        calls.push(['update', targetId, payload, sessionId]);
        return savedFromStore;
      },
    },
    isSessionActive: sessionId => {
      calls.push(['active', sessionId]);
      return true;
    },
    updateUiMessage: (targetId, saved) => calls.push(['ui', targetId, saved]),
    formatNowTime: () => '15:00',
  });

  assert.equal(result, savedFromStore);
  assert.equal(calls[1][1], 'assistant-4');
  assert.equal(calls[1][2].content, '完成续写');
  assert.equal(calls[1][2].raw, '完成续写 raw');
  assert.deepEqual(calls[1][2].meta, { renderRich: true });
  assert.deepEqual(calls, [
    ['find', 'assistant-4', 'session-continue'],
    ['update', 'assistant-4', calls[1][2], 'session-continue'],
    ['active', 'session-continue'],
    ['ui', 'assistant-4', savedFromStore],
  ]);
});

test('commitContinuationMessageToStore falls back to continue target message and skips inactive ui', () => {
  const calls = [];
  const fallbackMessage = {
    id: 'assistant-5',
    role: 'assistant',
    content: '旧内容',
    rawOriginal: 'old-original',
  };

  const result = commitContinuationMessageToStore({
    message: {
      content: '部分续写',
    },
    partial: true,
    continueTarget: {
      messageId: 'assistant-5',
      message: fallbackMessage,
    },
    sessionId: 'session-inactive',
    chatStore: {
      findMessage: () => null,
      updateMessage: () => null,
    },
    isSessionActive: sessionId => {
      calls.push(['active', sessionId]);
      return false;
    },
    updateUiMessage: () => calls.push(['ui']),
    formatNowTime: () => '16:00',
  });

  assert.equal(result.id, 'assistant-5');
  assert.equal(result.content, '部分续写');
  assert.equal(result.rawOriginal, 'old-original');
  assert.equal(result.meta.partial, true);
  assert.equal(result.meta.cancelled, true);
  assert.deepEqual(calls, [['active', 'session-inactive']]);
});

test('commitContinuationMessageToStore returns null without target message or existing payload', () => {
  assert.equal(commitContinuationMessageToStore({
    message: { content: 'x' },
    continueTarget: null,
  }), null);
  assert.equal(commitContinuationMessageToStore({
    message: null,
    continueTarget: { messageId: 'assistant-6' },
  }), null);
  assert.equal(commitContinuationMessageToStore({
    message: { content: 'x' },
    continueTarget: { messageId: 'assistant-6' },
    chatStore: { findMessage: () => null },
  }), null);
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
