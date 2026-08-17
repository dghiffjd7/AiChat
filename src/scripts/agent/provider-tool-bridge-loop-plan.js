import { createProviderToolCallDeltaAccumulator } from './provider-tool-call-delta-adapter.js';
import {
  buildProviderToolPermissionInteraction,
  buildProviderToolPermissionStrategySummary,
} from './provider-tool-permission-interaction.js';

export const PROVIDER_TOOL_BRIDGE_LOOP_MODES = Object.freeze({
  disabled: 'disabled',
  readOnlyCapture: 'read_only_capture',
  executionLoop: 'execution_loop',
});

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const resolveCaptureAction = (debugUiRegistry = null) => {
  const action = debugUiRegistry?.actions?.captureProviderToolCallDeltas;
  return typeof action === 'function' ? action : null;
};

const resolveExecutionAction = (debugUiRegistry = null) => {
  const action = debugUiRegistry?.actions?.runProviderToolExecutionLoopFixture;
  return typeof action === 'function' ? action : null;
};

const resolveExperimentStatus = (debugUiRegistry = null) => {
  const action = debugUiRegistry?.actions?.getProviderToolExperimentStatus;
  if (typeof action !== 'function') return null;
  try {
    const status = action();
    return isPlainObject(status) ? status : null;
  } catch {
    return null;
  }
};

const resolveSessionGate = (debugUiRegistry = null, {
  sessionId = '',
} = {}) => {
  const action = debugUiRegistry?.actions?.getProviderToolSessionGate;
  if (typeof action !== 'function') return null;
  try {
    const gate = action({ sessionId });
    return isPlainObject(gate) ? gate : null;
  } catch {
    return null;
  }
};

const buildDiagnostics = ({
  mode = PROVIDER_TOOL_BRIDGE_LOOP_MODES.disabled,
  providerName = '',
  modelName = '',
  sessionId = '',
  requestId = '',
  source = 'bridge.generateStream',
  experimentEnabled = false,
  sessionGate = null,
  permissionStrategy = null,
} = {}) => ({
  mode,
  provider: providerName,
  model: modelName,
  sessionId,
  requestId,
  source,
  network: false,
  writesChat: false,
  executesTools: mode === PROVIDER_TOOL_BRIDGE_LOOP_MODES.executionLoop,
  runsProvider: false,
  continuationStrategy: mode === PROVIDER_TOOL_BRIDGE_LOOP_MODES.executionLoop
    ? 'stop_after_tool_result'
    : 'none',
  experimentEnabled: experimentEnabled === true,
  sessionGateEnabled: sessionGate?.enabled === true,
  sessionGateSource: trim(sessionGate?.source),
  requiresSessionGate: mode !== PROVIDER_TOOL_BRIDGE_LOOP_MODES.disabled,
  requiresExperimentEnabled: false,
  permissionStrategy: permissionStrategy || buildProviderToolPermissionStrategySummary(buildProviderToolPermissionInteraction({}, {
    sessionId,
    sessionGate,
    promptPermission: false,
    source,
  })),
});

