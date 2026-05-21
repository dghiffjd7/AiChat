import { AGENT_PERMISSION_DECISIONS } from './agent-permissions.js';
import {
  PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES,
  PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES,
  PROVIDER_TOOL_PENDING_PERMISSION_STATUSES,
} from './provider-tool-pending-permissions.js';
import { buildProviderStreamEventsMessageParts } from './provider-tool-continuation-parts.js';
import { createProviderToolRealRunnerAdapter } from './provider-tool-real-runner-adapter.js';
import { buildProviderToolResultRequestPreview } from './provider-tool-result-request-preview.js';
import { buildProviderToolRunnerHandoff } from './provider-tool-runner-handoff.js';
import { runProviderToolRunnerFacade } from './provider-tool-runner-facade.js';
import { resolveProviderToolRunnerModePlan } from './provider-tool-runner-mode-policy.js';
import { buildProviderToolRunnerRequestDraft } from './provider-tool-runner-request-draft.js';

const DEFAULT_ALLOWED_TOOLS = Object.freeze([
  'contact_profile.list',
]);

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

const buildBlockedResult = ({
  pending = null,
  status = PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked,
  reason = '',
  now = Date.now,
} = {}) => ({
  ok: false,
  status,
  reason: trim(reason, 'provider tool pending continuation blocked'),
  pending,
  requestPreview: null,
  loopState: null,
  runnerHandoff: null,
  runnerRequestDraft: null,
  runnerModePlan: null,
  runnerFacade: null,
  parts: [],
  network: false,
  writesChat: false,
  replayChat: false,
  runsProvider: false,
  realNetwork: false,
  createdAt: readTimestamp(now),
});

const readResumeOutput = (pending = {}) => {
  const resumeResult = isPlainObject(pending.resumeResult) ? pending.resumeResult : {};
  if (Object.prototype.hasOwnProperty.call(resumeResult, 'output')) return resumeResult.output;
  return resumeResult;
};

const buildToolResultForPreview = (pending = {}) => {
  const output = readResumeOutput(pending);
  const resultSource = isPlainObject(output) ? output : {};
  return {
    toolCallId: trim(pending.toolCallId || pending.toolCall?.toolCallId || pending.toolCall?.id),
    toolName: trim(pending.toolName || pending.toolCall?.toolName || pending.toolCall?.name),
    toolCall: clone(pending.toolCall || {}),
    status: trim(resultSource.status, 'succeeded'),
    summary: trim(resultSource.summary),
    output: clone(output),
  };
};

const buildLoopState = ({
  pending = {},
  requestPreview = {},
  shouldContinue = false,
} = {}) => ({
  provider: trim(requestPreview.provider || pending.toolCall?.provider),
  sourceProvider: trim(requestPreview.sourceProvider || pending.toolCall?.provider),
  model: trim(requestPreview.model || pending.toolCall?.model),
  sessionId: trim(requestPreview.sessionId || pending.sessionId),
  status: 'succeeded',
  phase: 'pending_resume_completed',
  phaseCount: 1,
  shouldContinue: shouldContinue === true,
  network: false,
  writesChat: false,
  pendingPermissionId: trim(pending.id),
  toolCallId: trim(pending.toolCallId),
  toolName: trim(pending.toolName),
  resumeStatus: trim(pending.resumeStatus),
});

const resolveInjectedProviderRunner = ({
  runner = null,
  providerRunner = null,
  providerClient = null,
  runnerRequestOptions = {},
  realRunnerAdapterEnabled = false,
  enableRealProviderRunnerAdapter = false,
  now = Date.now,
} = {}) => {
  if (providerRunner) return providerRunner;
  if (runner) return runner;
  if (!providerClient) return null;
  return createProviderToolRealRunnerAdapter({
    providerClient,
    enabled: realRunnerAdapterEnabled === true || enableRealProviderRunnerAdapter === true,
    requestOptions: isPlainObject(runnerRequestOptions) ? runnerRequestOptions : {},
    now,
  });
};

const resolveRunnerMode = ({
  runnerMode = '',
  runner = null,
  providerRunner = null,
  providerClient = null,
  runnerRequestOptions = {},
  realRunnerAdapterEnabled = false,
  enableRealProviderRunnerAdapter = false,
  sessionGate = null,
  allowRealRunner = false,
  allowRunnerNetwork = false,
  now = Date.now,
} = {}) => {
  const requestedMode = trim(runnerMode);
  if (!requestedMode) {
    return {
      runner,
      runnerFacadeEnabled: false,
      allowNetwork: false,
      runnerModePlan: null,
    };
  }
  const gate = isPlainObject(sessionGate) ? sessionGate : {};
  const resolvedProviderRunner = resolveInjectedProviderRunner({
    runner,
    providerRunner,
    providerClient,
    runnerRequestOptions,
    realRunnerAdapterEnabled,
    enableRealProviderRunnerAdapter,
    now,
  });
  const plan = resolveProviderToolRunnerModePlan({
    runnerMode: requestedMode,
    providerRunner: resolvedProviderRunner,
    allowRealRunner: allowRealRunner === true && gate.enabled === true && gate.realRunnerAllowed === true,
    allowRunnerNetwork: allowRunnerNetwork === true && gate.enabled === true && gate.networkAllowed === true,
  });
  return {
    runner: plan.providerRunner || null,
    runnerFacadeEnabled: plan.runnerFacadeEnabled === true,
    allowNetwork: plan.allowRunnerNetwork === true,
    runnerModePlan: plan.diagnostics,
  };
};

