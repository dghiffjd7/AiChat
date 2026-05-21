import assert from 'node:assert/strict';

import {
  buildProviderToolLoopKey,
  createProviderToolLoopGuard,
} from '../../src/scripts/agent/provider-tool-loop-guard.js';

{
  const a = buildProviderToolLoopKey({
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
    toolName: 'memory.write',
    arguments: { b: 2, a: 1 },
  });
  const b = buildProviderToolLoopKey({
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
    toolName: 'memory.write',
    arguments: { a: 1, b: 2 },
  });
  assert.equal(a, b);
  console.log('ok - buildProviderToolLoopKey is stable for reordered argument objects');
}

{
  let currentTime = 1000;
  const guard = createProviderToolLoopGuard({
    maxRepeats: 2,
    windowMs: 100,
    now: () => currentTime,
  });
  const call = {
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
    toolName: 'memory.write',
    arguments: { text: 'same' },
  };
  assert.equal(guard.record(call).allowed, true);
  assert.equal(guard.record(call).allowed, true);
  const blocked = guard.record(call);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.repeatCount, 3);
  assert.equal(blocked.reason.includes('memory.write'), true);
  currentTime += 101;
  assert.equal(guard.record(call).allowed, true);
  console.log('ok - createProviderToolLoopGuard blocks repeated identical calls within a rolling window');
}

{
  const guard = createProviderToolLoopGuard({ maxRepeats: 1, now: () => 2000 });
  assert.equal(guard.record({ toolName: 'a', arguments: { x: 1 } }).allowed, true);
  assert.equal(guard.record({ toolName: 'b', arguments: { x: 1 } }).allowed, true);
  assert.equal(guard.getSnapshot().length, 2);
  guard.clear();
  assert.deepEqual(guard.getSnapshot(), []);
  console.log('ok - createProviderToolLoopGuard tracks distinct tools and supports clearing state');
}
