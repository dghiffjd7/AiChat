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

{
  let currentTime = 3000;
  let attempts = 0;
  const store = new AgentRunStore({
    now: () => currentTime,
  });
  const runtime = createAgentTaskRuntime({
    store,
    logger: { warn: () => {} },
    now: () => currentTime,
  });
  const result = await runtime.enqueue({
    kind: 'retry_task',
    sessionId: 's3',
    source: 'test-runtime',
    summary: 'retry task',
    retry: { maxAttempts: 2 },
  }, async ({ attempt, maxAttempts, startStep, finishStep }) => {
    attempts += 1;
    const step = startStep({
      type: 'retry.step',
      summary: `attempt ${attempt}`,
      metadata: { attempt, maxAttempts },
    });
    currentTime += 10;
    if (attempt === 1) {
      finishStep(step.id, {
        status: 'failed',
        errorMessage: 'temporary failure',
      });
      throw new Error('temporary failure');
    }
    finishStep(step.id, {
      status: 'succeeded',
      output: { attempt },
    });
    return { attempt };
  });

  const run = runtime.listRuns({ kind: 'retry_task' })[0];
  assert.deepEqual(result, { attempt: 2 });
  assert.equal(attempts, 2);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.metadata.attempt, 2);
  assert.equal(run.metadata.maxAttempts, 2);
  assert.deepEqual(run.steps.map(step => step.status), ['failed', 'succeeded']);
  console.log('ok - createAgentTaskRuntime retries failed queued tasks when configured');
}

{
  let release;
  let calls = 0;
  const store = new AgentRunStore();
  const runtime = createAgentTaskRuntime({
    store,
    logger: { warn: () => {} },
  });
  const first = runtime.enqueue({
    kind: 'coalesce_task',
    sessionId: 's4',
    source: 'test-runtime',
    summary: 'coalesced task',
    coalesceKey: 'contact:s4',
  }, async () => {
    calls += 1;
    return new Promise((resolve) => {
      release = () => resolve({ ok: true });
    });
  });
  const second = runtime.enqueue({
    kind: 'coalesce_task',
    sessionId: 's4',
    source: 'test-runtime',
    summary: 'coalesced duplicate',
    coalesceKey: 'contact:s4',
  }, async () => {
    calls += 1;
    return { ok: false };
  });

  assert.equal(first, second);
  assert.equal(runtime.listRuns({ kind: 'coalesce_task' }).length, 1);
  await Promise.resolve();
  release();
  const result = await second;
  assert.deepEqual(result, { ok: true });
  assert.equal(calls, 1);
  assert.equal(runtime.listRuns({ kind: 'coalesce_task' })[0].status, 'succeeded');
  console.log('ok - createAgentTaskRuntime coalesces duplicate in-flight tasks by key');
}