const choosePlanStatus = ({
  requestPreview = null,
  runnerHandoff = null,
  runnerRequestDraft = null,
  runnerModePlan = null,
  runnerFacade = null,
  runnerFacadeEnabled = false,
} = {}) => {
  if (!requestPreview || Number(requestPreview.toolResultCount || 0) <= 0) {
    return PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.skipped;
  }
  if (runnerHandoff?.ok !== true) {
    return runnerHandoff?.status === 'blocked'
      ? PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked
      : PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.skipped;
  }
  if (runnerRequestDraft?.ok !== true) {
    return runnerRequestDraft?.status === 'blocked'
      ? PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked
      : PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.skipped;
  }
  if (runnerModePlan?.status === 'blocked') {
    return PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked;
  }
  if (runnerFacadeEnabled !== true) return PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.ready;
  if (runnerFacade?.ok === true) return PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.succeeded;
  if (runnerFacade?.status === 'blocked') return PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked;
  if (runnerFacade?.status === 'failed') return PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.failed;
  return PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.skipped;
};

const chooseReason = ({
  status = '',
  requestPreview = null,
  runnerHandoff = null,
  runnerRequestDraft = null,
  runnerModePlan = null,
  runnerFacade = null,
} = {}) => {
  if (status === PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.ready) {
    return 'provider continuation request draft ready; runner facade disabled';
  }
  if (status === PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.succeeded) {
    return '';
  }
  if (!requestPreview || Number(requestPreview.toolResultCount || 0) <= 0) {
    return 'no model-safe tool results to continue';
  }
  if (runnerModePlan?.status === 'blocked') {
    return trim(runnerModePlan.reason, 'provider runner mode blocked');
  }
  return trim(runnerFacade?.reason || runnerRequestDraft?.reason || runnerHandoff?.reason, 'provider continuation skipped');
};

export const buildProviderToolPendingContinuationPlan = async ({
  pending = null,
  allowedTools = DEFAULT_ALLOWED_TOOLS,
  maxContentChars = 2000,
  runner = null,
  runnerName = '',
  runnerFacadeEnabled = false,
  runnerMode = '',
  providerRunner = null,
  providerClient = null,
  runnerRequestOptions = {},
  realRunnerAdapterEnabled = false,
  enableRealProviderRunnerAdapter = false,
  sessionGate = null,
  allowRealRunner = false,
  allowRunnerNetwork = false,
  now = Date.now,
} = {}) => {
  if (!pending) {
    return buildBlockedResult({
      status: PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked,
      reason: 'pending permission not found',
      now,
    });
  }
  if (pending.status !== PROVIDER_TOOL_PENDING_PERMISSION_STATUSES.allowed ||
    pending.decision !== AGENT_PERMISSION_DECISIONS.allow) {
    return buildBlockedResult({
      pending,
      status: PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked,
      reason: `pending permission is not allowed: ${pending.status}`,
      now,
    });
  }
  if (pending.resumeStatus !== PROVIDER_TOOL_PENDING_PERMISSION_RESUME_STATUSES.succeeded) {
    return buildBlockedResult({
      pending,
      status: PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.blocked,
      reason: `pending resume is not succeeded: ${pending.resumeStatus || 'idle'}`,
      now,
    });
  }

  const toolResult = buildToolResultForPreview(pending);
  const requestPreview = buildProviderToolResultRequestPreview({
    provider: pending.toolCall?.provider || pending.request?.provider || '',
    model: pending.toolCall?.model || pending.request?.model || '',
    sessionId: pending.sessionId,
    assistantToolCalls: [pending.toolCall],
    toolResults: [toolResult],
    maxContentChars,
    allowedTools,
  });
  const loopState = buildLoopState({
    pending,
    requestPreview,
    shouldContinue: Number(requestPreview.toolResultCount || 0) > 0,
  });
  const runnerModeResolution = resolveRunnerMode({
    runnerMode,
    runner,
    providerRunner,
    providerClient,
    runnerRequestOptions,
    realRunnerAdapterEnabled,
    enableRealProviderRunnerAdapter,
    sessionGate,
    allowRealRunner,
    allowRunnerNetwork,
    now,
  });
  const runnerModePlan = runnerModeResolution.runnerModePlan;
  const activeRunner = runnerModePlan ? runnerModeResolution.runner : runner;
  const activeRunnerFacadeEnabled = runnerModePlan
    ? runnerModeResolution.runnerFacadeEnabled
    : runnerFacadeEnabled === true;
  const activeAllowNetwork = runnerModePlan
    ? runnerModeResolution.allowNetwork
    : false;
  const activeRunnerName = trim(
    runnerName,
    runnerModePlan?.runner || 'pending_resume_provider_runner_draft',
  );
  const runnerHandoff = buildProviderToolRunnerHandoff({
    requestPreview,
    loopState,
    runner: activeRunnerName,
    network: false,
    writesChat: false,
    now,
  });
  const runnerRequestDraft = buildProviderToolRunnerRequestDraft({
    runnerHandoff,
    requestPreview,
    loopState,
    runner: activeRunnerName,
    writesChat: false,
    now,
  });
  const runnerFacade = await runProviderToolRunnerFacade({
    runnerRequestDraft,
    runner: activeRunner,
    enabled: activeRunnerFacadeEnabled === true,
    allowNetwork: activeAllowNetwork === true,
    now,
  });
  const parts = buildProviderStreamEventsMessageParts({
    pending,
    runnerFacade,
    requestPreview,
    runnerRequestDraft,
    now,
  });
  const status = choosePlanStatus({
    requestPreview,
    runnerHandoff,
    runnerRequestDraft,
    runnerModePlan,
    runnerFacade,
    runnerFacadeEnabled: activeRunnerFacadeEnabled,
  });
  const reason = chooseReason({
    status,
    requestPreview,
    runnerHandoff,
    runnerRequestDraft,
    runnerModePlan,
    runnerFacade,
  });
  const network = runnerFacade?.network === true;
  return {
    ok: status === PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.ready ||
      status === PROVIDER_TOOL_PENDING_PERMISSION_CONTINUATION_STATUSES.succeeded,
    status,
    reason,
    pending,
    pendingPermissionId: trim(pending.id),
    requestPreview,
    loopState,
    runnerHandoff,
    runnerRequestDraft,
    runnerModePlan,
    runnerFacade,
    parts,
    sessionGate: isPlainObject(sessionGate) ? clone(sessionGate) : null,
    network,
    writesChat: runnerFacade?.writesChat === true,
    replayChat: false,
    runsProvider: runnerFacade?.ok === true,
    realNetwork: network,
    createdAt: readTimestamp(now),
  };
};

