import { isOpenCodeGoChatCompletionsModel } from '../../src/scripts/api/providers/opencode.js';

export const OPENCODE_FC_MATRIX_FIXTURE_VERSION = 'opencode-fc-matrix-v1';

const THROUGH_ORDER = Object.freeze({
  transport: 0,
  surface6: 1,
  release30: 2,
  release: 3,
});

const trimLower = value => String(value ?? '').trim().toLowerCase();

const clone = (value, fallback = null) => {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return fallback;
  }
};

const normalizeModelList = (values = []) => {
  const seen = new Set();
  const out = [];
  for (const value of Array.isArray(values) ? values : []) {
    const model = trimLower(value);
    if (!model || model.length > 120 || seen.has(model)) continue;
    seen.add(model);
    out.push(model);
  }
  return out;
};

const getStepPaidCallsMade = (step, result = {}) => {
  if (step.kind === 'transport') return Number(result?.paidCallsMade || 0);
  if (step.kind === 'surface_round') return Number(result?.modelCallsMade || 0);
  if (step.kind === 'boundary') return Number(result?.realCallsMade || 0);
  if (step.kind === 'real_session') return Number(result?.providerRequests || 0);
  return 0;
};

const retainsNoSensitiveContent = result => (
  result?.rawTextRetained !== true
  && result?.toolArgumentsRetained !== true
  && result?.rawContentRetained !== true
  && result?.argumentContentRetained !== true
);

const isStepResultPassed = (step, result = {}) => {
  if (!step || !result || typeof result !== 'object' || !retainsNoSensitiveContent(result)) {
    return false;
  }
  if (step.kind === 'transport') {
    return result.ok === true
      && result.catalogExactMatch !== false
      && Number(result.paidCallsMade) === 2
      && Number(result.passed) === 2
      && Number(result.total) === 2
      && Number(result.persistentWrites) === 0;
  }
  if (step.kind === 'surface_round') {
    return result.ok === true
      && result.catalogExactMatch !== false
      && Number(result.modelCallsMade) === 3
      && Number(result.persistentWrites) === 0
      && Number(result?.overall?.total) === 3
      && Number(result?.overall?.attempted) === 3
      && Number(result?.overall?.strictSemanticPassed) === 3
      && Number(result?.overall?.wouldFallback) === 0;
  }
  if (step.kind === 'boundary') {
    return result.ok === true
      && Number(result.realCallsMade) === 1
      && Number(result.persistentWrites) === 0
      && result?.cancellation?.pass === true
      && Number(result?.cancellation?.fallbackCalls) === 0
      && result?.preCommitFallback?.pass === true
      && Number(result?.preCommitFallback?.fallbackCalls) === 1
      && result?.postCommitGuard?.pass === true
      && Number(result?.postCommitGuard?.fallbackCalls) === 0;
  }
  if (step.kind === 'real_session') {
    return result.pass === true
      && Number(result.providerRequests) === 1
      && Number(result.structuredRequests) === 1
      && Number(result.fallbackRequests) === 0
      && result?.session?.pass === true
      && result?.session?.exactOneProviderRequest === true
      && result?.session?.noFallback === true
      && result?.session?.exactOneToolCall === true
      && result?.cleanup?.pass === true;
  }
  return false;
};

export const buildOpenCodeMatrixSteps = (through = 'release') => {
  const normalizedThrough = trimLower(through);
  if (!Object.hasOwn(THROUGH_ORDER, normalizedThrough)) {
    throw new Error(`Unsupported OpenCode matrix stage: ${normalizedThrough || '(empty)'}`);
  }
  const steps = [
    Object.freeze({ id: 'transport', kind: 'transport', paidCallUpperBound: 2 }),
  ];
  if (THROUGH_ORDER[normalizedThrough] >= THROUGH_ORDER.surface6) {
    const roundLimit = THROUGH_ORDER[normalizedThrough] >= THROUGH_ORDER.release30 ? 10 : 2;
    for (let repetition = 1; repetition <= roundLimit; repetition += 1) {
      steps.push(Object.freeze({
        id: `surface_round_${String(repetition).padStart(2, '0')}`,
        kind: 'surface_round',
        repetition,
        paidCallUpperBound: 3,
      }));
    }
  }
  if (THROUGH_ORDER[normalizedThrough] >= THROUGH_ORDER.release) {
    steps.push(
      Object.freeze({ id: 'boundary', kind: 'boundary', paidCallUpperBound: 1 }),
      // A failed structured request may legitimately issue one legacy fallback
      // request before the fixture can classify the real-session outcome.
      Object.freeze({ id: 'real_session', kind: 'real_session', paidCallUpperBound: 2 }),
    );
  }
  return steps;
};

