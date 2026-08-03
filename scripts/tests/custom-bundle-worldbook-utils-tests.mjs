import assert from 'node:assert/strict';

const {
  BUILTIN_PHONE_FORMAT_WORLDBOOK_ID,
} = await import('../../src/scripts/storage/builtin-worldbooks.js');
const {
  collectCustomBundleWorldbookRecords,
  getCustomBundleRoleWorldIds,
  getCustomBundleSessionWorldIds,
  mergeCustomBundleExportWorldIds,
} = await import('../../src/scripts/ui/custom-bundle-worldbook-utils.js');

{
  const ids = getCustomBundleSessionWorldIds({
    globalWorldId: ' world:global ',
    globalWorldIds: [' world:global ', 'world:global-extra'],
    worldSessionMap: {
      'session:a': [' world:main ', 'world:main', '', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID],
    },
  }, ' session:a ');
  assert.deepEqual(ids, ['world:main', 'world:global', 'world:global-extra']);
  console.log('ok - getCustomBundleSessionWorldIds normalizes session and global world ids');
}

{
  const ids = getCustomBundleSessionWorldIds({
    globalWorldId: BUILTIN_PHONE_FORMAT_WORLDBOOK_ID,
    worldSessionMap: {
      'session:b': 'world:solo',
    },
  }, 'session:b');
  assert.deepEqual(ids, ['world:solo']);
  assert.deepEqual(getCustomBundleSessionWorldIds({}, ''), []);
  console.log('ok - getCustomBundleSessionWorldIds supports string bindings and skips builtin globals');
}

{
  assert.deepEqual(
    getCustomBundleRoleWorldIds({
      source: {
        worldbookId: ' world:role ',
        worldbookEnabled: false,
      },
    }),
    ['world:role'],
  );
  assert.deepEqual(getCustomBundleRoleWorldIds({ source: { worldbookId: BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } }), []);
  assert.deepEqual(getCustomBundleRoleWorldIds({}), []);
  console.log('ok - getCustomBundleRoleWorldIds preserves source-worldbook export compatibility');
}

{
  const ids = mergeCustomBundleExportWorldIds(
    ['world:main', 'world:global'],
    [' world:role ', 'world:main', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID],
  );
  assert.deepEqual(ids, ['world:main', 'world:global', 'world:role']);
  console.log('ok - mergeCustomBundleExportWorldIds deduplicates room and role world ids');
}

{
  const calls = [];
  const errors = [];
  const storeRecord = { name: 'Store', entries: [{ key: 'store' }] };
  const records = await collectCustomBundleWorldbookRecords({
    worldIds: [' world:store ', 'world:bridge', '', 'world:missing', 'world:fail', 'world:store'],
    worldStoreMap: {
      'world:store': storeRecord,
    },
    async getWorldInfo(id) {
      calls.push(id);
      if (id === 'world:fail') throw new Error('load failed');
      if (id === 'world:missing') return null;
      return { name: 'Bridge', entries: [{ key: id }] };
    },
    cloneWorldbook: value => JSON.parse(JSON.stringify(value)),
    onError: (err, id) => errors.push({ id, message: err.message }),
  });

  assert.deepEqual(Object.keys(records), ['world:store', 'world:bridge']);
  assert.deepEqual(calls, ['world:bridge', 'world:missing', 'world:fail']);
  assert.deepEqual(errors, [{ id: 'world:fail', message: 'load failed' }]);
  records['world:store'].entries[0].key = 'changed';
  assert.equal(storeRecord.entries[0].key, 'store');
  console.log('ok - collectCustomBundleWorldbookRecords prefers store records and falls back to bridge per worldbook');
}
