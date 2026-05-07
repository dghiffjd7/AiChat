import assert from 'node:assert/strict';

import {
  bindSessionMemoryShareButton,
  bindSessionPanelSharedWindowEvents,
  bindSessionSummarySectionControls,
} from '../../src/scripts/ui/session-panel-binding-utils.js';

const createButton = () => ({
  listeners: {},
  addEventListener(type, handler) {
    this.listeners[type] = handler;
  },
});

{
  const button = createButton();
  const calls = [];
  bindSessionMemoryShareButton({
    buttonEl: button,
    openManager: async () => {
      calls.push('open');
    },
    logger: { warn() { calls.push('warn'); } },
    toastr: { error() { calls.push('error'); } },
  });
  await button.listeners.click();
  assert.deepEqual(calls, ['open']);
  console.log('ok - bindSessionMemoryShareButton opens manager without warning on success');
}

{
  const button = createButton();
  const calls = [];
  bindSessionMemoryShareButton({
    buttonEl: button,
    openManager: async () => {
      throw new Error('boom');
    },
    logger: { warn(message) { calls.push(['warn', message]); } },
    toastr: { error(message) { calls.push(['error', message]); } },
    warnMessage: 'open manager failed',
    errorMessage: '打开失败',
  });
  await button.listeners.click();
  assert.deepEqual(calls, [['warn', 'open manager failed'], ['error', '打开失败']]);
  console.log('ok - bindSessionMemoryShareButton reports warning and toast on failure');
}

{
  const clearButton = createButton();
  const batchButton = createButton();
  const batchCancelButton = createButton();
  const batchDeleteButton = createButton();
  const batchEditButton = createButton();
  const compactedRawButton = createButton();
  const compactedEditButton = createButton();
  const compactedRunButton = createButton();
  const compactedClearButton = createButton();
  const calls = [];
  let batchMode = true;
  let confirmQueue = [true, true];

  bindSessionSummarySectionControls({
    clearButtonEl: clearButton,
    batchButtonEl: batchButton,
    batchCancelButtonEl: batchCancelButton,
    batchDeleteButtonEl: batchDeleteButton,
    batchEditButtonEl: batchEditButton,
    compactedRawButtonEl: compactedRawButton,
    compactedEditButtonEl: compactedEditButton,
    compactedRunButtonEl: compactedRunButton,
    compactedClearButtonEl: compactedClearButton,
    getSessionId: () => 'group:1',
    getSummaryBatchMode: () => batchMode,
    clearSelectedKeys: () => calls.push('clearSelected'),
    setSummaryBatchMode: (enabled) => {
      batchMode = enabled;
      calls.push(['batchMode', enabled]);
    },
    renderSummaries: () => calls.push('renderSummaries'),
    deleteSelectedSummaries: () => calls.push('deleteSelected'),
    editSelectedSummaries: () => calls.push('editSelected'),
    openCompactedRaw: () => calls.push('openRaw'),
    editCompactedSummary: () => calls.push('editCompacted'),
    runCompactedSummary: () => calls.push('runCompacted'),
    renderCompactedSummary: () => calls.push('renderCompacted'),
    clearSummaries: (sessionId) => calls.push(['clearSummaries', sessionId]),
    clearCompactedSummary: (sessionId) => calls.push(['clearCompacted', sessionId]),
    confirm: async (options) => {
      calls.push(['confirm', options.title]);
      return confirmQueue.shift();
    },
  });

  await clearButton.listeners.click();
  batchButton.listeners.click();
  batchCancelButton.listeners.click();
  batchDeleteButton.listeners.click();
  batchEditButton.listeners.click();
  compactedRawButton.listeners.click();
  compactedEditButton.listeners.click();
  compactedRunButton.listeners.click();
  await compactedClearButton.listeners.click();

  assert.deepEqual(calls, [
    ['confirm', '清空摘要'],
    ['clearSummaries', 'group:1'],
    'clearSelected',
    ['batchMode', false],
    'renderSummaries',
    ['batchMode', true],
    ['batchMode', false],
    'deleteSelected',
    'editSelected',
    'openRaw',
    'editCompacted',
    'runCompacted',
    ['confirm', '清空大总结'],
    ['clearCompacted', 'group:1'],
    'renderCompacted',
  ]);
  console.log('ok - bindSessionSummarySectionControls wires summary batch and compacted actions');
}

{
  const listeners = {};
  const windowRef = {
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const calls = [];
  let visible = false;
  bindSessionPanelSharedWindowEvents({
    target: windowRef,
    isPanelVisible: () => visible,
    applyMemoryMode: () => calls.push('applyMemoryMode'),
    getSessionId: () => 'chat:1',
    renderSummaries: () => calls.push('renderSummaries'),
    renderCompactedSummary: () => calls.push('renderCompacted'),
  });

  listeners['memory-storage-mode-changed']();
  listeners['chatapp-summaries-updated']({ detail: { sessionId: 'chat:1' } });
  visible = true;
  listeners['memory-storage-mode-changed']();
  listeners['chatapp-summaries-updated']({ detail: { sessionId: 'other' } });
  listeners['chatapp-summaries-updated']({ detail: { sessionId: 'chat:1' } });

  assert.deepEqual(calls, ['applyMemoryMode', 'renderSummaries', 'renderCompacted']);
  console.log('ok - bindSessionPanelSharedWindowEvents refreshes only when panel is visible and session matches');
}
