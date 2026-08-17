import assert from 'node:assert/strict';

import {
  commitProtocolSummary,
  consumeProtocolBatchEvent,
  consumeProtocolEventList,
  consumeProtocolStreamChunks,
  consumeProtocolRetryEvents,
  consumeProtocolHandledResult,
  createProtocolBatchEventHandlers,
  createSendProtocolEventHandlers,
  createSendProtocolResponseFlowHandlers,
  finalizeProtocolBufferedFlow,
  finalizeProtocolHandledFlow,
  finalizeProtocolStreamFlow,
  flushProtocolMomentsIfNeeded,
  runProtocolCommittedFunctionalEffects,
  runProtocolBufferedResponseFlow,
  runProtocolRetryFallbacks,
  runProtocolStreamResponseFlow,
} from '../../src/scripts/ui/chat/protocol-runtime-utils.js';

{
  const calls = [];
  const messages = new Map([
    ['s1:m1', { id: 'm1', role: 'assistant' }],
    ['s2:m2', { id: 'm2', role: 'assistant' }],
  ]);
  const result = await runProtocolCommittedFunctionalEffects({
    rawText: [
      'MiPhone_start',
      'msg_start',
      'body',
      'msg_end',
      'MiPhone_end',
      '<tableEdit>table</tableEdit>',
      '<UpdateVariable><json_patch>[]</json_patch></UpdateVariable>',
      '<details><summary>摘要</summary>总结</details>',
    ].join('\n'),
    primarySessionId: 's1',
    capturedMessages: [
      { messageId: 'm2', targetSessionId: 's2' },
      { messageId: 'm1', targetSessionId: 's1' },
    ],
    summarySessionIds: new Set(['s1', 's2']),
    summaryEnabled: true,
    variableRuntimeEnabled: true,
    useGlobalVariables: false,
    memoryOptions: { sessionId: 's1' },
  }, {
    handleMemoryEditsFromRaw: async (raw, options) => calls.push(['memory', raw.length, options.sessionId]),
    extractVariableBlocks: (postamble) => {
      calls.push(['variable-extract', postamble.includes('MiPhone_start')]);
      return { blocks: ['<json_patch>[]</json_patch>'] };
    },
    parseVariableCommands: () => [{ type: 'set', path: ['mood'], value: 'calm' }],
    applyVariableCommands: (sessionId, commands, options) => {
      calls.push(['variable-apply', sessionId, commands.length, options.useGlobal]);
      return true;
    },
    findMessage: (messageId, sessionId) => messages.get(`${sessionId}:${messageId}`) || null,
    captureVariableSnapshot: (sessionId, message) => calls.push(['variable-snapshot', sessionId, message.id]),
    extractSummaryBlock: () => {
      calls.push(['summary-extract']);
      return { summary: '总结' };
    },
    addSummary: (summary, sessionId) => calls.push(['summary', sessionId, summary]),
    requestSummaryCompaction: sessionId => calls.push(['compact', sessionId]),
  });
  assert.equal(result.memoryAttempted, true);
  assert.deepEqual(result.variable, {
    attempted: true,
    applied: true,
    changed: true,
    commandCount: 1,
    targetMessageId: 'm1',
    reason: '',
  });
  assert.equal(result.summaryCommitted, true);
  assert.deepEqual(calls, [
    ['memory', result.rawLength, 's1'],
    ['variable-extract', false],
    ['variable-apply', 's1', 1, false],
    ['variable-snapshot', 's1', 'm1'],
    ['summary-extract'],
    ['summary', 's1', '总结'],
    ['summary', 's2', '总结'],
    ['compact', 's1'],
    ['compact', 's2'],
  ]);
  console.log('ok - committed protocol effects execute table, variable, then summary against the primary assistant anchor');
}

{
  const calls = [];
  const base = {
    primarySessionId: 's1',
    capturedMessages: [{ messageId: 'm1', targetSessionId: 's1' }],
    summarySessionIds: new Set(['s1']),
  };
  const deps = {
    extractVariableBlocks: () => {
      calls.push('extract');
      return { blocks: ['x'] };
    },
    parseVariableCommands: () => [{ type: 'set', path: ['x'], value: 1 }],
    applyVariableCommands: () => calls.push('apply'),
    findMessage: () => ({ id: 'm1', role: 'assistant' }),
    captureVariableSnapshot: () => calls.push('snapshot'),
  };
  const beforeShell = await runProtocolCommittedFunctionalEffects({
    ...base,
    rawText: '<UpdateVariable>x</UpdateVariable>\nMiPhone_end',
    variableRuntimeEnabled: true,
  }, deps);
  assert.equal(beforeShell.variable.reason, 'postamble_block_missing');
  const unbalanced = await runProtocolCommittedFunctionalEffects({
    ...base,
    rawText: 'MiPhone_end\n<UpdateVariable>x',
    variableRuntimeEnabled: true,
  }, deps);
  assert.equal(unbalanced.variable.reason, 'postamble_block_unbalanced');
  const noAnchor = await runProtocolCommittedFunctionalEffects({
    ...base,
    capturedMessages: [],
    rawText: 'MiPhone_end\n<UpdateVariable>x</UpdateVariable>',
    variableRuntimeEnabled: true,
  }, deps);
  assert.equal(noAnchor.variable.reason, 'assistant_anchor_missing');
  assert.deepEqual(calls, []);
  console.log('ok - protocol variable effects fail closed outside a balanced postamble or without a branch snapshot anchor');
}

{
  const summarySessionIds = new Set(['s1']);
  const result = consumeProtocolHandledResult(
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds,
    },
    {
      consumed: true,
      didAnything: true,
      mutatedMoments: true,
      targetSessionId: 's2',
    },
  );
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.deepEqual([...summarySessionIds], ['s1', 's2']);
  assert.equal(result.consumed, true);
  console.log('ok - consumeProtocolHandledResult merges flags and target session ids');
}

{
  const summaryWrites = [];
  const compactions = [];
  const didCommit = commitProtocolSummary('总结', new Set(['s1', 's2']), {
    addSummary: (summary, sid) => summaryWrites.push([sid, summary]),
    requestSummaryCompaction: sid => compactions.push(sid),
  });
  assert.equal(didCommit, true);
  assert.deepEqual(summaryWrites, [['s1', '总结'], ['s2', '总结']]);
  assert.deepEqual(compactions, ['s1', 's2']);
  console.log('ok - commitProtocolSummary writes summary and compaction for each touched session');
}

