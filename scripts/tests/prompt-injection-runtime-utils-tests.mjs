import assert from 'node:assert/strict';

import {
  createPromptInjectionRuntime,
  normalizePromptInjectionBlock,
} from '../../src/scripts/ui/chat/prompt-injection-runtime-utils.js';

{
  assert.deepEqual(normalizePromptInjectionBlock({
    prompt: '  hello  ',
    role: 'USER',
    position: ' before_history ',
  }), {
    content: 'hello',
    role: 'user',
    position: 'before_history',
  });
  assert.equal(normalizePromptInjectionBlock({ content: '   ' }), null);
  assert.deepEqual(normalizePromptInjectionBlock({ content: 'x', role: 'unknown' }), {
    content: 'x',
    role: 'system',
    position: '',
  });
  console.log('ok - normalizePromptInjectionBlock trims content and normalizes role');
}

{
  let currentSessionId = ' s1 ';
  const runtime = createPromptInjectionRuntime({
    getCurrentSessionId: () => currentSessionId,
  });

  assert.equal(runtime.queuePromptInjection('', { content: ' A ' }), true);
  assert.equal(runtime.queuePromptInjection('s1', { content: 'B', role: 'assistant' }), true);
  assert.equal(runtime.queuePromptInjection('s1', { content: '   ' }), false);
  assert.deepEqual(runtime.peekPromptInjections('s1'), [
    { content: 'A', role: 'system', position: '' },
    { content: 'B', role: 'assistant', position: '' },
  ]);
  assert.deepEqual(runtime.consumePromptInjections('s1'), [
    { content: 'A', role: 'system', position: '' },
    { content: 'B', role: 'assistant', position: '' },
  ]);
  assert.deepEqual(runtime.peekPromptInjections('s1'), []);
  currentSessionId = '';
  assert.equal(runtime.queuePromptInjection('', { content: 'x' }), false);
  console.log('ok - createPromptInjectionRuntime queues peeks and consumes by normalized session id');
}
