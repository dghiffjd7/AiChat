import assert from 'node:assert/strict';

import {
  createDebugTraceTimeline,
  ensureDebugTraceTimeline,
  normalizeDebugTraceEvent,
} from '../../src/scripts/ui/debug-trace-timeline-utils.js';

{
  const event = normalizeDebugTraceEvent({
    category: ' session ',
    phase: ' enter ',
    source: ' app ',
    status: ' success ',
    startedAt: 100,
    endedAt: 175,
    details: { token: 't1' },
    relatedIds: [' m1 ', '', null, 'm2'],
  }, {
    eventId: 'fallback-id',
    now: () => 999,
  });
  assert.deepEqual(event, {
    eventId: 'fallback-id',
    category: 'session',
    phase: 'enter',
    sessionId: '',
    source: 'app',
    status: 'success',
    startedAt: 100,
    endedAt: 175,
    durationMs: 75,
    summary: '',
    details: { token: 't1' },
    relatedIds: ['m1', 'm2'],
  });
  console.log('ok - normalizeDebugTraceEvent applies stable trace schema defaults');
}

{
  let currentTime = 1000;
  const timeline = createDebugTraceTimeline({
    maxEvents: 2,
    now: () => currentTime,
  });
  const first = timeline.record({
    category: 'bridge',
    phase: 'register',
    source: 'appBridge',
    summary: 'first',
  });
  currentTime = 1010;
  const started = timeline.start({
    category: 'session',
    phase: 'enter',
    sessionId: 's1',
    source: 'app',
  });
  currentTime = 1045;
  const finished = timeline.finish(started.eventId, {
    status: 'success',
    summary: 'entered',
  });
  currentTime = 1100;
  timeline.record({
    category: 'memory',
    phase: 'rollback',
    sessionId: 's1',
    source: 'memory',
  });
  assert.equal(first.eventId, 'trace-1000-1');
  assert.equal(finished.durationMs, 35);
  assert.deepEqual(timeline.snapshot().map(event => event.category), ['session', 'memory']);
  assert.deepEqual(timeline.snapshot({ sessionId: 's1', limit: 1 }).map(event => event.category), ['memory']);
  assert.equal(timeline.finish('missing'), null);
  timeline.clear();
  assert.deepEqual(timeline.snapshot(), []);
  console.log('ok - createDebugTraceTimeline records, finishes, trims, filters, and clears events');
}

{
  const appBridge = {};
  const timeline = ensureDebugTraceTimeline(appBridge, {
    now: () => 2000,
  });
  const started = appBridge.debugUiRegistry.actions.startTraceEvent({
    category: 'bridge',
    phase: 'call',
    source: 'test',
  });
  const finished = appBridge.debugUiRegistry.actions.finishTraceEvent(started.eventId, {
    status: 'error',
    summary: 'failed safely',
  });
  assert.equal(timeline, appBridge.debugUiRegistry.stores.traceTimeline);
  assert.equal(appBridge.debugUiRegistry.actions.recordTraceEvent({ category: 'manual' }).category, 'manual');
  assert.equal(finished.status, 'error');
  assert.equal(ensureDebugTraceTimeline(null), null);
  console.log('ok - ensureDebugTraceTimeline exposes trace store and actions through debug registry');
}
