import assert from 'node:assert/strict';

import {
  buildWorldbookActionBatchPreview,
} from '../../src/scripts/ui/worldbook-action-preview-utils.js';

{
  const worldData = {
    id: 'world-a',
    name: 'World A',
    entries: [
      { id: 'a', comment: 'Alpha', content: 'old', key: ['alpha'], disable: false },
      { uid: 2, comment: 'Beta', content: 'beta', disable: false },
    ],
  };
  const preview = buildWorldbookActionBatchPreview({
    worldId: 'world-a',
    worldData,
    includeNextWorldData: true,
    actions: [
      { action: 'update_entry', entryId: 'a', patch: { content: 'new', key: ['alpha', 'route'] } },
      { action: 'disable_entry', entryId: '2' },
      { action: 'insert_entry', position: 'top', entry: { comment: 'Inserted', content: 'inserted lore' } },
      { action: 'delete_entry', entryId: '2' },
    ],
  });

  assert.equal(preview.worldId, 'world-a');
  assert.equal(preview.entryCountBefore, 2);
  assert.equal(preview.entryCountAfter, 2);
  assert.equal(preview.inserted, 1);
  assert.equal(preview.updated, 2);
  assert.equal(preview.deleted, 1);
  assert.equal(preview.skipped, 0);
  assert.equal(preview.changed, 4);
  assert.deepEqual(preview.entries.map(entry => entry.kind), ['update', 'update', 'insert', 'delete']);
  assert.deepEqual(preview.entries[0].diff.changedFields, ['content', 'key']);
  assert.equal(preview.entries[1].diff.after.disable, true);
  assert.equal(preview.entries[2].entryId, 'entry-preview-3');
  assert.equal(preview.nextWorldData.entries[0].comment, 'Inserted');
  assert.equal(preview.nextWorldData.entries[1].content, 'new');
  assert.deepEqual(preview.rollbackSnapshot.worldData, worldData);

  assert.equal(worldData.entries.length, 2);
  assert.equal(worldData.entries[0].content, 'old');
  assert.equal(worldData.entries[1].disable, false);
  console.log('ok - worldbook action preview simulates entry changes without mutating source data');
}

{
  const preview = buildWorldbookActionBatchPreview({
    worldData: {
      id: 'world-b',
      entries: [
        { id: 'keep', comment: 'Keep', content: 'same' },
      ],
    },
    actions: [
      { action: 'update_entry', entryId: 'missing', patch: { content: 'new' } },
      { action: 'unknown_action', entryId: 'keep' },
      { action: 'update_entry', entryId: 'keep', patch: { content: 'same' } },
      { action: 'update_entry', entryId: 'keep' },
    ],
  });
  assert.equal(preview.changed, 0);
  assert.equal(preview.skipped, 4);
  assert.deepEqual(preview.entries.map(entry => entry.reason), [
    'missingEntry',
    'unsupportedAction',
    'unchanged',
    'emptyPatch',
  ]);
  console.log('ok - worldbook action preview reports skipped actions with reasons');
}
