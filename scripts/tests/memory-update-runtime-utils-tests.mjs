import assert from 'node:assert/strict';

import {
  buildMemoryUpdatePlanInput,
  buildMemoryUpdateRequest,
  resolveMemoryUpdateHistoryLimit,
  resolveMemoryUpdateTrigger,
} from '../../src/scripts/ui/chat/memory-update-runtime-utils.js';

{
  assert.equal(resolveMemoryUpdateHistoryLimit({ memoryUpdateContextRounds: '8' }), 8);
  assert.equal(resolveMemoryUpdateHistoryLimit({ memoryUpdateContextRounds: '-2' }), 0);
  assert.equal(resolveMemoryUpdateHistoryLimit({ memoryUpdateContextRounds: 'oops' }), 6);
  console.log('ok - resolveMemoryUpdateHistoryLimit normalizes configured rounds');
}

{
  const baseContext = {
    foo: 'bar',
    session: { id: 'old', isGroup: false },
    meta: { keep: true, memoryAutoExtract: false },
    history: [{ role: 'assistant', content: 'old' }],
  };
  const next = buildMemoryUpdatePlanInput(baseContext, { sessionId: 's1', isGroup: true });
  assert.deepEqual(next, {
    foo: 'bar',
    session: { id: 's1', isGroup: true },
    meta: {
      keep: true,
      memoryAutoExtract: true,
      memoryStorageMode: 'table',
    },
    history: [],
  });
  assert.deepEqual(baseContext.history, [{ role: 'assistant', content: 'old' }]);
  console.log('ok - buildMemoryUpdatePlanInput resets session/meta/history without mutating source');
}

{
  const request = buildMemoryUpdateRequest({
    promptText: '  system prompt  ',
    historyText: 'A: hi\nB: hello',
  });
  assert.equal(request.systemText, 'system prompt');
  assert.match(request.userText, /<chat_history>\nA: hi\nB: hello\n<\/chat_history>/);
  assert.match(request.requestPrompt, /^system:\nsystem prompt\n\nuser:\n/);
  assert.deepEqual(request.messages, [
    { role: 'system', content: 'system prompt' },
    { role: 'user', content: request.userText },
  ]);
  console.log('ok - buildMemoryUpdateRequest composes system user and preview payloads');
}

{
  assert.deepEqual(resolveMemoryUpdateTrigger({ memoryFillEveryN: '3' }, 0), {
    shouldRun: false,
    nextCounter: 1,
    everyN: 3,
  });
  assert.deepEqual(resolveMemoryUpdateTrigger({ memoryFillEveryN: '3' }, 2), {
    shouldRun: true,
    nextCounter: 0,
    everyN: 3,
  });
  assert.deepEqual(resolveMemoryUpdateTrigger({ memoryFillEveryN: '0' }, -5), {
    shouldRun: true,
    nextCounter: 0,
    everyN: 1,
  });
  console.log('ok - resolveMemoryUpdateTrigger normalizes cadence and reset behavior');
}
