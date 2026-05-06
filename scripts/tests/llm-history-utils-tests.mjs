import assert from 'node:assert/strict';

import {
  applyChatHistoryLimit,
  applyHistoryCharBudget,
  dropTrailingPendingUserEcho,
  finalizeLlmHistory,
  injectReasoningIntoHistory,
  limitCreativeAssistantHistory,
  stripTransientHistoryFields,
} from '../../src/scripts/ui/chat/llm-history-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('dropTrailingPendingUserEcho removes only the duplicated trailing user message', () => {
  const history = [
    { role: 'assistant', content: 'a' },
    { role: 'user', content: ' hello ' },
  ];
  assert.deepEqual(dropTrailingPendingUserEcho(history, 'hello'), [
    { role: 'assistant', content: 'a' },
  ]);
  assert.equal(history.length, 2);
});

test('applyChatHistoryLimit trims oldest messages when over limit', () => {
  assert.deepEqual(
    applyChatHistoryLimit([
      { content: '1' },
      { content: '2' },
      { content: '3' },
    ], 2),
    [
      { content: '2' },
      { content: '3' },
    ],
  );
});

test('applyHistoryCharBudget caps long messages and drops oldest entries when over budget', () => {
  const result = applyHistoryCharBudget([
    { role: 'assistant', content: 'a'.repeat(50000) },
    { role: 'assistant', content: 'b'.repeat(50000) },
    { role: 'assistant', content: 'c'.repeat(50000) },
  ], {
    maxContext: 2000,
    maxOut: 1000,
  });

  assert.equal(result.length, 1);
  assert.ok(result[0].content.length <= 40001);
  assert.ok(result[0].content.startsWith('c'));
});

test('limitCreativeAssistantHistory keeps the user turn before the retained creative window', () => {
  const result = limitCreativeAssistantHistory([
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1', __creative: true },
    { role: 'user', content: 'u2' },
    { role: 'assistant', content: 'a2', __creative: true },
    { role: 'user', content: 'u3' },
    { role: 'assistant', content: 'a3', __creative: true },
  ], 2);

  assert.deepEqual(result, [
    { role: 'user', content: 'u2' },
    { role: 'assistant', content: 'a2', __creative: true },
    { role: 'user', content: 'u3' },
    { role: 'assistant', content: 'a3', __creative: true },
  ]);
});

test('injectReasoningIntoHistory prepends latest assistant reasoning blocks up to max additions', () => {
  const result = injectReasoningIntoHistory([
    { role: 'assistant', content: 'a1', __reasoning: 'r1' },
    { role: 'assistant', content: 'a2', __reasoning: 'r2' },
    { role: 'user', content: 'u' },
  ], {
    enabled: true,
    prefix: '[',
    suffix: ']',
    separator: '\n',
    maxAdditions: 1,
    applyMacros: value => String(value ?? '').toUpperCase(),
  });

  assert.equal(result[0].content, 'a1');
  assert.equal(result[1].content, '[r2]\na2');
});

test('stripTransientHistoryFields removes helper-only fields', () => {
  assert.deepEqual(
    stripTransientHistoryFields([
      { role: 'assistant', content: 'a', __creative: true, __reasoning: 'r' },
      { role: 'user', content: 'u' },
    ]),
    [
      { role: 'assistant', content: 'a' },
      { role: 'user', content: 'u' },
    ],
  );
});

test('finalizeLlmHistory composes all post-processing steps', () => {
  const result = finalizeLlmHistory([
    { role: 'assistant', content: 'older', __creative: true, __reasoning: 'old-think' },
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: 'newer', __creative: true, __reasoning: 'new-think' },
    { role: 'user', content: 'pending' },
  ], {
    pendingUserText: 'pending',
    chatHistoryLimit: 3,
    openaiPreset: { openai_max_context: 50000, openai_max_tokens: 1000 },
    rpUiMode: true,
    creativeHistoryLimit: 1,
    reasoning: {
      enabled: true,
      prefix: '<',
      suffix: '>',
      separator: '\n',
      maxAdditions: 1,
      applyMacros: value => String(value ?? ''),
    },
  });

  assert.deepEqual(result, [
    { role: 'user', content: 'hello' },
    { role: 'assistant', content: '<new-think>\nnewer' },
  ]);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
