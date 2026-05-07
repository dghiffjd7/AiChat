import assert from 'node:assert/strict';

import { createSessionSummarySectionRuntime } from '../../src/scripts/ui/session-summary-section-runtime-utils.js';

{
  let batchMode = true;
  let selectedKeys = new Set(['s1']);
  let summaryCompacting = false;
  const summaryCalls = [];
  const compactedCalls = [];

  const runtime = createSessionSummarySectionRuntime({
    variant: 'contact',
    getSessionId: () => 'contact:1',
    getChatStore: () => ({ tag: 'store' }),
    getSummariesContainer: () => ({ id: 'summaries' }),
    getCompactedContainer: () => ({ id: 'compacted' }),
    getBatchBar: () => ({ id: 'batchbar' }),
    getBatchMode: () => batchMode,
    setBatchModeState: (value) => {
      batchMode = value;
    },
    getSelectedKeys: () => selectedKeys,
    setSelectedKeys: (value) => {
      selectedKeys = value;
    },
    getSummaryCompacting: () => summaryCompacting,
    setSummaryCompacting: (value) => {
      summaryCompacting = value;
    },
    copyText: async () => {},
    deps: {
      applySessionSummaryBatchMode: ({ enabled, clearSelectedKeys, renderSummaries }) => {
        clearSelectedKeys();
        renderSummaries();
        return enabled;
      },
      renderSessionSummariesSection: (options) => {
        summaryCalls.push(options);
        return { kind: 'summaries', options };
      },
      renderSessionCompactedSummarySection: (options) => {
        compactedCalls.push(options);
        return { kind: 'compacted', options };
      },
    },
  });

  const renderedSummaries = runtime.renderSummaries();
  assert.equal(renderedSummaries.kind, 'summaries');
  assert.equal(summaryCalls[0].sessionId, 'contact:1');
  assert.equal(summaryCalls[0].chatStore.tag, 'store');
  assert.equal(summaryCalls[0].normalRowStyle, 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06);');

  summaryCalls[0].onSelectionChange(new Set(['s2', 's3']));
  assert.deepEqual([...selectedKeys], ['s2', 's3']);
  assert.equal(summaryCalls.length, 2);

  runtime.setSummaryBatchMode(false);
  assert.equal(batchMode, false);
  assert.deepEqual([...selectedKeys], []);
  assert.equal(summaryCalls.length, 3);

  const renderedCompacted = runtime.renderCompactedSummary();
  assert.equal(renderedCompacted.kind, 'compacted');
  assert.equal(compactedCalls[0].sessionId, 'contact:1');
  console.log('ok - createSessionSummarySectionRuntime renders summaries and compacted sections with shared state');
}

{
  const compactedEvents = [];
  let rawFlowOptions = null;
  let editFlowOptions = null;
  let editableVariant = '';
  let readonlyVariant = '';

  const runtime = createSessionSummarySectionRuntime({
    variant: 'group',
    getSessionId: () => 'group:1',
    getChatStore: () => ({
      getCompactedSummaryRaw: () => 'raw-summary',
      getCompactedSummary: () => 'summary',
      setCompactedSummary: () => {},
    }),
    getSelectedKeys: () => new Set(),
    setSelectedKeys: () => {},
    copyText: async () => {},
    dispatchUpdated: (sessionId) => compactedEvents.push(['dispatch', sessionId]),
    deps: {
      ensureSessionReadonlySummaryModal: ({ variant }) => {
        readonlyVariant = variant;
        return {
          setValue: (value) => compactedEvents.push(['raw:set', value]),
          show: () => compactedEvents.push(['raw:show']),
          focus: () => compactedEvents.push(['raw:focus']),
        };
      },
      ensureSessionEditableSummaryModal: ({ variant }) => {
        editableVariant = variant;
        return {
          setOnSave: (handler) => compactedEvents.push(['edit:setOnSave', typeof handler]),
          setValue: (value) => compactedEvents.push(['edit:set', value]),
          show: () => compactedEvents.push(['edit:show']),
          focus: () => compactedEvents.push(['edit:focus']),
          close: () => compactedEvents.push(['edit:close']),
        };
      },
      openCompactedRawFlow: (options) => {
        rawFlowOptions = options;
        options.ensureModal();
        options.setRawValue('RAW');
        options.showModal();
        options.focusTextarea();
      },
      openCompactedSummaryEditFlow: (options) => {
        editFlowOptions = options;
        options.ensureModal();
        options.setOnSave(() => {});
        options.setTextareaValue('EDIT');
        options.showModal();
        options.focusTextarea();
        options.closeModal();
        options.dispatchUpdated(options.sessionId);
      },
      renderSessionSummariesSection: () => null,
      renderSessionCompactedSummarySection: () => null,
    },
  });

  runtime.openCompactedRaw();
  runtime.editCompactedSummary();

  assert.equal(rawFlowOptions.sessionId, 'group:1');
  assert.equal(editFlowOptions.sessionId, 'group:1');
  assert.equal(readonlyVariant, 'group');
  assert.equal(editableVariant, 'group');
  assert.deepEqual(compactedEvents, [
    ['raw:set', 'RAW'],
    ['raw:show'],
    ['raw:focus'],
    ['edit:setOnSave', 'function'],
    ['edit:set', 'EDIT'],
    ['edit:show'],
    ['edit:focus'],
    ['edit:close'],
    ['dispatch', 'group:1'],
  ]);
  console.log('ok - createSessionSummarySectionRuntime wires compacted raw and edit modal flows');
}

