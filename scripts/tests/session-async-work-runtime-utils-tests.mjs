import assert from 'node:assert/strict';

import { createSessionAsyncWorkRuntime } from '../../src/scripts/ui/chat/session-async-work-runtime-utils.js';

const deferred = () => {
  let resolve;
  const promise = new Promise(next => { resolve = next; });
  return { promise, resolve };
};

{
  const runtime = createSessionAsyncWorkRuntime();
  const calls = [];
  const a = runtime.register({
    sessionId: 'room-a',
    kind: 'chat_generation',
    cancel: reason => calls.push(['cancel-a', reason]),
  });
  const b = runtime.register({
    sessionId: 'room-b',
    kind: 'image_generation',
    cancel: reason => calls.push(['cancel-b', reason]),
  });

  const pending = runtime.cancelAndWait('room-a', {
    reason: 'session_deleted',
    timeoutMs: 100,
  });
  await Promise.resolve();
  assert.deepEqual(calls, [['cancel-a', 'session_deleted']], '只取消目标会话的工作');
  a.settle();
  const result = await pending;
  assert.equal(result.ok, true);
  assert.equal(result.cancelledCount, 1);
  assert.equal(runtime.count('room-a'), 0);
  assert.equal(runtime.count('room-b'), 1);
  b.settle();
  console.log('ok - session async work cancellation is scoped and waits for settlement');
}

{
  const runtime = createSessionAsyncWorkRuntime();
  const gate = deferred();
  const lease = runtime.register({
    sessionId: 'room-timeout',
    cancel: () => gate.promise,
  });
  const result = await runtime.cancelAndWait('room-timeout', { timeoutMs: 5 });
  assert.equal(result.ok, false);
  assert.equal(result.timedOut, true);
  lease.settle();
  console.log('ok - session deletion guard fails closed when async work does not settle');
}

{
  const runtime = createSessionAsyncWorkRuntime();
  const cancelled = [];
  const guard = await runtime.cancelAndWait('room-closing', {
    reason: 'session_deleted',
    timeoutMs: 50,
    holdClosing: true,
  });
  assert.equal(guard.ok, true);
  assert.equal(runtime.isClosing('room-closing'), true);
  const late = runtime.register({
    sessionId: 'room-closing',
    kind: 'late_image',
    cancel: reason => cancelled.push(reason),
  });
  await Promise.resolve();
  assert.deepEqual(cancelled, ['session_deleted']);
  late.settle();
  assert.equal(guard.release(), true);
  assert.equal(runtime.isClosing('room-closing'), false);
  console.log('ok - held session close cancels late work until deletion releases the guard');
}

console.log('session-async-work-runtime-utils-tests passed');
