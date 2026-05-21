import { createProviderToolCallDeltaAccumulator } from './provider-tool-call-delta-adapter.js';
import { createProviderToolLlmClientNativeRunner } from './provider-tool-llmclient-native-runner.js';
import {
  buildProviderToolPermissionInteraction,
  buildProviderToolPermissionStrategySummary,
} from './provider-tool-permission-interaction.js';
import {
  buildProviderToolLoopContinuation,
  runProviderToolLoopController,
} from './provider-tool-loop-controller.js';
import { createProviderToolRealRunnerAdapter } from './provider-tool-real-runner-adapter.js';
import { resolveProviderToolRunnerModePlan } from './provider-tool-runner-mode-policy.js';

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

const normalizeAllowedTools = (tools = []) => (
  (Array.isArray(tools) ? tools : [tools])
    .map(tool => trim(tool))
    .filter(Boolean)
);

const resolveInjectedProviderRunner = (opts = {}, now = Date.now) => {
  if (opts.providerRunner) return opts.providerRunner;
  const injectedProviderClient = opts.providerClient || (
    opts.llmClient || opts.llmProvider
      ? createProviderToolLlmClientNativeRunner({
          llmClient: opts.llmClient,
          provider: opts.llmProvider,
          now,
          fetchFn: opts.fetchFn,
        })
      : null
  );
  if (!injectedProviderClient) return null;
  return createProviderToolRealRunnerAdapter({
    providerClient: injectedProviderClient,
    enabled: opts.realRunnerAdapterEnabled === true || opts.enableRealProviderRunnerAdapter === true,
    requestOptions: isPlainObject(opts.runnerRequestOptions) ? opts.runnerRequestOptions : {},
    now,
  });
};

const buildRealRunnerDebugSafety = ({
  opts = {},
  runnerModePlan = null,
  providerRunner = null,
  allowedTools = [],
  explicitEnabled = false,
  experimentEnabled = false,
} = {}) => {
  const diagnostics = isPlainObject(runnerModePlan?.diagnostics) ? runnerModePlan.diagnostics : {};
  const mode = trim(diagnostics.mode, 'read_only_capture');
  const adapterEnabled = opts.realRunnerAdapterEnabled === true || opts.enableRealProviderRunnerAdapter === true;
  const providerClientInjected = Boolean(opts.providerClient);
  const llmClientInjected = Boolean(opts.llmClient || opts.llmProvider);
  const providerRunnerInjected = Boolean(providerRunner);
  const allowRunnerNetwork = opts.allowRunnerNetwork === true;
  const allowRealRunner = opts.allowRealRunner === true || opts.runnerFacadeEnabled === true || opts.enableProviderRunner === true;
  const armed = mode === 'real_runner' &&
    diagnostics.status === 'ready' &&
    diagnostics.runnerFacadeEnabled === true &&
    allowRunnerNetwork &&
    providerRunnerInjected &&
    (adapterEnabled || Boolean(opts.providerRunner));
  return {
    status: armed ? 'armed' : 'blocked',
    mode,
    reason: armed ? '' : 'real runner requires explicit debug gates',
    experimentEnabled: experimentEnabled === true || explicitEnabled === true,
    explicitEnabled: explicitEnabled === true,
    providerRunnerInjected,
    providerClientInjected,
    llmClientInjected,
    adapterEnabled,
    allowRealRunner,
    allowRunnerNetwork,
    runnerFacadeEnabled: diagnostics.runnerFacadeEnabled === true,
    network: armed,
    writesChat: false,
    allowedTools: normalizeAllowedTools(allowedTools),
    modelContextPolicy: 'allowlist_only',
    rollback: 'set runnerMode=read_only_capture or remove providerRunner/providerClient',
  };
};

