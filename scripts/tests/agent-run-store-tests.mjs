import assert from 'node:assert/strict';

import {
  AgentRunStore,
  buildAgentRunStoreKey,
  normalizeAgentRunStoreState,
} from '../../src/scripts/storage/agent-run-store.js';

const installLocalStorage = () => {
  const backing = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: key => backing.get(String(key)) ?? null,
    setItem: (key, value) => {
      backing.set(String(key), String(value));
    },
    removeItem: key => {
      backing.delete(String(key));
    },
  };
  return {
    backing,
    restore: () => {
      if (previous === undefined) {
        delete globalThis.localStorage;
      } else {
        globalThis.localStorage = previous;
      }
    },
  };
};

{
  assert.equal(buildAgentRunStoreKey(''), 'agent_run_store_v1');
  assert.equal(buildAgentRunStoreKey(' rp:char '), 'agent_run_store_v1__rp_char');
  console.log('ok - buildAgentRunStoreKey scopes agent run storage keys');
}

{
  const state = normalizeAgentRunStoreState({
    runs: {
      a: { id: 'a', kind: 'memory_update', updatedAt: 10 },
      b: { id: 'b', kind: 'image_generate', updatedAt: 20, exportable: false },
    },
    events: [
      { id: 'e1', runId: 'a', type: 'agent.run.started', createdAt: 11 },
      { id: 'e2', runId: 'missing', type: 'agent.run.started', createdAt: 12 },
    ],
  }, {
    now: () => 100,
    maxRuns: 1,
    maxEvents: 10,
  });
  assert.deepEqual(Object.keys(state.runs), ['b']);
  assert.deepEqual(state.events.map(event => event.id), []);
  console.log('ok - normalizeAgentRunStoreState trims stale runs and orphan events');
}

{
  const local = installLocalStorage();
  try {
    let currentTime = 1000;
    const store = new AgentRunStore({
      now: () => currentTime,
      maxRuns: 5,
      maxEvents: 10,
    });
    await store.load();
    const run = store.upsertRun({
      id: 'run-1',
      kind: 'memory_update',
      sessionId: 's1',
      status: 'running',
      createdAt: 1000,
    });
    assert.equal(run.id, 'run-1');
    currentTime = 1010;
    const step = store.addStep('run-1', {
      id: 'step-1',
      type: 'memory.update',
      status: 'running',
    });
    assert.equal(step.runId, 'run-1');
    currentTime = 1025;
    store.updateStep('run-1', 'step-1', {
      status: 'succeeded',
      output: { changed: 2 },
      finishedAt: 1025,
    });
    const event = store.recordEvent({
      id: 'event-1',
      type: 'agent.run.finished',
      runId: 'run-1',
      sessionId: 's1',
      status: 'succeeded',
      createdAt: 1030,
    });
    assert.equal(event.id, 'event-1');
    currentTime = 1030;
    store.updateRun('run-1', {
      status: 'succeeded',
      finishedAt: 1030,
      summary: 'done',
    });
    const saved = store.getRun('run-1');
    assert.equal(saved.status, 'succeeded');
    assert.equal(saved.steps[0].output.changed, 2);
    assert.deepEqual(store.listRuns({ sessionId: 's1' }).map(item => item.id), ['run-1']);
    assert.deepEqual(store.listEvents({ runId: 'run-1' }).map(item => item.id), ['event-1']);
    assert.deepEqual(Object.keys(store.exportState().runs), ['run-1']);
    await store.writeChain;
    assert.ok(local.backing.get('agent_run_store_v1')?.includes('run-1'));
    console.log('ok - AgentRunStore records runs, steps, events, exports, and persists locally');
  } finally {
    local.restore();
  }
}
