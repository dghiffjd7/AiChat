const text = value => String(value ?? '');

const parseProtocolEvents = (candidateText, createParser) => {
  if (typeof createParser !== 'function') return { events: [], parser: null };
  const parser = createParser();
  const pushed = parser?.push?.(candidateText);
  const flushed = parser?.flush?.();
  return {
    events: [
      ...(Array.isArray(pushed) ? pushed : []),
      ...(Array.isArray(flushed) ? flushed : []),
    ],
    parser,
  };
};

const inspectProtocolParserCompletion = (parser) => {
  if (!parser || typeof parser !== 'object' || !('contentWrapper' in parser)) {
    return { ok: true };
  }
  const wrapper = text(parser.contentWrapper).trim().toLowerCase();
  const residue = text(parser.contentBuffer).trim();
  if (wrapper === 'miphone' && parser.ended !== true) {
    return { ok: false, reason: 'miphone_shell_unclosed' };
  }
  if (wrapper === 'content' && parser.inContent === true) {
    return { ok: false, reason: 'content_shell_unclosed' };
  }
  if (wrapper === 'implicit' && residue) {
    return { ok: false, reason: 'protocol_tail_unconsumed' };
  }
  return { ok: true };
};

const buildCandidates = (rawText, buildRetryCandidates) => {
  const raw = text(rawText);
  let retries = {};
  try {
    retries = typeof buildRetryCandidates === 'function'
      ? buildRetryCandidates(raw) || {}
      : {};
  } catch {}
  const candidates = [
    { source: 'raw', text: raw },
    { source: 'retry', text: text(retries.retryText) },
    { source: 'mi_phone', text: text(retries.miPhoneBlock) },
  ];
  const seen = new Set();
  return candidates.filter((candidate) => {
    if (!candidate.text.trim() || seen.has(candidate.text)) return false;
    seen.add(candidate.text);
    return true;
  });
};

const rollbackProtocolResponse = async ({
  capturedMessages = [],
  rollbackCaptured = null,
  rollbackTransaction = null,
} = {}) => {
  const errors = [];
  for (const [step, rollback] of [
    ['captured_messages', () => rollbackCaptured?.(capturedMessages)],
    ['transaction', () => rollbackTransaction?.()],
  ]) {
    try {
      await rollback();
    } catch (error) {
      errors.push({
        step,
        errorMessage: String(error?.message || error || ''),
      });
    }
  }
  return errors;
};

export const collectProtocolResponseStream = async ({
  stream = [],
  normalizeChunk = chunk => chunk,
  isInterrupted = () => false,
} = {}) => {
  let fullRaw = '';
  for await (const chunk of stream || []) {
    if (isInterrupted()) return { fullRaw, interrupted: true };
    const normalized = typeof normalizeChunk === 'function' ? normalizeChunk(chunk) : chunk;
    if (normalized?.content) fullRaw += normalized.content;
  }
  return {
    fullRaw,
    interrupted: Boolean(isInterrupted()),
  };
};