export const createProviderToolPendingContinuationPlanner = ({
  pendingPermissionStore = null,
  allowedTools = DEFAULT_ALLOWED_TOOLS,
  maxContentChars = 2000,
  readSessionGate = null,
  now = Date.now,
} = {}) => {
  const markContinuation = (id, continuation = {}) => (
    typeof pendingPermissionStore?.markContinuation === 'function'
      ? pendingPermissionStore.markContinuation(id, continuation)
      : null
  );

  const plan = async (id = '', options = {}) => {
    const opts = isPlainObject(options) ? options : {};
    const pendingId = trim(id || opts.id || opts.pendingPermissionId);
    const pending = typeof pendingPermissionStore?.get === 'function'
      ? pendingPermissionStore.get(pendingId)
      : null;
    const sessionGate = pending && typeof readSessionGate === 'function'
      ? readSessionGate(pending.sessionId)
      : null;
    const result = await buildProviderToolPendingContinuationPlan({
      pending,
      allowedTools: opts.allowedTools || allowedTools,
      maxContentChars: opts.maxContentChars || maxContentChars,
      runner: opts.runner,
      runnerName: opts.runnerName,
      runnerFacadeEnabled: opts.runnerFacadeEnabled === true,
      runnerMode: opts.runnerMode || opts.providerRunnerMode || '',
      providerRunner: opts.providerRunner,
      providerClient: opts.providerClient,
      runnerRequestOptions: opts.runnerRequestOptions,
      realRunnerAdapterEnabled: opts.realRunnerAdapterEnabled,
      enableRealProviderRunnerAdapter: opts.enableRealProviderRunnerAdapter,
      sessionGate,
      allowRealRunner: opts.allowRealRunner === true,
      allowRunnerNetwork: opts.allowRunnerNetwork === true,
      now,
    });
    if (!pending) return result;
    const storedResult = {
      ok: result.ok,
      status: result.status,
      reason: result.reason,
      pendingPermissionId: result.pendingPermissionId,
      requestPreview: result.requestPreview,
      loopState: result.loopState,
      runnerHandoff: result.runnerHandoff,
      runnerRequestDraft: result.runnerRequestDraft,
      runnerModePlan: result.runnerModePlan,
      runnerFacade: result.runnerFacade,
      parts: result.parts,
      sessionGate: result.sessionGate,
      network: result.network === true,
      writesChat: result.writesChat === true,
      replayChat: false,
      runsProvider: result.runsProvider === true,
      realNetwork: result.realNetwork === true,
      createdAt: result.createdAt,
    };
    const stored = markContinuation(pending.id, {
      status: result.status,
      reason: result.reason,
      result: storedResult,
      parts: result.parts,
    });
    return {
      ...result,
      pending: stored || result.pending,
    };
  };

  return {
    plan,
  };
};
