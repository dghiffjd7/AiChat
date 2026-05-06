import assert from 'node:assert/strict';

import {
  applySwipeBranchMemoryState,
  attachAssistantMemoryStateToMeta,
  captureAssistantMemoryState,
  persistSwipeBranchMemoryState,
} from '../../src/scripts/ui/chat/swipe-memory-state-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('persistSwipeBranchMemoryState stores snapshot and cloned update entry', async () => {
  const branches = [{ content: 'a' }];
  const updates = new Map([['chat-a', { raw: 'entry' }]]);

  const ok = await persistSwipeBranchMemoryState({
    branches,
    index: 0,
    sessionId: 'chat-a',
    buildSnapshot: async sid => ({ sid, rows: [] }),
    cloneEntry: value => (value ? { ...value } : null),
    getMemoryUpdateEntry: sid => updates.get(sid) || null,
  });

  assert.equal(ok, true);
  assert.deepEqual(branches[0].memoryTableSnapshot, { sid: 'chat-a', rows: [] });
  assert.deepEqual(branches[0].memoryUpdateEntry, { raw: 'entry' });
});

test('persistSwipeBranchMemoryState ignores invalid branch targets', async () => {
  const branches = [{ draft: true }];
  const ok = await persistSwipeBranchMemoryState({
    branches,
    index: 0,
    sessionId: 'chat-a',
    buildSnapshot: async () => ({ rows: [] }),
  });

  assert.equal(ok, false);
  assert.equal(branches[0].memoryTableSnapshot, undefined);
});

test('applySwipeBranchMemoryState applies snapshot and syncs cloned entry back', async () => {
  const calls = [];
  const writes = [];
  const branch = {
    memoryTableSnapshot: { rows: [1] },
    memoryUpdateEntry: { raw: 'entry' },
  };

  const ok = await applySwipeBranchMemoryState({
    sessionId: 'chat-a',
    branch,
    applySnapshot: async (sid, snapshot) => {
      calls.push({ sid, snapshot });
      return true;
    },
    cloneEntry: value => (value ? { ...value } : null),
    setMemoryUpdateEntry: (sid, value) => writes.push({ sid, value }),
  });

  assert.equal(ok, true);
  assert.deepEqual(calls, [{ sid: 'chat-a', snapshot: { rows: [1] } }]);
  assert.deepEqual(writes, [{ sid: 'chat-a', value: { raw: 'entry' } }]);
});

test('captureAssistantMemoryState clones snapshot and update entry', async () => {
  const result = await captureAssistantMemoryState({
    sessionId: 'chat-a',
    buildSnapshot: async () => ({ rows: [{ id: 'row-1' }] }),
    cloneSnapshot: value => JSON.parse(JSON.stringify(value)),
    cloneEntry: value => (value ? { ...value } : null),
    getMemoryUpdateEntry: () => ({ raw: 'entry' }),
  });

  assert.deepEqual(result, {
    memoryTableSnapshot: { rows: [{ id: 'row-1' }] },
    memoryUpdateEntry: { raw: 'entry' },
  });
});

test('attachAssistantMemoryStateToMeta mutates meta only when snapshot exists', () => {
  const meta = { renderRich: true };
  const result = attachAssistantMemoryStateToMeta({
    meta,
    memoryState: {
      memoryTableSnapshot: { rows: [{ id: 'row-1' }] },
      memoryUpdateEntry: { raw: 'entry' },
    },
    cloneSnapshot: value => JSON.parse(JSON.stringify(value)),
    cloneEntry: value => (value ? { ...value } : null),
  });

  assert.equal(result, meta);
  assert.deepEqual(meta, {
    renderRich: true,
    memoryTableSnapshot: { rows: [{ id: 'row-1' }] },
    memoryUpdateEntry: { raw: 'entry' },
  });
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
