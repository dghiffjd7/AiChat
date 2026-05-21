import assert from 'node:assert/strict';

import {
  buildAgentMessagePartsFromRun,
  mergeAgentMessageParts,
  normalizeAgentMessagePart,
} from '../../src/scripts/agent/agent-message-parts.js';

{
  const part = normalizeAgentMessagePart({
    type: 'agent_step',
    runId: 'run-1',
    stepId: 'step-1',
    status: 'running',
    metadata: { attempt: 1 },
  });
  assert.equal(part.id, 'agent_step:run-1:step-1');
  assert.equal(part.type, 'agent_step');
  assert.equal(part.metadata.attempt, 1);
  console.log('ok - normalizeAgentMessagePart builds stable fallback ids');
}

{
  const run = {
    id: 'run-1',
    kind: 'contact_profile_update',
    source: 'contact-profiler-agent',
    trigger: 'manual',
    sessionId: 's1',
    status: 'running',
    summary: 'profile update',
    createdAt: 1000,
    updatedAt: 1200,
    steps: [
      { id: 'step-1', type: 'collect', status: 'succeeded', summary: 'done', updatedAt: 1100 },
      { id: 'step-2', type: 'prepare', status: 'running', summary: 'working', updatedAt: 1200 },
    ],
    toolCalls: [
      { id: 'tool-1', toolName: 'contact_profile.read', status: 'succeeded', updatedAt: 1150 },
    ],
  };
  const parts = buildAgentMessagePartsFromRun(run);
  assert.deepEqual(parts.map(part => part.type), ['agent_status', 'agent_step', 'agent_tool']);
  assert.equal(parts[0].metadata.stepCount, 2);
  assert.equal(parts[1].stepId, 'step-2');
  assert.equal(parts[2].toolCallId, 'tool-1');

  const withSucceededSteps = buildAgentMessagePartsFromRun(run, { includeSucceededSteps: true });
  assert.deepEqual(withSucceededSteps.map(part => part.id), [
    'agent-status:run-1',
    'agent-step:run-1:step-1',
    'agent-step:run-1:step-2',
    'agent-tool:run-1:tool-1',
  ]);
  console.log('ok - buildAgentMessagePartsFromRun converts runs into compact status step and tool parts');
}

{
  const previous = [
    { id: 'agent-status:run-1', type: 'agent_status', runId: 'run-1', status: 'running', metadata: { attempt: 1 } },
    { id: 'agent-step:run-1:step-1', type: 'agent_step', runId: 'run-1', stepId: 'step-1', status: 'running' },
  ];
  const next = [
    { id: 'agent-status:run-1', type: 'agent_status', runId: 'run-1', status: 'succeeded', metadata: { finished: true } },
    { id: 'agent-step:run-1:step-2', type: 'agent_step', runId: 'run-1', stepId: 'step-2', status: 'succeeded' },
  ];
  const merged = mergeAgentMessageParts(previous, next);
  assert.deepEqual(merged.map(part => part.id), [
    'agent-status:run-1',
    'agent-step:run-1:step-1',
    'agent-step:run-1:step-2',
  ]);
  assert.equal(merged[0].status, 'succeeded');
  assert.deepEqual(merged[0].metadata, { attempt: 1, finished: true });
  console.log('ok - mergeAgentMessageParts patches existing parts and appends new ones');
}