{
  let flushed = 0;
  const didFlush = await flushProtocolMomentsIfNeeded(true, {
    flushMoments: async () => { flushed += 1; },
  });
  assert.equal(didFlush, true);
  assert.equal(flushed, 1);
  const skipped = await flushProtocolMomentsIfNeeded(false, {
    flushMoments: async () => { flushed += 1; },
  });
  assert.equal(skipped, false);
  assert.equal(flushed, 1);
  console.log('ok - flushProtocolMomentsIfNeeded only flushes when mutations happened');
}

{
  const calls = [];
  const didFinalize = await finalizeProtocolHandledFlow(
    {
      didAnything: true,
      mutatedMoments: true,
      protocolSummary: '总结',
      summarySessionIds: new Set(['s1', 's2']),
    },
    {
      addSummary: (summary, sid) => calls.push(['summary', sid, summary]),
      requestSummaryCompaction: sid => calls.push(['compact', sid]),
      refreshChatAndContacts: () => calls.push(['refresh']),
      renderMoments: () => calls.push(['render']),
      flushMoments: async () => calls.push(['flush']),
    },
  );
  assert.equal(didFinalize, true);
  assert.deepEqual(calls, [
    ['summary', 's1', '总结'],
    ['summary', 's2', '总结'],
    ['compact', 's1'],
    ['compact', 's2'],
    ['refresh'],
    ['render'],
    ['flush'],
  ]);
  const skippedFinalize = await finalizeProtocolHandledFlow(
    { didAnything: false, mutatedMoments: true },
    {
      addSummary: () => calls.push(['unexpected']),
      refreshChatAndContacts: () => calls.push(['unexpected']),
      renderMoments: () => calls.push(['unexpected']),
      flushMoments: async () => calls.push(['unexpected']),
    },
  );
  assert.equal(skippedFinalize, false);
  console.log('ok - finalizeProtocolHandledFlow commits summary refreshes ui and flushes once');
}

{
  const seen = [];
  const summarySessionIds = new Set(['s1']);
  const result = await consumeProtocolRetryEvents(
    [{ id: 'a' }, { id: 'b' }],
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds,
    },
    {
      handleEvent: async (event) => {
        seen.push(event.id);
        return event.id === 'a'
          ? { consumed: true, didAnything: true, mutatedMoments: false, targetSessionId: 's2' }
          : { consumed: true, didAnything: true, mutatedMoments: true, targetSessionId: '' };
      },
    },
  );
  assert.deepEqual(seen, ['a', 'b']);
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.equal(result.abortFlow, false);
  assert.deepEqual([...summarySessionIds], ['s1', 's2']);
  const abortResult = await consumeProtocolRetryEvents(
    [{ id: 'x' }, { id: 'y' }],
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds: new Set(),
    },
    {
      handleEvent: async (event) => (
        event.id === 'x'
          ? { consumed: true, didAnything: false, mutatedMoments: false, abortFlow: true }
          : { consumed: true, didAnything: true, mutatedMoments: true }
      ),
    },
  );
  assert.equal(abortResult.abortFlow, true);
  assert.equal(abortResult.didAnything, false);
  assert.equal(abortResult.mutatedMoments, false);
  console.log('ok - consumeProtocolRetryEvents merges handled results and stops on abort');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const result = await runProtocolRetryFallbacks(
    {
      rawText: 'raw',
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds,
    },
    {
      buildProtocolRetryCandidates: raw => {
        calls.push(['candidates', raw]);
        return { retryText: 'retry' };
      },
      createDialogueParser: () => ({
        push(text) {
          calls.push(['parse', text]);
          return [{ id: 'retry-event' }];
        },
      }),
      handleEvent: async (event) => {
        calls.push(['event', event.id]);
        return {
          consumed: true,
          didAnything: true,
          mutatedMoments: true,
          targetSessionId: 's2',
        };
      },
      flushAfterRetry: true,
      refreshAfterRetry: true,
      flushMoments: async () => calls.push(['flush']),
      refreshChatAndContacts: () => calls.push(['refresh']),
    },
  );

  assert.deepEqual(result, {
    didAnything: true,
    mutatedMoments: true,
    summarySessionIds,
    abortFlow: false,
  });
  assert.deepEqual([...summarySessionIds], ['s1', 's2']);
  assert.deepEqual(calls, [
    ['candidates', 'raw'],
    ['parse', 'retry'],
    ['event', 'retry-event'],
    ['flush'],
    ['refresh'],
  ]);
  console.log('ok - runProtocolRetryFallbacks retries stripped text and runs optional refresh hooks');
}

{
  const calls = [];
  const result = await runProtocolRetryFallbacks(
    {
      rawText: 'raw',
      didAnything: false,
      mutatedMoments: true,
      summarySessionIds: new Set(['s1']),
    },
    {
      buildProtocolRetryCandidates: raw => {
        calls.push(['candidates', raw]);
        return { retryText: raw, miPhoneBlock: '<MiPhone>body</MiPhone>' };
      },
      createDialogueParser: () => ({
        push(text) {
          calls.push(['parse', text]);
          return [{ id: 'mi-phone' }];
        },
      }),
      handleEvent: async () => ({
        consumed: true,
        abortFlow: true,
        didAnything: true,
        mutatedMoments: false,
      }),
      flushAfterRetry: true,
      refreshAfterRetry: true,
      stopOnMiPhoneAbort: true,
      flushMoments: async () => calls.push(['flush']),
      refreshChatAndContacts: () => calls.push(['refresh']),
    },
  );

  assert.equal(result.abortFlow, true);
  assert.equal(result.didAnything, false);
  assert.equal(result.mutatedMoments, true);
  assert.deepEqual(calls, [
    ['candidates', 'raw'],
    ['candidates', 'raw'],
    ['parse', '<MiPhone>body</MiPhone>'],
  ]);
  console.log('ok - runProtocolRetryFallbacks can stop on MiPhone retry abort before refresh hooks');
}

