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

const findProtocolPostambleStart = (rawText = '') => {
  const source = String(rawText ?? '');
  const marker = /\bMiPhone_end\b/giu;
  let last = null;
  let match;
  while ((match = marker.exec(source))) last = match;
  return last ? last.index + last[0].length : -1;
};

const findPrimaryAssistantAnchor = ({
  primarySessionId = '',
  capturedMessages = [],
  findMessage = null,
} = {}) => {
  const sessionId = String(primarySessionId || '').trim();
  if (!sessionId || typeof findMessage !== 'function') return null;
  const candidates = Array.isArray(capturedMessages) ? capturedMessages : [];
  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const item = candidates[index] || {};
    if (String(item.targetSessionId || '').trim() !== sessionId) continue;
    const messageId = String(item.messageId || '').trim();
    if (!messageId) continue;
    const message = findMessage(messageId, sessionId);
    if (message?.role === 'assistant') return message;
  }
  return null;
};

const applyProtocolPostambleVariableUpdate = ({
  rawText = '',
  primarySessionId = '',
  capturedMessages = [],
  variableRuntimeEnabled = true,
  useGlobalVariables = false,
} = {}, {
  extractVariableBlocks = null,
  parseVariableCommands = null,
  applyVariableCommands = null,
  findMessage = null,
  captureVariableSnapshot = null,
  logger = null,
} = {}) => {
  const skipped = reason => ({
    attempted: false,
    applied: false,
    changed: false,
    commandCount: 0,
    targetMessageId: '',
    reason,
  });
  if (variableRuntimeEnabled === false) return skipped('variable_runtime_disabled');
  const sessionId = String(primarySessionId || '').trim();
  if (!sessionId) return skipped('session_missing');
  const source = String(rawText ?? '');
  const postambleStart = findProtocolPostambleStart(source);
  if (postambleStart < 0) return skipped('phone_shell_missing');
  const postamble = source.slice(postambleStart);
  const balancedBlockPattern = /<\s*(update(?:variable)?|variableupdate)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/giu;
  const balancedBlocks = postamble.match(balancedBlockPattern) || [];
  const residue = postamble.replace(balancedBlockPattern, '');
  if (/<\s*\/?\s*(?:update(?:variable)?|variableupdate)\b[^>]*>/iu.test(residue)) {
    return skipped('postamble_block_unbalanced');
  }
  if (!balancedBlocks.length) return skipped('postamble_block_missing');
  const anchor = findPrimaryAssistantAnchor({
    primarySessionId: sessionId,
    capturedMessages,
    findMessage,
  });
  if (!anchor) return skipped('assistant_anchor_missing');
  if (
    typeof extractVariableBlocks !== 'function'
    || typeof parseVariableCommands !== 'function'
    || typeof applyVariableCommands !== 'function'
  ) {
    return skipped('variable_runtime_unavailable');
  }
  try {
    const extracted = extractVariableBlocks(postamble) || {};
    const blocks = Array.isArray(extracted.blocks) ? extracted.blocks : [];
    const commands = blocks.flatMap((block) => {
      const parsed = parseVariableCommands(block);
      return Array.isArray(parsed) ? parsed : [];
    });
    if (!commands.length) return skipped('variable_commands_empty');
    const changed = Boolean(applyVariableCommands(sessionId, commands, {
      useGlobal: useGlobalVariables === true,
    }));
    try {
      captureVariableSnapshot?.(sessionId, anchor);
    } catch (error) {
      logger?.warn?.('protocol variable snapshot capture failed', error);
    }
    return {
      attempted: true,
      applied: true,
      changed,
      commandCount: commands.length,
      targetMessageId: String(anchor.id || '').trim(),
      reason: '',
    };
  } catch (error) {
    logger?.warn?.('protocol variable side effect failed after response commit', error);
    return skipped('variable_apply_failed');
  }
};

