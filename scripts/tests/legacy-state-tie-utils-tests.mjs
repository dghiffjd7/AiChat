import assert from 'node:assert/strict';

import { resolveLegacyStateTie } from '../../src/scripts/storage/legacy-state-tie-utils.js';

const state = ({ updatedAt = 0, items = [] } = {}) => ({ updatedAt, items });
const isEmpty = value => !Array.isArray(value?.items) || value.items.length === 0;

assert.deepEqual(
  resolveLegacyStateTie({
    local: state({ items: ['local'] }),
    kv: state({ items: ['kv'] }),
    isEmpty,
  }),
  { action: 'adopt_local', backupRequired: true },
  'legacy ties with content on both sides must preserve both snapshots before adopting local',
);

assert.deepEqual(
  resolveLegacyStateTie({
    local: state(),
    kv: state({ items: ['kv'] }),
    isEmpty,
  }),
  { action: 'adopt_kv', backupRequired: false },
  'an empty legacy local mirror must not overwrite non-empty KV state',
);

assert.deepEqual(
  resolveLegacyStateTie({
    local: state({ items: ['local'] }),
    kv: state(),
    isEmpty,
  }),
  { action: 'adopt_local', backupRequired: false },
  'a non-empty legacy local mirror must recover an empty shaped KV state',
);

assert.deepEqual(
  resolveLegacyStateTie({
    local: state(),
    kv: state(),
    isEmpty,
  }),
  { action: 'adopt_kv', backupRequired: false },
  'two empty legacy states should converge on KV without a recovery backup',
);

assert.deepEqual(
  resolveLegacyStateTie({
    local: state({ updatedAt: 10, items: ['local'] }),
    kv: state({ updatedAt: 10, items: ['kv'] }),
    isEmpty,
  }),
  { action: 'keep_blocked', backupRequired: false },
  'modern equal timestamps with divergent content must remain fail-closed',
);

console.log('ok - legacy state tie decisions cover empty, populated, and modern conflict states');
