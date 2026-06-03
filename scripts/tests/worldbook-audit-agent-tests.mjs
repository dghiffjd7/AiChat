import assert from 'node:assert/strict';

import {
  auditWorldbookData,
  createWorldbookAuditAgent,
} from '../../src/scripts/agent/worldbook-audit-agent.js';
import { createAgentTaskRuntime } from '../../src/scripts/agent/agent-task-runtime.js';
import { AgentRunStore } from '../../src/scripts/storage/agent-run-store.js';

{
  const report = auditWorldbookData({
    id: 'world-a',
    entries: [
      { id: 'disabled', comment: 'Disabled lore', content: 'kept', disable: true },
      { id: 'route', comment: 'Route only', keys: ['route-key'], content: '' },
      { id: 'mvu', comment: 'MVU data', content: '[initvar]\n{"stat_data":{"hp":1}}' },
      { id: 'probability', comment: 'Chance', content: 'maybe', keys: ['maybe'], probability: 30 },
      { id: 'missing', comment: 'Missing trigger', content: 'visible' },
    ],
  }, { source: 'test' });
  assert.equal(report.worldId, 'world-a');
  assert.equal(report.counts.entries, 5);
  assert.equal(report.counts.disabled, 1);
  assert.equal(report.counts.routeOnly, 1);
  assert.equal(report.counts.mvuMarkers, 1);
  assert.equal(report.counts.probabilityGates, 1);
  assert.equal(report.counts.missingTrigger, 2);
  assert.ok(report.findings.some(item => item.type === 'disabled_entry'));
  assert.ok(report.findings.some(item => item.type === 'route_only_entry'));
  assert.ok(report.findings.some(item => item.type === 'mvu_marker'));
  console.log('ok - auditWorldbookData summarizes disabled route-only MVU and trigger risks');
}

{
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createWorldbookAuditAgent({
    agentTaskRuntime: runtime,
    loadWorld: async id => ({
      id,
      entries: [
        { id: 'e1', comment: 'Route only', key: ['route'], content: '' },
      ],
    }),
  });
  const result = await agent.auditWorldbook({ worldId: 'world-b', source: 'import' });
  const run = runtime.listRuns({ kind: 'worldbook_audit' })[0];
  assert.equal(result.status, 'succeeded');
  assert.equal(result.report.counts.routeOnly, 1);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.title, '世界书检查');
  assert.equal(run.source, 'worldbook-check');
  assert.deepEqual(run.steps.map(step => step.type), [
    'worldbook_audit.load',
    'worldbook_audit.analyze',
  ]);
  console.log('ok - WorldbookAuditAgent records worldbook check run and steps');
}

{
  const runtime = createAgentTaskRuntime({
    store: new AgentRunStore(),
    logger: { warn: () => {} },
  });
  const agent = createWorldbookAuditAgent({
    agentTaskRuntime: runtime,
    loadWorld: async () => null,
  });
  await assert.rejects(
    () => agent.auditWorldbook({ worldId: 'missing-world' }),
    /worldbook data not found/,
  );
  const run = runtime.listRuns({ kind: 'worldbook_audit' })[0];
  assert.equal(run.status, 'failed');
  assert.equal(run.steps[0].status, 'failed');
  console.log('ok - WorldbookAuditAgent records missing worldbook failures');
}
