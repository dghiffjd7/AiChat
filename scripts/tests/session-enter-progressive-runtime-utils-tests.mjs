import assert from 'node:assert/strict';

import {
  createSessionEnterProgressiveHistoryRuntime,
  createSessionEnterRequestTracker,
} from '../../src/scripts/ui/chat/session-enter-progressive-runtime-utils.js';

{
  let currentSessionId = 's1';
  const tracker = createSessionEnterRequestTracker({
    getCurrentSessionId: () => currentSessionId,
  });
  const requestA = tracker.beginRequest('s1');
  assert.equal(tracker.isStale(requestA), false);
  const requestB = tracker.beginRequest('s2');
  assert.equal(tracker.isStale(requestA), true);
  assert.equal(tracker.isStale(requestB), true);
  currentSessionId = 's2';
  assert.equal(tracker.isStale(requestB), false);
  console.log('ok - createSessionEnterRequestTracker detects token and active-session staleness');
}

{
  const calls = [];
  const runtime = createSessionEnterProgressiveHistoryRuntime({
    preloadHistory: (messages, options) => calls.push(['preload', messages, options]),
  });
  const result = runtime.renderHistory('', [], { keepScroll: false });
  assert.deepEqual(result, {
    decorateMs: 0,
    preloadMs: 0,
    deferred: false,
    deferredCount: 0,
  });
  assert.deepEqual(calls, [['preload', [], { keepScroll: false }]]);
  console.log('ok - createSessionEnterProgressiveHistoryRuntime falls back to empty preload state');
}

{
  const calls = [];
  let currentSessionId = 's-enter';
  const scheduled = [];
  let tick = 0;
  const runtime = createSessionEnterProgressiveHistoryRuntime({
    getCurrentSessionId: () => currentSessionId,
    preloadHistory: (messages, options) => calls.push(['preload', messages.map((message) => message.id), options]),
    prependHistory: (messages) => calls.push(['prepend', messages.map((message) => message.id)]),
    decorateMessagesForDisplay: (messages, options) => {
      calls.push(['decorate', messages.map((message) => message.id), options]);
      return messages.map((message) => ({ ...message, decorated: true }));
    },
    scheduleChunk: (runner) => scheduled.push(runner),
    nowPerfMs: () => {
      tick += 5;
      return tick;
    },
  });
  const result = runtime.renderHistory('s-enter', [
    { id: 'm1' },
    { id: 'm2' },
    { id: 'm3' },
    { id: 'm4' },
    { id: 'm5' },
  ], {
    recentCount: 2,
    chunkSize: 2,
  });
  assert.deepEqual(result, {
    decorateMs: 5,
    preloadMs: 5,
    deferred: true,
    deferredCount: 3,
  });
  assert.deepEqual(calls, [
    ['decorate', ['m4', 'm5'], { sessionId: 's-enter' }],
    ['preload', ['m4', 'm5'], { keepScroll: true }],
  ]);
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.deepEqual(calls.slice(2), [
    ['decorate', ['m2', 'm3'], { sessionId: 's-enter' }],
    ['prepend', ['m2', 'm3']],
  ]);
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.deepEqual(calls.slice(4), [
    ['decorate', ['m1'], { sessionId: 's-enter' }],
    ['prepend', ['m1']],
  ]);
  currentSessionId = 'other';
  runtime.cancelAll();
  console.log('ok - createSessionEnterProgressiveHistoryRuntime preloads recent messages and schedules older chunks');
}

{
  const calls = [];
  const scheduled = [];
  const runtime = createSessionEnterProgressiveHistoryRuntime({
    getCurrentSessionId: () => 's-enter',
    prependHistory: (messages) => calls.push(['prepend', messages.map((message) => message.id)]),
    decorateMessagesForDisplay: (messages) => messages,
    scheduleChunk: (runner) => scheduled.push(runner),
  });
  runtime.renderHistory('s-enter', [{ id: 'm1' }, { id: 'm2' }, { id: 'm3' }], {
    recentCount: 1,
    chunkSize: 1,
  });
  runtime.cancelSessionFill('s-enter');
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.deepEqual(calls, []);
  console.log('ok - createSessionEnterProgressiveHistoryRuntime stops scheduled prepend when fill is cancelled');
}
