import { createProviderToolCallDeltaAccumulator } from '../../agent/provider-tool-call-delta-adapter.js';
import {
  extractProviderWebSources,
  mergeWebSources,
} from '../../api/web-search-runtime.js';

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const toCount = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? Math.trunc(numeric) : null;
};

const sumCounts = (items, key) => {
  const values = items.map(item => toCount(item?.[key])).filter(value => value !== null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
};

const makeAbortError = () => {
  const error = new Error('Web search aborted');
  error.name = 'AbortError';
  return error;
};

const assertNotAborted = (signal) => {
  if (signal?.aborted) throw makeAbortError();
};

const notifyStatus = (options, state, message) => {
  try {
    options?.onWebSearchStatus?.({ state, message, execution: 'provider_native', provider: 'kimi' });
  } catch {}
};

const captureAssistantPayload = (capture, data) => {
  const choice = Array.isArray(data?.choices) ? data.choices[0] : null;
  const message = choice?.message && typeof choice.message === 'object' ? choice.message : null;
  const delta = choice?.delta && typeof choice.delta === 'object' ? choice.delta : null;
  if (message && Object.prototype.hasOwnProperty.call(message, 'content')) {
    capture.content = message.content;
  } else if (typeof delta?.content === 'string') {
    capture.content = `${typeof capture.content === 'string' ? capture.content : ''}${delta.content}`;
  }
  const reasoning = message?.reasoning_content ?? delta?.reasoning_content;
  if (reasoning !== undefined) {
    capture.reasoningContent = message
      ? reasoning
      : `${typeof capture.reasoningContent === 'string' ? capture.reasoningContent : ''}${String(reasoning)}`;
  }
};

const rawArgumentsFor = (call = {}) => {
  const streamed = String(call?.metadata?.streamingArgumentsText || '');
  if (streamed) return streamed;
  try {
    return JSON.stringify(call?.arguments && typeof call.arguments === 'object' ? call.arguments : {});
  } catch {
    return '{}';
  }
};

const parseArguments = (call = {}) => {
  try {
    const parsed = JSON.parse(rawArgumentsFor(call));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return call?.arguments && typeof call.arguments === 'object' ? call.arguments : {};
  }
};

const readSearchTokens = (call = {}) => {
  const args = parseArguments(call);
  return toCount(
    args?.usage?.total_tokens
    ?? args?.usage?.search_tokens
    ?? args?.usage?.web_search_tokens
    ?? args?.web_search_tokens,
  );
};

const buildContinuationMessages = (calls = [], assistantCapture = {}) => {
  const assistant = {
    role: 'assistant',
    content: assistantCapture.content ?? '',
    tool_calls: calls.map(call => ({
      id: trim(call?.toolCallId || call?.id),
      type: 'function',
      function: {
        name: '$web_search',
        arguments: rawArgumentsFor(call),
      },
    })),
  };
  if (assistantCapture.reasoningContent !== undefined) {
    assistant.reasoning_content = assistantCapture.reasoningContent;
  }
  return [
    assistant,
    ...calls.map(call => ({
      role: 'tool',
      tool_call_id: trim(call?.toolCallId || call?.id),
      name: '$web_search',
      content: rawArgumentsFor(call),
    })),
  ];
};

const reportUsage = (options, reports, {
  provider = 'kimi',
  model = '',
  searchRequests = 0,
  searchTokens = 0,
} = {}) => {
  if (!reports.length || typeof options?.onProviderUsage !== 'function') return;
  const last = reports.at(-1) || {};
  try {
    options.onProviderUsage({
      provider: trim(last.provider, provider),
      model: trim(last.model, model),
      finishReason: trim(last.finishReason),
      promptTokens: sumCounts(reports, 'promptTokens'),
      completionTokens: sumCounts(reports, 'completionTokens'),
      totalTokens: sumCounts(reports, 'totalTokens'),
      requestCount: reports.length,
      webSearch: true,
      webSearchRequests: searchRequests,
      webSearchTokens: searchTokens,
    });
  } catch {}
};

const reportCallSources = (options, calls = [], reportedUrls = new Set()) => {
  if (typeof options?.onProviderSources !== 'function') return;
  const payload = {
    choices: [{
      message: {
        tool_calls: calls.map(call => ({
          function: { name: '$web_search', arguments: rawArgumentsFor(call) },
        })),
      },
    }],
  };
  const sources = extractProviderWebSources(payload, { provider: 'kimi' })
    .filter(source => !reportedUrls.has(source.url));
  sources.forEach(source => reportedUrls.add(source.url));
  if (!sources.length) return;
  try {
    options.onProviderSources(mergeWebSources(sources), {
      provider: 'kimi',
      execution: 'provider_native',
    });
  } catch {}
};

const withoutStatusCallback = (options = {}) => {
  const {
    onWebSearchStatus: _status,
    onProviderSearchActivity: _activity,
    ...rest
  } = options || {};
  return rest;
};

const createTurnOptions = ({
  options,
  provider,
  model,
  calls,
  usageReports,
  assistantCapture,
  onSearchDetected,
} = {}) => {
  const accumulator = createProviderToolCallDeltaAccumulator({ provider, model });
  const originalDelta = options?.onProviderToolCallDelta;
  const providerOptions = withoutStatusCallback(options);
  return {
    ...providerOptions,
    onProviderUsage: usage => {
      if (usage && typeof usage === 'object') usageReports.push(usage);
    },
    onProviderToolCallDelta: (data, meta = {}) => {
      captureAssistantPayload(assistantCapture, data);
      try { originalDelta?.(data, meta); } catch {}
      const activity = accumulator.push(data, {
        provider: trim(meta?.provider, provider),
        model: trim(meta?.model, model),
      });
      const relevantDeltas = [...(activity?.deltas || []), ...(activity?.completed || [])]
        .filter(call => trim(call?.toolName) === '$web_search');
      if (relevantDeltas.length) {
        try { onSearchDetected?.(); } catch {}
      }
      (activity?.completed || [])
        .filter(call => trim(call?.toolName) === '$web_search')
        .forEach(call => calls.push(call));
    },
  };
};

export const createKimiNativeWebSearchClient = ({
  client = null,
  provider = 'kimi',
  model = '',
  maxContinuationTurns = 3,
} = {}) => {
  if (!client) return client;
  const limit = Math.max(1, Math.trunc(Number(maxContinuationTurns)) || 3);

  const finishUsage = (options, usageReports, state) => reportUsage(options, usageReports, {
    provider,
    model,
    searchRequests: state.searchRequests,
    searchTokens: state.searchTokens,
  });

  return {
    prepareChatRequest(messages, options = {}) {
      return client.prepareChatRequest?.(messages, withoutStatusCallback(options)) || null;
    },

    async chat(messages, options = {}) {
      const usageReports = [];
      const reportedUrls = new Set();
      const seenCallIds = new Set();
      const state = { searchRequests: 0, searchTokens: 0 };
      let continuationTurns = 0;
      let currentMessages = Array.isArray(messages) ? messages : [];
      try {
        while (true) {
          assertNotAborted(options.signal);
          const calls = [];
          const assistantCapture = {};
          const turnOptions = createTurnOptions({
            options,
            provider,
            model,
            calls,
            usageReports,
            assistantCapture,
          });
          const response = await client.chat(currentMessages, turnOptions);
          if (!calls.length) {
            finishUsage(options, usageReports, state);
            if (state.searchRequests) notifyStatus(options, 'done', '原生联网搜索完成');
            return response;
          }
          if (continuationTurns >= limit) {
            throw new Error(`Kimi native web search exceeded ${limit} continuation turns`);
          }
          for (const call of calls) {
            const callId = trim(call?.toolCallId || call?.id);
            if (seenCallIds.has(callId)) throw new Error('Kimi native web search repeated a tool call');
            seenCallIds.add(callId);
            state.searchRequests += 1;
            state.searchTokens += readSearchTokens(call) || 0;
          }
          notifyStatus(options, 'searching', '正在由 Kimi 原生联网搜索…');
          reportCallSources(options, calls, reportedUrls);
          currentMessages = [...currentMessages, ...buildContinuationMessages(calls, assistantCapture)];
          continuationTurns += 1;
          notifyStatus(options, 'continuing', 'Kimi 已取得网页资料，正在整理回答…');
        }
      } catch (error) {
        notifyStatus(options, options.signal?.aborted ? 'cancelled' : 'failed', 'Kimi 原生联网搜索未完成');
        throw error;
      }
    },

    async *streamChat(messages, options = {}) {
      const usageReports = [];
      const reportedUrls = new Set();
      const seenCallIds = new Set();
      const state = { searchRequests: 0, searchTokens: 0 };
      let continuationTurns = 0;
      let currentMessages = Array.isArray(messages) ? messages : [];
      try {
        while (true) {
          assertNotAborted(options.signal);
          const calls = [];
          const assistantCapture = {};
          let searchDetected = false;
          const turnOptions = createTurnOptions({
            options,
            provider,
            model,
            calls,
            usageReports,
            assistantCapture,
            onSearchDetected: () => { searchDetected = true; },
          });
          const buffered = [];
          for await (const chunk of client.streamChat(currentMessages, turnOptions)) {
            if (searchDetected) buffered.push(chunk);
            else yield chunk;
          }
          if (!calls.length) {
            for (const chunk of buffered) yield chunk;
            finishUsage(options, usageReports, state);
            if (state.searchRequests) notifyStatus(options, 'done', '原生联网搜索完成');
            return;
          }
          if (continuationTurns >= limit) {
            throw new Error(`Kimi native web search exceeded ${limit} continuation turns`);
          }
          for (const call of calls) {
            const callId = trim(call?.toolCallId || call?.id);
            if (seenCallIds.has(callId)) throw new Error('Kimi native web search repeated a tool call');
            seenCallIds.add(callId);
            state.searchRequests += 1;
            state.searchTokens += readSearchTokens(call) || 0;
          }
          notifyStatus(options, 'searching', '正在由 Kimi 原生联网搜索…');
          reportCallSources(options, calls, reportedUrls);
          currentMessages = [...currentMessages, ...buildContinuationMessages(calls, assistantCapture)];
          continuationTurns += 1;
          notifyStatus(options, 'continuing', 'Kimi 已取得网页资料，正在整理回答…');
        }
      } catch (error) {
        notifyStatus(options, options.signal?.aborted ? 'cancelled' : 'failed', 'Kimi 原生联网搜索未完成');
        throw error;
      }
    },
  };
};
