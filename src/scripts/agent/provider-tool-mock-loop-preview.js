import { PROVIDER_TOOL_RESULT_PREVIEW_FORMATS } from './provider-tool-result-request-preview.js';

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const parseJson = (value, fallback = null) => {
  try {
    return JSON.parse(String(value ?? ''));
  } catch {
    return fallback;
  }
};

const collectOpenAIToolSummaries = (requestPreview = {}) => {
  const messages = Array.isArray(requestPreview?.messages) ? requestPreview.messages : [];
  const assistantToolCalls = Array.isArray(messages[0]?.tool_calls) ? messages[0].tool_calls : [];
  const toolMessages = messages.filter(message => message?.role === 'tool');
  return toolMessages.map((message, index) => {
    const parsed = parseJson(message.content, {});
    const call = assistantToolCalls[index] || {};
    const name = trim(call.function?.name || parsed?.toolName, 'tool');
    const summary = trim(parsed?.summary || parsed?.error || parsed?.status, 'tool result ready');
    return { name, summary };
  });
};

export const buildProviderToolMockLoopPreview = ({
  requestPreview = null,
  assistantText = '',
} = {}) => {
  if (!isPlainObject(requestPreview)) {
    return {
      ok: false,
      status: 'skipped',
      reason: 'request preview missing',
      network: false,
    };
  }
  if (requestPreview.network === true) {
    return {
      ok: false,
      status: 'blocked',
      reason: 'mock loop refuses network previews',
      network: false,
    };
  }
  if (!requestPreview.toolResultCount) {
    return {
      ok: false,
      status: 'skipped',
      reason: 'no model-safe tool results to continue',
      network: false,
      requestPreview,
    };
  }
  if (requestPreview.format !== PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.openai) {
    return {
      ok: false,
      status: 'unsupported',
      reason: `mock loop only supports ${PROVIDER_TOOL_RESULT_PREVIEW_FORMATS.openai}`,
      network: false,
      requestPreview,
    };
  }

  const summaries = collectOpenAIToolSummaries(requestPreview);
  const summaryText = summaries
    .map(item => `${item.name}: ${item.summary}`)
    .join('; ');
  return {
    ok: true,
    status: 'preview_ready',
    provider: 'openai',
    network: false,
    requestPreview,
    assistantPreview: {
      role: 'assistant',
      content: trim(assistantText, `Mock continuation after tool result: ${summaryText || 'tool result ready'}`),
    },
  };
};
