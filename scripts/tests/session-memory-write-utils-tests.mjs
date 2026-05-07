import assert from 'node:assert/strict';

import { batchCreateMemoriesWithFallback } from '../../src/scripts/ui/session-memory-write-utils.js';

{
  const calls = [];
  const inserted = await batchCreateMemoriesWithFallback({
    memoryTableStore: {
      batchCreateMemories: async (inputs) => {
        calls.push(['batch', inputs]);
        return 3;
      },
    },
    inputs: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });
  assert.equal(inserted, 3);
  assert.equal(calls.length, 1);
  console.log('ok - batchCreateMemoriesWithFallback returns batch result when batch create succeeds');
}

{
  const inserted = await batchCreateMemoriesWithFallback({
    memoryTableStore: {
      batchCreateMemories: async () => undefined,
    },
    inputs: [{ id: 1 }, { id: 2 }],
  });
  assert.equal(inserted, 2);
  console.log('ok - batchCreateMemoriesWithFallback normalizes successful batch create without numeric count');
}

{
  const calls = [];
  const inserted = await batchCreateMemoriesWithFallback({
    memoryTableStore: {
      batchCreateMemories: async () => {
        throw new Error('no batch');
      },
      createMemory: async (input) => {
        calls.push(input.id);
        if (input.id === 2) throw new Error('skip');
      },
    },
    inputs: [{ id: 1 }, { id: 2 }, { id: 3 }],
  });
  assert.equal(inserted, 2);
  assert.deepEqual(calls, [1, 2, 3]);
  console.log('ok - batchCreateMemoriesWithFallback falls back to per-row create and counts successful inserts');
}