export const sumOpenCodeMatrixPaidCallUpperBound = (steps = []) => (
  (Array.isArray(steps) ? steps : []).reduce(
    (sum, step) => sum + Math.max(0, Number(step?.paidCallUpperBound) || 0),
    0,
  )
);

export const selectOpenCodeMatrixModels = ({
  catalogModels = [],
  bundledModels = [],
  requestedModels = [],
  includeBundled = false,
} = {}) => {
  const catalog = normalizeModelList(catalogModels);
  const catalogSet = new Set(catalog);
  const bundledSet = new Set(normalizeModelList(bundledModels));
  const requested = normalizeModelList(requestedModels);
  const source = requested.length ? requested : catalog.slice().sort();
  const selected = [];
  const rejected = [];

  for (const model of source) {
    if (!catalogSet.has(model)) {
      rejected.push({ model, reason: 'catalog_model_missing' });
      continue;
    }
    if (!isOpenCodeGoChatCompletionsModel(model)) {
      rejected.push({ model, reason: 'not_chat_completions_model' });
      continue;
    }
    if (!includeBundled && bundledSet.has(model)) {
      rejected.push({ model, reason: 'already_bundled' });
      continue;
    }
    selected.push(model);
  }
  return { selected, rejected };
};

export const createOpenCodeMatrixModelRecord = (model, { now = '' } = {}) => {
  const normalizedModel = trimLower(model);
  if (!normalizedModel || !isOpenCodeGoChatCompletionsModel(normalizedModel)) {
    throw new Error('OpenCode matrix record requires one Chat Completions model id');
  }
  return {
    fixtureVersion: OPENCODE_FC_MATRIX_FIXTURE_VERSION,
    provider: 'opencode',
    model: normalizedModel,
    createdAt: String(now || ''),
    updatedAt: String(now || ''),
    steps: {},
  };
};

export const beginOpenCodeMatrixStep = (record, step, {
  startedAt = '',
  retryFailed = false,
  retryUncertain = false,
} = {}) => {
  const current = record?.steps?.[step?.id] || null;
  if (current?.status === 'passed') return clone(record, record);
  if (current?.status === 'failed' && !retryFailed) {
    throw new Error(`OpenCode matrix step already failed: ${step?.id || '(unknown)'}`);
  }
  if (current?.status === 'running' && !retryUncertain) {
    throw new Error(`OpenCode matrix step outcome is uncertain: ${step?.id || '(unknown)'}`);
  }
  const next = clone(record, null);
  if (!next || !step?.id) throw new Error('Invalid OpenCode matrix step state');
  const attempts = Array.isArray(current?.attempts) ? clone(current.attempts, []) : [];
  if (current) {
    const previousAttempt = { ...current };
    delete previousAttempt.attempts;
    attempts.push(previousAttempt);
  }
  next.updatedAt = String(startedAt || '');
  next.steps = {
    ...(next.steps || {}),
    [step.id]: {
      id: step.id,
      kind: step.kind,
      repetition: Number(step.repetition || 0) || null,
      paidCallUpperBound: Number(step.paidCallUpperBound || 0),
      status: 'running',
      startedAt: String(startedAt || ''),
      finishedAt: '',
      paidCallsMade: null,
      result: null,
      attempts,
    },
  };
  return next;
};

