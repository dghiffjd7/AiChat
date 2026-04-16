import assert from 'node:assert/strict';
import {
  SELF_REACTION_ACTOR,
  buildReplyTargetSnapshot,
  countReactionActors,
  getMessagePreviewText,
  hasReactionActor,
  normalizeReactionEntries,
  normalizeReplyTarget,
  toggleReactionActor,
} from '../../src/scripts/ui/chat/message-interaction-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('getMessagePreviewText should summarize special message types', () => {
  assert.equal(getMessagePreviewText({ type: 'image' }), '[图片]');
  assert.equal(getMessagePreviewText({ type: 'document', content: '合同.pdf' }), '[文件] 合同.pdf');
  assert.equal(getMessagePreviewText({ type: 'sticker', content: 'happy' }), '[表情]');
});

test('buildReplyTargetSnapshot should keep author, avatar and truncated content', () => {
  const snapshot = buildReplyTargetSnapshot(
    {
      id: 'm1',
      role: 'assistant',
      type: 'text',
      content: '这是一段很长很长的测试内容，用来确认回复摘要会被截断并且保留必要的信息。',
    },
    { author: '测试角色', avatar: 'avatar.png', sessionId: 'contact:test' },
  );
  assert.equal(snapshot.id, 'm1');
  assert.equal(snapshot.author, '测试角色');
  assert.equal(snapshot.avatar, 'avatar.png');
  assert.equal(snapshot.sessionId, 'contact:test');
  assert.ok(snapshot.content.startsWith('这是一段很长很长的测试内容'));
});

test('normalizeReplyTarget should drop empty targets', () => {
  assert.equal(normalizeReplyTarget(null), null);
  assert.equal(normalizeReplyTarget({}), null);
});

test('normalizeReactionEntries should merge duplicate emoji and unique actors', () => {
  const normalized = normalizeReactionEntries([
    { emoji: '👍', actors: ['a', 'a'] },
    { emoji: '👍', actors: ['b'] },
    { emoji: '❤️', actors: [] },
  ]);
  assert.deepEqual(normalized, [
    { emoji: '👍', actors: ['a', 'b'] },
  ]);
});

test('toggleReactionActor should add and remove self reactions', () => {
  let next = toggleReactionActor([], '😂');
  assert.equal(countReactionActors(next[0]), 1);
  assert.equal(hasReactionActor(next[0], SELF_REACTION_ACTOR), true);

  next = toggleReactionActor(next, '😂');
  assert.deepEqual(next, []);
});

let failed = 0;
for (const item of tests) {
  try {
    await item.fn();
    console.log(`ok - ${item.name}`);
  } catch (error) {
    failed += 1;
    console.error(`not ok - ${item.name}`);
    console.error(error);
  }
}

if (failed > 0) process.exit(1);
