import assert from 'node:assert/strict';

import {
  buildCancelledAssistantPartial,
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
