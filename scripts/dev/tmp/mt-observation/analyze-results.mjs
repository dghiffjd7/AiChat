import { readFileSync } from 'node:fs';
import { basename } from 'node:path';

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: analyze-results.mjs RESULTS.jsonl [...]');
  process.exit(2);
}

const parseFile = (file) => readFileSync(file, 'utf8')
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`${file}:${index + 1}: ${error.message}`);
    }
  });

const reports = files.map(file => {
  const records = parseFile(file);
  const taskResults = records.filter(record => record.recordType === 'task_result');
  const recoveries = records.filter(record => record.recordType === 'task_recovery');
  const latest = new Map();
  for (const record of taskResults) latest.set(record.taskId, record);
  const tasks = [...latest.values()];
  const statuses = {};
  let validSelections = 0;
  let hits = 0;
  const misses = [];
  const coverageMismatches = [];
  const repeatedToolChains = [];
  const interventions = [];

  for (const task of tasks) {
    const status = task.timeout
      ? 'harness_timeout'
      : task.harnessError
        ? 'harness_error'
        : task.result?.status || 'unknown';
    statuses[status] = (statuses[status] || 0) + 1;
    for (const snapshot of task.snapshots || []) {
      if (!snapshot.validSelection || snapshot.policyExcluded) continue;
      validSelections += 1;
      if (snapshot.candidateHit) hits += 1;
      else misses.push({
        taskId: task.taskId,
        feature: snapshot.selectedCapabilityId,
        tool: snapshot.selectedToolName,
        selectedRank: snapshot.selectedRank,
      });
    }
    if (
      task.observed &&
      (!task.observed.expectedFeatureCoverage || !task.observed.expectedToolCoverage)
    ) {
      coverageMismatches.push({
        taskId: task.taskId,
        expectedFeatures: task.expectedFeatures || [],
        expectedTools: task.expectedTools || [],
        expectedAnyTools: task.expectedAnyTools || [],
        selectedFeatures: task.observed.selectedFeatures || [],
        selectedTools: task.observed.selectedTools || [],
      });
    }
    const tools = task.observed?.selectedTools || [];
    const repeated = tools.filter((tool, index) => index > 0 && tool === tools[index - 1]);
    if (repeated.length) repeatedToolChains.push({ taskId: task.taskId, tools });
    for (const event of task.permissionEvents || []) {
      interventions.push({ taskId: task.taskId, ...event });
    }
  }

  return {
    file: basename(file),
    taskCount: tasks.length,
    statuses,
    validSelections,
    hits,
    misses,
    hitRate: validSelections ? Number((hits / validSelections).toFixed(4)) : null,
    coverageMismatches,
    repeatedToolChains,
    interventions,
    recoveries,
  };
});

console.log(JSON.stringify(reports, null, 2));

