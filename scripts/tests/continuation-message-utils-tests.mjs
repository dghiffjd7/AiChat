import assert from 'node:assert/strict';

import { buildContinuationMessageUpdate } from '../../src/scripts/ui/chat/continuation-message-utils.js';

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