{
  const calls = [];
  const result = await runProtocolRetryFallbacks(
    {
      rawText: 'raw',
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds: new Set(),
    },
    {
      buildProtocolRetryCandidates: () => ({ retryText: 'retry', miPhoneBlock: 'mi-phone' }),
      createDialogueParser: () => ({
        push(text) {
          calls.push(['parse', text]);
          return [{ id: text }];
        },
      }),
      handleEvent: async (event) => (
        event.id === 'retry'
          ? { consumed: true, didAnything: false, mutatedMoments: false, abortFlow: true }
          : { consumed: true, didAnything: true, mutatedMoments: true, abortFlow: true }
      ),
      stopOnMiPhoneAbort: false,
    },
  );

  assert.equal(result.abortFlow, false);
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.deepEqual(calls, [
    ['parse', 'retry'],
    ['parse', 'mi-phone'],
  ]);
  console.log('ok - runProtocolRetryFallbacks preserves non-stopping abort behavior by default');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const result = await finalizeProtocolStreamFlow(
    {
      rawText: 'raw-summary',
      didAnything: true,
      mutatedMoments: true,
      summarySessionIds,
      summaryEnabled: true,
      memoryOptions: { sessionId: 's1', isGroup: true },
    },
    {
      extractSummaryBlock: raw => {
        calls.push(['extract-summary', raw]);
        return { summary: '总结' };
      },
      addSummary: (summary, sid) => calls.push(['summary', sid, summary]),
      requestSummaryCompaction: sid => calls.push(['compact', sid]),
      handleMemoryEditsFromRaw: async (raw, options) => calls.push(['memory', raw, options]),
      flushMoments: async () => calls.push(['flush']),
      refreshChatAndContacts: () => calls.push(['refresh']),
      warnNoValidTag: details => calls.push(['warn', details?.rawText]),
    },
  );

  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.equal(result.abortFlow, false);
  assert.equal(result.warned, false);
  assert.deepEqual(calls, [
    ['extract-summary', 'raw-summary'],
    ['summary', 's1', '总结'],
    ['compact', 's1'],
    ['memory', 'raw-summary', { sessionId: 's1', isGroup: true }],
    ['flush'],
    ['refresh'],
  ]);
  console.log('ok - finalizeProtocolStreamFlow preserves summary memory flush refresh order');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const result = await finalizeProtocolStreamFlow(
    {
      rawText: 'raw',
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds,
      summaryEnabled: false,
    },
    {
      handleMemoryEditsFromRaw: async raw => calls.push(['memory', raw]),
      flushMoments: async () => calls.push(['flush']),
      refreshChatAndContacts: () => calls.push(['refresh']),
      buildProtocolRetryCandidates: raw => {
        calls.push(['candidates', raw]);
        return { retryText: 'retry' };
      },
      createDialogueParser: () => ({
        push(text) {
          calls.push(['parse', text]);
          return [{ id: 'retry-event' }];
        },
      }),
      handleRetryEvent: async event => {
        calls.push(['retry-event', event.id]);
        return { consumed: true, didAnything: true, mutatedMoments: true, targetSessionId: 's2' };
      },
      warnNoValidTag: details => calls.push(['warn', details?.rawText]),
    },
  );

  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.equal(result.abortFlow, false);
  assert.equal(result.warned, false);
  assert.deepEqual([...summarySessionIds], ['s1', 's2']);
  assert.deepEqual(calls, [
    ['candidates', 'raw'],
    ['parse', 'retry'],
    ['retry-event', 'retry-event'],
    ['memory', 'raw'],
    ['flush'],
    ['refresh'],
  ]);
  console.log('ok - finalizeProtocolStreamFlow runs retry fallback before warning');
}

{
  const calls = [];
  const result = await finalizeProtocolStreamFlow(
    {
      rawText: 'raw',
      didAnything: false,
      mutatedMoments: true,
      summarySessionIds: new Set(['s1']),
    },
    {
      handleMemoryEditsFromRaw: async () => calls.push(['memory']),
      flushMoments: async () => calls.push(['flush']),
      refreshChatAndContacts: () => calls.push(['refresh']),
      buildProtocolRetryCandidates: raw => {
        calls.push(['candidates', raw]);
        return { retryText: raw, miPhoneBlock: 'mi-phone' };
      },
      createDialogueParser: () => ({
        push(text) {
          calls.push(['parse', text]);
          return [{ id: 'mi-phone' }];
        },
      }),
      handleRetryEvent: async () => ({ consumed: true, abortFlow: true, didAnything: true }),
      warnNoValidTag: details => calls.push(['warn', details?.rawText]),
    },
  );

  assert.equal(result.abortFlow, true);
  assert.equal(result.didAnything, false);
  assert.equal(result.mutatedMoments, true);
  assert.equal(result.warned, false);
  assert.deepEqual(calls, [
    ['candidates', 'raw'],
    ['candidates', 'raw'],
    ['parse', 'mi-phone'],
  ]);
  console.log('ok - finalizeProtocolStreamFlow preserves MiPhone abort without warning');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const result = await finalizeProtocolBufferedFlow(
    {
      rawText: 'raw',
      didAnything: true,
      mutatedMoments: true,
      protocolSummary: '总结',
      summarySessionIds,
    },
    {
      addSummary: (summary, sid) => calls.push(['summary', sid, summary]),
      requestSummaryCompaction: sid => calls.push(['compact', sid]),
      refreshChatAndContacts: () => calls.push(['refresh']),
      renderMoments: () => calls.push(['render']),
      flushMoments: async () => calls.push(['flush']),
      buildProtocolRetryCandidates: () => {
        calls.push(['unexpected-retry']);
        return {};
      },
      warnNoValidTag: details => calls.push(['warn', details?.rawText]),
    },
  );

  assert.equal(result.handled, true);
  assert.equal(result.warned, false);
  assert.deepEqual(calls, [
    ['summary', 's1', '总结'],
    ['compact', 's1'],
    ['refresh'],
    ['render'],
    ['flush'],
  ]);
  console.log('ok - finalizeProtocolBufferedFlow returns after first successful finalize');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const result = await finalizeProtocolBufferedFlow(
    {
      rawText: 'raw',
      didAnything: false,
      mutatedMoments: false,
      protocolSummary: '总结',
      summarySessionIds,
    },
    {
      addSummary: (summary, sid) => calls.push(['summary', sid, summary]),
      requestSummaryCompaction: sid => calls.push(['compact', sid]),
      refreshChatAndContacts: () => calls.push(['refresh']),
      renderMoments: () => calls.push(['render']),
      flushMoments: async () => calls.push(['flush']),
      buildProtocolRetryCandidates: raw => {
        calls.push(['candidates', raw]);
        return { retryText: 'retry' };
      },
      createDialogueParser: () => ({
        push(text) {
          calls.push(['parse', text]);
          return [{ id: 'retry-event' }];
        },
      }),
      handleRetryEvent: async event => {
        calls.push(['retry-event', event.id]);
        return { consumed: true, didAnything: true, mutatedMoments: true, targetSessionId: 's2' };
      },
      warnNoValidTag: () => calls.push(['warn']),
    },
  );

  assert.equal(result.handled, true);
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.deepEqual([...summarySessionIds], ['s1', 's2']);
  assert.deepEqual(calls, [
    ['candidates', 'raw'],
    ['parse', 'retry'],
    ['retry-event', 'retry-event'],
    ['summary', 's1', '总结'],
    ['summary', 's2', '总结'],
    ['compact', 's1'],
    ['compact', 's2'],
    ['refresh'],
    ['render'],
    ['flush'],
  ]);
  console.log('ok - finalizeProtocolBufferedFlow retries then finalizes handled protocol output');
}

