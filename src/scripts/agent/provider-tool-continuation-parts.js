import { normalizeAgentMessagePart } from './agent-message-parts.js';

export const PROVIDER_TOOL_CONTINUATION_PART_TYPES = Object.freeze({
  streamEvents: 'provider_stream_events',
});

const isPlainObject = value => Boolean(value && typeof value === 'object' && !Array.isArray(value));

const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const readTimestamp = (now = Date.now) => Number(now?.() || Date.now()) || Date.now();

const truncate = (value = '', limit = 160) => {
  const text = String(value ?? '');
  const max = Math.max(0, Math.trunc(Number(limit)) || 0);
  if (!max || text.length <= max) return text;
  return `${text.slice(0, max)}...`;
};

const normalizeEvent = (event = {}) => {
  const src = isPlainObject(event) ? event : {};
  return {
    type: trim(src.type, 'provider_stream_event'),
    index: Number.isFinite(Number(src.index)) ? Number(src.index) : 0,
    textDelta: src.type === 'provider_stream_delta' ? String(src.textDelta || '') : '',
    accumulatedText: src.type === 'provider_stream_delta' ? truncate(src.accumulatedText || '', 240) : '',
    finalText: src.type === 'provider_stream_end' ? truncate(src.finalText || '', 240) : '',
    finishReason: src.type === 'provider_stream_end' ? trim(src.finishReason, 'stop') : '',
    createdAt: Number(src.createdAt || 0) || 0,
  };
};

const summarizeEvents = (events = []) => {
  const list = (Array.isArray(events) ? events : []).map(normalizeEvent);
  const end = list.slice().reverse().find(event => event.type === 'provider_stream_end');
  const lastDelta = list.slice().reverse().find(event => event.type === 'provider_stream_delta');
  return {
    events: list,
    eventTypes: list.map(event => event.type),
    finalText: end?.finalText || lastDelta?.accumulatedText || '',
    finishReason: trim(end?.finishReason),
  };
};

export const buildProviderStreamEventsMessagePart = ({
  pending = null,
  runnerFacade = null,
  requestPreview = null,
  runnerRequestDraft = null,
  now = Date.now,
} = {}) => {
  const facade = isPlainObject(runnerFacade) ? runnerFacade : {};
  const sourceEvents = Array.isArray(facade.events) ? facade.events : [];
  if (!sourceEvents.length) return null;
  const pendingId = trim(pending?.id || pending?.pendingPermissionId);
  const provider = trim(facade.provider || requestPreview?.provider || pending?.toolCall?.provider);
  const model = trim(facade.model || requestPreview?.model || pending?.toolCall?.model);
  const sessionId = trim(facade.sessionId || requestPreview?.sessionId || pending?.sessionId);
  const createdAt = Number(facade.createdAt || readTimestamp(now)) || readTimestamp(now);
  const updatedAt = Number(facade.updatedAt || createdAt) || createdAt;
  const { events, eventTypes, finalText, finishReason } = summarizeEvents(sourceEvents);
  const status = facade.ok === true
    ? 'succeeded'
    : (trim(facade.status) === 'blocked' || trim(facade.status) === 'failed' ? 'failed' : trim(facade.status, 'running'));
  return normalizeAgentMessagePart({
    id: `provider-stream-events:${pendingId || sessionId || 'session'}:${updatedAt}`,
    type: PROVIDER_TOOL_CONTINUATION_PART_TYPES.streamEvents,
    status,
    title: 'Provider continuation',
    summary: finalText
      ? `provider streamed ${events.length} event(s): ${truncate(finalText, 120)}`
      : `provider streamed ${events.length} event(s)`,
    source: 'provider-tool-pending-continuation',
    kind: PROVIDER_TOOL_CONTINUATION_PART_TYPES.streamEvents,
    createdAt,
    updatedAt,
    metadata: {
      provider,
      model,
      sessionId,
      pendingPermissionId: pendingId,
      output: trim(facade.output, 'provider_stream_events'),
      eventCount: events.length,
      eventTypes,
      finalText,
      finishReason,
      network: facade.network === true,
      writesChat: facade.writesChat === true,
      requestPreviewFormat: trim(requestPreview?.format || runnerRequestDraft?.requestPreviewFormat),
      payloadKind: trim(runnerRequestDraft?.payloadKind),
      runner: trim(runnerRequestDraft?.runner || facade.runner),
      events,
    },
    errorMessage: trim(facade.reason || facade.errorMessage),
  });
};

export const buildProviderStreamEventsMessageParts = (options = {}) => {
  const part = buildProviderStreamEventsMessagePart(options);
  return part ? [part] : [];
};