export const completeOpenCodeMatrixStep = (record, step, result, {
  finishedAt = '',
} = {}) => {
  const next = clone(record, null);
  const current = next?.steps?.[step?.id];
  if (!next || current?.status !== 'running') {
    throw new Error(`OpenCode matrix step was not started: ${step?.id || '(unknown)'}`);
  }
  const passed = isStepResultPassed(step, result);
  next.updatedAt = String(finishedAt || '');
  next.steps[step.id] = {
    ...current,
    status: passed ? 'passed' : 'failed',
    finishedAt: String(finishedAt || ''),
    paidCallsMade: getStepPaidCallsMade(step, result),
    result: clone(result, {}),
  };
  return next;
};

export const getOpenCodeMatrixProgress = (record, through = 'release') => {
  const steps = buildOpenCodeMatrixSteps(through);
  const stored = record?.steps && typeof record.steps === 'object' ? record.steps : {};
  let failedStepId = '';
  let uncertainStepId = '';
  for (const step of steps) {
    const status = stored[step.id]?.status;
    if (status === 'failed' && !failedStepId) failedStepId = step.id;
    if (status === 'running' && !uncertainStepId) uncertainStepId = step.id;
  }
  const passedSteps = steps.filter(step => stored[step.id]?.status === 'passed');
  const surfaceSteps = steps.filter(step => step.kind === 'surface_round');
  const passedSurfaceSteps = surfaceSteps.filter(step => stored[step.id]?.status === 'passed');
  const strictSurfaceSamplesPassed = passedSurfaceSteps.reduce(
    (sum, step) => sum + Number(stored[step.id]?.result?.overall?.strictSemanticPassed || 0),
    0,
  );
  const remainingSteps = steps.filter(step => stored[step.id]?.status !== 'passed');
  const complete = passedSteps.length === steps.length;
  return {
    complete,
    readyForProposal: through === 'release' && complete,
    blockedReason: uncertainStepId
      ? 'step_outcome_uncertain'
      : failedStepId
        ? 'step_failed'
        : '',
    failedStepId,
    uncertainStepId,
    passedStepCount: passedSteps.length,
    totalStepCount: steps.length,
    surfaceRoundsPassed: passedSurfaceSteps.length,
    strictSurfaceSamplesPassed,
    remainingPaidCallUpperBound: sumOpenCodeMatrixPaidCallUpperBound(remainingSteps),
    nextStep: !failedStepId && !uncertainStepId
      ? remainingSteps[0] || null
      : null,
  };
};

export const buildOpenCodeBundledCandidateProposal = (record, {
  verifiedAt = '',
  catalogFingerprint = '',
} = {}) => {
  const progress = getOpenCodeMatrixProgress(record, 'release');
  if (!progress.readyForProposal) return null;
  const model = trimLower(record?.model);
  const ruleSuffix = model.replace(/[^a-z0-9._-]+/gu, '-').replace(/^-+|-+$/gu, '');
  const normalizedDate = /^\d{4}-\d{2}-\d{2}$/u.test(String(verifiedAt || ''))
    ? String(verifiedAt)
    : new Date().toISOString().slice(0, 10);
  return {
    ruleId: `bundled.opencode.chat-completions.${ruleSuffix}`,
    providerId: 'opencode',
    endpointClass: 'official_opencode_go_chat_completions',
    transportAdapter: 'openai_chat_completions',
    modelId: model,
    toolResultContinuation: false,
    schemaProfiles: ['phone.reply.ir.v1'],
    verifiedAt: normalizedDate,
    evidence: {
      fixtureVersion: OPENCODE_FC_MATRIX_FIXTURE_VERSION,
      catalogFingerprint: String(catalogFingerprint || ''),
      transportPassed: Number(record?.steps?.transport?.result?.passed || 0),
      strictSurfaceSamplesPassed: progress.strictSurfaceSamplesPassed,
      cancellationPassed: record?.steps?.boundary?.result?.cancellation?.pass === true,
      fallbackBoundaryPassed: record?.steps?.boundary?.result?.preCommitFallback?.pass === true
        && record?.steps?.boundary?.result?.postCommitGuard?.pass === true,
      realSessionPassed: record?.steps?.real_session?.result?.pass === true
        && record?.steps?.real_session?.result?.cleanup?.pass === true,
    },
  };
};
