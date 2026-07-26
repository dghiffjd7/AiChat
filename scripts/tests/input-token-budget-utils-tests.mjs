import assert from 'node:assert/strict';

import {
  HISTORY_TOKEN_BACKSTOP,
  resolveInputTokenBudget,
  resolveRecentHistoryQuota,
} from '../../src/scripts/memory/input-token-budget-utils.js';

assert.deepEqual(
  resolveInputTokenBudget({
    maxContextTokens: 8192,
    maxOutputTokens: 1024,
    safetyReserveTokens: 512,
  }),
  {
    contextKnown: true,
    maxContextTokens: 8192,
    maxOutputTokens: 1024,
    safetyReserveTokens: 512,
    userBudgetTokens: null,
    contextInputLimitTokens: 6656,
    inputBudgetTokens: 6656,
    source: 'context',
  },
);

assert.equal(
  resolveInputTokenBudget({
    maxContextTokens: 131072,
    maxOutputTokens: 4096,
    userBudgetTokens: 100000,
  }).inputBudgetTokens,
  100000,
);

assert.equal(
  resolveInputTokenBudget({
    maxContextTokens: 8192,
    maxOutputTokens: 2048,
    userBudgetTokens: 100000,
  }).inputBudgetTokens,
  5632,
);

const unknown = resolveInputTokenBudget({
  maxContextTokens: 0,
  maxOutputTokens: 4096,
});
assert.equal(unknown.contextKnown, false);
assert.equal(unknown.contextInputLimitTokens, null);
assert.equal(unknown.inputBudgetTokens, null);
assert.equal(unknown.source, 'unbounded');

assert.equal(
  resolveInputTokenBudget({
    maxContextTokens: null,
    userBudgetTokens: 100000,
  }).inputBudgetTokens,
  100000,
);

console.log('ok - input token budget respects explicit context and never invents an unknown context limit');

// 兜底顶：调度器给不出 recent 配额（条数模式 + ctx 未知）时 history 不能彻底不设防
assert.equal(resolveRecentHistoryQuota(74600), 74600);
assert.equal(resolveRecentHistoryQuota(0), 0);
assert.equal(resolveRecentHistoryQuota(null), HISTORY_TOKEN_BACKSTOP);
assert.equal(resolveRecentHistoryQuota(undefined), HISTORY_TOKEN_BACKSTOP);
assert.equal(resolveRecentHistoryQuota('not-a-number'), HISTORY_TOKEN_BACKSTOP);
assert.equal(HISTORY_TOKEN_BACKSTOP, 200000);
assert.equal(resolveRecentHistoryQuota(null, { backstopTokens: 50000 }), 50000);
assert.equal(resolveRecentHistoryQuota(null, { backstopTokens: 0 }), null);

console.log('ok - recent history quota falls back to a high backstop instead of unlimited');

