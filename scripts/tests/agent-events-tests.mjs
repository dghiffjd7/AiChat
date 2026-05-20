import assert from 'node:assert/strict';

import {
  AGENT_EVENT_TYPES,
  buildAgentTraceEvent,
  normalizeAgentEvent,
  normalizeAgentRun,
  normalizeAgentStatus,
  normalizeAgentStep,
} from '../../src/scripts/agent/agent-events.js';

{
  assert.equal(normalizeAgentStatus(' success ', 'queued'), 'queued');
  assert.equal(normalizeAgentStatus(' succeeded ', 'queued'), 'succeeded');
  assert.equal(normalizeAgentStatus('failed', 'queued'), 'failed');
  assert.equal(normalizeAgentStatus('', 'running'), 'running');
  console.log('ok - normalizeAgentStatus accepts only stable agent statuses');
}

{
  const step = normalizeAgentStep({
    id: ' step-1 ',
    type: ' memory.update ',
    status: ' succeeded ',
    startedAt: 100,
    finishedAt: 125,
    input: { sessionId: 's1' },
  }, {
    runId: 'run-1',
    now: () => 999,
  });
  assert.deepEqual(step, {
    id: 'step-1',
    runId: 'run-1',
    type: 'memory.update',
    title: '',
    status: 'succeeded',
    summary: '',
    input: { sessionId: 's1' },
    output: null,
    metadata: {},
    errorMessage: '',
    startedAt: 100,
    updatedAt: 125,
    finishedAt: 125,
  });
  console.log('ok - normalizeAgentStep preserves step timing and serializable input');
}

{
  const run = normalizeAgentRun({
    id: ' run-1 ',
    kind: ' memory_update ',
    sessionId: ' s1 ',
    status: ' running ',
    createdAt: 1000,
    metadata: { checkpointMessageId: 'm1' },
    steps: [
      { id: 'step-1', type: 'memory.update', status: 'running', startedAt: 1001 },
    ],
  }, {
    now: () => 2000,
  });
  assert.equal(run.id, 'run-1');
  assert.equal(run.version, 1);
  assert.equal(run.kind, 'memory_update');
  assert.equal(run.sessionId, 's1');
  assert.equal(run.status, 'running');
  assert.equal(run.exportable, true);
  assert.deepEqual(run.metadata, { checkpointMessageId: 'm1' });
  assert.equal(run.steps[0].runId, 'run-1');
  assert.equal(run.steps[0].status, 'running');
  console.log('ok - normalizeAgentRun builds exportable run records with normalized nested steps');
}

{
  const event = normalizeAgentEvent({
    id: ' event-1 ',
    type: AGENT_EVENT_TYPES.runStarted,
    runId: ' run-1 ',
    stepId: ' step-1 ',
    sessionId: ' s1 ',
    source: ' memory-update-runtime ',
    status: ' running ',
    summary: ' started ',
    details: { kind: 'memory_update' },
    createdAt: 3000,
  }, {
    now: () => 9999,
  });
  assert.deepEqual(event, {
    id: 'event-1',
    type: 'agent.run.started',
    runId: 'run-1',
    stepId: 'step-1',
    toolCallId: '',
    sessionId: 's1',
    source: 'memory-update-runtime',
    status: 'running',
    summary: 'started',
    details: { kind: 'memory_update' },
    createdAt: 3000,
  });
  assert.deepEqual(buildAgentTraceEvent(event), {
    category: 'agent',
    phase: 'run.started',
    sessionId: 's1',
    source: 'memory-update-runtime',
    status: 'running',
    startedAt: 3000,
    summary: 'started',
    details: {
      runId: 'run-1',
      stepId: 'step-1',
      toolCallId: '',
      kind: 'memory_update',
    },
  });
  console.log('ok - normalizeAgentEvent and buildAgentTraceEvent expose debug trace friendly events');
}
