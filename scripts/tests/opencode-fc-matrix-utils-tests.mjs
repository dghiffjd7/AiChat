import assert from 'node:assert/strict';

import {
  beginOpenCodeMatrixStep,
  buildOpenCodeBundledCandidateProposal,
  buildOpenCodeMatrixSteps,
  completeOpenCodeMatrixStep,
  createOpenCodeMatrixModelRecord,
  getOpenCodeMatrixProgress,
  selectOpenCodeMatrixModels,
  sumOpenCodeMatrixPaidCallUpperBound,
} from '../dev/opencode-fc-matrix-utils.mjs';

const transportPass = () => ({
  ok: true,
  paidCallsMade: 2,
  passed: 2,
  total: 2,
  persistentWrites: 0,
  rawTextRetained: false,
  toolArgumentsRetained: false,
});

const surfaceRoundPass = () => ({
  ok: true,
  modelCallsMade: 3,
  persistentWrites: 0,
  rawTextRetained: false,
  toolArgumentsRetained: false,
  overall: {
    total: 3,
    attempted: 3,
    strictSemanticPassed: 3,
    wouldFallback: 0,
  },
});

const boundaryPass = () => ({
  ok: true,
  realCallsMade: 1,
  persistentWrites: 0,
  rawTextRetained: false,
  toolArgumentsRetained: false,
  cancellation: { pass: true, fallbackCalls: 0 },
  preCommitFallback: { pass: true, fallbackCalls: 1 },
  postCommitGuard: { pass: true, fallbackCalls: 0 },
});

const realSessionPass = () => ({
  pass: true,
  providerRequests: 1,
  structuredRequests: 1,
  fallbackRequests: 0,
  session: {
    pass: true,
    exactOneProviderRequest: true,
    noFallback: true,
    exactOneToolCall: true,
  },
  cleanup: { pass: true },
  rawContentRetained: false,
  argumentContentRetained: false,
});

{
  const transport = buildOpenCodeMatrixSteps('transport');
  const surface6 = buildOpenCodeMatrixSteps('surface6');
  const release30 = buildOpenCodeMatrixSteps('release30');
  const release = buildOpenCodeMatrixSteps('release');

  assert.deepEqual(transport.map(step => step.id), ['transport']);
  assert.deepEqual(surface6.map(step => step.id), [
    'transport',
    'surface_round_01',
    'surface_round_02',
  ]);
  assert.equal(release30.filter(step => step.kind === 'surface_round').length, 10);
  assert.deepEqual(release.slice(-2).map(step => step.id), ['boundary', 'real_session']);
  assert.equal(sumOpenCodeMatrixPaidCallUpperBound(transport), 2);
  assert.equal(sumOpenCodeMatrixPaidCallUpperBound(surface6), 8);
  assert.equal(sumOpenCodeMatrixPaidCallUpperBound(release30), 32);
  assert.equal(sumOpenCodeMatrixPaidCallUpperBound(release), 35);
  assert.equal(release.at(-1).paidCallUpperBound, 2);
  console.log('ok - OpenCode matrix stages reserve the real-session fallback request');
}

{
  const selection = selectOpenCodeMatrixModels({
    catalogModels: [
      'glm-5.2',
      'deepseek-v4-flash',
      'deepseek-v4-pro',
      'gpt-5.6-sol',
      'deepseek-v4-flash',
    ],
    bundledModels: ['glm-5.2'],
    requestedModels: ['deepseek-v4-pro', 'glm-5.2', 'missing-model', 'gpt-5.6-sol'],
  });
  assert.deepEqual(selection.selected, ['deepseek-v4-pro']);
  assert.deepEqual(selection.rejected, [
    { model: 'glm-5.2', reason: 'already_bundled' },
    { model: 'missing-model', reason: 'catalog_model_missing' },
    { model: 'gpt-5.6-sol', reason: 'not_chat_completions_model' },
  ]);

  const all = selectOpenCodeMatrixModels({
    catalogModels: ['deepseek-v4-pro', 'glm-5.2', 'deepseek-v4-flash'],
    bundledModels: ['glm-5.2'],
  });
  assert.deepEqual(all.selected, ['deepseek-v4-flash', 'deepseek-v4-pro']);
  console.log('ok - OpenCode matrix selects exact catalog models and skips bundled or wrong-protocol ids');
}

