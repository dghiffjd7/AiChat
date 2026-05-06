export const consumeProtocolHandledResult = (
  {
    didAnything = false,
    mutatedMoments = false,
    summarySessionIds = null,
  } = {},
  handled = null,
) => {
  const targetSessionId = String(handled?.targetSessionId || '').trim();
  if (targetSessionId && summarySessionIds && typeof summarySessionIds.add === 'function') {
    summarySessionIds.add(targetSessionId);
  }
  return {
    didAnything: Boolean(didAnything || handled?.didAnything),
    mutatedMoments: Boolean(mutatedMoments || handled?.mutatedMoments),
    summarySessionIds,
    consumed: Boolean(handled?.consumed),
  };
};

export const commitProtocolSummary = (
  protocolSummary,
  summarySessionIds,
  {
    addSummary = null,
    requestSummaryCompaction = null,
  } = {},
) => {
  const summary = String(protocolSummary || '').trim();
  if (!summary) return false;
  const sessionIds = summarySessionIds instanceof Set
    ? [...summarySessionIds]
    : Array.isArray(summarySessionIds)
      ? summarySessionIds
      : [];
  if (!sessionIds.length) return false;
  try {
    if (typeof addSummary === 'function') {
      for (const sid of sessionIds) addSummary(summary, sid);
    }
  } catch {}
  try {
    if (typeof requestSummaryCompaction === 'function') {
      for (const sid of sessionIds) requestSummaryCompaction(sid);
    }
  } catch {}
  return true;
};

export const flushProtocolMomentsIfNeeded = async (
  mutatedMoments,
  { flushMoments = null } = {},
) => {
  if (!mutatedMoments || typeof flushMoments !== 'function') return false;
  try {
    await flushMoments();
  } catch {}
  return true;
};

export const finalizeProtocolHandledFlow = async (
  {
    didAnything = false,
    mutatedMoments = false,
    protocolSummary = '',
    summarySessionIds = null,
  } = {},
  {
    addSummary = null,
    requestSummaryCompaction = null,
    refreshChatAndContacts = null,
    renderMoments = null,
    flushMoments = null,
  } = {},
) => {
  if (!didAnything) return false;
  commitProtocolSummary(protocolSummary, summarySessionIds, {
    addSummary,
    requestSummaryCompaction,
  });
  try {
    if (typeof refreshChatAndContacts === 'function') {
      refreshChatAndContacts();
    }
  } catch {}
  try {
    if (typeof renderMoments === 'function') {
      renderMoments();
    }
  } catch {}
  await flushProtocolMomentsIfNeeded(mutatedMoments, { flushMoments });
  return true;
};

export const consumeProtocolRetryEvents = async (
  events,
  {
    didAnything = false,
    mutatedMoments = false,
    summarySessionIds = null,
  } = {},
  {
    handleEvent = null,
  } = {},
) => {
  let nextDidAnything = Boolean(didAnything);
  let nextMutatedMoments = Boolean(mutatedMoments);
  const retryEvents = Array.isArray(events) ? events : [];
  for (const event of retryEvents) {
    const handled = typeof handleEvent === 'function'
      ? await handleEvent(event)
      : null;
    const consumed = consumeProtocolHandledResult({
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
    }, handled);
    nextDidAnything = consumed.didAnything;
    nextMutatedMoments = consumed.mutatedMoments;
    if (handled?.abortFlow) {
      return {
        didAnything: nextDidAnything,
        mutatedMoments: nextMutatedMoments,
        summarySessionIds,
        abortFlow: true,
      };
    }
  }
  return {
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    summarySessionIds,
    abortFlow: false,
  };
};