{
  const calls = [];
  const result = await finalizeProtocolBufferedFlow(
    {
      rawText: 'raw',
      didAnything: false,
      mutatedMoments: false,
      protocolSummary: '',
      summarySessionIds: new Set(['s1']),
    },
    {
      buildProtocolRetryCandidates: () => ({ retryText: '' }),
      createDialogueParser: () => ({
        push() {
          calls.push(['unexpected-parse']);
          return [];
        },
      }),
      warnNoValidTag: details => calls.push(['warn', details?.rawText]),
    },
  );

  assert.equal(result.handled, false);
  assert.equal(result.warned, true);
  assert.equal(result.didAnything, false);
  assert.deepEqual(calls, [['warn', 'raw']]);
  console.log('ok - finalizeProtocolBufferedFlow warns when primary and retry parsing miss');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const momentState = await consumeProtocolBatchEvent(
    { type: 'moment_reply' },
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds,
    },
    {
      applyMomentEvent: () => ({
        consumed: true,
        didAnything: true,
        mutatedMoments: true,
        targetSessionId: 'moments',
      }),
      onMomentConsumed: async (handled) => calls.push(['moment', handled.targetSessionId]),
    },
  );

  assert.equal(momentState.didAnything, true);
  assert.equal(momentState.mutatedMoments, true);
  assert.equal(momentState.consumed, true);
  assert.equal(momentState.abortFlow, false);
  assert.deepEqual([...summarySessionIds], ['s1', 'moments']);
  assert.deepEqual(calls, [['moment', 'moments']]);
  console.log('ok - consumeProtocolBatchEvent handles consumed moment events and callbacks');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const state = await consumeProtocolBatchEvent(
    { type: 'group_chat', groupName: '群' },
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds,
    },
    {
      applyMomentEvent: () => null,
      onBeforeDispatch: async (type) => calls.push(['before', type]),
      buildGroupBatch: async () => {
        calls.push(['build-group']);
        return { targetSessionId: 'group:1', messages: [{ id: 'a' }] };
      },
      getGroupDispatchOptions: (batch, event) => {
        calls.push(['group-options', batch.targetSessionId, event.type]);
        return { animEnabled: true, bumpReadCount: true };
      },
      dispatchGroupBatch: async (batch, options) => calls.push(['dispatch-group', batch.targetSessionId, options]),
      onAfterDispatch: async (type, batch) => calls.push(['after', type, batch.targetSessionId]),
      warnMissingGroupTarget: () => calls.push(['warn-group']),
    },
  );

  assert.equal(state.didAnything, true);
  assert.equal(state.mutatedMoments, false);
  assert.equal(state.consumed, true);
  assert.deepEqual([...summarySessionIds], ['s1', 'group:1']);
  assert.deepEqual(calls, [
    ['before', 'group_chat'],
    ['build-group'],
    ['group-options', 'group:1', 'group_chat'],
    ['dispatch-group', 'group:1', { animEnabled: true, bumpReadCount: true }],
    ['after', 'group_chat', 'group:1'],
  ]);
  console.log('ok - consumeProtocolBatchEvent builds dispatches group batches and records summary target');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const state = await consumeProtocolBatchEvent(
    { type: 'private_chat', otherName: '角色' },
    {
      didAnything: true,
      mutatedMoments: false,
      summarySessionIds,
    },
    {
      applyMomentEvent: () => null,
      onBeforeDispatch: async (type) => calls.push(['before', type]),
      buildPrivateBatch: async () => {
        calls.push(['build-private']);
        return { targetSessionId: '' };
      },
      warnMissingPrivateTarget: () => calls.push(['warn-private']),
      dispatchPrivateBatch: async () => calls.push(['dispatch-private']),
      onAfterDispatch: async () => calls.push(['after']),
    },
  );

  assert.equal(state.didAnything, true);
  assert.equal(state.consumed, true);
  assert.deepEqual([...summarySessionIds], ['s1']);
  assert.deepEqual(calls, [
    ['before', 'private_chat'],
    ['build-private'],
    ['warn-private'],
  ]);
  console.log('ok - consumeProtocolBatchEvent preserves state and warns when private target is missing');
}

{
  const state = await consumeProtocolBatchEvent(
    { type: 'moment_reply' },
    {
      didAnything: true,
      mutatedMoments: true,
      summarySessionIds: new Set(['s1']),
    },
    {
      applyMomentEvent: () => ({ consumed: false, abortFlow: true }),
    },
  );

  assert.equal(state.abortFlow, true);
  assert.equal(state.didAnything, true);
  assert.equal(state.mutatedMoments, true);
  console.log('ok - consumeProtocolBatchEvent reports abortFlow before mutating state');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const result = await consumeProtocolEventList(
    [{ id: 'a' }, { id: 'b' }],
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds,
    },
    {
      eventHandlers: { marker: 'handlers' },
      consumeEvent: async (event, state, handlers) => {
        calls.push([event.id, state.didAnything, state.mutatedMoments, handlers.marker]);
        return {
          didAnything: event.id === 'a' ? true : state.didAnything,
          mutatedMoments: event.id === 'b' ? true : state.mutatedMoments,
          summarySessionIds: state.summarySessionIds,
          abortFlow: false,
        };
      },
    },
  );

  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.equal(result.abortFlow, false);
  assert.deepEqual(calls, [
    ['a', false, false, 'handlers'],
    ['b', true, false, 'handlers'],
  ]);
  console.log('ok - consumeProtocolEventList merges event state in order');
}

{
  const calls = [];
  const result = await consumeProtocolEventList(
    [{ id: 'a' }, { id: 'b' }],
    {
      didAnything: true,
      mutatedMoments: false,
      summarySessionIds: new Set(['s1']),
    },
    {
      stopOnAbort: true,
      consumeEvent: async event => {
        calls.push(event.id);
        return {
          didAnything: false,
          mutatedMoments: true,
          abortFlow: true,
        };
      },
    },
  );

  assert.equal(result.abortFlow, true);
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, false);
  assert.deepEqual(calls, ['a']);
  console.log('ok - consumeProtocolEventList stops on abort before mutating state when requested');
}

