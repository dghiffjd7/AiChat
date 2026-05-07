import assert from 'node:assert/strict';

import { createSessionArchiveSectionRuntime } from '../../src/scripts/ui/session-archive-section-runtime-utils.js';

{
  let capturedOptions = null;
  const runtime = createSessionArchiveSectionRuntime({
    getContainer: () => ({ id: 'archives' }),
    getSessionId: () => 'contact:1',
    getChatStore: () => ({ id: 'store' }),
    isGroup: false,
    getMemoryStorageMode: () => 'summary',
    buildMemoryTableSnapshot: async () => ({ rows: [] }),
    captureArchivePointer: () => ({ pointer: true }),
    loadArchivedMessages: () => [],
    getLastArchiveTransition: () => ({ type: 'recent' }),
    persistArchivePointer: () => {},
    applyMemoryTableSnapshot: () => {},
    restoreArchivePointerForLoadedThread: () => {},
    logger: { warn() {} },
    appConfirmFn: () => true,
    runArchiveSwitchFlow: () => {},
    runArchiveDeleteFlow: () => {},
    deleteArchiveTurnCheckpointState: () => {},
    deleteArchive: () => {},
    onArchiveLoaded: () => {},
    onArchiveDeleted: () => {},
    onHide: () => {},
    createEmptyState: () => ({ kind: 'empty' }),
    createArchiveRow: () => ({ kind: 'row' }),
    sourcePrefix: 'contact',
    restoreWarnMessage: 'restore warn',
    deleteWarnMessage: 'delete warn',
    deps: {
      renderSessionArchivesSection: (options) => {
        capturedOptions = options;
        return { kind: 'archives', options };
      },
    },
  });

  const rendered = runtime.renderArchives();
  assert.equal(rendered.kind, 'archives');
  assert.equal(capturedOptions.container.id, 'archives');
  assert.equal(capturedOptions.sessionId, 'contact:1');
  assert.equal(capturedOptions.chatStore.id, 'store');
  assert.equal(capturedOptions.isGroup, false);
  assert.equal(capturedOptions.sourcePrefix, 'contact');
  assert.equal(capturedOptions.restoreWarnMessage, 'restore warn');
  assert.equal(capturedOptions.deleteWarnMessage, 'delete warn');
  console.log('ok - createSessionArchiveSectionRuntime forwards archive section dependencies for contacts');
}

{
  let capturedOptions = null;
  const runtime = createSessionArchiveSectionRuntime({
    getContainer: () => ({ id: 'group-archives' }),
    getSessionId: () => 'group:1',
    getChatStore: () => ({ id: 'group-store' }),
    isGroup: true,
    sourcePrefix: 'group',
    deps: {
      renderSessionArchivesSection: (options) => {
        capturedOptions = options;
        return options;
      },
    },
  });

  runtime.renderArchives();
  assert.equal(capturedOptions.container.id, 'group-archives');
  assert.equal(capturedOptions.sessionId, 'group:1');
  assert.equal(capturedOptions.chatStore.id, 'group-store');
  assert.equal(capturedOptions.isGroup, true);
  assert.equal(capturedOptions.sourcePrefix, 'group');
  console.log('ok - createSessionArchiveSectionRuntime forwards archive section dependencies for groups');
}
