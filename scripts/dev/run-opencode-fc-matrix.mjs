// Staged OpenCode Go FC certification runner for a running Windows dev APP.
// Catalog inspection is always zero-inference. Paid stages require --execute,
// an explicit model selection (or --all), a report path, and a hard call cap.

import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateInApp } from './cdp-client.mjs';
import {
  OPENCODE_FC_MATRIX_FIXTURE_VERSION,
  beginOpenCodeMatrixStep,
  buildOpenCodeBundledCandidateProposal,
  buildOpenCodeMatrixSteps,
  completeOpenCodeMatrixStep,
  createOpenCodeMatrixModelRecord,
  getOpenCodeMatrixProgress,
  selectOpenCodeMatrixModels,
  sumOpenCodeMatrixPaidCallUpperBound,
} from './opencode-fc-matrix-utils.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_FILES = Object.freeze({
  catalog: 'opencode-fc-matrix-catalog.js',
  transport: 'opencode-k5-candidate-smoke.js',
  surface: 'opencode-k5-candidate-cohort.js',
  boundary: 'opencode-k5-candidate-boundary-smoke.js',
  real_session: 'provider-h4-real-session-gray.js',
});

const usage = () => {
  console.log([
    'Usage:',
    '  node scripts/dev/run-opencode-fc-matrix.mjs [options]',
    '',
    'Zero-inference planning (default):',
    '  --models a,b       Select exact model ids; omitted means all unbundled models',
    '  --all              Explicitly select all unbundled models',
    '  --through <stage>  transport | surface6 | release30 | release (default)',
    '  --include-bundled  Include already released models',
    '',
    'Paid execution (all required):',
    '  --execute',
    '  --models a,b | --all',
    '  --max-paid-calls N Hard cap for this invocation',
    '  --report <path>    Atomic checkpoint/report file; existing file resumes',
    '',
    'Explicit recovery:',
    '  --retry-failed     Retry a previously failed stage',
    '  --retry-uncertain  Retry a stage interrupted after its budget was reserved',
    '  --timeout-ms N     Per-stage CDP timeout (default 180000)',
  ].join('\n'));
};

const parseValue = (args, index, inlineValue) => {
  if (inlineValue !== undefined) return { value: inlineValue, nextIndex: index };
  if (index + 1 >= args.length) throw new Error(`Missing value for ${args[index]}`);
  return { value: args[index + 1], nextIndex: index + 1 };
};

const parseArgs = (args = []) => {
  const options = {
    execute: false,
    all: false,
    models: [],
    through: 'release',
    includeBundled: false,
    maxPaidCalls: 0,
    reportPath: '',
    retryFailed: false,
    retryUncertain: false,
    timeoutMs: 180000,
    help: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const raw = String(args[index] || '');
    const [name, inlineValue] = raw.split(/=(.*)/su, 2);
    if (name === '--help' || name === '-h') options.help = true;
    else if (name === '--execute') options.execute = true;
    else if (name === '--all') options.all = true;
    else if (name === '--include-bundled') options.includeBundled = true;
    else if (name === '--retry-failed') options.retryFailed = true;
    else if (name === '--retry-uncertain') options.retryUncertain = true;
    else if (name === '--models') {
      const parsed = parseValue(args, index, inlineValue);
      index = parsed.nextIndex;
      options.models.push(...String(parsed.value || '').split(','));
    } else if (name === '--through') {
      const parsed = parseValue(args, index, inlineValue);
      index = parsed.nextIndex;
      options.through = String(parsed.value || '').trim().toLowerCase();
    } else if (name === '--max-paid-calls') {
      const parsed = parseValue(args, index, inlineValue);
      index = parsed.nextIndex;
      options.maxPaidCalls = Math.trunc(Number(parsed.value));
    } else if (name === '--report') {
      const parsed = parseValue(args, index, inlineValue);
      index = parsed.nextIndex;
      options.reportPath = path.resolve(String(parsed.value || ''));
    } else if (name === '--timeout-ms') {
      const parsed = parseValue(args, index, inlineValue);
      index = parsed.nextIndex;
      options.timeoutMs = Math.trunc(Number(parsed.value));
    } else {
      throw new Error(`Unknown option: ${raw}`);
    }
  }
  options.models = [...new Set(options.models.map(value => String(value).trim().toLowerCase()).filter(Boolean))];
  buildOpenCodeMatrixSteps(options.through);
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 5000) {
    throw new Error('--timeout-ms must be at least 5000');
  }
  if (options.execute) {
    if (!options.all && !options.models.length) {
      throw new Error('Paid execution requires --models or an explicit --all');
    }
    if (!Number.isInteger(options.maxPaidCalls) || options.maxPaidCalls <= 0) {
      throw new Error('Paid execution requires a positive --max-paid-calls hard cap');
    }
    if (!options.reportPath) throw new Error('Paid execution requires --report for atomic checkpoints');
  }
  return options;
};

