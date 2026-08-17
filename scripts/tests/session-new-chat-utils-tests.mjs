import assert from 'node:assert/strict';

import {
  clearSessionMemoriesForNewChat,
  runRpPlotResetFlow,
  runStartNewChatFlow,
} from '../../src/scripts/ui/session-new-chat-utils.js';

{
  const calls = [];
  const result = await clearSessionMemoriesForNewChat({
    sessionId: 'chat:1',
    isGroup: false,
    keepNonSummary: true,
    memoryTableStore: {
      getMemories: async (query) => {
        calls.push(['get', query]);
        return [
          { id: 'r1', table_id: 'chat_summary' },
          { id: 'r2', table_id: 'chat_outline' },
          { id: 'r3', table_id: 'other' },
        ];
      },
      batchDeleteMemories: async (ids) => calls.push(['delete', ids]),
    },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
    resolveSummaryTableIds: () => ['chat_summary', 'chat_outline'],
    notifyRowsUpdated: (detail) => calls.push(['notify', detail]),
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['get', {
      scope: 'contact',
      group_id: undefined,
      contact_id: 'chat:1',
      template_id: 'default-v1',
    }],
    ['delete', ['r1', 'r2']],
    ['notify', { sessionId: 'chat:1', templateId: 'default-v1' }],
  ]);
  console.log('ok - clearSessionMemoriesForNewChat keeps only summary rows when keepNonSummary is enabled');
}

{
  const calls = [];
  const result = await clearSessionMemoriesForNewChat({
    sessionId: 'chat:profile-clear',
    keepNonSummary: false,
    memoryTableStore: {
      getMemories: async (query) => {
        calls.push(['get', query]);
        if (query.scope === 'global') {
          return [
            { id: 'global-profile', table_id: 'user_profile' },
            { id: 'global-unrelated', table_id: 'moment_summary' },
          ];
        }
        return [{ id: 'contact-row', table_id: 'character_profile' }];
      },
      batchDeleteMemories: async (ids) => calls.push(['delete', ids]),
    },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['get', {
      scope: 'contact',
      group_id: undefined,
      contact_id: 'chat:profile-clear',
      template_id: 'default-v1',
    }],
    ['get', { scope: 'global', template_id: 'default-v1' }],
    ['delete', ['contact-row', 'global-profile']],
  ]);
  console.log('ok - clear-all new chat also deletes the global user profile and leaves other global tables intact');
}

{
  const deleted = [];
  const result = await clearSessionMemoriesForNewChat({
    sessionId: 'group:1',
    isGroup: true,
    keepNonSummary: false,
    memoryTableStore: {
      getMemories: async () => [{ id: 'r1', table_id: 'group_summary' }, { id: 'r2', table_id: 'other' }],
      batchDeleteMemories: async () => {
        throw new Error('batch failed');
      },
      deleteMemory: async (id) => deleted.push(id),
    },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
    resolveSummaryTableIds: () => ['group_summary', 'group_outline'],
  });
  assert.equal(result, true);
  assert.deepEqual(deleted, ['r1', 'r2']);
  console.log('ok - clearSessionMemoriesForNewChat falls back to per-row deletion when batch delete fails');
}

{
  const calls = [];
  const result = await runStartNewChatFlow({
    sessionId: 'chat:2',
    isGroup: false,
    sessionMode: 'chat',
    getMemoryStorageMode: () => 'table',
    askMemoryTableNewChatMode: async () => 'keep',
    promptForArchiveName: () => 'Archive A',
    buildMemoryTableSnapshot: async ({ sessionId, isGroup }) => {
      calls.push(['snapshot', sessionId, isGroup]);
      return { rows: [{ id: 'x' }] };
    },
    captureArchivePointer: async (sessionId, options) => {
      calls.push(['capture', sessionId, options]);
      return { pointer: true };
    },
    clearSessionMemories: async (payload) => calls.push(['clear', payload]),
    startNewChat: (sessionId, archiveName, options) => {
      calls.push(['start', sessionId, archiveName, options]);
      return 'arc-1';
    },
    persistArchivePointer: async (sessionId, archiveId, archivePointer, options) =>
      calls.push(['persist', sessionId, archiveId, archivePointer, options]),
    restoreMemoryForActiveThread: async (sessionId, options) =>
      calls.push(['restore', sessionId, options]),
    logger: { warn: (...args) => calls.push(['warn', ...args]) },
    sourcePrefix: 'contact',
  });
  assert.deepEqual(result, {
    started: true,
    cancelled: false,
    archiveId: 'arc-1',
    keepNonSummary: true,
    memoryTableSnapshot: { rows: [{ id: 'x' }] },
  });
  assert.deepEqual(calls, [
    ['snapshot', 'chat:2', false],
    ['capture', 'chat:2', {
      fallbackSnapshot: { rows: [{ id: 'x' }] },
      source: 'contact_start_new_chat_capture',
    }],
    ['clear', {
      sessionId: 'chat:2',
      isGroup: false,
      keepNonSummary: true,
      sessionMode: 'chat',
    }],
    ['start', 'chat:2', 'Archive A', { memoryTableSnapshot: { rows: [{ id: 'x' }] } }],
    ['persist', 'chat:2', 'arc-1', { pointer: true }, {
      fallbackSnapshot: { rows: [{ id: 'x' }] },
      source: 'contact_start_new_chat_save_archive',
    }],
    ['restore', 'chat:2', {
      refreshBaselineWhenNoTail: true,
      source: 'start_new_chat_contact',
    }],
  ]);
  console.log('ok - runStartNewChatFlow captures pointer clears memory persists archive and restores active thread');
}

