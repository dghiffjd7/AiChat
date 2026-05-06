import assert from 'node:assert/strict';

import {
  buildLlmHistoryFinalizeOptions,
  buildLlmHistoryReasoningConfig,
} from '../../src/scripts/ui/chat/llm-history-config-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildLlmHistoryReasoningConfig normalizes settings and preset text', () => {
  const applyMacros = value => `resolved:${String(value ?? '')}`;
  const result = buildLlmHistoryReasoningConfig({
    reasoningSettings: {
      reasoningAddToPrompts: true,
      reasoningMaxAdditions: '3',
    },
    reasoningPreset: {
      prefix: '<p>',
      suffix: '</p>',
      separator: '\n',
    },
    applyMacros,
  });

  assert.equal(result.enabled, true);
  assert.equal(result.prefix, '<p>');
  assert.equal(result.suffix, '</p>');
  assert.equal(result.separator, '\n');
  assert.equal(result.maxAdditions, 3);
  assert.equal(result.applyMacros('x'), 'resolved:x');
});

test('buildLlmHistoryFinalizeOptions normalizes limits and preserves openai preset', () => {
  const openaiPreset = { openai_max_context: 50000, openai_max_tokens: 1000 };
  const result = buildLlmHistoryFinalizeOptions({
    pendingUserText: 'hello',
    settings: {
      chatHistoryMax: '8',
      creativeHistoryMax: '2',
      reasoningAddToPrompts: false,
      reasoningMaxAdditions: 'bad',
    },
    openaiPreset,
    rpUiMode: true,
    reasoningPreset: {
      prefix: '[',
      suffix: ']',
      separator: '\n',
    },
  });

  assert.equal(result.pendingUserText, 'hello');
  assert.equal(result.chatHistoryLimit, 8);
  assert.equal(result.creativeHistoryLimit, 2);
  assert.equal(result.rpUiMode, true);
  assert.equal(result.openaiPreset, openaiPreset);
  assert.equal(result.reasoning.enabled, false);
  assert.equal(result.reasoning.maxAdditions, 1);
  assert.equal(result.reasoning.prefix, '[');
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
