import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const readArg = (name, fallback = '') => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] ?? fallback) : fallback;
};

const outputPath = resolve(readArg('--output'));
const taskId = readArg('--task');
const runId = readArg('--run');
const startedAt = Number(readArg('--started-at', '0'));
const finishedAt = Number(readArg('--finished-at', String(Date.now())));

if (!outputPath || !taskId || !runId || !startedAt) {
  console.error('usage: capture-recovery.mjs --output FILE --task ID --run ID --started-at MS [--finished-at MS]');
  process.exit(2);
}

const expression = `(() => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const runStore = stores.agentRunStore;
  const retrievalStore = stores.capabilityRetrievalStore;
  const runId = ${JSON.stringify(runId)};
  const startedAt = ${startedAt};
  const finishedAt = ${finishedAt};
  const run = runStore?.getRun?.(runId)
    || (runStore?.listRuns?.({ limit: 500 }) || []).find(item => item.id === runId)
    || null;
  const snapshots = (retrievalStore?.listSnapshots?.({ limit: 500 }) || [])
    .filter(item => Number(item.createdAt || 0) >= startedAt - 1000)
    .filter(item => Number(item.createdAt || 0) <= finishedAt + 1000)
    .map(item => ({
      id: item.id,
      phase: item.phase,
      mode: item.mode,
      effectiveMode: item.effectiveMode,
      createdAt: item.createdAt,
      selectedCapabilityId: item.selectedCapabilityId,
      selectedToolName: item.selectedToolName,
      selectedRank: item.selectedRank,
      candidateHit: item.candidateHit,
      validSelection: item.validSelection,
      policyExcluded: item.policyExcluded,
      candidateCount: item.candidateCount,
      cohort: item.cohort || {},
    }));
  return {
    run: run ? {
      id: run.id,
      kind: run.kind,
      status: run.status,
      summary: run.summary,
      errorMessage: run.errorMessage,
      createdAt: run.createdAt,
      finishedAt: run.finishedAt,
      usage: run.usage || null,
      steps: (run.steps || []).map(step => ({
        id: step.id,
        toolName: step.toolName || '',
        featureId: step.featureId || '',
        status: step.status || '',
        failureCode: step.failureCode || '',
        summary: String(step.summary || '').slice(0, 800),
      })),
    } : null,
    snapshots,
  };
})()`;

const recovered = await evaluateInApp(expression, { timeoutMs: 30000 });
const record = {
  recordType: 'task_recovery',
  schemaVersion: 1,
  taskId,
  at: Date.now(),
  originalResult: 'harness_timeout',
  intervention: {
    kind: 'guide_skip',
    button: '跳过引导',
    reason: 'first-run guide awaited user interaction',
  },
  recovered,
};
appendFileSync(outputPath, `${JSON.stringify(record)}\n`, 'utf8');
console.log(JSON.stringify(record, null, 2));

