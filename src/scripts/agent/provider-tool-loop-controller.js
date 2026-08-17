import { createProviderToolCallDeltaAccumulator } from './provider-tool-call-delta-adapter.js';
import { buildProviderToolMockLoopPreview } from './provider-tool-mock-loop-preview.js';
import { buildProviderToolMockProviderRun } from './provider-tool-mock-provider-runner.js';
import { buildProviderToolResultRequestPreview } from './provider-tool-result-request-preview.js';
import { buildProviderToolRunnerDryRun } from './provider-tool-runner-dry-run-adapter.js';
import { runProviderToolRunnerFacade } from './provider-tool-runner-facade.js';
import { buildProviderToolRunnerHandoff } from './provider-tool-runner-handoff.js';
import { buildProviderToolRunnerRequestDraft } from './provider-tool-runner-request-draft.js';

export const PROVIDER_TOOL_LOOP_PHASES = Object.freeze({
  disabled: 'disabled',
  captureDeltas: 'capture_deltas',
  executeTools: 'execute_tools',
  requestPreview: 'request_preview',
  mockLoopPreview: 'mock_loop_preview',
  mockProviderRun: 'mock_provider_run',
  completed: 'completed',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

const normalizeRunnerModePlan = (runnerModePlan = null) => {
  if (!isPlainObject(runnerModePlan)) return null;
  return {
    requestedMode: trim(runnerModePlan.requestedMode),
    mode: trim(runnerModePlan.mode),
    status: trim(runnerModePlan.status, 'unknown'),
    reason: trim(runnerModePlan.reason),
    runner: trim(runnerModePlan.runner),
    runnerFacadeEnabled: runnerModePlan.runnerFacadeEnabled === true,
    allowRunnerNetwork: runnerModePlan.allowRunnerNetwork === true,
    network: runnerModePlan.network === true,
    writesChat: runnerModePlan.writesChat === true,
    realRunnerAllowed: runnerModePlan.realRunnerAllowed === true,
  };
};

export const buildProviderToolLoopContinuation = (status = 'unknown') => ({
  strategy: 'stop_after_tool_result',
  shouldContinue: false,
  reason: status === 'succeeded'
    ? 'fixture stops after provider tool result'
    : 'fixture does not continue provider generation',
});

const createPhaseRecorder = (now = Date.now) => {
  const phases = [];
  return {
    phases,
    push: (phase, status = 'succeeded', details = {}) => {
      phases.push({
        phase,
        status: trim(status, 'unknown'),
        network: details.network === true,
        summary: trim(details.summary),
        details: isPlainObject(details.details) ? details.details : {},
        updatedAt: readTimestamp(now),
      });
    },
  };
};

const buildLoopState = ({
  ok = false,
  status = 'unknown',
  phase = PROVIDER_TOOL_LOOP_PHASES.completed,
  provider = '',
  model = '',
  sessionId = '',
  phases = [],
  deltas = [],
  completedToolCalls = [],
  results = [],
  parts = [],
  continuation = null,
  requestPreview = null,
  mockLoopPreview = null,
  mockProviderRun = null,
  runnerHandoff = null,
  runnerRequestDraft = null,
  runnerModePlan = null,
  runnerFacade = null,
  runnerDryRun = null,
  startedAt = 0,
  updatedAt = 0,
} = {}) => ({
  ok: ok === true,
  status: trim(status, 'unknown'),
  phase: trim(phase, PROVIDER_TOOL_LOOP_PHASES.completed),
  provider: trim(provider),
  model: trim(model),
  sessionId: trim(sessionId),
  network: false,
  phases,
  phaseCount: phases.length,
  deltas: Array.isArray(deltas) ? deltas.length : 0,
  completedToolCalls: Array.isArray(completedToolCalls) ? completedToolCalls.length : 0,
  results: Array.isArray(results) ? results.length : 0,
  parts: Array.isArray(parts) ? parts.length : 0,
  continuationStrategy: trim(continuation?.strategy),
  shouldContinue: continuation?.shouldContinue === true,
  requestPreviewFormat: trim(requestPreview?.format),
  requestPreviewToolResults: Number(requestPreview?.toolResultCount || 0) || 0,
  mockLoopStatus: trim(mockLoopPreview?.status),
  mockProviderStatus: trim(mockProviderRun?.status),
  mockProviderEvents: Array.isArray(mockProviderRun?.events)
    ? mockProviderRun.events.length
    : (Number(mockProviderRun?.eventCount || 0) || 0),
  runnerHandoffStatus: trim(runnerHandoff?.status),
  runnerHandoffOutput: trim(runnerHandoff?.output),
  runnerHandoffWritesChat: runnerHandoff?.writesChat === true,
  runnerRequestDraftStatus: trim(runnerRequestDraft?.status),
  runnerRequestDraftPayloadKind: trim(runnerRequestDraft?.payloadKind),
  runnerRequestDraftWritesChat: runnerRequestDraft?.writesChat === true,
  runnerMode: trim(runnerModePlan?.mode),
  runnerModeStatus: trim(runnerModePlan?.status),
  runnerModeRunner: trim(runnerModePlan?.runner),
  runnerModeFacadeEnabled: runnerModePlan?.runnerFacadeEnabled === true,
  runnerModeNetwork: runnerModePlan?.network === true,
  runnerModeWritesChat: runnerModePlan?.writesChat === true,
  runnerFacadeStatus: trim(runnerFacade?.status),
  runnerFacadeEvents: Array.isArray(runnerFacade?.events)
    ? runnerFacade.events.length
    : (Number(runnerFacade?.eventCount || 0) || 0),
  runnerFacadeWritesChat: runnerFacade?.writesChat === true,
  runnerDryRunStatus: trim(runnerDryRun?.status),
  runnerDryRunEvents: Array.isArray(runnerDryRun?.events)
    ? runnerDryRun.events.length
    : (Number(runnerDryRun?.eventCount || 0) || 0),
  createdAt: Number(startedAt || 0) || 0,
  updatedAt: Number(updatedAt || startedAt || 0) || 0,
});

export const runProviderToolLoopController = async ({
  events = [],
  enabled = true,
  provider = '',
  model = '',
  sessionId = '',
  now = Date.now,
  executeToolCall = null,
  buildRequestPreview = buildProviderToolResultRequestPreview,
  buildMockLoopPreview = buildProviderToolMockLoopPreview,
  buildMockProviderRun = buildProviderToolMockProviderRun,
  buildRunnerHandoff = buildProviderToolRunnerHandoff,
  buildRunnerRequestDraft = buildProviderToolRunnerRequestDraft,
  runRunnerFacade = runProviderToolRunnerFacade,
  buildRunnerDryRun = buildProviderToolRunnerDryRun,
  runnerFacadeEnabled = false,
  providerRunner = null,
  allowRunnerNetwork = false,
  runnerModePlan = null,
  providerContinuationContext = null,
} = {}) => {
  const startedAt = readTimestamp(now);
  const providerName = trim(provider, 'debug-provider');
  const modelName = trim(model);
  const normalizedSessionId = trim(sessionId);
  const normalizedRunnerModePlan = normalizeRunnerModePlan(runnerModePlan);
  const { phases, push } = createPhaseRecorder(now);

  if (enabled !== true) {
    const continuation = buildProviderToolLoopContinuation('disabled');
    push(PROVIDER_TOOL_LOOP_PHASES.disabled, 'disabled', {
      summary: 'provider tool loop disabled',
    });
    const updatedAt = readTimestamp(now);
    const loopState = buildLoopState({
      ok: false,
      status: 'disabled',
      phase: PROVIDER_TOOL_LOOP_PHASES.disabled,
      provider: providerName,
      model: modelName,
      sessionId: normalizedSessionId,
      phases,
      continuation,
      runnerModePlan: normalizedRunnerModePlan,
      startedAt,
      updatedAt,
    });
    return {
      ok: false,
      status: 'disabled',
      reason: 'provider tool experiment is disabled',
      deltas: [],
      completedToolCalls: [],
      results: [],
      parts: [],
      continuation,
      requestPreview: null,
      mockLoopPreview: null,
      mockProviderRun: null,
      runnerModePlan: normalizedRunnerModePlan,
      loopState,
    };
  }

  const list = Array.isArray(events) ? events : [events];
  const accumulator = createProviderToolCallDeltaAccumulator({
    provider: providerName,
    model: modelName,
    now,
  });
  const deltas = [];
  const completedToolCalls = [];
  list.forEach((event) => {
    const next = accumulator.push(event, {
      provider: providerName,
      model: modelName,
    });
    deltas.push(...next.deltas);
    completedToolCalls.push(...next.completed);
  });
  push(PROVIDER_TOOL_LOOP_PHASES.captureDeltas, completedToolCalls.length ? 'completed' : 'no_tool_calls', {
    summary: completedToolCalls.length
      ? `captured ${completedToolCalls.length} provider tool call(s)`
      : 'no completed provider tool calls',
    details: {
      deltas: deltas.length,
      completedToolCalls: completedToolCalls.length,
    },
  });

  const execute = typeof executeToolCall === 'function'
    ? executeToolCall
    : async () => ({
        ok: false,
        status: 'failed',
        reason: 'provider tool call runtime not configured',
        parts: [],
      });
  const results = [];
  for (const toolCall of completedToolCalls) {
    results.push(await execute(toolCall));
  }
  const failed = results.find(result => result?.ok === false);
  const toolStatus = results.length
    ? (failed?.status || 'succeeded')
    : 'skipped';
  push(PROVIDER_TOOL_LOOP_PHASES.executeTools, toolStatus, {
    summary: results.length
      ? `executed ${results.length} provider tool call(s)`
      : 'tool execution skipped',
    details: {
      results: results.length,
      failed: failed ? 1 : 0,
    },
  });

  const requestPreview = results.length
    ? buildRequestPreview({
        provider: providerName,
        model: modelName,
        sessionId: normalizedSessionId,
        assistantToolCalls: completedToolCalls,
        toolResults: results,
        historyMessages: providerContinuationContext?.historyMessages,
        providerRequestOptions: providerContinuationContext?.providerRequestOptions,
      })
    : null;
  push(PROVIDER_TOOL_LOOP_PHASES.requestPreview, requestPreview ? 'succeeded' : 'skipped', {
    summary: requestPreview ? 'request preview ready' : 'request preview skipped',
    details: {
      format: trim(requestPreview?.format),
      toolResults: Number(requestPreview?.toolResultCount || 0) || 0,
      skippedToolResults: Number(requestPreview?.skippedToolResultCount || 0) || 0,
    },
  });

  const mockLoopPreview = requestPreview
    ? buildMockLoopPreview({ requestPreview })
    : null;
  push(PROVIDER_TOOL_LOOP_PHASES.mockLoopPreview, mockLoopPreview?.status || 'skipped', {
    summary: mockLoopPreview?.ok === true ? 'mock loop preview ready' : trim(mockLoopPreview?.reason, 'mock loop preview skipped'),
    details: {
      ok: mockLoopPreview?.ok === true,
      network: mockLoopPreview?.network === true,
    },
  });

  const mockProviderRun = mockLoopPreview
    ? buildMockProviderRun({ mockLoopPreview, now })
    : null;
  push(PROVIDER_TOOL_LOOP_PHASES.mockProviderRun, mockProviderRun?.status || 'skipped', {
    summary: mockProviderRun?.ok === true ? 'mock provider run ready' : trim(mockProviderRun?.reason, 'mock provider run skipped'),
    details: {
      ok: mockProviderRun?.ok === true,
      network: mockProviderRun?.network === true,
      events: Array.isArray(mockProviderRun?.events)
        ? mockProviderRun.events.length
        : (Number(mockProviderRun?.eventCount || 0) || 0),
    },
  });

  const status = results.length > 0
    ? (failed?.status || 'succeeded')
    : 'no_tool_calls';
  const ok = results.length > 0 && !failed;
  const continuation = buildProviderToolLoopContinuation(status);
  const parts = results.flatMap(result => (Array.isArray(result?.parts) ? result.parts : []));
  const updatedAt = readTimestamp(now);
  const loopState = buildLoopState({
    ok,
    status,
    phase: PROVIDER_TOOL_LOOP_PHASES.completed,
    provider: providerName,
    model: modelName,
    sessionId: normalizedSessionId,
    phases,
    deltas,
    completedToolCalls,
    results,
    parts,
    continuation,
    requestPreview,
    mockLoopPreview,
    mockProviderRun,
    runnerModePlan: normalizedRunnerModePlan,
    startedAt,
    updatedAt,
  });
  const runnerHandoff = requestPreview
    ? buildRunnerHandoff({
        requestPreview,
        loopState,
        runner: 'mock_provider_runner',
        network: false,
        writesChat: false,
        now,
      })
    : null;
  if (runnerHandoff) {
    loopState.runnerHandoffStatus = trim(runnerHandoff.status);
    loopState.runnerHandoffOutput = trim(runnerHandoff.output);
    loopState.runnerHandoffWritesChat = runnerHandoff.writesChat === true;
  }
  const runnerRequestDraft = runnerHandoff
    ? buildRunnerRequestDraft({
        runnerHandoff,
        requestPreview,
        loopState,
        now,
      })
    : null;
  if (runnerRequestDraft) {
    loopState.runnerRequestDraftStatus = trim(runnerRequestDraft.status);
    loopState.runnerRequestDraftPayloadKind = trim(runnerRequestDraft.payloadKind);
    loopState.runnerRequestDraftWritesChat = runnerRequestDraft.writesChat === true;
  }
  const runnerFacade = runnerRequestDraft
    ? await runRunnerFacade({
        runnerRequestDraft,
        runner: providerRunner,
        enabled: runnerFacadeEnabled === true,
        allowNetwork: allowRunnerNetwork === true,
        now,
      })
    : null;
  if (runnerFacade) {
    loopState.runnerFacadeStatus = trim(runnerFacade.status);
    loopState.runnerFacadeEvents = Array.isArray(runnerFacade.events)
      ? runnerFacade.events.length
      : (Number(runnerFacade.eventCount || 0) || 0);
    loopState.runnerFacadeWritesChat = runnerFacade.writesChat === true;
  }
  const runnerDryRun = runnerHandoff
    ? buildRunnerDryRun({
        runnerHandoff,
        mockProviderRun,
        now,
      })
    : null;
  if (runnerDryRun) {
    loopState.runnerDryRunStatus = trim(runnerDryRun.status);
    loopState.runnerDryRunEvents = Array.isArray(runnerDryRun.events)
      ? runnerDryRun.events.length
      : (Number(runnerDryRun.eventCount || 0) || 0);
  }

  return {
    ok,
    status,
    deltas,
    completedToolCalls,
    results,
    parts,
    continuation,
    requestPreview,
    mockLoopPreview,
    mockProviderRun,
    runnerHandoff,
    runnerRequestDraft,
    runnerModePlan: normalizedRunnerModePlan,
    runnerFacade,
    runnerDryRun,
    loopState,
  };
};
