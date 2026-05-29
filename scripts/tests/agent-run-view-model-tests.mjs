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
  assert.equal(view.meta.unreadFailures, 1);
  assert.equal(view.meta.newestFailureAt, 1350);
  assert.equal(view.meta.scopedUnreadFailures, 0);
  assert.equal(view.meta.scopedNewestFailureAt, 0);
  assert.equal(view.filters.failureSeenAt, 0);
  assert.deepEqual(view.runs.map(run => run.id), ['run-3', 'run-1']);
  assert.equal(buildAgentRunDiagnosticsMeta(view), 'runs=2/2 · total=3 · active=1 · failures=1');
  const text = formatAgentRunDiagnostics(view);
  assert.equal(text.includes('[RUNNING] contact_profile_update'), true);
  assert.equal(text.includes('lastStep: memory.apply [succeeded] · applied'), true);
  console.log('ok - buildAgentRunListView filters sorts and formats diagnostics');
}

{
  const seenView = buildAgentRunListView(runs, {
    failureSeenAt: 1350,
    limit: 10,
  });
  assert.equal(seenView.meta.failures, 1);
  assert.equal(seenView.meta.unreadFailures, 0);
  assert.equal(seenView.meta.newestFailureAt, 1350);
  assert.equal(seenView.filters.failureSeenAt, 1350);
  console.log('ok - buildAgentRunListView separates historical failures from unread failures');
}

{
  const summary = buildAgentRunSummary({
    id: 'run-format',
    kind: 'chat_format_guardian',
    source: 'chat-format-guardian',
    status: 'waiting_permission',
    metadata: {
      sourceTextKind: 'rawOriginal',
      hasRawOriginal: true,
      eventCount: 1,
      issueCount: 1,
      errors: [],
      warnings: ['time is missing'],
      repairCandidate: {
        available: true,
        kind: 'fill_missing_time',
        title: '补齐时间',
        summary: '补齐 1 条缺失时间',
        replacementText: 'should not be surfaced',
      },
      decisionActions: [
        { id: 'apply_repair', label: '应用修复', enabled: true, repairCandidate: { replacementText: 'hidden' } },
        { id: 'review_original', label: '查看原文', enabled: true },
      ],
    },
  });
  assert.equal(summary.review.sourceTextKind, 'rawOriginal');
  assert.equal(summary.review.hasRawOriginal, true);
  assert.deepEqual(summary.review.warnings, ['time is missing']);
  assert.equal(summary.review.repairCandidate.summary, '补齐 1 条缺失时间');
  assert.equal(summary.review.repairCandidate.replacementText, undefined);
  assert.deepEqual(summary.review.actionLabels, ['应用修复', '查看原文']);
  console.log('ok - buildAgentRunSummary exposes safe chat format review metadata');
}

{
  const summary = buildAgentRunSummary({
    id: 'run-body',
    kind: 'chat_body_quality_guardian',
    source: 'chat-body-quality-guardian',
    status: 'waiting_permission',
    metadata: {
      sourceTextKind: 'rawOriginal',
      hasRawOriginal: true,
      issueCount: 1,
      issues: [{
        id: 'consecutive_duplicate_lines',
        severity: 'warning',
        title: '连续重复句段',
        summary: '发现 1 行连续重复正文。',
        risk: 'low',
      }],
      patchCandidate: {
        available: true,
        id: 'body_quality_deterministic_cleanup',
        title: '清理重复正文',
        summary: '移除 1 行连续重复',
        replacementText: 'should not be surfaced',
      },
      decisionActions: [
        { id: 'review_original', label: '查看原文', enabled: true },
        { id: 'open_agent_center', label: 'Agent Center', enabled: true },
      ],
    },
  });
  assert.equal(summary.review.type, 'body_quality');
  assert.equal(summary.review.sourceTextKind, 'rawOriginal');
  assert.equal(summary.review.issueCount, 1);
  assert.equal(summary.review.issues[0].title, '连续重复句段');
  assert.equal(summary.review.patchCandidate.summary, '移除 1 行连续重复');
  assert.equal(summary.review.patchCandidate.replacementText, undefined);
  assert.deepEqual(summary.review.actionLabels, ['查看原文', 'Agent Center']);
  console.log('ok - buildAgentRunSummary exposes safe chat body quality review metadata');
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
  const surfaceRuns = [
    ...runs,
    {
      id: 'run-4',
      kind: 'moment_summary',
      sessionId: 'moments',
      source: 'moments-agent',
      surface: 'moments',
      status: 'running',
      summary: 'moments running',
      createdAt: 1500,
      updatedAt: 1510,
    },
  ];
  const view = buildAgentRunListView(surfaceRuns, { surface: 'moments', limit: 10 });
  assert.deepEqual(view.runs.map(run => run.id), ['run-4']);
  assert.equal(view.runs[0].surface, 'moments');
  assert.equal(view.filters.surface, 'moments');
  assert.equal(view.meta.scoped, 1);
  assert.equal(view.meta.scopedActive, 1);
  assert.equal(view.meta.active, 2);
  console.log('ok - buildAgentRunListView supports surface scoped activity');
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
