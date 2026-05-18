import assert from 'node:assert/strict';

import {
  PROMPT_SEGMENT_ANCHORS,
  normalizePromptSegmentAnchor,
  sortPromptSegments,
  splitDepthPromptMessagesForLatest,
} from '../../src/scripts/ui/chat/prompt-segment-plan-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('normalizePromptSegmentAnchor accepts latest-user anchors only', () => {
  assert.equal(normalizePromptSegmentAnchor('before_latest_user'), 'before_latest_user');
  assert.equal(normalizePromptSegmentAnchor('after_latest_user'), 'after_latest_user');
  assert.equal(
    normalizePromptSegmentAnchor('unknown', PROMPT_SEGMENT_ANCHORS.BEFORE_LATEST_USER),
    'before_latest_user',
  );
  assert.equal(normalizePromptSegmentAnchor('unknown'), 'after_latest_user');
});

test('sortPromptSegments keeps anchor, order and sequence stable', () => {
  const sorted = sortPromptSegments([
    { anchor: 'after_latest_user', order: 0, seq: 0, content: 'format' },
    { anchor: 'before_latest_user', order: 20, seq: 0, content: 'memory' },
    { anchor: 'before_latest_user', order: 10, seq: 1, content: 'image' },
    { anchor: 'before_latest_user', order: 10, seq: 0, content: 'chat' },
  ]);
  assert.deepEqual(sorted.map(item => item.content), ['chat', 'image', 'memory', 'format']);
});

test('splitDepthPromptMessagesForLatest splits D0 around pending latest user', () => {
  const result = splitDepthPromptMessagesForLatest([
    { role: 'system', content: 'phone format', depth: 0, promptAnchor: 'after_latest_user', promptOrder: 900 },
    { role: 'system', content: 'chat guide', depth: 0, promptAnchor: 'before_latest_user', promptOrder: 100 },
    { role: 'system', content: 'memory', depth: 0, promptAnchor: 'before_latest_user', promptOrder: 200 },
    { role: 'system', content: 'summary depth one', depth: 1, promptOrder: 50 },
  ], { hasPendingLatest: true });

  assert.deepEqual(result.historyMessages.map(item => [item.content, item.depth]), [['summary depth one', 0]]);
  assert.deepEqual(result.beforeLatestMessages.map(item => item.content), ['chat guide', 'memory']);
  assert.deepEqual(result.afterLatestMessages.map(item => item.content), ['phone format']);
});

test('splitDepthPromptMessagesForLatest preserves D0 history insertion when there is no pending latest user', () => {
  const result = splitDepthPromptMessagesForLatest([
    { role: 'system', content: 'chat guide', depth: 0, promptAnchor: 'before_latest_user' },
  ], { hasPendingLatest: false });
  assert.deepEqual(result.historyMessages.map(item => [item.content, item.depth]), [['chat guide', 0]]);
  assert.deepEqual(result.beforeLatestMessages, []);
  assert.deepEqual(result.afterLatestMessages, []);
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
