import assert from 'node:assert/strict';

import {
  buildSwipeMemoryStateKey,
  buildTurnCheckpointHydrationThreadKey,
  createSwipeMemoryStateTracker,
  findPreviousUserMessageIdForAssistant,
  findTailTrackedAssistantMessage,
  normalizeCheckpointSwipeState,
  resolveAssistantFloorForCheckpoint,
  resolveTurnIndexForAssistant,
} from '../../src/scripts/ui/chat/turn-checkpoint-message-runtime-utils.js';

{
  assert.equal(buildSwipeMemoryStateKey('s1', 'm1', 2), 's1:m1:2');
  assert.equal(buildSwipeMemoryStateKey('s1', '', 2), '');
  assert.equal(buildTurnCheckpointHydrationThreadKey('s1', 'archive-a'), 's1::archive-a');
  assert.equal(buildTurnCheckpointHydrationThreadKey('', 'archive-a'), '');
  console.log('ok - turn checkpoint key helpers normalize swipe and hydration thread identifiers');
}

{
  const tracker = createSwipeMemoryStateTracker();
  assert.equal(tracker.canPersistOutgoing('s1', 'm1', 0, {}), true);
  tracker.markActive('s1', 'm1', 1);
  assert.equal(tracker.getActiveKey(), 's1:m1:1');
  assert.equal(tracker.canPersistOutgoing('s1', 'm1', 1, { memoryTableSnapshot: { a: 1 } }), true);
  assert.equal(tracker.canPersistOutgoing('s1', 'm1', 0, { memoryTableSnapshot: { a: 1 } }), false);
  console.log('ok - createSwipeMemoryStateTracker preserves active branch persistence semantics');
}

{
  const normalized = normalizeCheckpointSwipeState({
    content: 'assistant text',
    raw: 'assistant raw',
    meta: {
      activeSwipe: 4,
      memoryTableSnapshot: { hp: 3 },
      memoryUpdateEntry: { rowId: 'r1' },
      swipes: [
        { content: 'branch a' },
        { content: 'branch b', memoryTableSnapshot: { hp: 4 } },
      ],
    },
  }, {
    clonePlainObject: value => (value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value),
    cloneMemoryUpdateEntry: value => (value && typeof value === 'object' ? { ...value } : value),
  });
  assert.equal(normalized.activeSwipeIndex, 1);
  assert.deepEqual(normalized.swipes[0].memoryTableSnapshot, { hp: 3 });
  assert.deepEqual(normalized.swipes[0].memoryUpdateEntry, { rowId: 'r1' });
  assert.deepEqual(normalized.meta.memoryTableSnapshot, { hp: 3 });
  console.log('ok - normalizeCheckpointSwipeState backfills checkpoint swipe snapshots and clamps active index');
}

{
  const messages = [
    { id: 'u1', role: 'user', content: 'hello' },
    { id: 'a1', role: 'assistant', content: 'reply' },
    { id: 'u2', role: 'user', content: 'from ai', meta: { generatedByAssistant: true } },
    { id: 'u3', role: 'user', content: 'real user' },
    { id: 'a2', role: 'assistant', content: 'second reply' },
  ];
  assert.equal(findPreviousUserMessageIdForAssistant(messages, 'a2'), 'u3');
  assert.equal(resolveTurnIndexForAssistant(messages, 'a2'), 2);
  assert.equal(
    resolveAssistantFloorForCheckpoint(
      messages,
      'a2',
      message => message?.role === 'assistant' && String(message?.content || '') !== 'reply',
    ),
    1,
  );
  assert.deepEqual(
    findTailTrackedAssistantMessage(messages, message => message?.role === 'assistant'),
    messages[4],
  );
  console.log('ok - turn checkpoint message helpers resolve previous user turn index assistant floor and tail assistant');
}
