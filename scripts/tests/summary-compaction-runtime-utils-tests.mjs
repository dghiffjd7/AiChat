import assert from 'node:assert/strict';

import { createSessionSummaryCompactionRuntime } from '../../src/scripts/ui/chat/summary-compaction-runtime-utils.js';

{
  const calls = [];
  const chatStore = {
    getSummaries(sessionId) {
      assert.equal(sessionId, 's1');
      return [
        { text: 'a' },
        { text: 'b' },
        { text: 'c' },
      ];
    },
    getCompactedSummary() {
      return { text: 'old' };
    },
    setCompactedSummaryRaw(raw, sessionId) {
      calls.push(['raw', raw, sessionId]);
    },
    setCompactedSummary(text, sessionId, options) {
      calls.push(['set', text, sessionId, options]);
    },
    setSummaries(items, sessionId) {
      calls.push(['summaries', items, sessionId]);
    },
  };
  const updated = [];
  const runtime = createSessionSummaryCompactionRuntime({
    chatStore,
    getIsSummaryMemoryEnabled: () => true,
    getIsConfigured: () => true,
    buildMessages: () => [],
    backgroundChat: async () => '',
    buildSessionContext: (sessionId) => ({ sessionId, scope: 'chat' }),
    requestCompactionRaw: async (payload) => {
      calls.push(['request', payload.context, payload.compactedText, payload.items.length]);
      return '<details><summary>摘要</summary> 新摘要 </details>';
    },
    parseCompactionResult: () => ({ text: '新摘要', valid: true }),
    normalizeItems: items => items.map((item, index) => ({ ...item, keep: index })),
    shouldCompact: ({ items, force }) => items.length >= 3 && force === false,
    refreshChatAndContacts: () => calls.push(['refresh']),
    dispatchUpdated: (sessionId) => updated.push(sessionId),
    setTimeoutFn: async (fn) => fn(),
    delayMs: 0,
  });
  const ok = await runtime('s1');
  assert.equal(ok, true);
  assert.deepEqual(calls, [
    ['request', { sessionId: 's1', scope: 'chat' }, 'old', 3],
    ['raw', '<details><summary>摘要</summary> 新摘要 </details>', 's1'],
    ['set', '新摘要', 's1', { raw: '<details><summary>摘要</summary> 新摘要 </details>' }],
    ['summaries', [{ text: 'b', keep: 1 }, { text: 'c', keep: 2 }], 's1'],
    ['refresh'],
  ]);
  assert.deepEqual(updated, ['s1']);
  console.log('ok - createSessionSummaryCompactionRuntime compacts summaries and keeps the latest normalized snapshots');
}

{
  const failed = [];
  const runtime = createSessionSummaryCompactionRuntime({
    chatStore: {
      getSummaries() {
        return [{ text: 'a' }];
      },
      getCompactedSummary() {
        return { text: '' };
      },
      setCompactedSummary() {
        throw new Error('should not persist invalid payload');
      },
    },
    getIsSummaryMemoryEnabled: () => true,
    getIsConfigured: () => true,
    buildMessages: () => [],
    backgroundChat: async () => '',
    buildSessionContext: () => ({}),
    requestCompactionRaw: async () => '<details><summary>摘要</summary> raw </details>',
    parseCompactionResult: () => ({ text: '', valid: false }),
    normalizeItems: items => items,
    shouldCompact: () => true,
    dispatchFailed: (sessionId, reason) => failed.push([sessionId, reason]),
    setTimeoutFn: async (fn) => fn(),
    delayMs: 0,
  });
  const ok = await runtime('s2');
  assert.equal(ok, false);
  assert.deepEqual(failed, [['s2', 'missing_summary_tag']]);
  console.log('ok - createSessionSummaryCompactionRuntime reports missing summary tag failures');
}

{
  const failed = [];
  const runtime = createSessionSummaryCompactionRuntime({
    chatStore: {
      getSummaries() {
        return [{ text: 'a' }];
      },
      getCompactedSummary() {
        return { text: '' };
      },
      setCompactedSummaryRaw() {},
      setCompactedSummary() {
        throw new Error('should not persist invalid format');
      },
    },
    getIsSummaryMemoryEnabled: () => true,
    getIsConfigured: () => true,
    buildMessages: () => [],
    backgroundChat: async () => '',
    buildSessionContext: () => ({}),
    requestCompactionRaw: async () => '<details><summary>摘要</summary> raw </details>',
    parseCompactionResult: () => ({ text: '有内容', valid: false }),
    normalizeItems: items => items,
    shouldCompact: () => true,
    dispatchFailed: (sessionId, reason) => failed.push([sessionId, reason]),
    setTimeoutFn: async (fn) => fn(),
    delayMs: 0,
  });
  const ok = await runtime('s3');
  assert.equal(ok, false);
  assert.deepEqual(failed, [['s3', 'format']]);
  console.log('ok - createSessionSummaryCompactionRuntime reports invalid summary format failures');
}
