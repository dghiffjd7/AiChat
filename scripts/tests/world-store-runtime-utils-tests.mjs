import assert from 'node:assert/strict';

import {
  hasStoredWorldInfo,
  listWorldIds,
  loadStoredWorldInfo,
  waitForWorldStoreReady,
} from '../../src/scripts/ui/world-store-runtime-utils.js';
import { WorldInfoConcurrencyCoordinator } from '../../src/scripts/storage/worldinfo-concurrency.js';
import { mergeWorldbookChanges } from '../../src/scripts/ui/world-editor/worldbook-merge-utils.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('world store helpers prefer bridge contract methods', async () => {
  const calls = [];
  const bridge = {
    waitForWorldStoreReady: async () => {
      calls.push('ready');
      return true;
    },
    loadStoredWorldInfo: id => ({ id, source: 'contract' }),
    hasStoredWorldInfo: id => id === 'world-1',
    listWorlds: async () => ['world-1'],
  };
  assert.equal(await waitForWorldStoreReady(bridge), true);
  assert.deepEqual(loadStoredWorldInfo(bridge, 'world-1'), { id: 'world-1', source: 'contract' });
  assert.equal(hasStoredWorldInfo(bridge, 'world-1'), true);
  assert.deepEqual(await listWorldIds(bridge), ['world-1']);
  assert.deepEqual(calls, ['ready']);
});

test('world store helpers keep legacy worldStore fallback behavior', async () => {
  let ready = false;
  const bridge = {
    worldStore: {
      ready: Promise.resolve().then(() => {
        ready = true;
      }),
      load: id => (id === 'world-1' ? { id, source: 'fallback' } : null),
      list: () => ['world-1', 'world-2'],
    },
  };
  await waitForWorldStoreReady(bridge);
  assert.equal(ready, true);
  assert.deepEqual(loadStoredWorldInfo(bridge, 'world-1'), { id: 'world-1', source: 'fallback' });
  assert.equal(hasStoredWorldInfo(bridge, 'world-1'), true);
  assert.equal(hasStoredWorldInfo(bridge, 'missing'), false);
  assert.deepEqual(await listWorldIds(bridge), ['world-1', 'world-2']);
});

test('worldinfo coordinator serializes one resource while keeping different resources independent', async () => {
  const coordinator = new WorldInfoConcurrencyCoordinator();
  const events = [];
  let releaseWorldOne;
  const worldOneGate = new Promise(resolve => { releaseWorldOne = resolve; });

  const first = coordinator.enqueue('world-1', async () => {
    events.push('world-1:first:start');
    await worldOneGate;
    events.push('world-1:first:end');
  });
  const second = coordinator.enqueue('world-1', async () => {
    events.push('world-1:second');
  });
  const other = coordinator.enqueue('world-2', async () => {
    events.push('world-2');
  });

  await other;
  assert.deepEqual(events, ['world-1:first:start', 'world-2']);
  releaseWorldOne();
  await Promise.all([first, second]);
  assert.deepEqual(events, [
    'world-1:first:start',
    'world-2',
    'world-1:first:end',
    'world-1:second',
  ]);
});

test('worldinfo revisions reject stale writes and generation changes after delete/recreate', async () => {
  const coordinator = new WorldInfoConcurrencyCoordinator();
  const initial = { name: 'world-1', entries: [{ id: 'a', content: 'initial' }] };
  const opened = coordinator.snapshot('world-1', initial);
  assert.equal(opened.exists, true);

  const saved = coordinator.commitSave('world-1', {
    ...initial,
    entries: [{ id: 'a', content: 'new' }],
  });
  const stale = coordinator.validate('world-1', {
    expectedRevision: opened.revision,
    expectedGeneration: opened.generation,
  });
  assert.equal(stale?.reason, 'worldbook_revision_conflict');
  assert.equal(stale?.currentRevision, saved.revision);

  const deleted = coordinator.commitDelete('world-1');
  const recreated = coordinator.commitSave('world-1', initial);
  assert.ok(recreated.revision > deleted.revision);
  assert.ok(recreated.generation > opened.generation);
  const aba = coordinator.validate('world-1', {
    expectedRevision: opened.revision,
    expectedGeneration: opened.generation,
  });
  assert.equal(aba?.reason, 'worldbook_revision_conflict');
  assert.equal(aba?.currentGeneration, recreated.generation);
});

test('worldinfo fingerprint memoizes repeated observations of the same immutable object', () => {
  const coordinator = new WorldInfoConcurrencyCoordinator();
  let reads = 0;
  const world = {
    name: 'large-world',
    get entries() {
      reads += 1;
      return [{ id: 'entry-1', content: 'body' }];
    },
  };

  coordinator.observe('large-world', world);
  const firstReads = reads;
  coordinator.observe('large-world', world);

  assert.ok(firstReads > 0);
  assert.equal(reads, firstReads, 'same object identity must reuse its fingerprint');
});

test('worldbook three-way merge combines non-overlapping entry and field edits', () => {
  const base = {
    name: 'World',
    entries: [
      { id: 'a', comment: 'A', content: 'base-A', key: ['a'] },
      { id: 'b', comment: 'B', content: 'base-B', key: ['b'] },
    ],
  };
  const local = structuredClone(base);
  local.entries[1].content = 'local-B';
  local.entries[0].comment = 'local-title-A';
  const latest = structuredClone(base);
  latest.entries[0].content = 'maid-A';
  latest.entries[1].key = ['b', 'latest'];

  const result = mergeWorldbookChanges({ base, local, latest });
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.merged.entries[0].comment, 'local-title-A');
  assert.equal(result.merged.entries[0].content, 'maid-A');
  assert.equal(result.merged.entries[1].content, 'local-B');
  assert.deepEqual(result.merged.entries[1].key, ['b', 'latest']);
});

test('worldbook three-way merge reports same-field and delete-versus-edit conflicts', () => {
  const base = {
    name: 'World',
    entries: [
      { id: 'a', comment: 'A', content: 'base-A' },
      { id: 'b', comment: 'B', content: 'base-B' },
    ],
  };
  const local = structuredClone(base);
  local.entries[0].content = 'local-A';
  local.entries = local.entries.filter(entry => entry.id !== 'b');
  const latest = structuredClone(base);
  latest.entries[0].content = 'maid-A';
  latest.entries[1].comment = 'maid-title-B';

  const result = mergeWorldbookChanges({ base, local, latest });
  assert.deepEqual(
    result.conflicts.map(item => item.path).sort(),
    ['entries.a.content', 'entries.b'],
  );
});

test('worldbook three-way merge fails closed when id-less entries change concurrently', () => {
  const base = { entries: [{ comment: 'A' }, { comment: 'B' }, { comment: 'C' }] };
  const local = { entries: [{ comment: 'A' }, { comment: 'B' }] };
  const latest = { entries: [{ comment: 'B' }, { comment: 'C' }] };

  const result = mergeWorldbookChanges({ base, local, latest });
  assert.deepEqual(result.conflicts.map(item => item.path), ['entries']);
  assert.deepEqual(result.merged.entries, latest.entries);
});

test('worldbook three-way merge keeps a one-sided id-less entry edit', () => {
  const base = { entries: [{ comment: 'A', content: 'base' }] };
  const local = { entries: [{ comment: 'A', content: 'local' }] };
  const latest = structuredClone(base);

  const result = mergeWorldbookChanges({ base, local, latest });
  assert.deepEqual(result.conflicts, []);
  assert.deepEqual(result.merged.entries, local.entries);
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}