export const runProtocolResponseTransaction = async ({
  rawText = '',
  buildRetryCandidates = null,
  createParser = null,
  preflightEvent = null,
  beginTransaction = null,
  beforeDispatch = null,
  processEvent = null,
  afterDispatch = null,
  endTransaction = null,
  commitTransaction = null,
  rollbackTransaction = null,
  rollbackCaptured = null,
  onCommitted = null,
} = {}) => {
  let lastFailure = {
    reason: 'no_events',
    eventCount: 0,
    preflightResults: [],
    eventResults: [],
  };
  for (const candidate of buildCandidates(rawText, buildRetryCandidates)) {
    let events = [];
    let parserCompletion = { ok: true };
    try {
      const parsed = parseProtocolEvents(candidate.text, createParser);
      events = parsed.events;
      parserCompletion = inspectProtocolParserCompletion(parsed.parser);
    } catch (error) {
      lastFailure = {
        reason: 'protocol_parse_failed',
        errorMessage: String(error?.message || error || ''),
        eventCount: 0,
        preflightResults: [],
        eventResults: [],
      };
      continue;
    }
    if (parserCompletion.ok !== true) {
      lastFailure = {
        reason: 'protocol_parse_incomplete',
        parseReason: String(parserCompletion.reason || ''),
        eventCount: events.length,
        preflightResults: [],
        eventResults: [],
      };
      continue;
    }
    if (!events.length) {
      lastFailure = {
        reason: 'no_events',
        eventCount: 0,
        preflightResults: [],
        eventResults: [],
      };
      continue;
    }
    const preflightResults = [];
    events.forEach((event, index) => {
      try {
        preflightResults.push(typeof preflightEvent === 'function'
          ? preflightEvent(event, {
              index,
              events,
              priorEvents: events.slice(0, index),
              priorPreflightResults: preflightResults.slice(0, index),
            }) || { ok: false }
          : { ok: true });
      } catch (error) {
        preflightResults.push({
          ok: false,
          reason: 'preflight_error',
          errorMessage: String(error?.message || error || ''),
        });
      }
    });
    if (preflightResults.some(result => result?.ok !== true)) {
      lastFailure = {
        reason: 'protocol_preflight_failed',
        eventCount: events.length,
        preflightResults,
        eventResults: [],
      };
      continue;
    }
    if (typeof beginTransaction === 'function' && beginTransaction() === false) {
      return {
        handled: false,
        didAnything: false,
        reason: 'protocol_transaction_in_progress',
        eventCount: events.length,
        preflightResults,
        eventResults: [],
        candidateSource: candidate.source,
        targetSessionIds: [],
        capturedMessages: [],
      };
    }

    const eventResults = [];
    let dispatchError = null;
    let capturedMessages = [];
    try {
      await beforeDispatch?.();
      for (const event of events) {
        const result = typeof processEvent === 'function'
          ? await processEvent(event)
          : null;
        eventResults.push({
          type: String(event?.type || ''),
          consumed: result?.consumed === true,
          didAnything: result?.didAnything === true,
          mutatedMoments: result?.mutatedMoments === true,
          abortFlow: result?.abortFlow === true,
          targetSessionId: String(result?.targetSessionId || '').trim(),
        });
        if (result?.abortFlow === true) break;
      }
    } catch (error) {
      dispatchError = error;
    } finally {
      try {
        await afterDispatch?.();
      } finally {
        capturedMessages = typeof endTransaction === 'function'
          ? endTransaction() || []
          : [];
      }
    }

    const fullyDispatched = !dispatchError &&
      eventResults.length === events.length &&
      eventResults.every(result => (
        result.consumed &&
        result.didAnything &&
        result.abortFlow !== true
    ));
    if (!fullyDispatched) {
      const rollbackErrors = await rollbackProtocolResponse({
        capturedMessages,
        rollbackCaptured,
        rollbackTransaction,
      });
      lastFailure = {
        reason: dispatchError ? 'protocol_dispatch_failed' : 'protocol_dispatch_incomplete',
        errorMessage: String(dispatchError?.message || dispatchError || ''),
        eventCount: events.length,
        preflightResults,
        eventResults,
        rollbackErrors,
      };
      continue;
    }

    let transactionCommit = { ok: true };
    try {
      transactionCommit = typeof commitTransaction === 'function'
        ? await commitTransaction()
        : { ok: true };
    } catch (error) {
      const rollbackErrors = await rollbackProtocolResponse({
        capturedMessages,
        rollbackCaptured,
        rollbackTransaction,
      });
      lastFailure = {
        reason: 'protocol_transaction_commit_failed',
        errorMessage: String(error?.message || error || ''),
        eventCount: events.length,
        preflightResults,
        eventResults,
        rollbackErrors,
      };
      continue;
    }
    if (transactionCommit?.ok === false) {
      const rollbackErrors = await rollbackProtocolResponse({
        capturedMessages,
        rollbackCaptured,
        rollbackTransaction,
      });
      lastFailure = {
        reason: String(transactionCommit?.reason || 'protocol_transaction_commit_failed'),
        eventCount: events.length,
        preflightResults,
        eventResults,
        rollbackErrors,
      };
      continue;
    }

    const targetSessionIds = Array.from(new Set(
      eventResults.map(result => result.targetSessionId).filter(Boolean),
    ));
    const details = {
      handled: true,
      didAnything: true,
      reason: '',
      eventCount: events.length,
      preflightResults,
      eventResults,
      candidateSource: candidate.source,
      candidateText: candidate.text,
      targetSessionIds,
      capturedMessages: Array.isArray(capturedMessages) ? capturedMessages : [],
      transactionCommit,
    };
    try {
      await onCommitted?.(details);
    } catch (error) {
      details.postCommitError = error;
    }
    return details;
  }

  return {
    handled: false,
    didAnything: false,
    candidateSource: '',
    targetSessionIds: [],
    capturedMessages: [],
    ...lastFailure,
  };
};
