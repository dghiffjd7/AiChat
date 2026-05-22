import assert from 'node:assert/strict';

import {
  buildAgentRunCacheStats,
  buildAgentRunDiagnosticsMeta,
  buildAgentRunListView,
  buildAgentRunSummary,
  formatAgentRunDiagnostics,
} from '../../src/scripts/agent/agent-run-view-model.js';

const runs = [
  {
    id: 'run-1',
    kind: 'memory_update',
    sessionId: 's1',
    source: 'memory',
    trigger: 'after_chat',
    status: 'succeeded',
    summary: 'memory done',
    createdAt: 1000,
    updatedAt: 1200,
    finishedAt: 1200,
    steps: [
      { id: 'step-1', type: 'memory.plan', status: 'succeeded', summary: 'planned', updatedAt: 1100 },
      { id: 'step-2', type: 'memory.apply', status: 'succeeded', summary: 'applied', updatedAt: 1200 },
    ],
  },
  {
    id: 'run-2',
    kind: 'image_director_generation',
    sessionId: 's2',
    source: 'image-director-agent',
    status: 'failed',
    summary: 'image failed',
    errorMessage: 'provider unavailable',
    createdAt: 1300,
    updatedAt: 1350,
    finishedAt: 1350,
    steps: [
      { id: 'step-3', type: 'image.generate', status: 'failed', summary: 'failed', errorMessage: 'provider unavailable', updatedAt: 1350 },
    ],
  },
  {
    id: 'run-3',
    kind: 'contact_profile_update',
    sessionId: 's1',
    source: 'contact-profiler-agent',
    status: 'running',
    summary: 'profile running',
    createdAt: 1400,
    updatedAt: 1420,
    steps: [],
  },
];

{
  const summary = buildAgentRunSummary(runs[0], {
    events: [
      { id: 'event-1', runId: 'run-1' },
      { id: 'event-2', runId: 'run-2' },
    ],
  });
  assert.equal(summary.id, 'run-1');
  assert.equal(summary.durationMs, 200);
  assert.equal(summary.stepCount, 2);
  assert.equal(summary.eventCount, 1);
  assert.equal(summary.lastStep.type, 'memory.apply');
  assert.equal(summary.stepStatusCounts.succeeded, 2);
  console.log('ok - buildAgentRunSummary produces compact run state');
}

{
  const view = buildAgentRunListView(runs, {
    events: [{ id: 'event-3', runId: 'run-3' }],
    sessionId: 's1',
    limit: 10,
  });
  assert.equal(view.meta.total, 3);
  assert.equal(view.meta.filtered, 2);
  assert.equal(view.meta.visible, 2);
  assert.equal(view.meta.active, 1);
  assert.equal(view.meta.failures, 1);
  assert.deepEqual(view.runs.map(run => run.id), ['run-3', 'run-1']);
  assert.equal(buildAgentRunDiagnosticsMeta(view), 'runs=2/2 · total=3 · active=1 · failures=1');
  const text = formatAgentRunDiagnostics(view);
  assert.equal(text.includes('[RUNNING] contact_profile_update'), true);
  assert.equal(text.includes('lastStep: memory.apply [succeeded] · applied'), true);
  console.log('ok - buildAgentRunListView filters sorts and formats diagnostics');
}

{
  const withCancelled = [
    ...runs,
    {
      id: 'run-4',
      kind: 'lineage_layout',
      sessionId: 's3',
      source: 'lineage-agent',
      status: 'cancelled',
      summary: 'cancelled by user',
      createdAt: 1500,
      updatedAt: 1510,
      finishedAt: 1510,
    },
  ];
  const activeView = buildAgentRunListView(withCancelled, { status: 'active', limit: 10 });
  assert.deepEqual(activeView.runs.map(run => run.id), ['run-3']);
  const failureView = buildAgentRunListView(withCancelled, { status: 'failure', limit: 10 });
  assert.deepEqual(failureView.runs.map(run => run.id), ['run-4', 'run-2']);
  assert.equal(failureView.filters.status, 'failure');
  console.log('ok - buildAgentRunListView supports user-facing active and failure status filters');
}

{
  const stats = buildAgentRunCacheStats({
    runs,
    events: [{}, {}, {}],
    maxRuns: 200,
    maxEvents: 1000,
  });
  assert.deepEqual(stats, {
    runCount: 3,
    eventCount: 3,
    maxRuns: 200,
    maxEvents: 1000,
    activeRuns: 1,
    failedRuns: 1,
    oldestUpdatedAt: 1200,
    newestUpdatedAt: 1420,
  });
  assert.equal(formatAgentRunDiagnostics({ runs: [] }), 'No agent runs');
  console.log('ok - buildAgentRunCacheStats summarizes run cache pressure');
}