{
  const calls = [];
  const result = await consumeProtocolEventList(
    [{ id: 'a' }, { id: 'b' }],
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds: new Set(['s1']),
    },
    {
      stopOnAbort: false,
      consumeEvent: async (event, state) => {
        calls.push(event.id);
        return event.id === 'a'
          ? { didAnything: true, mutatedMoments: true, abortFlow: true }
          : { didAnything: state.didAnything, mutatedMoments: false, abortFlow: false };
      },
    },
  );

  assert.equal(result.abortFlow, false);
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, false);
  assert.deepEqual(calls, ['a', 'b']);
  console.log('ok - consumeProtocolEventList preserves non-stopping abort behavior by default');
}

{
  const calls = [];
  async function* stream() {
    yield { content: 'A' };
    yield { reasoning: 'ignored' };
    yield { content: 'B' };
  }
  const parser = {
    push(text) {
      calls.push(['parse', text]);
      return [{ id: text }];
    },
  };
  const summarySessionIds = new Set(['s1']);
  const result = await consumeProtocolStreamChunks(
    stream(),
    {
      parser,
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds,
    },
    {
      normalizeChunk: chunk => {
        calls.push(['normalize', chunk.content || chunk.reasoning]);
        return chunk;
      },
      isInterrupted: () => false,
      eventHandlers: { marker: 'handlers' },
      consumeEvents: async (events, state, options) => {
        calls.push(['events', events.map(event => event.id).join(','), state.didAnything, state.mutatedMoments, options.stopOnAbort, options.eventHandlers.marker]);
        return {
          didAnything: true,
          mutatedMoments: events.some(event => event.id === 'B'),
          summarySessionIds: state.summarySessionIds,
          abortFlow: false,
        };
      },
    },
  );

  assert.equal(result.fullRaw, 'AB');
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.equal(result.abortFlow, false);
  assert.equal(result.interrupted, false);
  assert.deepEqual(calls, [
    ['normalize', 'A'],
    ['parse', 'A'],
    ['events', 'A', false, false, true, 'handlers'],
    ['normalize', 'ignored'],
    ['normalize', 'B'],
    ['parse', 'B'],
    ['events', 'B', true, false, true, 'handlers'],
  ]);
  console.log('ok - consumeProtocolStreamChunks accumulates content chunks and consumes parsed events');
}

{
  const calls = [];
  async function* stream() {
    yield { content: 'A' };
    yield { content: 'B' };
  }
  let interruptionChecks = 0;
  const result = await consumeProtocolStreamChunks(
    stream(),
    {
      parser: {
        push(text) {
          calls.push(['parse', text]);
          return [{ id: text }];
        },
      },
      summarySessionIds: new Set(['s1']),
    },
    {
      isInterrupted: () => {
        interruptionChecks += 1;
        return interruptionChecks >= 2;
      },
      consumeEvents: async () => {
        calls.push(['events']);
        return { didAnything: true, mutatedMoments: false, abortFlow: false };
      },
    },
  );

  assert.equal(result.fullRaw, 'A');
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, false);
  assert.equal(result.interrupted, true);
  assert.deepEqual(calls, [
    ['parse', 'A'],
    ['events'],
  ]);
  console.log('ok - consumeProtocolStreamChunks preserves interruption check before chunk handling and after loop');
}

{
  async function* stream() {
    yield { content: 'A' };
    yield { content: 'B' };
  }
  const result = await consumeProtocolStreamChunks(
    stream(),
    {
      parser: {
        push: text => [{ id: text }],
      },
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds: new Set(['s1']),
    },
    {
      consumeEvents: async () => ({
        didAnything: true,
        mutatedMoments: true,
        abortFlow: true,
      }),
    },
  );

  assert.equal(result.fullRaw, 'A');
  assert.equal(result.didAnything, false);
  assert.equal(result.mutatedMoments, false);
  assert.equal(result.abortFlow, true);
  assert.equal(result.interrupted, false);
  console.log('ok - consumeProtocolStreamChunks stops on abort before mutating event state');
}

{
  const calls = [];
  async function* stream() {
    yield { content: 'A' };
    yield { content: 'B' };
  }
  const summarySessionIds = new Set(['s1']);
  const parser = {
    push(text) {
      calls.push(['parse', text]);
      return [{ type: 'moment_post', id: text }];
    },
  };
  const result = await runProtocolStreamResponseFlow(
    {
      stream: stream(),
      parser,
      summarySessionIds,
      summaryEnabled: true,
      memoryOptions: { sessionId: 's1', isGroup: true },
    },
    {
      normalizeChunk: chunk => {
        calls.push(['normalize', chunk.content]);
        return chunk;
      },
      isInterrupted: () => false,
      eventHandlers: {
        applyMomentEvent: event => {
          calls.push(['event', event.id]);
          return event.id === 'A'
            ? { consumed: true, didAnything: true, mutatedMoments: false, targetSessionId: 's2' }
            : { consumed: true, didAnything: true, mutatedMoments: true };
        },
      },
      onBeforeRawSave: raw => calls.push(['before-raw', raw]),
      setLastRawResponse: raw => calls.push(['raw', raw]),
      extractSummaryBlock: raw => {
        calls.push(['extract-summary', raw]);
        return { summary: '总结' };
      },
      addSummary: (summary, sid) => calls.push(['summary', sid, summary]),
      requestSummaryCompaction: sid => calls.push(['compact', sid]),
      handleMemoryEditsFromRaw: async (raw, options) => calls.push(['memory', raw, options]),
      flushMoments: async () => calls.push(['flush']),
      refreshChatAndContacts: () => calls.push(['refresh']),
      warnNoValidTag: () => calls.push(['warn']),
    },
  );

  assert.equal(result.fullRaw, 'AB');
  assert.equal(result.didAnything, true);
  assert.equal(result.mutatedMoments, true);
  assert.equal(result.abortFlow, false);
  assert.equal(result.interrupted, false);
  assert.deepEqual([...summarySessionIds], ['s1', 's2']);
  assert.deepEqual(calls, [
    ['normalize', 'A'],
    ['parse', 'A'],
    ['event', 'A'],
    ['normalize', 'B'],
    ['parse', 'B'],
    ['event', 'B'],
    ['before-raw', 'AB'],
    ['raw', 'AB'],
    ['extract-summary', 'AB'],
    ['summary', 's1', '总结'],
    ['summary', 's2', '总结'],
    ['compact', 's1'],
    ['compact', 's2'],
    ['memory', 'AB', { sessionId: 's1', isGroup: true }],
    ['flush'],
    ['refresh'],
  ]);
  console.log('ok - runProtocolStreamResponseFlow consumes stream saves raw then finalizes');
}

