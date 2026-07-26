import assert from 'node:assert/strict';

import {
  reportProviderUsage,
  resolveProviderPromptTokens,
} from '../../src/scripts/api/provider-usage.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('reports normalized OpenAI-shape usage through the callback', () => {
  let seen = null;
  reportProviderUsage({ onProviderUsage: (u) => { seen = u; } }, {
    body: { usage: { prompt_tokens: 1200, completion_tokens: 300, total_tokens: 1500 } },
    model: 'deepseek-v4-pro',
    provider: 'custom',
    finishReason: 'stop',
  });
  assert.deepEqual(seen, {
    provider: 'custom', model: 'deepseek-v4-pro', finishReason: 'stop',
    promptTokens: 1200, completionTokens: 300, totalTokens: 1500,
  });
});

test('falls back to input/output token field names', () => {
  let seen = null;
  reportProviderUsage({ onProviderUsage: (u) => { seen = u; } }, {
    body: { usage: { input_tokens: 500, output_tokens: 90 } },
    model: 'm', provider: 'p', finishReason: '',
  });
  assert.equal(seen.promptTokens, 500);
  assert.equal(seen.completionTokens, 90);
  assert.equal(seen.totalTokens, null); // 无 total 字段时不推导，留给上层 aggregator/normalizer
});

test('does not double count OpenAI cached prompt tokens', () => {
  assert.equal(resolveProviderPromptTokens({
    prompt_tokens: 1200,
    prompt_tokens_details: { cached_tokens: 800 },
  }), 1200);
});

test('adds Anthropic cache read and creation tokens to input tokens', () => {
  assert.equal(resolveProviderPromptTokens({
    input_tokens: 500,
    cache_read_input_tokens: 400,
    cache_creation_input_tokens: 100,
  }), 1000);
});

test('emits null tokens (unknown) when body has no usage', () => {
  let seen = null;
  reportProviderUsage({ onProviderUsage: (u) => { seen = u; } }, {
    body: { choices: [{ message: { content: 'hi' } }] },
    model: 'm', provider: 'p',
  });
  assert.equal(seen.promptTokens, null);
  assert.equal(seen.completionTokens, null);
  assert.equal(seen.totalTokens, null);
  assert.equal(seen.provider, 'p');
});

test('no-op when callback absent and never throws on bad input', () => {
  assert.doesNotThrow(() => reportProviderUsage({}, { body: null }));
  assert.doesNotThrow(() => reportProviderUsage(null, null));
  assert.doesNotThrow(() => reportProviderUsage({ onProviderUsage: () => { throw new Error('boom'); } }, { body: { usage: {} } }));
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
if (failed > 0) process.exit(1);