{
  const releaseSteps = buildOpenCodeMatrixSteps('release');
  let record = createOpenCodeMatrixModelRecord('deepseek-v4-flash');
  const results = new Map([
    ['transport', transportPass()],
    ['boundary', boundaryPass()],
    ['real_session', realSessionPass()],
  ]);
  for (const step of releaseSteps) {
    record = beginOpenCodeMatrixStep(record, step, { startedAt: '2026-08-15T00:00:00.000Z' });
    record = completeOpenCodeMatrixStep(
      record,
      step,
      results.get(step.id) || surfaceRoundPass(),
      { finishedAt: '2026-08-15T00:00:01.000Z' },
    );
  }
  const progress = getOpenCodeMatrixProgress(record, 'release');
  assert.equal(progress.complete, true);
  assert.equal(progress.readyForProposal, true);
  assert.equal(progress.surfaceRoundsPassed, 10);
  assert.equal(progress.strictSurfaceSamplesPassed, 30);
  assert.equal(progress.remainingPaidCallUpperBound, 0);

  assert.deepEqual(buildOpenCodeBundledCandidateProposal(record, {
    verifiedAt: '2026-08-15',
    catalogFingerprint: 'sha256:test-catalog',
  }), {
    ruleId: 'bundled.opencode.chat-completions.deepseek-v4-flash',
    providerId: 'opencode',
    endpointClass: 'official_opencode_go_chat_completions',
    transportAdapter: 'openai_chat_completions',
    modelId: 'deepseek-v4-flash',
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.ir.v1'],
    verifiedAt: '2026-08-15',
    evidence: {
      fixtureVersion: 'opencode-fc-matrix-v1',
      catalogFingerprint: 'sha256:test-catalog',
      transportPassed: 2,
      strictSurfaceSamplesPassed: 30,
      cancellationPassed: true,
      fallbackBoundaryPassed: true,
      realSessionPassed: true,
    },
  });
  console.log('ok - only a complete release gate produces an exact bundled candidate proposal');
}

{
  const steps = buildOpenCodeMatrixSteps('release');
  let record = createOpenCodeMatrixModelRecord('deepseek-v4-pro');
  record = beginOpenCodeMatrixStep(record, steps[0], { startedAt: '2026-08-15T00:00:00.000Z' });
  record = completeOpenCodeMatrixStep(record, steps[0], transportPass());
  record = beginOpenCodeMatrixStep(record, steps[1]);
  record = completeOpenCodeMatrixStep(record, steps[1], {
    ...surfaceRoundPass(),
    ok: false,
    modelCallsMade: 1,
    overall: {
      total: 1,
      attempted: 1,
      strictSemanticPassed: 0,
      wouldFallback: 1,
    },
  });
  const progress = getOpenCodeMatrixProgress(record, 'release');
  assert.equal(progress.complete, false);
  assert.equal(progress.blockedReason, 'step_failed');
  assert.equal(progress.failedStepId, 'surface_round_01');
  assert.equal(buildOpenCodeBundledCandidateProposal(record), null);
  console.log('ok - a failed semantic stage stops promotion without fabricating passed samples');
}

{
  const step = buildOpenCodeMatrixSteps('transport')[0];
  const running = beginOpenCodeMatrixStep(
    createOpenCodeMatrixModelRecord('deepseek-v4-flash'),
    step,
  );
  const progress = getOpenCodeMatrixProgress(running, 'release');
  assert.equal(progress.blockedReason, 'step_outcome_uncertain');
  assert.equal(progress.uncertainStepId, 'transport');
  assert.equal(progress.remainingPaidCallUpperBound, 35);
  console.log('ok - interrupted paid stages remain uncertain and are never silently replayed');
}

{
  const step = buildOpenCodeMatrixSteps('transport')[0];
  let record = beginOpenCodeMatrixStep(createOpenCodeMatrixModelRecord('deepseek-v4-pro'), step);
  record = completeOpenCodeMatrixStep(record, step, {
    ...transportPass(),
    ok: false,
    paidCallsMade: 1,
    passed: 0,
    total: 1,
  });
  record = beginOpenCodeMatrixStep(record, step, { retryFailed: true });
  record = completeOpenCodeMatrixStep(record, step, transportPass());
  assert.equal(record.steps.transport.status, 'passed');
  assert.equal(record.steps.transport.attempts.length, 1);
  assert.equal(record.steps.transport.attempts[0].status, 'failed');
  assert.equal(record.steps.transport.attempts[0].paidCallsMade, 1);
  console.log('ok - explicit retries preserve prior paid attempts for audit and budget accounting');
}

console.log('opencode-fc-matrix-utils-tests passed');
