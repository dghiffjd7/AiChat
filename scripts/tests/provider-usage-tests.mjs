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

test('preserves an OpenAI-compatible system fingerprint when the provider returns one', () => {
  let seen = null;
  reportProviderUsage({ onProviderUsage: (u) => { seen = u; } }, {
    body: {
      system_fingerprint: 'fp_2026_08_01_alpha',
      usage: { prompt_tokens: 500, completion_tokens: 90, total_tokens: 590 },
    },
    model: 'm', provider: 'openai', finishReason: 'stop',
  });
  assert.equal(seen.systemFingerprint, 'fp_2026_08_01_alpha');
});

test('normalizes Gemini usage metadata and response identity without inventing a fingerprint', () => {
  let seen = null;
  reportProviderUsage({ onProviderUsage: (u) => { seen = u; } }, {
    body: {
      usageMetadata: {
        promptTokenCount: 640,
        candidatesTokenCount: 96,
        totalTokenCount: 736,
      },
      modelVersion: 'gemini-3.7-flash-20260801',
      responseId: 'gemini-response-42',
    },
    model: 'gemini-3.7-flash', provider: 'makersuite', finishReason: 'STOP',
  });
  assert.deepEqual(seen, {
    provider: 'makersuite',
    model: 'gemini-3.7-flash',
    finishReason: 'STOP',
    promptTokens: 640,
    completionTokens: 96,
    totalTokens: 736,
    modelVersion: 'gemini-3.7-flash-20260801',
    responseId: 'gemini-response-42',
  });
  assert.equal(Object.hasOwn(seen, 'systemFingerprint'), false);
});

test('preserves provider-returned response model and routed provider identity', () => {
  let seen = null;
  reportProviderUsage({ onProviderUsage: (u) => { seen = u; } }, {
    body: {
      id: 'gen-openrouter-1',
      model: 'upstream/model-v2',
      provider: 'Upstream Labs',
      usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
    },
    model: 'requested/model', provider: 'openrouter', finishReason: 'stop',
  });
  assert.equal(seen.responseId, 'gen-openrouter-1');
  assert.equal(seen.responseModel, 'upstream/model-v2');
  assert.equal(seen.routedProvider, 'Upstream Labs');
});

test('reports provider-native web search usage and engine when returned', () => {
  let seen = null;
  reportProviderUsage({ onProviderUsage: (u) => { seen = u; } }, {
    body: {
      usage: {
        prompt_tokens: 10,
        completion_tokens: 4,
        total_tokens: 14,
        server_tool_use: {
          web_search_requests: 2,
          web_search_tokens: 320,
        },
      },
      router_metadata: { web_search: { engine: 'exa' } },
    },
    model: 'model', provider: 'openrouter', finishReason: 'stop',
  });
  assert.equal(seen.webSearchRequests, 2);
  assert.equal(seen.webSearchTokens, 320);
  assert.equal(seen.webSearchEngine, 'exa');
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

test('mixed usage shape sums caches onto prompt_tokens when no OpenAI details object exists', () => {
  // 中转把 Anthropic 基数改名成 prompt_tokens、cache 字段原样透传：基数不含 cache，必须求和
  assert.equal(
    resolveProviderPromptTokens({
      prompt_tokens: 500,
      cache_read_input_tokens: 400,
      cache_creation_input_tokens: 100,
    }),
    1000,
  );
  // prompt_tokens_details 存在（OpenAI 形态）时优先：prompt_tokens 已含 cached，杂散 cache 字段不再求和
  assert.equal(
    resolveProviderPromptTokens({
      prompt_tokens: 1200,
      prompt_tokens_details: { cached_tokens: 800 },
      cache_read_input_tokens: 800,
    }),
    1200,
  );
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