{
  const calls = [];
  const parser = { push: () => [] };
  const summarySessionIds = new Set(['s1']);
  const result = await runProtocolStreamResponseFlow(
    {
      stream: [],
      parser,
      summarySessionIds,
    },
    {
      eventHandlers: { marker: 'handlers' },
      consumeStreamChunks: async (stream, state, options) => {
        calls.push(['consume', stream.length, state.parser === parser, options.eventHandlers.marker]);
        return {
          fullRaw: 'raw',
          didAnything: true,
          mutatedMoments: false,
          summarySessionIds: state.summarySessionIds,
          abortFlow: false,
          interrupted: false,
        };
      },
      isInterrupted: () => true,
      onBeforeRawSave: () => calls.push(['unexpected-before-raw']),
      setLastRawResponse: () => calls.push(['unexpected-raw']),
      handleMemoryEditsFromRaw: async () => calls.push(['unexpected-memory']),
    },
  );

  assert.equal(result.fullRaw, 'raw');
  assert.equal(result.interrupted, true);
  assert.equal(result.abortFlow, false);
  assert.deepEqual(calls, [
    ['consume', 0, true, 'handlers'],
  ]);
  console.log('ok - runProtocolStreamResponseFlow preserves post-stream interruption before raw save');
}

{
  const calls = [];
  const result = await runProtocolStreamResponseFlow(
    {
      stream: [],
      summarySessionIds: new Set(['s1']),
    },
    {
      consumeStreamChunks: async () => {
        calls.push(['consume']);
        return {
          fullRaw: 'partial',
          didAnything: false,
          mutatedMoments: false,
          abortFlow: true,
          interrupted: false,
        };
      },
      isInterrupted: () => {
        calls.push(['unexpected-interrupted']);
        return false;
      },
      setLastRawResponse: () => calls.push(['unexpected-raw']),
      warnNoValidTag: () => calls.push(['unexpected-warn']),
    },
  );

  assert.equal(result.abortFlow, true);
  assert.equal(result.interrupted, false);
  assert.equal(result.fullRaw, 'partial');
  assert.deepEqual(calls, [['consume']]);
  console.log('ok - runProtocolStreamResponseFlow returns stream abort before raw save and finalize');
}

{
  const calls = [];
  const summarySessionIds = new Set(['s1']);
  const result = await runProtocolBufferedResponseFlow(
    {
      rawText: 'raw',
      protocolSummary: '总结',
      summarySessionIds,
      memoryOptions: { sessionId: 's1', isGroup: false },
    },
    {
      createDialogueParser: () => ({
        push(text) {
          calls.push(['parse', text]);
          return [{ id: 'event-1' }];
        },
      }),
      handleMemoryEditsFromRaw: async (raw, options) => {
        calls.push(['memory-start', raw, options]);
        await Promise.resolve();
        calls.push(['memory-end']);
      },
      eventHandlers: { marker: 'handlers' },
      consumeEvents: async (events, state, options) => {
        calls.push(['events', events.map(event => event.id).join(','), state.didAnything, state.mutatedMoments, options.eventHandlers.marker]);
        state.summarySessionIds.add('s2');
        return {
          didAnything: true,
          mutatedMoments: true,
          summarySessionIds: state.summarySessionIds,
        };
      },
      addSummary: (summary, sid) => calls.push(['summary', sid, summary]),
      requestSummaryCompaction: sid => calls.push(['compact', sid]),
      refreshChatAndContacts: () => calls.push(['refresh']),
      renderMoments: () => calls.push(['render']),
      flushMoments: async () => calls.push(['flush']),
      buildProtocolRetryCandidates: () => {
        calls.push(['unexpected-retry']);
        return {};
      },
      warnNoValidTag: () => calls.push(['warn']),
    },
  );

  assert.equal(result.handled, true);
  assert.equal(result.warned, false);
  assert.deepEqual([...summarySessionIds], ['s1', 's2']);
  assert.deepEqual(calls, [
    ['parse', 'raw'],
    ['events', 'event-1', false, false, 'handlers'],
    ['summary', 's1', '总结'],
    ['summary', 's2', '总结'],
    ['compact', 's1'],
    ['compact', 's2'],
    ['refresh'],
    ['render'],
    ['flush'],
    ['memory-start', 'raw', { sessionId: 's1', isGroup: false }],
    ['memory-end'],
  ]);
  console.log('ok - runProtocolBufferedResponseFlow parses consumes events awaits memory and finalizes');
}

{
  const calls = [];
  const result = await runProtocolBufferedResponseFlow(
    {
      rawText: 'raw',
      protocolSummary: '',
      summarySessionIds: new Set(['s1']),
    },
    {
      createDialogueParser: () => ({
        push(text) {
          calls.push(['parse', text]);
          return [];
        },
      }),
      handleMemoryEditsFromRaw: async () => {
        calls.push(['memory']);
      },
      consumeEvents: async () => {
        calls.push(['events']);
        return { didAnything: false, mutatedMoments: false };
      },
      buildProtocolRetryCandidates: raw => {
        calls.push(['candidates', raw]);
        return { retryText: '' };
      },
      warnNoValidTag: details => calls.push(['warn', details?.rawText]),
    },
  );

  assert.equal(result.handled, false);
  assert.equal(result.warned, true);
  assert.deepEqual(calls, [
    ['parse', 'raw'],
    ['events'],
    ['candidates', 'raw'],
    ['candidates', 'raw'],
    ['warn', 'raw'],
  ]);
  console.log('ok - runProtocolBufferedResponseFlow rejects invalid protocol before memory side effects');
}

{
  const calls = [];
  let assignedQueue = null;
  const handlers = createProtocolBatchEventHandlers({
    streamMode: true,
    applyMomentEvent: () => null,
    buildGroupBatch: () => ({ targetSessionId: 'group:1', messages: [] }),
    dispatchGroupBatch: async (batch, options) => {
      calls.push(['dispatch', batch.targetSessionId, options.animEnabled, options.bumpReadCount, options.queueTypingOptions]);
      options.onQueueCreated?.('queue-1');
    },
    getAnimEnabled: () => false,
    getQueueTypingOptions: () => ({ memberIds: ['u1'] }),
    assignActiveQueue: q => { assignedQueue = q; calls.push(['assign', q]); },
    isSessionActive: () => true,
    hideTyping: () => calls.push(['hide']),
    fastForwardDelivery: () => calls.push(['fast-forward']),
    refreshChatAndContacts: () => calls.push(['refresh']),
    showTyping: (avatar, options) => calls.push(['show', avatar, options]),
    assistantAvatar: 'avatar.png',
  });
  const state = await consumeProtocolBatchEvent(
    { type: 'group_chat' },
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds: new Set(['s1']),
    },
    handlers,
  );

  assert.equal(state.didAnything, true);
  assert.equal(assignedQueue, 'queue-1');
  assert.deepEqual(calls, [
    ['hide'],
    ['fast-forward'],
    ['dispatch', 'group:1', false, true, { memberIds: ['u1'] }],
    ['assign', 'queue-1'],
    ['refresh'],
    ['show', 'avatar.png', { memberIds: ['u1'] }],
  ]);
  console.log('ok - createProtocolBatchEventHandlers preserves stream dispatch hooks and queue options');
}

