import assert from 'node:assert/strict';

const {
  BUILTIN_PHONE_FORMAT_WORLDBOOK_ID,
} = await import('../../src/scripts/storage/builtin-worldbooks.js');
const {
  buildTransferWorldIdList,
  collectTransferWorldbookBundle,
} = await import('../../src/scripts/ui/transfer-worldbook-utils.js');

{
  const worldIds = buildTransferWorldIdList({
    sessionWorldIds: [' world:main ', 'world:main', '', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID],
    globalWorldId: ' world:global ',
  });
  assert.deepEqual(worldIds, ['world:main', 'world:global']);
  console.log('ok - buildTransferWorldIdList normalizes deduplicates and skips builtin worldbooks');
}

{
  const worldIds = buildTransferWorldIdList({
    sessionWorldIds: [' raw ', 'raw', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, ' raw '],
    normalizeSessionWorldIds: false,
  });
  assert.deepEqual(worldIds, [' raw ', 'raw']);
  console.log('ok - buildTransferWorldIdList can preserve raw session world ids for card export compatibility');
}

{
  const calls = [];
  const errors = [];
  const sourceWorldbooks = {
    'world:main': { id: 'world:main', name: '', entries: [{ key: 'main' }] },
    'world:global': { id: 'world:global', name: 'Global', entries: [{ key: 'global' }] },
  };
  const bundle = await collectTransferWorldbookBundle({
    sessionId: ' session:a ',
    appBridge: {
      globalWorldId: ' world:global ',
      getWorldIdsForSession(sessionId) {
        assert.equal(sessionId, 'session:a');
        return [' world:main ', 'world:main', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, 'world:fail'];
      },
      async getWorldInfo(id) {
        calls.push(id);
        if (id === 'world:fail') throw new Error('load failed');
        return sourceWorldbooks[id];
      },
    },
    cloneWorldbook: value => JSON.parse(JSON.stringify(value)),
    onError: (err, id) => errors.push({ id, message: err.message }),
  });

  assert.deepEqual(bundle.worldIds, ['world:main', 'world:fail', 'world:global']);
  assert.equal(bundle.globalWorldId, 'world:global');
  assert.deepEqual(calls, ['world:main', 'world:fail', 'world:global']);
  assert.deepEqual(errors, [{ id: 'world:fail', message: 'load failed' }]);
  assert.deepEqual(Object.keys(bundle.worldbooks), ['world:main', 'world:global']);
  assert.equal(bundle.worldbooks['world:main'].name, 'world:main');
  bundle.worldbooks['world:main'].entries[0].key = 'changed';
  assert.equal(sourceWorldbooks['world:main'].entries[0].key, 'main');
  console.log('ok - collectTransferWorldbookBundle preserves experience pack worldbook collection contracts');
}

{
  const calls = [];
  const bundle = await collectTransferWorldbookBundle({
    appBridge: {
      getWorldIdsForSession() {
        return [' raw ', 'raw', BUILTIN_PHONE_FORMAT_WORLDBOOK_ID, ' raw '];
      },
      async getWorldInfo(id) {
        calls.push(id);
        return { id, name: id };
      },
    },
    normalizeSessionWorldIds: false,
  });

  assert.deepEqual(bundle.worldIds, [' raw ', 'raw']);
  assert.deepEqual(calls, [' raw ', 'raw']);
  assert.equal(bundle.globalWorldId, '');
  assert.deepEqual(Object.keys(bundle.worldbooks), [' raw ', 'raw']);
  console.log('ok - collectTransferWorldbookBundle preserves card export raw world id compatibility');
}