{
  let batchMode = true;
  let selectedKeys = new Set(['x']);
  let compacting = false;
  let deleteFlowOptions = null;
  let editFlowOptions = null;
  let compactionOptions = null;
  const renderEvents = [];

  const runtime = createSessionSummarySectionRuntime({
    variant: 'contact',
    getSessionId: () => 'contact:2',
    getChatStore: () => ({
      deleteSummaryItems: () => {},
      updateSummaryItems: () => {},
    }),
    getSummariesContainer: () => ({}),
    getCompactedContainer: () => ({}),
    getBatchBar: () => ({}),
    getBatchMode: () => batchMode,
    setBatchModeState: (value) => {
      batchMode = value;
    },
    getSelectedKeys: () => selectedKeys,
    setSelectedKeys: (value) => {
      selectedKeys = value;
    },
    getSummaryCompacting: () => compacting,
    setSummaryCompacting: (value) => {
      compacting = value;
    },
    confirm: () => true,
    copyText: async () => {},
    resolveRequestSummaryCompaction: () => 'request-fn',
    deps: {
      buildSelectedSummaryEntries: () => [],
      parseEditedSummaryLines: () => [],
      applySessionSummaryBatchMode: ({ enabled, clearSelectedKeys, renderSummaries }) => {
        if (!enabled) clearSelectedKeys();
        renderSummaries();
        return enabled;
      },
      runDeleteSelectedSummariesFlow: async (options) => {
        deleteFlowOptions = options;
      },
      ensureSessionEditableSummaryModal: () => ({
        setValue: () => {},
        setOnSave: () => {},
        show: () => {},
        focus: () => {},
        close: () => {},
      }),
      openSessionEditableSummaryModal: ({ onSave }) => onSave([]),
      runEditSelectedSummariesFlow: (options) => {
        editFlowOptions = options;
      },
      runCompactedSummaryGenerationFlow: async (options) => {
        compactionOptions = options;
        options.setSummaryCompacting(true);
        options.renderSummaries();
        options.renderCompactedSummary();
      },
      renderSessionSummariesSection: () => {
        renderEvents.push('summaries');
        return null;
      },
      renderSessionCompactedSummarySection: () => {
        renderEvents.push('compacted');
        return null;
      },
    },
  });

  await runtime.deleteSelectedSummaries();
  runtime.editSelectedSummaries();
  await runtime.runCompactedSummary();

  assert.equal(deleteFlowOptions.sessionId, 'contact:2');
  assert.deepEqual(deleteFlowOptions.selectedKeys, ['x']);
  assert.equal(editFlowOptions.sessionId, 'contact:2');
  assert.deepEqual(editFlowOptions.selectedKeys, ['x']);
  assert.equal(compactionOptions.sessionId, 'contact:2');
  assert.equal(compactionOptions.resolveRequestSummaryCompaction(), 'request-fn');
  assert.equal(compacting, true);
  assert.deepEqual(renderEvents, ['summaries', 'compacted']);
  console.log('ok - createSessionSummarySectionRuntime forwards delete edit and compaction flows');
}
