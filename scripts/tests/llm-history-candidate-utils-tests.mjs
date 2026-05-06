import assert from 'node:assert/strict';

import {
  buildLlmConversationPositionMap,
  buildLlmHistoryCandidates,
  resolveLlmConversationDepth,
  shouldIncludeLlmHistoryMessage,
} from '../../src/scripts/ui/chat/llm-history-candidate-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('buildLlmConversationPositionMap tracks only user and assistant turns', () => {
  const positions = buildLlmConversationPositionMap([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'u1' },
    { role: 'assistant', content: 'a1' },
    { role: 'assistant', content: 'a2' },
  ]);
  assert.equal(positions.size, 3);
  assert.equal(resolveLlmConversationDepth(positions, 1), 2);
  assert.equal(resolveLlmConversationDepth(positions, 2), 1);
  assert.equal(resolveLlmConversationDepth(positions, 3), 0);
  assert.equal(resolveLlmConversationDepth(positions, 0), undefined);
});

test('shouldIncludeLlmHistoryMessage filters pending, excluded, hidden rp, and private system messages', () => {
  const excluded = new Set(['a1']);
  assert.equal(
    shouldIncludeLlmHistoryMessage({ id: 'u1', role: 'user', content: 'x', status: 'pending' }),
    false,
  );
  assert.equal(
    shouldIncludeLlmHistoryMessage({ id: 'a1', role: 'assistant', content: 'x' }, { excludeMessageIds: excluded }),
    false,
  );
  assert.equal(
    shouldIncludeLlmHistoryMessage(
      { id: 'u2', role: 'user', content: 'x', meta: { hiddenFromRpPrompt: true } },
      { isRpMode: true },
    ),
    false,
  );
  assert.equal(
    shouldIncludeLlmHistoryMessage({ id: 's1', role: 'system', content: 'sys' }, { isGroupChat: false }),
    false,
  );
  assert.equal(
    shouldIncludeLlmHistoryMessage({ id: 's2', role: 'system', content: 'sys' }, { isGroupChat: true }),
    true,
  );
});

test('buildLlmHistoryCandidates preserves original conversation depth while filtering output candidates', () => {
  const candidates = buildLlmHistoryCandidates([
    { id: 'sys', role: 'system', content: 'sys' },
    { id: 'u1', role: 'user', content: 'u1' },
    { id: 'a1', role: 'assistant', content: 'a1' },
    { id: 'u2', role: 'user', content: 'u2', status: 'pending' },
    { id: 'a2', role: 'assistant', content: 'a2' },
    { id: 's2', role: 'system', content: 'group sys' },
  ], {
    excludeMessageIds: new Set(['a2']),
    isGroupChat: true,
  });

  assert.deepEqual(
    candidates.map(item => ({ id: item.message.id, depth: item.depth })),
    [
      { id: 'sys', depth: undefined },
      { id: 'u1', depth: 3 },
      { id: 'a1', depth: 2 },
      { id: 's2', depth: undefined },
    ],
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

if (failed > 0) {
  process.exit(1);
}
