import assert from 'node:assert/strict';

import { runArchiveSwitchFlow } from '../../src/scripts/ui/session-archive-switch-utils.js';

{
  const calls = [];
  const result = await runArchiveSwitchFlow({
    sessionId: 'chat:1',
    isGroup: false,
    archive: {
      id: 'arc-1',
      memoryTableSnapshot: { rows: [{ id: 'row-a' }] },
    },
    getMemoryStorageMode: () => 'table',
    buildMemoryTableSnapshot: async ({ sessionId, isGroup }) => {
      calls.push(['snapshot', sessionId, isGroup]);
      return { rows: [{ id: 'current-row' }] };
    },
    captureArchivePointer: async (sessionId, options) => {
      calls.push(['capture', sessionId, options]);
      return { pointer: true };
    },
    loadArchivedMessages: async (archiveId, sessionId, options) => {
      calls.push(['load', archiveId, sessionId, options]);
      return true;
    },
    getLastArchiveTransition: (sessionId) => {
      calls.push(['transition', sessionId]);
      return { archivedCurrentId: 'arc-current' };
    },
    persistArchivePointer: async (sessionId, archiveId, archivePointer, options) => {
      calls.push(['persist', sessionId, archiveId, archivePointer, options]);
    },
    applyMemoryTableSnapshot: async (payload) => {
      calls.push(['apply', payload]);
      return true;
    },
    restoreArchivePointerForLoadedThread: async (sessionId, options) => {
      calls.push(['restore', sessionId, options]);
    },
    logger: { warn: (...args) => calls.push(['warn', ...args]) },
    sourcePrefix: 'contact',
    restoreWarnMessage: 'restore checkpoint memory after archive load failed',
  });
  assert.deepEqual(result, {
    loaded: true,
    currentSnapshot: { rows: [{ id: 'current-row' }] },
    currentArchivePointer: { pointer: true },
    targetSnapshot: { rows: [{ id: 'row-a' }] },
    archivedCurrentId: 'arc-current',
  });
  assert.deepEqual(calls, [
    ['snapshot', 'chat:1', false],
    ['capture', 'chat:1', {
      fallbackSnapshot: { rows: [{ id: 'current-row' }] },
      source: 'contact_archive_switch_capture',
    }],
    ['load', 'arc-1', 'chat:1', {
      memoryTableSnapshot: { rows: [{ id: 'current-row' }] },
    }],
    ['transition', 'chat:1'],
    ['persist', 'chat:1', 'arc-current', { pointer: true }, {
      fallbackSnapshot: { rows: [{ id: 'current-row' }] },
      source: 'contact_archive_switch_save_previous',
    }],
    ['apply', {
      sessionId: 'chat:1',
      isGroup: false,
      snapshot: { rows: [{ id: 'row-a' }] },
    }],
    ['restore', 'chat:1', {
      refreshBaselineWhenNoTail: true,
      source: 'archive_load_contact',
    }],
  ]);
  console.log('ok - runArchiveSwitchFlow captures current state loads archive persists previous pointer and restores target state');
}

{
  const calls = [];
  const result = await runArchiveSwitchFlow({
    sessionId: 'group:1',
    isGroup: true,
    archive: { id: 'arc-2', memoryTableSnapshot: { rows: [{ id: 'x' }] } },
    getMemoryStorageMode: () => 'summary',
    loadArchivedMessages: async (archiveId, sessionId, options) => {
      calls.push(['load', archiveId, sessionId, options]);
      return false;
    },
    getLastArchiveTransition: (sessionId) => {
      calls.push(['transition', sessionId]);
      return { archivedCurrentId: 'arc-prev' };
    },
    persistArchivePointer: async () => calls.push(['persist']),
    applyMemoryTableSnapshot: async () => calls.push(['apply']),
    restoreArchivePointerForLoadedThread: async () => calls.push(['restore']),
    logger: { warn: (...args) => calls.push(['warn', ...args]) },
    sourcePrefix: 'group',
    restoreWarnMessage: 'restore checkpoint memory after group archive load failed',
  });
  assert.deepEqual(result, {
    loaded: false,
    currentSnapshot: null,
    currentArchivePointer: null,
    targetSnapshot: { rows: [{ id: 'x' }] },
    archivedCurrentId: 'arc-prev',
  });
  assert.deepEqual(calls, [
    ['load', 'arc-2', 'group:1', { memoryTableSnapshot: null }],
    ['transition', 'group:1'],
  ]);
  console.log('ok - runArchiveSwitchFlow skips pointer persistence snapshot apply and restore when archive load fails');
}