{
  const calls = [];
  const handlers = createProtocolBatchEventHandlers({
    streamMode: false,
    applyMomentEvent: () => null,
    buildPrivateBatch: () => ({ targetSessionId: 'private:1', messages: [] }),
    dispatchPrivateBatch: async (batch, options) => {
      calls.push(['dispatch', batch.targetSessionId, options]);
    },
    getAnimEnabled: () => true,
    hideTyping: () => calls.push(['unexpected-hide']),
    refreshChatAndContacts: () => calls.push(['unexpected-refresh']),
    showTyping: () => calls.push(['unexpected-show']),
  });
  const state = await consumeProtocolBatchEvent(
    { type: 'private_chat' },
    {
      didAnything: false,
      mutatedMoments: false,
      summarySessionIds: new Set(['s1']),
    },
    handlers,
  );

  assert.equal(state.didAnything, true);
  assert.deepEqual(calls, [
    ['dispatch', 'private:1', { animEnabled: true }],
  ]);
  console.log('ok - createProtocolBatchEventHandlers keeps non-stream dispatch free of stream hooks');
}

{
  const calls = [];
  let activeGeneration = { id: 7 };
  let activePage = 'moments';
  const handlers = createSendProtocolEventHandlers({
    streamMode: true,
    sessionId: 'session-protocol',
    generationId: 7,
    getActiveGeneration: () => activeGeneration,
    getActivePage: () => activePage,
    applyProtocolMomentEvent: (event, options) => {
      calls.push(['moment-event', event.type, options.abortOnMissingMomentId]);
      options.addMoments(['moment-raw']);
      options.addMomentComments('moment-1', ['comment-raw']);
      calls.push(['normalized-comments', options.normalizeComments(['comment']).join('|')]);
      return { consumed: true, mutatedMoments: true };
    },
    ingestMoments: items => {
      calls.push(['ingest', items]);
      return items.map(item => `ingested:${item}`);
    },
    addMoments: items => calls.push(['add-moments', items]),
    addMomentComments: (momentId, comments) => calls.push(['add-comments', momentId, comments]),
    normalizeMomentCommentsForStore: (comments, options) => {
      calls.push(['normalize-comments', comments, options]);
      return comments.map(comment => `normalized:${comment}`);
    },
    renderMoments: () => calls.push(['render']),
    buildGroupBatch: () => null,
    dispatchGroupBatch: () => calls.push(['unexpected-dispatch-group']),
    buildPrivateBatch: () => null,
    dispatchPrivateBatch: () => calls.push(['unexpected-dispatch-private']),
    showWarning: message => calls.push(['warn', message]),
    getTypingDotsMode: () => 'off',
    getGroupTypingMembers: sessionId => {
      calls.push(['typing-members', sessionId]);
      return { memberIds: ['u1'] };
    },
    isSessionActive: sessionId => {
      calls.push(['active', sessionId]);
      return true;
    },
    hideTyping: () => calls.push(['hide']),
    fastForwardDelivery: sessionId => calls.push(['fast-forward', sessionId]),
    refreshChatAndContacts: () => calls.push(['refresh']),
    showTyping: (avatar, options) => calls.push(['show', avatar, options]),
    assistantAvatar: 'assistant.png',
  });

  assert.deepEqual(handlers.applyMomentEvent({ type: 'moment' }), {
    consumed: true,
    mutatedMoments: true,
  });
  handlers.onMomentConsumed({ mutatedMoments: true });
  activePage = 'chat';
  handlers.onMomentConsumed({ mutatedMoments: true });
  handlers.warnMissingGroupTarget();
  handlers.warnMissingPrivateTarget();
  const groupOptions = handlers.getGroupDispatchOptions();
  assert.equal(groupOptions.animEnabled, false);
  assert.equal(groupOptions.bumpReadCount, true);
  assert.equal(groupOptions.backgroundQueue, true);
  assert.deepEqual(groupOptions.queueTypingOptions, { memberIds: ['u1'] });
  groupOptions.onQueueCreated('queue-1');
  assert.equal(activeGeneration._messageQueue, 'queue-1');
  activeGeneration = { id: 8 };
  groupOptions.onQueueCreated('queue-2');
  assert.equal(activeGeneration._messageQueue, undefined);
  activeGeneration = { id: 7 };
  handlers.onBeforeDispatch();
  handlers.onAfterDispatch();

  assert.deepEqual(calls, [
    ['moment-event', 'moment', true],
    ['ingest', ['moment-raw']],
    ['add-moments', ['ingested:moment-raw']],
    ['add-comments', 'moment-1', ['comment-raw']],
    ['normalize-comments', ['comment'], { regexMode: 'output', depth: 0 }],
    ['normalized-comments', 'normalized:comment'],
    ['render'],
    ['warn', '对话回复格式错误：群聊标签未匹配任何已存在群组，已丢弃'],
    ['warn', '对话回复格式错误：私聊标签未匹配当前联系人，已丢弃'],
    ['typing-members', 'session-protocol'],
    ['active', 'session-protocol'],
    ['hide'],
    ['fast-forward', 'session-protocol'],
    ['refresh'],
    ['active', 'session-protocol'],
    ['typing-members', 'session-protocol'],
    ['show', 'assistant.png', { memberIds: ['u1'] }],
  ]);
  calls.length = 0;
  activeGeneration = { id: 7, cancelled: true };
  handlers.onBeforeDispatch();
  handlers.onAfterDispatch();
  assert.deepEqual(calls, [
    ['refresh'],
  ]);
  console.log('ok - createSendProtocolEventHandlers wires stream protocol side effects');
}

