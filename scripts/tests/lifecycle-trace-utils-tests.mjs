import assert from 'node:assert/strict';

import {
  emitLifecycleTraceEvent,
  normalizeLifecycleTraceDetails,
  normalizeLifecycleTraceText,
} from '../../src/scripts/ui/chat/lifecycle-trace-utils.js';

{
  assert.equal(normalizeLifecycleTraceText(' phase.start ', 'event'), 'phase.start');
  assert.equal(normalizeLifecycleTraceText('   ', 'event'), 'event');
  assert.equal(normalizeLifecycleTraceText(null, 'event'), 'event');
  assert.deepEqual(
    normalizeLifecycleTraceDetails({
      keptFalse: false,
      keptZero: 0,
      keptEmpty: '',
      dropped: undefined,
    }),
    {
      keptFalse: false,
      keptZero: 0,
      keptEmpty: '',
    },
  );
  assert.deepEqual(normalizeLifecycleTraceDetails(null), {});
  console.log('ok - lifecycle trace normalization keeps falsy metadata and drops undefined details');
}

{
  const events = [];
  const event = { phase: 'send.start' };
  const emitted = emitLifecycleTraceEvent((payload) => {
    events.push(payload);
    return 'recorded';
  }, event);
  assert.equal(emitted, 'recorded');
  assert.deepEqual(events, [event]);
  assert.equal(emitLifecycleTraceEvent(null, event), null);
  assert.equal(emitLifecycleTraceEvent(() => { throw new Error('boom'); }, event), null);
  console.log('ok - emitLifecycleTraceEvent safely delegates optional trace recorders');
}
