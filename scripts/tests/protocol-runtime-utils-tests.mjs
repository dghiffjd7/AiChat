import assert from 'node:assert/strict';

import {
  commitProtocolSummary,
  consumeProtocolRetryEvents,
  consumeProtocolHandledResult,
  finalizeProtocolHandledFlow,
  flushProtocolMomentsIfNeeded,
} from '../../src/scripts/ui/chat/protocol-runtime-utils.js';

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
