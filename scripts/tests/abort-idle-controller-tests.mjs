import assert from 'node:assert/strict';

import { createLinkedAbortController } from '../../src/scripts/api/abort.js';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

{
  // idle 模式：持续 touch 时超过总时长也不 abort；停止 touch 后按空闲上限 abort。
  const { controller, cleanup, touch } = createLinkedAbortController({ timeoutMs: 60, idle: true });
  for (let i = 0; i < 6; i += 1) {
    await sleep(25);
    touch();
  }
  assert.equal(controller.signal.aborted, false, 'kept-alive idle stream must not abort past the nominal timeout');
  await sleep(120);
  assert.equal(controller.signal.aborted, true, 'idle stream must abort after the idle window with no touch');
  cleanup();
  console.log('ok - idle mode resets on touch and aborts only after a silent gap');
}

{
  // 非 idle 模式（默认）：行为不变，touch 是安全的 no-op，总时长到点即 abort。
  const { controller, cleanup, touch } = createLinkedAbortController({ timeoutMs: 40 });
  touch();
  await sleep(30);
  touch();
  await sleep(40);
  assert.equal(controller.signal.aborted, true, 'total-timeout mode must ignore touch and abort on schedule');
  cleanup();
  console.log('ok - non-idle mode keeps total-timeout semantics and touch is a no-op');
}

{
  // 上游 signal 中止仍即时联动，cleanup 后不再触发计时。
  const upstream = new AbortController();
  const { controller, cleanup } = createLinkedAbortController({ timeoutMs: 1000, idle: true, signal: upstream.signal });
  upstream.abort();
  assert.equal(controller.signal.aborted, true, 'upstream abort must propagate in idle mode');
  cleanup();
  const second = createLinkedAbortController({ timeoutMs: 30, idle: true });
  second.cleanup();
  await sleep(60);
  assert.equal(second.controller.signal.aborted, false, 'cleanup must disarm the pending idle timer');
  console.log('ok - upstream abort propagates and cleanup disarms the idle timer');
}

console.log('abort-idle-controller-tests passed');