export const runProtocolCommittedFunctionalEffects = async ({
  rawText = '',
  primarySessionId = '',
  capturedMessages = [],
  protocolSummary = '',
  summarySessionIds = null,
  summaryEnabled = false,
  variableRuntimeEnabled = true,
  useGlobalVariables = false,
  memoryOptions = {},
} = {}, {
  handleMemoryEditsFromRaw = null,
  extractVariableBlocks = null,
  parseVariableCommands = null,
  applyVariableCommands = null,
  findMessage = null,
  captureVariableSnapshot = null,
  extractSummaryBlock = null,
  addSummary = null,
  requestSummaryCompaction = null,
  logger = null,
} = {}) => {
  const raw = String(rawText ?? '');
  let memoryAttempted = false;
  let memoryFailed = false;
  if (typeof handleMemoryEditsFromRaw === 'function') {
    memoryAttempted = true;
    try {
      await handleMemoryEditsFromRaw(raw, memoryOptions || {});
    } catch (error) {
      memoryFailed = true;
      logger?.warn?.('protocol memory side effect failed after response commit', error);
    }
  }
  const variable = applyProtocolPostambleVariableUpdate({
    rawText: raw,
    primarySessionId,
    capturedMessages,
    variableRuntimeEnabled,
    useGlobalVariables,
  }, {
    extractVariableBlocks,
    parseVariableCommands,
    applyVariableCommands,
    findMessage,
    captureVariableSnapshot,
    logger,
  });
  let resolvedSummary = String(protocolSummary || '').trim();
  if (!resolvedSummary && summaryEnabled && typeof extractSummaryBlock === 'function') {
    try {
      resolvedSummary = String(extractSummaryBlock(raw)?.summary || '').trim();
    } catch {}
  }
  const summaryCommitted = commitProtocolSummary(resolvedSummary, summarySessionIds, {
    addSummary,
    requestSummaryCompaction,
  });
  return {
    rawLength: raw.length,
    memoryAttempted,
    memoryFailed,
    variable,
    summaryCommitted,
  };
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

export const runProtocolRetryFallbacks = async (
  {
    rawText = '',
    didAnything = false,
    mutatedMoments = false,
    summarySessionIds = null,
  } = {},
  {
    buildProtocolRetryCandidates = () => ({}),
    createDialogueParser = null,
    handleEvent = null,
    flushMoments = null,
    refreshChatAndContacts = null,
    flushAfterRetry = false,
    refreshAfterRetry = false,
    stopOnMiPhoneAbort = false,
  } = {},
) => {
  let nextDidAnything = Boolean(didAnything);
  let nextMutatedMoments = Boolean(mutatedMoments);
  let abortFlow = false;
  const raw = String(rawText ?? '');

  const runRefreshHooks = async () => {
    if (flushAfterRetry) {
      await flushProtocolMomentsIfNeeded(nextMutatedMoments, { flushMoments });
    }
    if (refreshAfterRetry && typeof refreshChatAndContacts === 'function') {
      refreshChatAndContacts();
    }
  };

  if (!nextDidAnything) {
    try {
      const { retryText } = buildProtocolRetryCandidates(raw) || {};
      if (retryText && retryText !== raw && typeof createDialogueParser === 'function') {
        const retryParser = createDialogueParser();
        const retryEvents = retryParser?.push?.(retryText);
        const retryState = await consumeProtocolRetryEvents(retryEvents, {
          didAnything: nextDidAnything,
          mutatedMoments: nextMutatedMoments,
          summarySessionIds,
        }, {
          handleEvent,
        });
        nextDidAnything = retryState.didAnything;
        nextMutatedMoments = retryState.mutatedMoments;
        await runRefreshHooks();
      }
    } catch {}
  }

  if (!nextDidAnything) {
    try {
      const { miPhoneBlock } = buildProtocolRetryCandidates(raw) || {};
      if (miPhoneBlock && typeof createDialogueParser === 'function') {
        const retryParser = createDialogueParser();
        const retryEvents = retryParser?.push?.(miPhoneBlock);
        const retryState = await consumeProtocolRetryEvents(retryEvents, {
          didAnything: nextDidAnything,
          mutatedMoments: nextMutatedMoments,
          summarySessionIds,
        }, {
          handleEvent,
        });
        if (retryState.abortFlow && stopOnMiPhoneAbort) {
          abortFlow = true;
          return {
            didAnything: nextDidAnything,
            mutatedMoments: nextMutatedMoments,
            summarySessionIds,
            abortFlow,
          };
        }
        nextDidAnything = retryState.didAnything;
        nextMutatedMoments = retryState.mutatedMoments;
        await runRefreshHooks();
      }
    } catch {}
  }

  return {
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    summarySessionIds,
    abortFlow,
  };
};

export const finalizeProtocolStreamFlow = async (
  {
    rawText = '',
    didAnything = false,
    mutatedMoments = false,
    summarySessionIds = null,
    summaryEnabled = false,
    memoryOptions = {},
  } = {},
  {
    extractSummaryBlock = null,
    addSummary = null,
    requestSummaryCompaction = null,
    handleMemoryEditsFromRaw = null,
    flushMoments = null,
    refreshChatAndContacts = null,
    buildProtocolRetryCandidates = () => ({}),
    createDialogueParser = null,
    handleRetryEvent = null,
    warnNoValidTag = null,
  } = {},
) => {
  const raw = String(rawText ?? '');
  let nextDidAnything = Boolean(didAnything);
  let nextMutatedMoments = Boolean(mutatedMoments);

  if (!nextDidAnything) {
    const retryState = await runProtocolRetryFallbacks({
      rawText: raw,
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
    }, {
      buildProtocolRetryCandidates,
      createDialogueParser,
      handleEvent: handleRetryEvent,
      flushAfterRetry: false,
      refreshAfterRetry: false,
      stopOnMiPhoneAbort: true,
      flushMoments,
      refreshChatAndContacts,
    });
    if (retryState.abortFlow) {
      return {
        didAnything: nextDidAnything,
        mutatedMoments: nextMutatedMoments,
        summarySessionIds,
        abortFlow: true,
        warned: false,
      };
    }
    nextDidAnything = retryState.didAnything;
    nextMutatedMoments = retryState.mutatedMoments;
    if (!nextDidAnything && typeof warnNoValidTag === 'function') {
      warnNoValidTag({ rawText: raw });
    }
  }
  if (nextDidAnything) {
    if (summaryEnabled && typeof extractSummaryBlock === 'function') {
      const { summary: protocolSummary } = extractSummaryBlock(raw) || {};
      commitProtocolSummary(protocolSummary, summarySessionIds, {
        addSummary,
        requestSummaryCompaction,
      });
    }
    if (typeof handleMemoryEditsFromRaw === 'function') {
      await handleMemoryEditsFromRaw(raw, memoryOptions || {});
    }
    await flushProtocolMomentsIfNeeded(nextMutatedMoments, {
      flushMoments,
    });
    if (typeof refreshChatAndContacts === 'function') {
      refreshChatAndContacts();
    }
  }

  return {
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    summarySessionIds,
    abortFlow: false,
    warned: !nextDidAnything,
  };
};

export const finalizeProtocolBufferedFlow = async (
  {
    rawText = '',
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
    buildProtocolRetryCandidates = () => ({}),
    createDialogueParser = null,
    handleRetryEvent = null,
    warnNoValidTag = null,
  } = {},
) => {
  const raw = String(rawText ?? '');
  let nextDidAnything = Boolean(didAnything);
  let nextMutatedMoments = Boolean(mutatedMoments);
  const finalize = () => finalizeProtocolHandledFlow({
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    protocolSummary,
    summarySessionIds,
  }, {
    addSummary,
    requestSummaryCompaction,
    refreshChatAndContacts,
    renderMoments,
    flushMoments,
  });

  if (await finalize()) {
    return {
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
      handled: true,
      warned: false,
    };
  }

  const retryState = await runProtocolRetryFallbacks({
    rawText: raw,
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    summarySessionIds,
  }, {
    buildProtocolRetryCandidates,
    createDialogueParser,
    handleEvent: handleRetryEvent,
  });
  nextDidAnything = retryState.didAnything;
  nextMutatedMoments = retryState.mutatedMoments;

  if (await finalize()) {
    return {
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
      handled: true,
      warned: false,
    };
  }

  if (typeof warnNoValidTag === 'function') {
    warnNoValidTag({ rawText: raw });
  }
  return {
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    summarySessionIds,
    handled: false,
    warned: true,
  };
};

export const consumeProtocolBatchEvent = async (
  event,
  {
    didAnything = false,
    mutatedMoments = false,
    summarySessionIds = null,
  } = {},
  {
    applyMomentEvent = null,
    onMomentConsumed = null,
    buildGroupBatch = null,
    dispatchGroupBatch = null,
    getGroupDispatchOptions = () => ({}),
    warnMissingGroupTarget = null,
    buildPrivateBatch = null,
    dispatchPrivateBatch = null,
    getPrivateDispatchOptions = () => ({}),
    warnMissingPrivateTarget = null,
    onBeforeDispatch = null,
    onAfterDispatch = null,
  } = {},
) => {
  let nextDidAnything = Boolean(didAnything);
  let nextMutatedMoments = Boolean(mutatedMoments);
  const commitState = (handled = null) => {
    const result = consumeProtocolHandledResult({
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
    }, handled);
    nextDidAnything = result.didAnything;
    nextMutatedMoments = result.mutatedMoments;
    return result;
  };

  const handledMoment =
    typeof applyMomentEvent === 'function'
      ? applyMomentEvent(event)
      : null;
  if (handledMoment?.abortFlow) {
    return {
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
      consumed: Boolean(handledMoment?.consumed),
      abortFlow: true,
    };
  }
  const momentState = commitState(handledMoment);
  if (handledMoment?.consumed) {
    if (typeof onMomentConsumed === 'function') {
      await onMomentConsumed(handledMoment, event);
    }
    return {
      ...momentState,
      abortFlow: false,
    };
  }

  if (event?.type === 'group_chat') {
    if (typeof onBeforeDispatch === 'function') {
      await onBeforeDispatch('group_chat', event);
    }
    const groupBatch =
      typeof buildGroupBatch === 'function'
        ? await buildGroupBatch(event)
        : null;
    if (!groupBatch?.targetSessionId) {
      if (typeof warnMissingGroupTarget === 'function') warnMissingGroupTarget();
      return {
        didAnything: nextDidAnything,
        mutatedMoments: nextMutatedMoments,
        summarySessionIds,
        consumed: true,
        abortFlow: false,
      };
    }
    if (summarySessionIds && typeof summarySessionIds.add === 'function') {
      summarySessionIds.add(groupBatch.targetSessionId);
    }
    const options = typeof getGroupDispatchOptions === 'function'
      ? getGroupDispatchOptions(groupBatch, event)
      : {};
    if (typeof dispatchGroupBatch === 'function') {
      await dispatchGroupBatch(groupBatch, options || {});
    }
    nextDidAnything = true;
    if (typeof onAfterDispatch === 'function') {
      await onAfterDispatch('group_chat', groupBatch, event);
    }
    return {
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
      consumed: true,
      abortFlow: false,
    };
  }

  if (event?.type === 'private_chat') {
    if (typeof onBeforeDispatch === 'function') {
      await onBeforeDispatch('private_chat', event);
    }
    const privateBatch =
      typeof buildPrivateBatch === 'function'
        ? await buildPrivateBatch(event)
        : null;
    if (!privateBatch?.targetSessionId) {
      if (typeof warnMissingPrivateTarget === 'function') warnMissingPrivateTarget();
      return {
        didAnything: nextDidAnything,
        mutatedMoments: nextMutatedMoments,
        summarySessionIds,
        consumed: true,
        abortFlow: false,
      };
    }
    if (summarySessionIds && typeof summarySessionIds.add === 'function') {
      summarySessionIds.add(privateBatch.targetSessionId);
    }
    const options = typeof getPrivateDispatchOptions === 'function'
      ? getPrivateDispatchOptions(privateBatch, event)
      : {};
    if (typeof dispatchPrivateBatch === 'function') {
      await dispatchPrivateBatch(privateBatch, options || {});
    }
    nextDidAnything = true;
    if (typeof onAfterDispatch === 'function') {
      await onAfterDispatch('private_chat', privateBatch, event);
    }
    return {
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
      consumed: true,
      abortFlow: false,
    };
  }

  return {
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    summarySessionIds,
    consumed: false,
    abortFlow: false,
  };
};

export const consumeProtocolEventList = async (
  events,
  {
    didAnything = false,
    mutatedMoments = false,
    summarySessionIds = null,
  } = {},
  {
    eventHandlers = {},
    stopOnAbort = false,
    consumeEvent = consumeProtocolBatchEvent,
  } = {},
) => {
  let nextDidAnything = Boolean(didAnything);
  let nextMutatedMoments = Boolean(mutatedMoments);
  const eventList = Array.isArray(events) ? events : [];
  for (const event of eventList) {
    const eventState = await consumeEvent(event, {
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
    }, eventHandlers);
    if (eventState?.abortFlow && stopOnAbort) {
      return {
        didAnything: nextDidAnything,
        mutatedMoments: nextMutatedMoments,
        summarySessionIds,
        abortFlow: true,
      };
    }
    nextDidAnything = Boolean(eventState?.didAnything);
    nextMutatedMoments = Boolean(eventState?.mutatedMoments);
  }
  return {
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    summarySessionIds,
    abortFlow: false,
  };
};

export const consumeProtocolStreamChunks = async (
  stream,
  {
    parser = null,
    didAnything = false,
    mutatedMoments = false,
    summarySessionIds = null,
  } = {},
  {
    normalizeChunk = chunk => chunk,
    isInterrupted = () => false,
    eventHandlers = {},
    consumeEvents = consumeProtocolEventList,
  } = {},
) => {
  let fullRaw = '';
  let nextDidAnything = Boolean(didAnything);
  let nextMutatedMoments = Boolean(mutatedMoments);
  const isFlowInterrupted = () => Boolean(typeof isInterrupted === 'function' && isInterrupted());

  for await (const chunk of stream) {
    if (isFlowInterrupted()) break;
    const normalizedChunk = typeof normalizeChunk === 'function'
      ? normalizeChunk(chunk)
      : chunk;
    if (!normalizedChunk?.content) continue;
    fullRaw += normalizedChunk.content;
    const events = parser?.push?.(normalizedChunk.content);
    const eventState = await consumeEvents(events, {
      didAnything: nextDidAnything,
      mutatedMoments: nextMutatedMoments,
      summarySessionIds,
    }, {
      eventHandlers,
      stopOnAbort: true,
    });
    if (eventState.abortFlow) {
      return {
        fullRaw,
        didAnything: nextDidAnything,
        mutatedMoments: nextMutatedMoments,
        summarySessionIds,
        abortFlow: true,
        interrupted: false,
      };
    }
    nextDidAnything = eventState.didAnything;
    nextMutatedMoments = eventState.mutatedMoments;
  }

  return {
    fullRaw,
    didAnything: nextDidAnything,
    mutatedMoments: nextMutatedMoments,
    summarySessionIds,
    abortFlow: false,
    interrupted: isFlowInterrupted(),
  };
};

export const runProtocolStreamResponseFlow = async (
  {
    stream = [],
    parser = null,
    summarySessionIds = null,
    summaryEnabled = false,
    memoryOptions = {},
  } = {},
  {
    createDialogueParser = null,
    normalizeChunk = chunk => chunk,
    isInterrupted = () => false,
    eventHandlers = {},
    consumeStreamChunks = consumeProtocolStreamChunks,
    onBeforeRawSave = null,
    setLastRawResponse = null,
    extractSummaryBlock = null,
    addSummary = null,
    requestSummaryCompaction = null,
    handleMemoryEditsFromRaw = null,
    flushMoments = null,
    refreshChatAndContacts = null,
    buildProtocolRetryCandidates = () => ({}),
    handleRetryEvent = null,
    warnNoValidTag = null,
  } = {},
) => {
  const protocolParser = parser || (
    typeof createDialogueParser === 'function'
      ? createDialogueParser()
      : null
  );
  const streamState = await consumeStreamChunks(stream || [], {
    parser: protocolParser,
    didAnything: false,
    mutatedMoments: false,
    summarySessionIds,
  }, {
    normalizeChunk,
    isInterrupted,
    eventHandlers,
  });

  if (streamState.abortFlow || streamState.interrupted) {
    return {
      ...streamState,
      interrupted: Boolean(streamState.interrupted),
    };
  }

  if (typeof isInterrupted === 'function' && isInterrupted()) {
    return {
      ...streamState,
      interrupted: true,
    };
  }

  const fullRaw = String(streamState.fullRaw ?? '');
  if (typeof onBeforeRawSave === 'function') {
    onBeforeRawSave(fullRaw, streamState);
  }
  if (typeof setLastRawResponse === 'function') {
    setLastRawResponse(fullRaw, streamState);
  }

  const finalState = await finalizeProtocolStreamFlow({
    rawText: fullRaw,
    didAnything: streamState.didAnything,
    mutatedMoments: streamState.mutatedMoments,
    summarySessionIds: streamState.summarySessionIds || summarySessionIds,
    summaryEnabled,
    memoryOptions,
  }, {
    extractSummaryBlock,
    addSummary,
    requestSummaryCompaction,
    handleMemoryEditsFromRaw,
    flushMoments,
    refreshChatAndContacts,
    buildProtocolRetryCandidates,
    createDialogueParser,
    handleRetryEvent,
    warnNoValidTag,
  });

  return {
    ...finalState,
    fullRaw,
    interrupted: false,
  };
};

export const runProtocolBufferedResponseFlow = async (
  {
    rawText = '',
    protocolSummary = '',
    summarySessionIds = null,
    memoryOptions = {},
  } = {},
  {
    createDialogueParser = null,
    handleMemoryEditsFromRaw = null,
    eventHandlers = {},
    consumeEvents = consumeProtocolEventList,
    addSummary = null,
    requestSummaryCompaction = null,
    refreshChatAndContacts = null,
    renderMoments = null,
    flushMoments = null,
    buildProtocolRetryCandidates = () => ({}),
    handleRetryEvent = null,
    warnNoValidTag = null,
  } = {},
) => {
  const raw = String(rawText ?? '');
  const parser = typeof createDialogueParser === 'function'
    ? createDialogueParser()
    : null;
  const events = parser?.push?.(raw);
  let didAnything = false;
  let mutatedMoments = false;

  ({
    didAnything,
    mutatedMoments,
  } = await consumeEvents(events, {
    didAnything,
    mutatedMoments,
    summarySessionIds,
  }, {
    eventHandlers,
  }));

  const finalState = await finalizeProtocolBufferedFlow({
    rawText: raw,
    didAnything,
    mutatedMoments,
    protocolSummary,
    summarySessionIds,
  }, {
    addSummary,
    requestSummaryCompaction,
    refreshChatAndContacts,
    renderMoments,
    flushMoments,
    buildProtocolRetryCandidates,
    createDialogueParser,
    handleRetryEvent,
    warnNoValidTag,
  });
  if (finalState?.handled === true && typeof handleMemoryEditsFromRaw === 'function') {
    await handleMemoryEditsFromRaw(raw, memoryOptions || {});
  }
  return finalState;
};

export const createProtocolBatchEventHandlers = ({
  streamMode = false,
  applyMomentEvent = null,
  onMomentConsumed = null,
  buildGroupBatch = null,
  dispatchGroupBatch = null,
  warnMissingGroupTarget = null,
  buildPrivateBatch = null,
  dispatchPrivateBatch = null,
  warnMissingPrivateTarget = null,
  getAnimEnabled = () => true,
  getQueueTypingOptions = () => ({}),
  assignActiveQueue = null,
  isSessionActive = () => false,
  hideTyping = null,
  fastForwardDelivery = null,
  refreshChatAndContacts = null,
  showTyping = null,
  assistantAvatar = null,
} = {}) => {
  const resolveAnimEnabled = () => {
    try {
      return Boolean(getAnimEnabled());
    } catch {
      return true;
    }
  };
  const resolveQueueTypingOptions = () => {
    try {
      return getQueueTypingOptions() || {};
    } catch {
      return {};
    }
  };
  const assignQueue = q => {
    if (typeof assignActiveQueue === 'function') {
      assignActiveQueue(q);
    }
  };

  const handlers = {
    applyMomentEvent,
    onMomentConsumed,
    buildGroupBatch,
    warnMissingGroupTarget,
    getGroupDispatchOptions: () => {
      const options = {
        animEnabled: resolveAnimEnabled(),
        bumpReadCount: true,
      };
      if (streamMode) {
        options.backgroundQueue = true;
        options.onQueueCreated = assignQueue;
        options.queueTypingOptions = resolveQueueTypingOptions();
      }
      return options;
    },
    dispatchGroupBatch,
    buildPrivateBatch,
    warnMissingPrivateTarget,
    getPrivateDispatchOptions: () => {
      const options = {
        animEnabled: resolveAnimEnabled(),
      };
      if (streamMode) {
        options.backgroundQueue = true;
        options.onQueueCreated = assignQueue;
        options.queueTypingOptions = resolveQueueTypingOptions();
      }
      return options;
    },
    dispatchPrivateBatch,
  };

  if (streamMode) {
    handlers.onBeforeDispatch = () => {
      let active = false;
      try {
        active = Boolean(isSessionActive());
      } catch {}
      if (!active) return;
      if (typeof hideTyping === 'function') hideTyping();
      if (typeof fastForwardDelivery === 'function') fastForwardDelivery();
    };
    handlers.onAfterDispatch = () => {
      if (typeof refreshChatAndContacts === 'function') {
        refreshChatAndContacts();
      }
      let active = false;
      try {
        active = Boolean(isSessionActive());
      } catch {}
      if (active && typeof showTyping === 'function') {
        showTyping(assistantAvatar, resolveQueueTypingOptions());
      }
    };
  }

  return handlers;
};

export const createSendProtocolEventHandlers = ({
  streamMode = false,
  sessionId = '',
  generationId = null,
  getActiveGeneration = null,
  getActivePage = null,
  applyProtocolMomentEvent = null,
  ingestMoments = null,
  addMoments = null,
  addMomentComments = null,
  normalizeMomentCommentsForStore = null,
  renderMoments = null,
  buildGroupBatch = null,
  dispatchGroupBatch = null,
  buildPrivateBatch = null,
  dispatchPrivateBatch = null,
  showWarning = null,
  getTypingDotsMode = null,
  getGroupTypingMembers = null,
  isSessionActive = null,
  hideTyping = null,
  fastForwardDelivery = null,
  refreshChatAndContacts = null,
  showTyping = null,
  assistantAvatar = null,
} = {}) => {
  const isActiveGeneration = () => {
    const activeGeneration = typeof getActiveGeneration === 'function'
      ? getActiveGeneration()
      : null;
    return Boolean(
      activeGeneration &&
      activeGeneration.id === generationId &&
      activeGeneration.cancelled !== true
    );
  };
  const isActiveSessionGeneration = () => (
    isActiveGeneration() &&
    (typeof isSessionActive === 'function' ? isSessionActive(sessionId) : false)
  );

  return createProtocolBatchEventHandlers({
    streamMode,
    applyMomentEvent: event => applyProtocolMomentEvent(event, {
      addMoments: items => addMoments(ingestMoments(items)),
      addMomentComments,
      ...(streamMode ? { abortOnMissingMomentId: true } : {}),
      normalizeComments: comments => normalizeMomentCommentsForStore(comments, {
        regexMode: 'output',
        depth: 0,
      }),
    }),
    onMomentConsumed: streamMode
      ? handled => {
          if (handled.mutatedMoments && getActivePage() === 'moments') {
            renderMoments();
          }
        }
      : null,
    buildGroupBatch,
    warnMissingGroupTarget: () => showWarning?.('对话回复格式错误：群聊标签未匹配任何已存在群组，已丢弃'),
    dispatchGroupBatch,
    buildPrivateBatch,
    warnMissingPrivateTarget: () => showWarning?.('对话回复格式错误：私聊标签未匹配当前联系人，已丢弃'),
    dispatchPrivateBatch,
    getAnimEnabled: () => getTypingDotsMode() !== 'off',
    getQueueTypingOptions: () => getGroupTypingMembers(sessionId) || {},
    assignActiveQueue: q => {
      if (!isActiveGeneration()) return;
      const activeGeneration = getActiveGeneration();
      activeGeneration._messageQueue = q;
    },
    isSessionActive: isActiveSessionGeneration,
    hideTyping,
    fastForwardDelivery: () => fastForwardDelivery(sessionId),
    refreshChatAndContacts,
    showTyping,
    assistantAvatar,
  });
};

export const createSendProtocolResponseFlowHandlers = ({
  sessionId = '',
  getActivePage = null,
  isSessionActive = null,
  hideTyping = null,
  fastForwardDelivery = null,
  setLastRawResponse = null,
  addSummary = null,
  requestSummaryCompaction = null,
  handleMemoryEditsFromRaw = null,
  extractSummaryBlock = null,
  flushMoments = null,
  renderMoments = null,
  refreshChatAndContacts = null,
  buildProtocolRetryCandidates = null,
  createDialogueParser = null,
  processProtocolRetryEvent = null,
  showWarning = null,
  onNoValidTag = null,
} = {}) => {
  const isActive = () => Boolean(typeof isSessionActive === 'function' && isSessionActive(sessionId));
  const notifyNoValidTag = ({ rawText = '', mode = '' } = {}) => {
    showWarning?.('未解析到有效对话标签，已丢弃；可在「本次 AI 回复」查看原始内容');
    if (typeof onNoValidTag === 'function') {
      onNoValidTag({
        sessionId,
        rawText: String(rawText || ''),
        mode,
      });
    }
  };
  const createCommonHandlers = ({ mode = '' } = {}) => ({
    createDialogueParser,
    handleMemoryEditsFromRaw,
    addSummary,
    requestSummaryCompaction,
    refreshChatAndContacts,
    flushMoments,
    buildProtocolRetryCandidates,
    warnNoValidTag: details => notifyNoValidTag({
      ...(details || {}),
      mode,
    }),
  });

  return {
    createStreamHandlers: () => ({
      ...createCommonHandlers({ mode: 'stream' }),
      onBeforeRawSave: () => {
        if (!isActive()) return;
        if (typeof hideTyping === 'function') hideTyping();
        if (typeof fastForwardDelivery === 'function') fastForwardDelivery(sessionId);
      },
      setLastRawResponse: fullRaw => setLastRawResponse?.(fullRaw, sessionId),
      extractSummaryBlock,
      handleRetryEvent: ev => processProtocolRetryEvent?.(ev, {
        renderMoments: true,
        refreshAfterAppend: true,
      }),
    }),
    createBufferedHandlers: () => ({
      ...createCommonHandlers({ mode: 'buffered' }),
      renderMoments: (
        typeof getActivePage === 'function'
        && getActivePage() === 'moments'
        && typeof renderMoments === 'function'
      )
        ? () => renderMoments()
        : null,
      handleRetryEvent: ev => processProtocolRetryEvent?.(ev),
    }),
  };
};
