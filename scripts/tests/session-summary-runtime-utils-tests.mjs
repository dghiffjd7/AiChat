import assert from 'node:assert/strict';

import {
  openCompactedRawFlow,
  openCompactedSummaryEditFlow,
  runCompactedSummaryGenerationFlow,
  runDeleteSelectedSummariesFlow,
  runEditSelectedSummariesFlow,
} from '../../src/scripts/ui/session-summary-runtime-utils.js';

{
  const calls = [];
  const result = openCompactedRawFlow({
    sessionId: 'chat:1',
    getCompactedSummaryRaw: () => 'raw reply',
    ensureModal: () => calls.push(['ensure']),
    setRawValue: (value) => calls.push(['set', value]),
    showModal: () => calls.push(['show']),
    focusTextarea: () => calls.push(['focus']),
    toastr: { info: (msg) => calls.push(['info', msg]) },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(result, true);
  assert.deepEqual(calls, [['ensure'], ['set', 'raw reply'], ['show'], ['focus']]);
  console.log('ok - openCompactedRawFlow opens raw modal when compacted raw text exists');
}

{
  const calls = [];
  const result = openCompactedSummaryEditFlow({
    sessionId: 'chat:2',
    getCompactedSummary: () => ({ text: 'summary' }),
    getCompactedSummaryRaw: () => 'raw summary',
    ensureModal: () => calls.push(['ensure']),
    setOnSave: (handler) => {
      calls.push(['setOnSave']);
      handler('next summary');
    },
    setTextareaValue: (value) => calls.push(['textarea', value]),
    showModal: () => calls.push(['show']),
    focusTextarea: () => calls.push(['focus']),
    setCompactedSummary: (text, sessionId, options) => calls.push(['setSummary', text, sessionId, options]),
    renderCompactedSummary: () => calls.push(['render']),
    closeModal: () => calls.push(['close']),
    dispatchUpdated: (sessionId) => calls.push(['dispatch', sessionId]),
    toastr: {
      info: (msg) => calls.push(['info', msg]),
      error: (msg) => calls.push(['error', msg]),
      success: (msg) => calls.push(['success', msg]),
    },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['ensure'],
    ['setOnSave'],
    ['setSummary', 'next summary', 'chat:2', { raw: 'raw summary' }],
    ['dispatch', 'chat:2'],
    ['render'],
    ['close'],
    ['success', '已更新大总结'],
    ['textarea', 'summary'],
    ['show'],
    ['focus'],
  ]);
  console.log('ok - openCompactedSummaryEditFlow wires save handler and opens edit modal');
}

{
  const calls = [];
  const result = await runDeleteSelectedSummariesFlow({
    sessionId: 'chat:3',
    selectedKeys: ['1|a', '2|b'],
    confirm: async (options) => {
      calls.push(['confirm', options]);
      return true;
    },
    buildSelectedSummaryEntries: (keys) => keys.map((key) => ({ key })),
    deleteSummaryItems: (items, sessionId) => calls.push(['delete', items, sessionId]),
    setSummaryBatchMode: (enabled) => calls.push(['batch', enabled]),
    renderSummaries: () => calls.push(['render']),
    toastr: { info: (msg) => calls.push(['info', msg]) },
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['confirm', { title: '删除摘要', message: '确定要删除所选摘要（2条）吗？', danger: true }],
    ['delete', [{ key: '1|a' }, { key: '2|b' }], 'chat:3'],
    ['batch', false],
    ['render'],
  ]);
  console.log('ok - runDeleteSelectedSummariesFlow confirms deletion then clears batch mode and rerenders');
}

{
  const calls = [];
  const result = runEditSelectedSummariesFlow({
    sessionId: 'chat:4',
    selectedKeys: ['1|a', '2|b'],
    buildSelectedSummaryEntries: () => [{ at: 1, text: 'a' }, { at: 2, text: 'b' }],
    openSummaryEditModal: (value, onSave) => {
      calls.push(['open', value]);
      onSave('- aa\n- bb');
    },
    parseEditedSummaryLines: (text) => text.split(/\r?\n/).map((line) => line.replace(/^- /, '')),
    updateSummaryItems: (updates, sessionId) => calls.push(['update', updates, sessionId]),
    closeSummaryEditModal: () => calls.push(['close']),
    setSummaryBatchMode: (enabled) => calls.push(['batch', enabled]),
    renderSummaries: () => calls.push(['render']),
    toastr: { info: (msg) => calls.push(['info', msg]), error: (msg) => calls.push(['error', msg]) },
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['open', '- a\n- b'],
    ['update', [
      { at: 1, fromText: 'a', toText: 'aa' },
      { at: 2, fromText: 'b', toText: 'bb' },
    ], 'chat:4'],
    ['close'],
    ['batch', false],
    ['render'],
  ]);
  console.log('ok - runEditSelectedSummariesFlow rewrites selected summary lines and rerenders');
}

{
  const calls = [];
  const result = await runCompactedSummaryGenerationFlow({
    sessionId: 'chat:5',
    summaryCompacting: false,
    setSummaryCompacting: (value) => calls.push(['compacting', value]),
    resolveRequestSummaryCompaction: () => async (sessionId, options) => {
      calls.push(['request', sessionId, options]);
      return true;
    },
    waitForRetry: async () => calls.push(['wait']),
    renderSummaries: () => calls.push(['renderSummaries']),
    renderCompactedSummary: () => calls.push(['renderCompacted']),
    logger: { warn: (...args) => calls.push(['warn', ...args]) },
    toastr: {
      info: (msg) => calls.push(['info', msg]),
      error: (msg) => calls.push(['error', msg]),
    },
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['compacting', true],
    ['info', '正在生成大总结…'],
    ['request', 'chat:5', { force: true }],
    ['renderSummaries'],
    ['renderCompacted'],
    ['compacting', false],
  ]);
  console.log('ok - runCompactedSummaryGenerationFlow runs compaction request and refreshes summary views');
}