{
  const calls = [];
  const handlers = createSendProtocolEventHandlers({
    streamMode: false,
    sessionId: 'session-protocol',
    generationId: 1,
    getActiveGeneration: () => ({ id: 1 }),
    getActivePage: () => 'moments',
    applyProtocolMomentEvent: (event, options) => {
      calls.push(['moment-event', event.type, Object.hasOwn(options, 'abortOnMissingMomentId')]);
      options.addMoments(['moment-raw']);
      return { consumed: true };
    },
    ingestMoments: items => items,
    addMoments: items => calls.push(['add-moments', items]),
    addMomentComments: () => calls.push(['unexpected-comments']),
    normalizeMomentCommentsForStore: comments => comments,
    renderMoments: () => calls.push(['unexpected-render']),
    buildGroupBatch: () => null,
    dispatchGroupBatch: () => calls.push(['unexpected-dispatch']),
    buildPrivateBatch: () => null,
    dispatchPrivateBatch: () => calls.push(['unexpected-dispatch']),
    showWarning: message => calls.push(['warn', message]),
    getTypingDotsMode: () => 'on',
    getGroupTypingMembers: () => {
      calls.push(['unexpected-typing-members']);
      return {};
    },
    isSessionActive: () => {
      calls.push(['unexpected-active']);
      return true;
    },
    hideTyping: () => calls.push(['unexpected-hide']),
    fastForwardDelivery: () => calls.push(['unexpected-fast-forward']),
    refreshChatAndContacts: () => calls.push(['unexpected-refresh']),
    showTyping: () => calls.push(['unexpected-show']),
  });

  assert.equal(handlers.onMomentConsumed, null);
  assert.deepEqual(handlers.applyMomentEvent({ type: 'moment' }), { consumed: true });
  handlers.warnMissingPrivateTarget();
  assert.deepEqual(handlers.getPrivateDispatchOptions(), { animEnabled: true });
  assert.equal(Object.hasOwn(handlers.getPrivateDispatchOptions(), 'onQueueCreated'), false);
  assert.equal(Object.hasOwn(handlers, 'onBeforeDispatch'), false);
  assert.deepEqual(calls, [
    ['moment-event', 'moment', false],
    ['add-moments', ['moment-raw']],
    ['warn', '对话回复格式错误：私聊标签未匹配当前联系人，已丢弃'],
  ]);
  console.log('ok - createSendProtocolEventHandlers keeps non-stream protocol side effects minimal');
}

{
  const calls = [];
  const handlers = createSendProtocolResponseFlowHandlers({
    sessionId: 'session-protocol',
    getActivePage: () => 'moments',
    isSessionActive: sessionId => {
      calls.push(['active', sessionId]);
      return true;
    },
    hideTyping: () => calls.push(['hide']),
    fastForwardDelivery: sessionId => calls.push(['fast-forward', sessionId]),
    setLastRawResponse: (raw, sessionId) => calls.push(['raw', raw, sessionId]),
    addSummary: (summary, sessionId) => calls.push(['summary', summary, sessionId]),
    requestSummaryCompaction: sessionId => calls.push(['compact', sessionId]),
    handleMemoryEditsFromRaw: async (raw, options) => calls.push(['memory', raw, options]),
    extractSummaryBlock: raw => {
      calls.push(['extract-summary', raw]);
      return { summary: 'sum' };
    },
    flushMoments: async () => calls.push(['flush']),
    refreshChatAndContacts: () => calls.push(['refresh']),
    buildProtocolRetryCandidates: raw => {
      calls.push(['candidates', raw]);
      return {};
    },
    createDialogueParser: () => ({ push: () => [] }),
    processProtocolRetryEvent: (event, options) => {
      calls.push(['retry', event.type, options]);
      return { consumed: true };
    },
    showWarning: message => calls.push(['warn', message]),
    onNoValidTag: payload => calls.push(['no-valid-tag', payload]),
  });

  const streamHandlers = handlers.createStreamHandlers();
  assert.equal(streamHandlers.createDialogueParser().push().length, 0);
  streamHandlers.onBeforeRawSave('raw');
  streamHandlers.setLastRawResponse('raw');
  streamHandlers.extractSummaryBlock('raw');
  streamHandlers.addSummary('sum', 'target-session');
  streamHandlers.requestSummaryCompaction('target-session');
  await streamHandlers.handleMemoryEditsFromRaw('raw', { sessionId: 'session-protocol' });
  await streamHandlers.flushMoments();
  streamHandlers.refreshChatAndContacts();
  streamHandlers.buildProtocolRetryCandidates('raw');
  streamHandlers.handleRetryEvent({ type: 'retry' });
  streamHandlers.warnNoValidTag({ rawText: 'raw' });

  assert.deepEqual(calls, [
    ['active', 'session-protocol'],
    ['hide'],
    ['fast-forward', 'session-protocol'],
    ['raw', 'raw', 'session-protocol'],
    ['extract-summary', 'raw'],
    ['summary', 'sum', 'target-session'],
    ['compact', 'target-session'],
    ['memory', 'raw', { sessionId: 'session-protocol' }],
    ['flush'],
    ['refresh'],
    ['candidates', 'raw'],
    ['retry', 'retry', { renderMoments: true, refreshAfterAppend: true }],
    ['warn', '未解析到有效对话标签，已丢弃；可在「本次 AI 回复」查看原始内容'],
    ['no-valid-tag', { sessionId: 'session-protocol', rawText: 'raw', mode: 'stream' }],
  ]);
  console.log('ok - createSendProtocolResponseFlowHandlers preserves stream raw save retry and warning side effects');
}

{
  const calls = [];
  let activePage = 'moments';
  let active = false;
  const handlers = createSendProtocolResponseFlowHandlers({
    sessionId: 'session-protocol',
    getActivePage: () => activePage,
    isSessionActive: sessionId => {
      calls.push(['active', sessionId]);
      return active;
    },
    hideTyping: () => calls.push(['hide']),
    fastForwardDelivery: sessionId => calls.push(['fast-forward', sessionId]),
    renderMoments: () => calls.push(['render']),
    processProtocolRetryEvent: (event, options) => {
      calls.push(['retry', event.type, options]);
      return { consumed: true };
    },
    showWarning: message => calls.push(['warn', message]),
    onNoValidTag: payload => calls.push(['no-valid-tag', payload]),
  });

  const inactiveStreamHandlers = handlers.createStreamHandlers();
  inactiveStreamHandlers.onBeforeRawSave('raw');
  const bufferedHandlers = handlers.createBufferedHandlers();
  bufferedHandlers.renderMoments();
  bufferedHandlers.handleRetryEvent({ type: 'retry' });
  activePage = 'chat';
  assert.equal(handlers.createBufferedHandlers().renderMoments, null);
  bufferedHandlers.warnNoValidTag({ rawText: 'raw-buffered' });

  assert.deepEqual(calls, [
    ['active', 'session-protocol'],
    ['render'],
    ['retry', 'retry', undefined],
    ['warn', '未解析到有效对话标签，已丢弃；可在「本次 AI 回复」查看原始内容'],
    ['no-valid-tag', { sessionId: 'session-protocol', rawText: 'raw-buffered', mode: 'buffered' }],
  ]);
  console.log('ok - createSendProtocolResponseFlowHandlers keeps buffered render and inactive stream behavior');
}
