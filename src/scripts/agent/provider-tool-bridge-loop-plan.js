export const PROVIDER_TOOL_BRIDGE_LOOP_MODES = Object.freeze({
  disabled: 'disabled',
  readOnlyCapture: 'read_only_capture',
});

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const resolveCaptureAction = (debugUiRegistry = null) => {
  const action = debugUiRegistry?.actions?.captureProviderToolCallDeltas;
  return typeof action === 'function' ? action : null;
};

export const buildProviderToolBridgeLoopPlan = ({
  debugUiRegistry = null,
  provider = '',
  model = '',
  sessionId = '',
  requestId = '',
  source = 'bridge.generateStream',
  onCaptureError = null,
} = {}) => {
  const captureProviderToolCallDeltas = resolveCaptureAction(debugUiRegistry);
  const providerName = trim(provider);
  const modelName = trim(model);
  const normalizedSessionId = trim(sessionId);
  const normalizedRequestId = trim(requestId);
  const normalizedSource = trim(source, 'bridge.generateStream');
  const diagnostics = {
    mode: captureProviderToolCallDeltas
      ? PROVIDER_TOOL_BRIDGE_LOOP_MODES.readOnlyCapture
      : PROVIDER_TOOL_BRIDGE_LOOP_MODES.disabled,
    provider: providerName,
    model: modelName,
    sessionId: normalizedSessionId,
    requestId: normalizedRequestId,
    source: normalizedSource,
    network: false,
    writesChat: false,
    executesTools: false,
    runsProvider: false,
    continuationStrategy: 'none',
  };

  if (!captureProviderToolCallDeltas) {
    return {
      enabled: false,
      mode: diagnostics.mode,
      diagnostics,
      requestOptions: {},
      handleProviderToolCallDelta: null,
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