export const createProviderToolExperimentRuntime = ({
  providerToolCallRuntime = null,
  enabledByDefault = false,
  allowedTools = ['contact_profile.list'],
  provider = 'debug-provider',
  model = 'debug-tool-model',
  sessionId = '',
  requestPermission = null,
  now = Date.now,
} = {}) => {
  let enabled = enabledByDefault === true;
  const allowlist = normalizeAllowedTools(allowedTools);
  const diagnostics = [];
  const captureStates = new Map();
  const readNow = () => Number(now?.() || Date.now()) || Date.now();

  const recordDiagnostics = (entry = {}) => {
    const normalized = {
      id: trim(entry.id, `provider-tool-experiment:${readNow()}:${diagnostics.length + 1}`),
      kind: trim(entry.kind, 'tool_call'),
      status: trim(entry.status, 'unknown'),
      ok: entry.ok === true,
      reason: trim(entry.reason),
      provider: trim(entry.provider, provider),
      model: trim(entry.model, model),
      sessionId: trim(entry.sessionId, sessionId),
      explicitEnabled: entry.explicitEnabled === true,
      createdAt: Number(entry.createdAt || readNow()) || readNow(),
      updatedAt: Number(entry.updatedAt || entry.createdAt || readNow()) || readNow(),
      deltas: Array.isArray(entry.deltas) ? clone(entry.deltas) : [],
      completedToolCalls: Array.isArray(entry.completedToolCalls) ? clone(entry.completedToolCalls) : [],
      results: Array.isArray(entry.results) ? clone(entry.results) : [],
      parts: Array.isArray(entry.parts) ? clone(entry.parts) : [],
      continuation: isPlainObject(entry.continuation) ? clone(entry.continuation) : null,
      requestPreview: isPlainObject(entry.requestPreview) ? clone(entry.requestPreview) : null,
      mockLoopPreview: isPlainObject(entry.mockLoopPreview) ? clone(entry.mockLoopPreview) : null,
      mockProviderRun: isPlainObject(entry.mockProviderRun) ? clone(entry.mockProviderRun) : null,
      runnerHandoff: isPlainObject(entry.runnerHandoff) ? clone(entry.runnerHandoff) : null,
      runnerRequestDraft: isPlainObject(entry.runnerRequestDraft) ? clone(entry.runnerRequestDraft) : null,
      runnerModePlan: isPlainObject(entry.runnerModePlan) ? clone(entry.runnerModePlan) : null,
      runnerFacade: isPlainObject(entry.runnerFacade) ? clone(entry.runnerFacade) : null,
      runnerDryRun: isPlainObject(entry.runnerDryRun) ? clone(entry.runnerDryRun) : null,
      realRunnerDebug: isPlainObject(entry.realRunnerDebug) ? clone(entry.realRunnerDebug) : null,
      permissionStrategy: isPlainObject(entry.permissionStrategy) ? clone(entry.permissionStrategy) : null,
      loopState: isPlainObject(entry.loopState) ? clone(entry.loopState) : null,
      toolCall: entry.toolCall ? clone(entry.toolCall) : null,
    };
    diagnostics.unshift(normalized);
    if (diagnostics.length > 20) diagnostics.length = 20;
    return normalized;
  };

  const getStatus = () => ({
    enabled,
    allowedTools: allowlist.slice(),
    provider: trim(provider, 'debug-provider'),
    model: trim(model, 'debug-tool-model'),
  });

  const setEnabled = (nextEnabled = false) => {
    enabled = nextEnabled === true;
    return getStatus();
  };

  const buildPermissionRequester = (opts, normalizedToolCall) => async request => {
    const interaction = buildProviderToolPermissionInteraction(request, {
      sessionId: normalizedToolCall.sessionId,
      sessionGate: opts.sessionGate,
      promptPermission: opts.promptPermission === true,
      source: opts.source || normalizedToolCall.source || 'provider-tool-experiment',
      timeoutMs: opts.permissionTimeoutMs,
    });
    if (opts.allowOnce === true || opts.allowPermission === true) {
      return { decision: 'allow', request, interaction };
    }
    if (opts.denyPermission === true) {
      return { decision: 'deny', request, interaction };
    }
    if (typeof opts.requestPermission === 'function') {
      const requested = await opts.requestPermission({
        ...request,
        interaction,
      }, { toolCall: normalizedToolCall, experiment: getStatus() });
      return isPlainObject(requested) && !isPlainObject(requested.interaction)
        ? { ...requested, interaction }
        : requested;
    }
    if (typeof requestPermission === 'function') {
      const requested = await requestPermission({
        ...request,
        interaction,
      }, { toolCall: normalizedToolCall, experiment: getStatus() });
      return isPlainObject(requested) && !isPlainObject(requested.interaction)
        ? { ...requested, interaction }
        : requested;
    }
    return { decision: 'ask', action: 'deferred', request, interaction };
  };

  const run = async (options = {}) => {
    const opts = isPlainObject(options) ? options : {};
    const shouldRecord = opts.skipDiagnostics !== true;
    const explicitEnabled = opts.enabled === true || opts.experimentEnabled === true;
    if (!enabled && !explicitEnabled) {
      const disabled = {
        ok: false,
        status: 'disabled',
        reason: 'provider tool experiment is disabled',
        parts: [],
        experiment: getStatus(),
      };
      if (shouldRecord) {
        recordDiagnostics({
          kind: 'tool_call',
          ...disabled,
          explicitEnabled,
          createdAt: readNow(),
        });
      }
      return disabled;
    }
    if (!providerToolCallRuntime || typeof providerToolCallRuntime.executeToolCall !== 'function') {
      const failed = {
        ok: false,
        status: 'failed',
        reason: 'provider tool call runtime not configured',
        parts: [],
        experiment: getStatus(),
      };
      if (shouldRecord) {
        recordDiagnostics({
          kind: 'tool_call',
          ...failed,
          explicitEnabled,
          createdAt: readNow(),
        });
      }
      return failed;
    }

    const toolCall = isPlainObject(opts.toolCall) ? opts.toolCall : {};
    const toolName = trim(opts.toolName || toolCall.toolName || toolCall.name, allowlist[0] || '');
    if (!toolName || !allowlist.includes(toolName)) {
      const blocked = {
        ok: false,
        status: 'blocked',
        reason: `provider tool experiment only allows: ${allowlist.join(', ') || '-'}`,
        parts: [],
        experiment: getStatus(),
      };
      if (shouldRecord) {
        recordDiagnostics({
          kind: 'tool_call',
          ...blocked,
          explicitEnabled,
          toolCall: {
            ...toolCall,
            toolName,
          },
          createdAt: readNow(),
        });
      }
      return blocked;
    }

    const startedAt = readNow();
    const args = isPlainObject(opts.arguments)
      ? opts.arguments
      : (isPlainObject(opts.args) ? opts.args : (isPlainObject(toolCall.arguments) ? toolCall.arguments : {}));
    const normalizedToolCall = {
      id: trim(opts.toolCallId || toolCall.id || toolCall.toolCallId, `experiment:${toolName}:${Number(now?.() || Date.now())}`),
      ...toolCall,
      toolName,
      arguments: args,
      provider: trim(opts.provider || toolCall.provider, provider),
      model: trim(opts.model || toolCall.model, model),
      sessionId: trim(opts.sessionId || toolCall.sessionId, sessionId),
    };
    const permissionStrategy = buildProviderToolPermissionStrategySummary(buildProviderToolPermissionInteraction({}, {
      sessionId: normalizedToolCall.sessionId,
      sessionGate: opts.sessionGate,
      promptPermission: opts.promptPermission === true,
      source: opts.source || 'provider-tool-experiment',
      timeoutMs: opts.permissionTimeoutMs,
    }));
    const result = await providerToolCallRuntime.executeToolCall(normalizedToolCall, {
      provider: normalizedToolCall.provider,
      model: normalizedToolCall.model,
      sessionId: normalizedToolCall.sessionId,
      source: opts.source || normalizedToolCall.source || 'provider-tool-experiment',
      requestId: opts.requestId || opts.streamId || opts.generationId,
      promptPermission: opts.promptPermission === true,
      permissionTimeoutMs: opts.permissionTimeoutMs,
      providerToolSessionGate: opts.sessionGate,
      requestPermission: buildPermissionRequester(opts, normalizedToolCall),
    });
    const completed = {
      ...result,
      experiment: getStatus(),
      explicitEnabled,
      permissionStrategy,
    };
    if (shouldRecord) {
      recordDiagnostics({
        kind: 'tool_call',
        ...completed,
        toolCall: normalizedToolCall,
          provider: normalizedToolCall.provider,
          model: normalizedToolCall.model,
          sessionId: normalizedToolCall.sessionId,
          permissionStrategy,
          createdAt: startedAt,
          updatedAt: readNow(),
        });
    }
    return completed;
  };

  const runStreamDeltas = async (events = [], options = {}) => {
    const opts = isPlainObject(options) ? options : {};
    const explicitEnabled = opts.enabled === true || opts.experimentEnabled === true;
    if (!enabled && !explicitEnabled) {
      const disabled = {
        ok: false,
        status: 'disabled',
        reason: 'provider tool experiment is disabled',
        deltas: [],
        completedToolCalls: [],
        results: [],
        continuation: buildProviderToolLoopContinuation('disabled'),
        experiment: getStatus(),
      };
      recordDiagnostics({
        kind: 'stream_delta',
        ...disabled,
        explicitEnabled,
        createdAt: readNow(),
      });
      return disabled;
    }
    const startedAt = readNow();
    const legacyRunnerRequested = opts.runnerFacadeEnabled === true || opts.enableProviderRunner === true;
    const providerRunner = resolveInjectedProviderRunner(opts, now);
    const runnerModePlan = resolveProviderToolRunnerModePlan({
      runnerMode: opts.runnerMode || opts.providerRunnerMode || (legacyRunnerRequested ? 'real_runner' : ''),
      providerRunner,
      allowRealRunner: opts.allowRealRunner === true || legacyRunnerRequested,
      allowRunnerNetwork: opts.allowRunnerNetwork === true,
    });
    const realRunnerDebug = buildRealRunnerDebugSafety({
      opts,
      runnerModePlan,
      providerRunner,
      allowedTools: allowlist,
      explicitEnabled,
      experimentEnabled: enabled,
    });
    const permissionStrategy = buildProviderToolPermissionStrategySummary(buildProviderToolPermissionInteraction({}, {
      sessionId: trim(opts.sessionId, sessionId),
      sessionGate: opts.sessionGate,
      promptPermission: opts.promptPermission === true,
      source: opts.source || 'provider-tool-experiment',
      timeoutMs: opts.permissionTimeoutMs,
    }));
    const completed = await runProviderToolLoopController({
      events,
      enabled: true,
      provider: trim(opts.provider, provider),
      model: trim(opts.model, model),
      sessionId: trim(opts.sessionId, sessionId),
      now,
      runnerFacadeEnabled: runnerModePlan.runnerFacadeEnabled === true,
      providerRunner: runnerModePlan.providerRunner || null,
      allowRunnerNetwork: runnerModePlan.allowRunnerNetwork === true,
      runnerModePlan: runnerModePlan.diagnostics,
      executeToolCall: toolCall => run({
        ...opts,
        enabled: true,
        toolCall,
        toolName: toolCall.toolName,
        arguments: toolCall.arguments,
        skipDiagnostics: true,
      }),
    });
    completed.experiment = getStatus();
    completed.explicitEnabled = explicitEnabled;
    recordDiagnostics({
      kind: 'stream_delta',
      ...completed,
      provider: trim(opts.provider, provider),
      model: trim(opts.model, model),
      sessionId: trim(opts.sessionId, sessionId),
      realRunnerDebug,
      permissionStrategy,
      createdAt: startedAt,
      updatedAt: readNow(),
    });
    completed.realRunnerDebug = realRunnerDebug;
    completed.permissionStrategy = permissionStrategy;
    return completed;
  };

  const resolveCaptureKey = (opts = {}) => trim(
    opts.requestId || opts.streamId || opts.generationId,
    [
      trim(opts.provider, provider),
      trim(opts.model, model),
      trim(opts.sessionId, sessionId),
      'default',
    ].join(':'),
  );

  const captureStreamDeltas = (events = [], options = {}) => {
    const opts = isPlainObject(options) ? options : {};
    const key = resolveCaptureKey(opts);
    const current = captureStates.get(key) || {
      accumulator: createProviderToolCallDeltaAccumulator({
        provider: trim(opts.provider, provider),
        model: trim(opts.model, model),
        now,
      }),
      deltas: [],
      createdAt: readNow(),
    };
    captureStates.set(key, current);

    const list = Array.isArray(events) ? events : [events];
    const completedToolCalls = [];
    list.forEach((event) => {
      const next = current.accumulator.push(event, {
        provider: trim(opts.provider, provider),
        model: trim(opts.model, model),
      });
      current.deltas.push(...next.deltas);
      completedToolCalls.push(...next.completed);
    });

    if (!current.deltas.length && !completedToolCalls.length) {
      return {
        ok: true,
        status: 'no_tool_calls',
        deltas: [],
        completedToolCalls: [],
        experiment: getStatus(),
      };
    }
    if (!completedToolCalls.length) {
      return {
        ok: true,
        status: 'capturing',
        deltas: current.deltas.slice(),
        completedToolCalls: [],
        experiment: getStatus(),
      };
    }

    const completed = {
      ok: true,
      status: 'captured',
      deltas: current.deltas.slice(),
      completedToolCalls,
      results: [],
      experiment: getStatus(),
      explicitEnabled: false,
    };
    recordDiagnostics({
      kind: 'stream_delta_capture',
      ...completed,
      provider: trim(opts.provider, provider),
      model: trim(opts.model, model),
      sessionId: trim(opts.sessionId, sessionId),
      createdAt: current.createdAt,
      updatedAt: readNow(),
    });
    captureStates.delete(key);
    return completed;
  };

  return {
    clearDiagnostics: () => {
      diagnostics.length = 0;
      captureStates.clear();
      return [];
    },
    captureStreamDeltas,
    getDiagnostics: (options = {}) => {
      const limit = Math.max(0, Math.trunc(Number(options?.limit || diagnostics.length)) || diagnostics.length);
      return {
        status: getStatus(),
        history: diagnostics.slice(0, limit).map(clone),
      };
    },
    getStatus,
    run,
    runStreamDeltas,
    setEnabled,
  };
};