const loadSources = async () => Object.fromEntries(await Promise.all(
  Object.entries(SOURCE_FILES).map(async ([key, file]) => [
    key,
    (await readFile(path.join(SCRIPT_DIR, file), 'utf8')).replace(/^﻿/u, ''),
  ]),
));

const isoNow = () => new Date().toISOString();

const writeReportAtomic = async (reportPath, report) => {
  if (!reportPath) return;
  await mkdir(path.dirname(reportPath), { recursive: true });
  const temporaryPath = `${reportPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, reportPath);
};

const loadExistingReport = async (reportPath) => {
  if (!reportPath || !existsSync(reportPath)) return null;
  const parsed = JSON.parse(await readFile(reportPath, 'utf8'));
  if (
    parsed?.schemaVersion !== 1
    || parsed?.fixtureVersion !== OPENCODE_FC_MATRIX_FIXTURE_VERSION
    || parsed?.provider !== 'opencode'
  ) throw new Error('Existing report is not an OpenCode FC matrix v1 checkpoint');
  return parsed;
};

const fingerprintCatalog = models => `sha256:${createHash('sha256')
  .update(JSON.stringify(Array.isArray(models) ? models : []))
  .digest('hex')}`;

const summarizeReport = (report, through) => {
  const rows = Object.values(report.models || {});
  const progress = rows.map(record => getOpenCodeMatrixProgress(record, through));
  const sumStepCalls = step => Math.max(0, Number(step?.paidCallsMade) || 0)
    + (Array.isArray(step?.attempts) ? step.attempts : [])
      .reduce((sum, attempt) => sum + Math.max(0, Number(attempt?.paidCallsMade) || 0), 0);
  const sumUncertainReservations = step => [
    step,
    ...(Array.isArray(step?.attempts) ? step.attempts : []),
  ].reduce((sum, attempt) => (
    attempt?.status === 'running'
      ? sum + Math.max(0, Number(attempt?.paidCallUpperBound) || 0)
      : sum
  ), 0);
  return {
    selectedModels: report.selectedModels.length,
    completeModels: progress.filter(item => item.complete).length,
    proposalReadyModels: progress.filter(item => item.readyForProposal).length,
    failedModels: progress.filter(item => item.blockedReason === 'step_failed').length,
    uncertainModels: progress.filter(item => item.blockedReason === 'step_outcome_uncertain').length,
    actualPaidCalls: rows.reduce((total, record) => total + Object.values(record.steps || {})
      .reduce((sum, step) => sum + sumStepCalls(step), 0), 0),
    uncertainReservedPaidCallUpperBound: rows.reduce(
      (total, record) => total + Object.values(record.steps || {})
        .reduce((sum, step) => sum + sumUncertainReservations(step), 0),
      0,
    ),
    candidateProposalCount: report.candidateProposals.length,
  };
};

const setPageGlobals = async ({ model, catalogModels, repetition = 0, timeoutMs }) => {
  const expression = `(() => {
    window.__opencodeK5CandidateModel = ${JSON.stringify(model)};
    window.__opencodeK5MatrixCatalogModels = ${JSON.stringify(catalogModels)};
    window.__opencodeK5CohortStartRepetition = ${Math.max(0, Number(repetition) - 1)};
    window.__opencodeK5CohortRepetitions = 1;
    window.__stageH4ProviderFilter = 'opencode';
    window.__stageH4OpenCodeModelOverride = ${JSON.stringify(model)};
    return true;
  })()`;
  await evaluateInApp(expression, { timeoutMs });
};

const executeStep = async ({ step, model, catalogModels, sources, timeoutMs }) => {
  await setPageGlobals({
    model,
    catalogModels,
    repetition: step.repetition || 0,
    timeoutMs,
  });
  const sourceKey = step.kind === 'surface_round' ? 'surface' : step.kind;
  return evaluateInApp(sources[sourceKey], { timeoutMs });
};

const findNextStep = (record, steps, options) => {
  for (const step of steps) {
    const status = record?.steps?.[step.id]?.status;
    if (status === 'passed') continue;
    if (status === 'failed' && !options.retryFailed) {
      return { step: null, blockedReason: 'step_failed', blockedStepId: step.id };
    }
    if (status === 'running' && !options.retryUncertain) {
      return { step: null, blockedReason: 'step_outcome_uncertain', blockedStepId: step.id };
    }
    return { step, blockedReason: '', blockedStepId: '' };
  }
  return { step: null, blockedReason: '', blockedStepId: '' };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  const sources = await loadSources();
  const catalog = await evaluateInApp(sources.catalog, { timeoutMs: Math.min(options.timeoutMs, 60000) });
  if (catalog?.inferenceCallsMade !== 0 || catalog?.credentialsRetained !== false) {
    throw new Error('OpenCode catalog snapshot violated its zero-inference contract');
  }
  const catalogFingerprint = fingerprintCatalog(catalog.catalogModels);
  const selection = selectOpenCodeMatrixModels({
    catalogModels: catalog.catalogModels,
    bundledModels: catalog.bundledModels,
    requestedModels: options.models,
    includeBundled: options.includeBundled,
  });
  if (!selection.selected.length) {
    console.log(JSON.stringify({
      mode: options.execute ? 'execute' : 'plan',
      through: options.through,
      catalogModelCount: catalog.catalogModelCount,
      compatibleModelCount: catalog.compatibleModelCount,
      bundledModels: catalog.bundledModels,
      selectedModels: [],
      rejectedModels: selection.rejected,
      inferenceCallsMade: 0,
    }, null, 2));
    return;
  }

  const steps = buildOpenCodeMatrixSteps(options.through);
  const perModelUpperBound = sumOpenCodeMatrixPaidCallUpperBound(steps);
  if (!options.execute) {
    console.log(JSON.stringify({
      mode: 'plan',
      through: options.through,
      catalogModelCount: catalog.catalogModelCount,
      compatibleModelCount: catalog.compatibleModelCount,
      bundledRevision: catalog.bundledRevision,
      catalogFingerprint,
      bundledModels: catalog.bundledModels,
      selectedModels: selection.selected,
      rejectedModels: selection.rejected,
      paidCallUpperBoundPerModel: perModelUpperBound,
      paidCallUpperBoundTotal: perModelUpperBound * selection.selected.length,
      inferenceCallsMade: 0,
      nextCommandRequires: ['--execute', '--models or --all', '--max-paid-calls', '--report'],
    }, null, 2));
    return;
  }

  const existing = await loadExistingReport(options.reportPath);
  if (existing?.catalog?.fingerprint && existing.catalog.fingerprint !== catalogFingerprint) {
    throw new Error('OpenCode catalog changed since this checkpoint; start a new report for fresh evidence');
  }
  const now = isoNow();
  const report = existing || {
    schemaVersion: 1,
    fixtureVersion: OPENCODE_FC_MATRIX_FIXTURE_VERSION,
    provider: 'opencode',
    createdAt: now,
    updatedAt: now,
    catalog: {
      fingerprint: catalogFingerprint,
      capturedAt: now,
      modelCount: catalog.catalogModelCount,
      compatibleModelCount: catalog.compatibleModelCount,
      bundledRevision: catalog.bundledRevision,
      bundledModels: catalog.bundledModels,
    },
    selectedModels: [],
    rejectedModels: [],
    models: {},
    candidateProposals: [],
    runs: [],
    summary: {},
  };
  report.updatedAt = now;
  report.selectedModels = [...new Set([...report.selectedModels, ...selection.selected])].sort();
  report.rejectedModels = selection.rejected;
  report.runs.push({
    startedAt: now,
    through: options.through,
    selectedModels: selection.selected,
    maxPaidCalls: options.maxPaidCalls,
    reservedPaidCalls: 0,
    actualPaidCalls: 0,
    status: 'running',
  });
  const run = report.runs.at(-1);
  await writeReportAtomic(options.reportPath, report);

  let stopForBudget = false;
  for (const model of selection.selected) {
    if (!report.models[model]) {
      report.models[model] = createOpenCodeMatrixModelRecord(model, { now: isoNow() });
    }
    while (true) {
      const record = report.models[model];
      const next = findNextStep(record, steps, options);
      if (!next.step) {
        if (next.blockedReason) {
          console.warn(`[opencode-fc-matrix] ${model}: ${next.blockedReason} (${next.blockedStepId})`);
        }
        break;
      }
      if (run.reservedPaidCalls + next.step.paidCallUpperBound > options.maxPaidCalls) {
        stopForBudget = true;
        break;
      }

      run.reservedPaidCalls += next.step.paidCallUpperBound;
      report.models[model] = beginOpenCodeMatrixStep(record, next.step, {
        startedAt: isoNow(),
        retryFailed: options.retryFailed,
        retryUncertain: options.retryUncertain,
      });
      delete report.models[model].runnerError;
      report.updatedAt = isoNow();
      await writeReportAtomic(options.reportPath, report);
      console.log(
        `[opencode-fc-matrix] ${model}: ${next.step.id} `
        + `(reserve ${next.step.paidCallUpperBound}, run ${run.reservedPaidCalls}/${options.maxPaidCalls})`,
      );

      let result;
      try {
        result = await executeStep({
          step: next.step,
          model,
          catalogModels: catalog.catalogModels,
          sources,
          timeoutMs: options.timeoutMs,
        });
      } catch (error) {
        report.models[model].runnerError = {
          stepId: next.step.id,
          code: String(error?.message || error).includes('timed out') ? 'cdp_timeout' : 'runner_failed',
        };
        report.updatedAt = isoNow();
        run.status = 'uncertain';
        run.finishedAt = isoNow();
        report.summary = summarizeReport(report, options.through);
        await writeReportAtomic(options.reportPath, report);
        throw error;
      }

      report.models[model] = completeOpenCodeMatrixStep(
        report.models[model],
        next.step,
        result,
        { finishedAt: isoNow() },
      );
      run.actualPaidCalls += Math.max(
        0,
        Number(report.models[model].steps[next.step.id].paidCallsMade) || 0,
      );
      report.updatedAt = isoNow();
      report.summary = summarizeReport(report, options.through);
      await writeReportAtomic(options.reportPath, report);
      if (report.models[model].steps[next.step.id].status !== 'passed') break;
    }
    if (stopForBudget) break;
  }

  report.candidateProposals = Object.values(report.models)
    .map(record => buildOpenCodeBundledCandidateProposal(record, {
      verifiedAt: new Date().toISOString().slice(0, 10),
      catalogFingerprint,
    }))
    .filter(Boolean);
  report.updatedAt = isoNow();
  run.finishedAt = isoNow();
  run.status = stopForBudget ? 'budget_exhausted' : 'complete';
  report.summary = summarizeReport(report, options.through);
  await writeReportAtomic(options.reportPath, report);

  console.log(JSON.stringify({
    mode: 'execute',
    through: options.through,
    reportPath: options.reportPath,
    run,
    summary: report.summary,
    selectedModels: selection.selected,
    rejectedModels: selection.rejected,
    candidateProposals: report.candidateProposals,
  }, null, 2));
};

main().catch((error) => {
  console.error(error?.message || String(error));
  process.exitCode = 1;
});
