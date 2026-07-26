import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  evaluateMemoryReplay,
  normalizeMemoryReplayDataset,
} from '../evaluate-memory-replay.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(here, 'fixtures', 'memory-replay-sample.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));

const normalized = normalizeMemoryReplayDataset(fixture);
assert.equal(normalized.messages.length, 6);
assert.equal(normalized.rows.length, 2);
assert.equal(normalized.cases.length, 2);

const report = evaluateMemoryReplay(fixture);
assert.equal(report.metrics.coverage.rate, 1);
assert.equal(report.metrics.coverage.pass, true);
assert.equal(report.metrics.recall.expectedRows, 1);
assert.equal(report.metrics.recall.hitRows, 1);
assert.equal(report.metrics.recall.hitRate, 1);
assert.equal(report.metrics.consistency.assistantReferences, 2);
assert.equal(report.metrics.consistency.conflicts, 1);
assert.equal(report.metrics.consistency.conflictRate, 0.5);
assert.deepEqual(report.cases[0].recall.selectedRowIds, ['event-ledger']);
assert.deepEqual(report.cases[1].consistency.conflictRowIds, ['event-ledger']);

const holeReport = evaluateMemoryReplay({
  ...fixture,
  memoryRows: fixture.memoryRows.filter(row => row.table_id !== 'chat_summary'),
});
assert.equal(holeReport.metrics.coverage.pass, false);
assert.equal(holeReport.metrics.coverage.rate, 0);

console.log('ok - offline replay evaluator reports coverage, recall hits, and continuity conflicts');