{
  const calls = [];
  const result = await runStartNewChatFlow({
    sessionId: 'chat:3',
    isGroup: false,
    getMemoryStorageMode: () => 'table',
    askMemoryTableNewChatMode: async () => 'cancel',
    promptForArchiveName: () => {
      calls.push(['prompt']);
      return 'ignored';
    },
  });
  assert.deepEqual(result, { started: false, cancelled: true, archiveId: '' });
  assert.deepEqual(calls, []);
  console.log('ok - runStartNewChatFlow exits before prompting when table-mode new-chat dialog is cancelled');
}

{
  const calls = [];
  const result = await runRpPlotResetFlow({
    sessionId: 'rp:hero',
    keepInput: false,
    getMemoryStorageMode: () => 'table',
    askMemoryTableNewChatMode: async () => 'keep',
    promptForArchiveName: async () => '剧情存档',
    buildMemoryTableSnapshot: async () => ({ rows: ['memory'] }),
    captureArchivePointer: async () => ({ pointer: true }),
    clearSessionMemories: async () => calls.push('clear-memory'),
    persistArchivePointer: async () => calls.push('persist-pointer'),
    restoreMemoryForActiveThread: async () => calls.push('restore-baseline'),
    clearRenderedMessages: () => calls.push('clear-rendered'),
    resetVariableState: sessionId => calls.push(`reset-variables:${sessionId}`),
    resetRenderState: sessionId => calls.push(`reset-render:${sessionId}`),
    startNewChat: (sessionId, archiveName, options) => {
      calls.push(['start', sessionId, archiveName, options]);
      return 'archive-rp';
    },
    seedGreeting: async sessionId => calls.push(`seed:${sessionId}`),
    clearInput: () => calls.push('clear-input'),
    refreshUi: sessionId => calls.push(`refresh:${sessionId}`),
  });
  assert.equal(result.started, true);
  assert.equal(result.archiveId, 'archive-rp');
  assert.deepEqual(calls, [
    'clear-memory',
    'clear-rendered',
    'reset-variables:rp:hero',
    'reset-render:rp:hero',
    ['start', 'rp:hero', '剧情存档', { memoryTableSnapshot: { rows: ['memory'] } }],
    'persist-pointer',
    'restore-baseline',
    'seed:rp:hero',
    'clear-input',
    'refresh:rp:hero',
  ]);
  console.log('ok - runRpPlotResetFlow archives before resetting variables and reseeding the greeting');
}

{
  const calls = [];
  const result = await runRpPlotResetFlow({
    sessionId: 'rp:cancel',
    runStartNewChat: async () => ({ started: false, cancelled: true, archiveId: '' }),
    clearRenderedMessages: () => calls.push('clear-rendered'),
    resetVariableState: () => calls.push('reset-variables'),
    startNewChat: () => calls.push('start'),
    seedGreeting: async () => calls.push('seed'),
    clearInput: () => calls.push('clear-input'),
    refreshUi: () => calls.push('refresh'),
  });
  assert.deepEqual(result, { started: false, cancelled: true, archiveId: '' });
  assert.deepEqual(calls, []);
  console.log('ok - runRpPlotResetFlow leaves UI and data untouched when the archive flow is cancelled');
}
