import assert from 'node:assert/strict';

import {
  buildInitialHistorySlice,
  buildEnterRestorePlan,
  resolveEnterPageSize,
  resolveEnterHydrationDelay,
  resolveEnterScrollMode,
  shouldUseProgressiveInitialRender,
} from '../../src/scripts/ui/chat/session-enter-utils.js';

{
  assert.equal(resolveEnterPageSize({ isGroupSession: false, isAndroid: true }), 90);
  assert.equal(resolveEnterPageSize({ isGroupSession: true, isAndroid: false }), 72);
  assert.equal(resolveEnterPageSize({ isGroupSession: true, isAndroid: true }), 56);
  console.log('ok - resolveEnterPageSize matches group and android tuning');
}

{
  const history = Array.from({ length: 20 }, (_, index) => ({ id: `m${index + 1}` }));
  const result = buildInitialHistorySlice(history, {
    firstUnreadId: 'm4',
    pageSize: 6,
    unreadLead: 2,
    injectUnreadDivider: (initial, firstUnreadId) => ({
      list: [...initial, { id: `divider:${firstUnreadId}` }],
      dividerId: `divider:${firstUnreadId}`,
    }),
  });
  assert.equal(result.start, 1);
  assert.deepEqual(result.initial.map(item => item.id), ['m2', 'm3', 'm4', 'm5', 'm6', 'm7']);
  assert.equal(result.dividerId, 'divider:m4');
  assert.equal(result.list.at(-1).id, 'divider:m4');
  console.log('ok - buildInitialHistorySlice expands around unread marker and injects divider');
}

{
  const history = Array.from({ length: 5 }, (_, index) => ({ id: `m${index + 1}` }));
  const result = buildInitialHistorySlice(history, {
    firstUnreadId: 'missing',
    pageSize: 3,
  });
  assert.equal(result.start, 2);
  assert.deepEqual(result.list.map(item => item.id), ['m3', 'm4', 'm5']);
  console.log('ok - buildInitialHistorySlice falls back to tail window when unread target is absent');
}

{
  assert.equal(shouldUseProgressiveInitialRender({
    isGroupSession: true,
    isAndroid: true,
    jumpTargetMessageId: '',
    firstUnreadId: '',
    initialCount: 29,
  }), true);
  assert.equal(shouldUseProgressiveInitialRender({
    isGroupSession: true,
    isAndroid: true,
    jumpTargetMessageId: 'm1',
    firstUnreadId: '',
    initialCount: 100,
  }), false);
  console.log('ok - shouldUseProgressiveInitialRender respects jump and unread guards');
}

{
  assert.equal(resolveEnterScrollMode({ jumpedToTarget: true }), 'target');
  assert.equal(resolveEnterScrollMode({ suppressInitialAutoScroll: true }), 'keep');
  assert.equal(resolveEnterScrollMode({ dividerId: 'd1' }), 'unread');
  assert.equal(resolveEnterScrollMode({ firstUnreadId: 'm1' }), 'unread');
  assert.equal(resolveEnterScrollMode({}), 'bottom');
  console.log('ok - resolveEnterScrollMode selects the expected initial scroll strategy');
}

{
  assert.equal(resolveEnterHydrationDelay({ isGroupSession: true }), 720);
  assert.equal(resolveEnterHydrationDelay({ isGroupSession: false }), 480);
  assert.deepEqual(buildEnterRestorePlan({ currentArchiveId: 'a1' }), {
    mode: 'archive',
    source: 'enter_chat_room_archive',
    refreshBaselineWhenNoTail: true,
  });
  assert.deepEqual(buildEnterRestorePlan({ currentArchiveId: '' }), {
    mode: 'tail',
    source: 'enter_chat_room',
    refreshBaselineWhenNoTail: true,
  });
  console.log('ok - enter restore helpers resolve hydrate delay and restore plan');
}
