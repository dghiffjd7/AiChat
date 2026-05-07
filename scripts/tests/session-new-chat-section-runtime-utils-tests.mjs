import assert from 'node:assert/strict';

import { createSessionNewChatSectionRuntime } from '../../src/scripts/ui/session-new-chat-section-runtime-utils.js';

{
  let clearOptions = null;
  let flowOptions = null;
  const startedEvents = [];

  const runtime = createSessionNewChatSectionRuntime({
    getSessionId: () => 'rp:hero',
    isGroup: false,
    resolveSessionMode: () => 'rp',
    getMemoryStorageMode: () => 'summary',
    askMemoryTableNewChatMode: async () => 'keep',
    promptForArchiveName: () => 'archive-a',
    buildMemoryTableSnapshot: async () => ({ rows: ['x'] }),
    captureArchivePointer: () => ({ pointer: true }),
    memoryTableStore: { id: 'memory-store' },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
    resolveSummaryTableIds: ({ sessionId, isGroup, sessionMode }) => {
      assert.equal(sessionId, 'rp:hero');
      assert.equal(isGroup, false);
      assert.equal(sessionMode, 'rp');
      return ['rp_summary', 'rp_outline'];
    },
    notifyRowsUpdated: ({ sessionId, templateId }) => startedEvents.push(['rows', sessionId, templateId]),
    startNewChat: () => {},
    persistArchivePointer: () => {},
    restoreMemoryForActiveThread: () => {},
    logger: { warn() {} },
    sourcePrefix: 'contact',
    onStarted: ({ sessionId, isGroup, sessionMode }) => startedEvents.push(['started', sessionId, isGroup, sessionMode]),
    deps: {
      clearSessionMemoriesForNewChat: async (options) => {
        clearOptions = options;
        return true;
      },
      runStartNewChatFlow: async (options) => {
        flowOptions = options;
        await options.clearSessionMemories({
          sessionId: 'rp:hero',
          isGroup: false,
          keepNonSummary: true,
          sessionMode: 'rp',
        });
        return { started: true };
      },
    },
  });

  const result = await runtime.startNewChat();
  assert.equal(result.started, true);
  assert.equal(flowOptions.sessionId, 'rp:hero');
  assert.equal(flowOptions.sessionMode, 'rp');
  assert.equal(flowOptions.sourcePrefix, 'contact');
  assert.equal(clearOptions.sessionId, 'rp:hero');
  assert.equal(clearOptions.isGroup, false);
  assert.equal(clearOptions.keepNonSummary, true);
  assert.equal(clearOptions.memoryTableStore.id, 'memory-store');
  assert.deepEqual(clearOptions.resolveSummaryTableIds({ sessionId: 'rp:hero', isGroup: false }), ['rp_summary', 'rp_outline']);
  assert.deepEqual(startedEvents, [['started', 'rp:hero', false, 'rp']]);
  console.log('ok - createSessionNewChatSectionRuntime forwards contact new-chat flow and rp summary-table resolution');
}

{
  let clearOptions = null;
  let flowOptions = null;
  let startedCalled = false;

  const runtime = createSessionNewChatSectionRuntime({
    getSessionId: () => 'group:1',
    isGroup: true,
    resolveSessionMode: () => 'chat',
    getMemoryStorageMode: () => 'table',
    askMemoryTableNewChatMode: async () => 'reset',
    promptForArchiveName: () => 'archive-b',
    buildMemoryTableSnapshot: async () => ({ rows: [] }),
    captureArchivePointer: () => ({ pointer: true }),
    memoryTableStore: { id: 'memory-store' },
    resolveDefaultMemoryTemplateId: async () => 'default-v1',
    resolveSummaryTableIds: ({ isGroup, sessionMode }) => {
      assert.equal(isGroup, true);
      assert.equal(sessionMode, 'chat');
      return ['group_summary', 'group_outline'];
    },
    notifyRowsUpdated: () => {},
    startNewChat: () => {},
    persistArchivePointer: () => {},
    restoreMemoryForActiveThread: () => {},
    logger: { warn() {} },
    sourcePrefix: 'group',
    onStarted: () => {
      startedCalled = true;
    },
    deps: {
      clearSessionMemoriesForNewChat: async (options) => {
        clearOptions = options;
        return true;
      },
      runStartNewChatFlow: async (options) => {
        flowOptions = options;
        await options.clearSessionMemories({
          sessionId: 'group:1',
          isGroup: true,
          keepNonSummary: false,
          sessionMode: 'chat',
        });
        return { started: false };
      },
    },
  });

  const result = await runtime.startNewChat();
  assert.equal(result.started, false);
  assert.equal(flowOptions.sessionId, 'group:1');
  assert.equal(flowOptions.sessionMode, 'chat');
  assert.equal(flowOptions.sourcePrefix, 'group');
  assert.equal(clearOptions.isGroup, true);
  assert.equal(clearOptions.keepNonSummary, false);
  assert.deepEqual(clearOptions.resolveSummaryTableIds({ sessionId: 'group:1', isGroup: true }), ['group_summary', 'group_outline']);
  assert.equal(startedCalled, false);
  console.log('ok - createSessionNewChatSectionRuntime forwards group new-chat flow and skips onStarted when not started');
}
