import assert from 'node:assert/strict';

import { runArchiveDeleteFlow } from '../../src/scripts/ui/session-archive-delete-utils.js';

{
  const calls = [];
  const result = await runArchiveDeleteFlow({
    sessionId: 'chat:1',
    archiveId: 'arc-1',
    deleteArchiveTurnCheckpointState: async (sessionId, archiveId) => {
      calls.push(['checkpoint', sessionId, archiveId]);
    },
    deleteArchive: (archiveId, sessionId) => {
      calls.push(['delete', archiveId, sessionId]);
    },
    renderArchives: () => {
      calls.push(['render']);
    },
    logger: { warn: (...args) => calls.push(['warn', ...args]) },
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['checkpoint', 'chat:1', 'arc-1'],
    ['delete', 'arc-1', 'chat:1'],
    ['render'],
  ]);
  console.log('ok - runArchiveDeleteFlow deletes checkpoint state archive data and refreshes archive list');
}

{
  const calls = [];
  const result = await runArchiveDeleteFlow({
    sessionId: 'group:1',
    archiveId: 'arc-2',
    deleteArchiveTurnCheckpointState: async () => {
      throw new Error('checkpoint failed');
    },
    deleteArchive: (archiveId, sessionId) => {
      calls.push(['delete', archiveId, sessionId]);
    },
    renderArchives: () => {
      calls.push(['render']);
    },
    logger: { warn: (...args) => calls.push(['warn', ...args]) },
    warnMessage: 'delete group archive turn checkpoint state failed',
  });
  assert.equal(result, true);
  assert.deepEqual(calls, [
    ['warn', 'delete group archive turn checkpoint state failed', new Error('checkpoint failed')],
    ['delete', 'arc-2', 'group:1'],
    ['render'],
  ]);
  console.log('ok - runArchiveDeleteFlow keeps deleting archive after checkpoint cleanup failure');
}
