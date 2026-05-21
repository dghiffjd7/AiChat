import { PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS } from './provider-tool-runner-handoff.js';

export const PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS = Object.freeze({
  messages: 'messages',
  contents: 'contents',
  toolResults: 'tool_results',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

const clone = (value) => {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return Array.isArray(value) ? value.slice() : { ...value };
  }
};

const buildPayloadDraft = (requestPreview = {}) => {
  if (Array.isArray(requestPreview.messages) && requestPreview.messages.length) {
    return {
      payloadKind: PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.messages,
      payloadCount: requestPreview.messages.length,
      request: {
        messages: clone(requestPreview.messages),
      },
    };
  }
  if (Array.isArray(requestPreview.contents) && requestPreview.contents.length) {
    return {
      payloadKind: PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.contents,
      payloadCount: requestPreview.contents.length,
      request: {
        contents: clone(requestPreview.contents),
      },
    };
  }
  if (Array.isArray(requestPreview.toolResults) && requestPreview.toolResults.length) {
    return {
      payloadKind: PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.toolResults,
      payloadCount: requestPreview.toolResults.length,
      request: {
        toolResults: clone(requestPreview.toolResults),
      },
    };
  }
  return null;
};

export const buildProviderToolRunnerRequestDraft = ({
  runnerHandoff = null,
  requestPreview = null,
  loopState = null,
  runner = 'real_provider_runner_draft',
  writesChat = false,
  now = Date.now,
} = {}) => {
  const handoff = isPlainObject(runnerHandoff) ? runnerHandoff : null;
  const request = isPlainObject(requestPreview) ? requestPreview : null;
  const state = isPlainObject(loopState) ? loopState : null;
  const createdAt = readTimestamp(now);
  const base = {
    runner: trim(runner, 'real_provider_runner_draft'),
    network: false,
    writesChat: writesChat === true,
    inputKeys: ['requestPreview', 'loopState'],
    output: PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents,
    createdAt,
    updatedAt: createdAt,
  };

  if (!handoff) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'runner handoff missing',
    };
  }
  if (handoff.ok !== true) {
    return {
      ...base,
      ok: false,
      status: trim(handoff.status, 'skipped'),
      reason: trim(handoff.reason, 'runner handoff is not ready'),
      provider: trim(handoff.provider),
      model: trim(handoff.model),
      sessionId: trim(handoff.sessionId),
    };
  }
  if (trim(handoff.output) !== PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason: 'runner handoff output is not provider stream events',
      provider: trim(handoff.provider),
      model: trim(handoff.model),
      sessionId: trim(handoff.sessionId),
    };
  }
  if (handoff.network === true || request?.network === true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason: 'runner request draft must not perform network work',
      provider: trim(handoff.provider || request?.provider),
      model: trim(handoff.model || request?.model),
      sessionId: trim(handoff.sessionId || request?.sessionId),
    };
  }
  if (handoff.writesChat === true || writesChat === true) {
    return {
      ...base,
      ok: false,
      status: 'blocked',
      reason: 'runner request draft must not write chat messages directly',
      provider: trim(handoff.provider || request?.provider),
      model: trim(handoff.model || request?.model),
      sessionId: trim(handoff.sessionId || request?.sessionId),
    };
  }
  if (!request) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'request preview missing',
      provider: trim(handoff.provider),
      model: trim(handoff.model),
      sessionId: trim(handoff.sessionId),
    };
  }
  if (!state) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'loop state missing',
      provider: trim(handoff.provider || request.provider),
      model: trim(handoff.model || request.model),
      sessionId: trim(handoff.sessionId || request.sessionId),
      requestPreviewFormat: trim(request.format),
    };
  }

  const payload = buildPayloadDraft(request);
  if (!payload) {
    return {
      ...base,
      ok: false,
      status: 'skipped',
      reason: 'request preview has no provider runner payload',
      provider: trim(handoff.provider || request.provider || state.provider),
      model: trim(handoff.model || request.model || state.model),
      sessionId: trim(handoff.sessionId || request.sessionId || state.sessionId),
      requestPreviewFormat: trim(request.format),
    };
  }

  const provider = trim(handoff.provider || request.provider || state.provider);
  const model = trim(handoff.model || request.model || state.model);
  const sessionId = trim(handoff.sessionId || request.sessionId || state.sessionId);
  return {
    ...base,
    ok: true,
    status: 'ready',
    reason: '',
    provider,
    model,
    sessionId,
    requestPreviewFormat: trim(request.format),
    payloadKind: payload.payloadKind,
    payloadCount: payload.payloadCount,
    toolResultCount: Number(request.toolResultCount || handoff.toolResultCount || 0) || 0,
    loopStateStatus: trim(state.status),
    loopStatePhase: trim(state.phase),
    shouldContinue: state.shouldContinue === true,
    request: {
      provider,
      model,
      sessionId,
      format: trim(request.format),
      ...payload.request,
    },
    updatedAt: readTimestamp(now),
  };
};
