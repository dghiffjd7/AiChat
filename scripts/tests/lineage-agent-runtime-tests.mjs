import assert from 'node:assert/strict';

import { createLineageAgentRuntime } from '../../src/scripts/agent/lineage-agent-runtime.js';

const graph = {
  scopeId: 'scope-1',
  mode: 'chat',
  nodes: [{ id: 'a' }, { id: 'b' }],
  edges: [{ id: 'e1', source: 'a', target: 'b' }],
};

{
  const runtime = createLineageAgentRuntime({
    renderMapSceneHtml: async (nextGraph, options) => `<div>${nextGraph.scopeId}:${options.focusId}</div>`,
  });
  const html = await runtime.renderMapScene({
    graph,
    options: { focusId: 'a' },
  });
  assert.equal(html, '<div>scope-1:a</div>');
  console.log('ok - lineage agent runtime renders without agent task runtime');
}

{
  const calls = [];
  const runtime = createLineageAgentRuntime({
    agentTaskRuntime: {
      startRun: (run) => {
        calls.push(['startRun', run.kind, run.sessionId, run.metadata.nodeCount, run.metadata.expandedCount]);
        return { id: 'run-1' };
      },
      startStep: (runId, step) => {
        calls.push(['startStep', runId, step.type, step.input.edgeCount, step.input.focusId]);
        return { id: 'step-1' };
      },
      finishStep: (runId, stepId, patch) => {
        calls.push(['finishStep', runId, stepId, patch.status, patch.output.htmlLength]);
      },
      finishRun: (runId, patch) => {
        calls.push(['finishRun', runId, patch.status]);
      },
    },
    renderMapSceneHtml: async () => '<section>lineage</section>',
    summarizeGraph: () => ({
      scopeId: 'scope-1',
      mode: 'chat',
      nodeCount: 2,
      edgeCount: 1,
      riskCount: 0,
    }),
    logger: { warn: () => {} },
  });
  const html = await runtime.renderMapScene({
    graph,
    options: { focusId: 'a', expandedIds: ['contacts', 'memories'] },
    sessionId: 'session-1',
  });
  assert.equal(html, '<section>lineage</section>');
  assert.deepEqual(calls, [
    ['startRun', 'lineage_layout', 'session-1', 2, 2],
    ['startStep', 'run-1', 'lineage.layout', 1, 'a'],
    ['finishStep', 'run-1', 'step-1', 'succeeded', 26],
    ['finishRun', 'run-1', 'succeeded'],
  ]);
  console.log('ok - lineage agent runtime records layout run and step lifecycle');
}

{
  const calls = [];
  const runtime = createLineageAgentRuntime({
    agentTaskRuntime: {
      startRun: () => ({ id: 'run-err' }),
      startStep: () => ({ id: 'step-err' }),
      finishStep: (runId, stepId, patch) => calls.push(['finishStep', patch.status, patch.errorMessage]),
      finishRun: (runId, patch) => calls.push(['finishRun', patch.status, patch.errorMessage]),
    },
    renderMapSceneHtml: async () => {
      throw new Error('layout failed');
    },
    logger: { warn: () => {} },
  });
  await assert.rejects(
    () => runtime.renderMapScene({ graph }),
    /layout failed/,
  );
  assert.deepEqual(calls, [
    ['finishStep', 'failed', 'layout failed'],
    ['finishRun', 'failed', 'layout failed'],
  ]);
  console.log('ok - lineage agent runtime records layout failures');
}
