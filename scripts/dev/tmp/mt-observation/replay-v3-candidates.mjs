import { readFileSync } from 'node:fs';

import { createAgentToolRegistry } from '../../../../src/scripts/agent/agent-tool-registry.js';
import { listAppFeatures } from '../../../../src/scripts/agent/app-feature-catalog.js';
import { createMaidCapabilityRoutingRuntime } from '../../../../src/scripts/agent/maid-capability-routing.js';

const features = listAppFeatures();
const registry = createAgentToolRegistry({
  permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
  logger: { warn() {} },
});
for (const name of new Set(features.flatMap(feature => feature.tools || []))) {
  registry.register({
    name,
    schema: { type: 'object' },
    execute: async () => ({ ok: true }),
  });
}
const runtime = createMaidCapabilityRoutingRuntime({
  features,
  toolRegistry: registry,
  permissionEvaluator: { evaluateTool: () => ({ decision: 'allow', checks: [] }) },
  logger: { debug() {} },
});

const tasks = [];
for (const batch of ['obs-01', 'obs-02', 'obs-03', 'obs-04', 'obs-05']) {
  const path = new URL(`./results-${batch}.jsonl`, import.meta.url);
  const rows = readFileSync(path, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => JSON.parse(line))
    .filter(row => row.recordType === 'task_result');
  tasks.push(...rows);
}

const misses = [];
tasks.forEach((task, index) => {
  const historyText = tasks
    .slice(Math.max(0, index - 3), index)
    .map(row => row.prompt)
    .join('\n');
  for (const snapshot of task.snapshots || []) {
    if (!snapshot.validSelection || snapshot.policyExcluded || snapshot.candidateHit) continue;
    if (snapshot.phase !== 'planner') continue;
    if (!snapshot.selectedCapabilityId) continue;
    if (snapshot.selectedCapabilityId === 'maid.todo' && task.taskId !== 'obs-04-020') continue;
    const request = runtime.beginRequest({ input: task.prompt });
    const replay = runtime.prepareDecision({
      requestId: request.id,
      input: task.prompt,
      context: { maidConversationContext: { historyText } },
      phase: snapshot.phase || 'planner',
    });
    runtime.finishRequest(request.id, { ok: true });
    const candidates = Array.from(replay.candidateIds);
    misses.push({
      taskId: task.taskId,
      selectedCapabilityId: snapshot.selectedCapabilityId,
      recovered: candidates.includes(snapshot.selectedCapabilityId),
      candidates,
    });
  }
});

const unrecovered = misses.filter(item => !item.recovered);
console.log(JSON.stringify({
  eligibleOldMisses: misses.length,
  recovered: misses.length - unrecovered.length,
  unrecovered,
}, null, 2));
