import { PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS } from './provider-tool-runner-handoff.js';
import { PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS } from './provider-tool-runner-request-draft.js';

export const PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS = Object.freeze({
  openai: 'openai_chat_completions',
  anthropic: 'anthropic_messages',
  gemini: 'gemini_contents',
  generic: 'generic_tool_results',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

const normalizeProvider = (provider = '', format = '') => {
  const value = trim(provider).toLowerCase();
  const fmt = trim(format).toLowerCase();
  if (value.includes('anthropic') || value.includes('claude') || fmt.includes('anthropic')) return 'anthropic';
  if (value.includes('gemini') || value.includes('maker') || value.includes('vertex') || fmt.includes('gemini')) return 'gemini';
  if (value.includes('openai') || value.includes('deepseek') || value.includes('custom') || fmt.includes('openai')) return 'openai';
  return value || 'generic';
};

const getPayloadCount = (draft = {}) => {
  if (Array.isArray(draft.request?.messages)) return draft.request.messages.length;
  if (Array.isArray(draft.request?.contents)) return draft.request.contents.length;
  if (Array.isArray(draft.request?.toolResults)) return draft.request.toolResults.length;
  return 0;
};

const resolveAdapter = (draft = {}) => {
  const provider = normalizeProvider(draft.provider || draft.request?.provider, draft.requestPreviewFormat || draft.request?.format);
  const payloadKind = trim(draft.payloadKind);
  if (provider === 'openai' && payloadKind === PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.messages && Array.isArray(draft.request?.messages)) {
    return PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.openai;
  }
  if (provider === 'anthropic' && payloadKind === PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.messages && Array.isArray(draft.request?.messages)) {
    return PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.anthropic;
  }
  if (provider === 'gemini' && payloadKind === PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.contents && Array.isArray(draft.request?.contents)) {
    return PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.gemini;
  }
  if (payloadKind === PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.toolResults && Array.isArray(draft.request?.toolResults)) {
    return PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.generic;
  }
  return '';
};

const buildFinalText = (draft = {}, adapter = '') => {
  const provider = trim(draft.provider || draft.request?.provider, 'provider');
  const payloadCount = getPayloadCount(draft);
  const toolResultCount = Number(draft.toolResultCount || 0) || 0;
  return `contract fixture ${adapter || 'unsupported'} handled ${provider} payload=${trim(draft.payloadKind, '-')} items=${payloadCount} toolResults=${toolResultCount}`;
};

export const runProviderToolRunnerContractFixture = async (runnerRequestDraft = {}, {
  now = Date.now,
} = {}) => {
  const draft = isPlainObject(runnerRequestDraft) ? runnerRequestDraft : {};
  const createdAt = readTimestamp(now);
  const provider = trim(draft.provider || draft.request?.provider);
  const model = trim(draft.model || draft.request?.model);
  const sessionId = trim(draft.sessionId || draft.request?.sessionId);
  const adapter = resolveAdapter(draft);

  if (!adapter) {
    return {
      ok: false,
      status: 'unsupported',
      reason: `unsupported provider runner contract payload: ${trim(draft.payloadKind, '-')}`,
      output: PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents,
      provider,
      model,
      sessionId,
      network: false,
      writesChat: false,
      events: [],
      eventCount: 0,
      finalText: '',
      createdAt,
      updatedAt: createdAt,
    };
  }

  const finalText = buildFinalText(draft, adapter);
  const events = [
    {
      type: 'provider_stream_start',
      provider,
      model,
      sessionId,
      adapter,
      createdAt,
    },
    {
      type: 'provider_stream_delta',
      provider,
      model,
      sessionId,
      adapter,
      textDelta: finalText,
      accumulatedText: finalText,
      createdAt: readTimestamp(now),
    },
    {
      type: 'provider_stream_end',
      provider,
      model,
      sessionId,
      adapter,
      finishReason: 'stop',
      finalText,
      createdAt: readTimestamp(now),
    },
  ];

  return {
    ok: true,
    status: 'succeeded',
    reason: '',
    adapter,
    output: PROVIDER_TOOL_RUNNER_HANDOFF_OUTPUTS.providerStreamEvents,
    provider,
    model,
    sessionId,
    payloadKind: trim(draft.payloadKind),
    requestPreviewFormat: trim(draft.requestPreviewFormat || draft.request?.format),
    payloadCount: getPayloadCount(draft),
    toolResultCount: Number(draft.toolResultCount || 0) || 0,
    network: false,
    writesChat: false,
    events,
    eventCount: events.length,
    finalText,
    createdAt,
    updatedAt: readTimestamp(now),
  };
};
