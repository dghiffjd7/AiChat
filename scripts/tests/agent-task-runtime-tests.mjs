import assert from 'node:assert/strict';

import { createAgentTaskRuntime } from '../../src/scripts/agent/agent-task-runtime.js';
import { AgentRunStore } from '../../src/scripts/storage/agent-run-store.js';

{
  let currentTime = 1000;
  let idCounter = 0;
  const traces = [];
  const observed = [];
  const store = new AgentRunStore({
    now: () => currentTime,
    maxRuns: 20,
    maxEvents: 50,
  });
  const runtime = createAgentTaskRuntime({
    store,
    now: () => currentTime,
    idFactory: prefix => `${prefix}-${++idCounter}`,
    recordTraceEvent: event => traces.push(event),
    logger: { warn: () => {} },
  });
  const unsubscribe = runtime.onEvent(event => observed.push(event));
  const run = runtime.startRun({
    kind: 'memory_update',
    sessionId: 's1',
    source: 'test-runtime',
    summary: 'start memory',
  });
  currentTime = 1010;
  const step = runtime.startStep(run.id, {
    type: 'memory.update',
    summary: 'step running',
  });
  currentTime = 1030;
  runtime.finishStep(run.id, step.id, {
    status: 'succeeded',
    output: { changed: 1 },
    summary: 'step done',
  });
  currentTime = 1040;
  runtime.finishRun(run.id, {
    status: 'succeeded',
    summary: 'run done',
  });
  unsubscribe();

  const saved = runtime.getRun(run.id);
  assert.equal(saved.status, 'succeeded');
  assert.equal(saved.steps[0].status, 'succeeded');
  assert.equal(saved.steps[0].output.changed, 1);
  assert.deepEqual(observed.map(event => event.type), [
    'agent.run.started',
    'agent.step.started',
    'agent.step.finished',
    'agent.run.finished',
  ]);
  assert.deepEqual(traces.map(event => event.phase), [
    'run.started',
    'step.started',
    'step.finished',
    'run.finished',
  ]);
  console.log('ok - createAgentTaskRuntime records run and step lifecycle events');
}

{
  let currentTime = 2000;
  let idCounter = 0;
  const store = new AgentRunStore({
    now: () => currentTime,
  });
  const runtime = createAgentTaskRuntime({
    store,
    now: () => currentTime,
    idFactory: prefix => `${prefix}-${++idCounter}`,
    logger: { warn: () => {} },
  });
  const result = await runtime.enqueue({
    kind: 'image_generate',
    sessionId: 's2',
    source: 'test-runtime',
    summary: 'queued image',
  }, async ({ runId, startStep, finishStep }) => {
    currentTime = 2010;
    const step = startStep({ type: 'image.generate', summary: 'generating' });
    currentTime = 2025;
    finishStep(step.id, {
      status: 'succeeded',
      output: { path: 'image.png' },
    });
    return { runId, path: 'image.png' };
  });
  assert.equal(result.path, 'image.png');
  const run = runtime.listRuns({ sessionId: 's2' })[0];
  assert.equal(run.status, 'succeeded');
  assert.equal(run.steps[0].type, 'image.generate');
  assert.deepEqual(runtime.listEvents({ runId: run.id }).map(event => event.type), [
    'agent.run.queued',
    'agent.run.updated',
    'agent.step.started',
    'agent.step.finished',
    'agent.run.finished',
  ]);
  console.log('ok - createAgentTaskRuntime enqueue runs async task and records queue lifecycle');
}

{
  const calls = [];
  const store = new AgentRunStore();
  const runtime = createAgentTaskRuntime({
    store,
    toolRegistry: {
      executeTool: async (toolName, args, context) => {
        calls.push({
          toolName,
          args,
          hasEmit: typeof context.emit === 'function',
          hasRuntime: context.runtime === runtime,
        });
        return { status: 'succeeded', result: { ok: true } };
      },
    },
    logger: { warn: () => {} },
  });
  const result = await runtime.executeTool('demo.tool', { value: 1 }, { runId: 'run-x' });
  assert.deepEqual(result, { status: 'succeeded', result: { ok: true } });
  assert.deepEqual(calls, [{
    toolName: 'demo.tool',
    args: { value: 1 },
    hasEmit: true,
    hasRuntime: true,
  }]);
  console.log('ok - createAgentTaskRuntime delegates tool execution through configured registry');
}