export const buildProviderToolBridgeLoopPlan = ({
  debugUiRegistry = null,
  provider = '',
  model = '',
  sessionId = '',
  requestId = '',
  source = 'bridge.generateStream',
  historyMessages = [],
  providerRequestOptions = {},
  onCaptureError = null,
} = {}) => {
  const captureProviderToolCallDeltas = resolveCaptureAction(debugUiRegistry);
  const runProviderToolExecutionLoopFixture = resolveExecutionAction(debugUiRegistry);
  const experimentStatus = resolveExperimentStatus(debugUiRegistry);
  const experimentEnabled = experimentStatus?.enabled === true;
  const providerName = trim(provider);
  const modelName = trim(model);
  const normalizedSessionId = trim(sessionId);
  const normalizedRequestId = trim(requestId);
  const normalizedSource = trim(source, 'bridge.generateStream');
  const sessionGate = resolveSessionGate(debugUiRegistry, { sessionId: normalizedSessionId });
  const sessionGateEnabled = sessionGate?.enabled === true;
  const permissionStrategy = buildProviderToolPermissionStrategySummary(buildProviderToolPermissionInteraction({}, {
    sessionId: normalizedSessionId,
    sessionGate,
    promptPermission: false,
    source: normalizedSource,
  }));
  const mode = sessionGateEnabled && runProviderToolExecutionLoopFixture
    ? PROVIDER_TOOL_BRIDGE_LOOP_MODES.executionLoop
    : (captureProviderToolCallDeltas
        ? PROVIDER_TOOL_BRIDGE_LOOP_MODES.readOnlyCapture
        : PROVIDER_TOOL_BRIDGE_LOOP_MODES.disabled);
  const providerContinuationContext = mode === PROVIDER_TOOL_BRIDGE_LOOP_MODES.executionLoop
    ? {
        historyMessages: Array.isArray(historyMessages) ? clone(historyMessages) : [],
        providerRequestOptions: isPlainObject(providerRequestOptions) ? clone(providerRequestOptions) : {},
      }
    : null;
  const diagnostics = buildDiagnostics({
    mode,
    providerName,
    modelName,
    sessionId: normalizedSessionId,
    requestId: normalizedRequestId,
    source: normalizedSource,
    experimentEnabled,
    sessionGate,
    permissionStrategy,
  });

  if (mode === PROVIDER_TOOL_BRIDGE_LOOP_MODES.disabled) {
    return {
      enabled: false,
      mode: diagnostics.mode,
      diagnostics,
      requestOptions: {},
      handleProviderToolCallDelta: null,
    };
  }

  if (mode === PROVIDER_TOOL_BRIDGE_LOOP_MODES.executionLoop) {
    const accumulator = createProviderToolCallDeltaAccumulator({
      provider: providerName,
      model: modelName,
    });
    let bufferedEvents = [];
    const handleProviderToolCallDelta = async (data, meta = {}) => {
      const currentProvider = trim(meta?.provider, providerName);
      const currentModel = trim(meta?.model, modelName);
      bufferedEvents.push(data);
      const next = accumulator.push(data, {
        provider: currentProvider,
        model: currentModel,
      });
      if (!next.completed.length) {
        return {
          ok: true,
          status: 'capturing',
          mode,
          completedToolCalls: 0,
          deltas: next.deltas,
        };
      }
      const events = bufferedEvents.slice();
      bufferedEvents = [];
      try {
        return await runProviderToolExecutionLoopFixture(events, {
          enabled: true,
          provider: currentProvider,
          model: currentModel,
          sessionId: normalizedSessionId,
          requestId: normalizedRequestId,
          source: normalizedSource,
          continuationStrategy: 'stop_after_tool_result',
          promptPermission: false,
          permissionStrategy: permissionStrategy.mode,
          permissionInteractionMode: permissionStrategy.mode,
          sessionGate,
          providerContinuationContext,
          runnerMode: 'read_only_capture',
          allowRunnerNetwork: false,
          allowRealRunner: false,
        });
      } catch (error) {
        if (typeof onCaptureError === 'function') {
          try {
            onCaptureError(error);
          } catch {}
        }
        return null;
      }
    };
    return {
      enabled: true,
      mode: diagnostics.mode,
      diagnostics,
      requestOptions: {
        onProviderToolCallDelta: handleProviderToolCallDelta,
      },
      handleProviderToolCallDelta,
    };
  }

  const handleProviderToolCallDelta = (data, meta = {}) => {
    try {
      return captureProviderToolCallDeltas([data], {
        provider: meta?.provider || providerName,
        model: meta?.model || modelName,
        sessionId: normalizedSessionId,
        requestId: normalizedRequestId,
        source: normalizedSource,
      });
    } catch (error) {
      if (typeof onCaptureError === 'function') {
        try {
          onCaptureError(error);
        } catch {}
      }
      return null;
    }
  };

  return {
    enabled: true,
    mode: diagnostics.mode,
    diagnostics,
    requestOptions: {
      onProviderToolCallDelta: handleProviderToolCallDelta,
    },
    handleProviderToolCallDelta,
  };
};
