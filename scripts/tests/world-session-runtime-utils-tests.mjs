import assert from 'node:assert/strict';

import {
  deleteWorldSessionMapEntry,
  emitWorldInfoChanged,
  getCurrentWorldId,
  getCurrentWorldIds,
  getGlobalWorldId,
  getWorldIdsForSession,
  getWorldSessionMap,
  persistWorldSessionMap,
  renameWorldSessionMapEntry,
  replaceWorldSessionMap,
  setCurrentWorld,
} from '../../src/scripts/ui/world-session-runtime-utils.js';

{
  const worldSessionMap = { s1: ['w1'] };
  const bridge = {
    worldSessionMap: { legacy: ['legacy'] },
    getWorldSessionMap: () => worldSessionMap,
  };
  assert.equal(getWorldSessionMap(bridge), worldSessionMap);
  console.log('ok - world session runtime helper prefers explicit map getter');
}

{
  const bridge = {
    worldSessionMap: { s1: ['w1'] },
    persisted: 0,
    persistWorldSessionMap() {
      this.persisted += 1;
    },
  };
  assert.equal(renameWorldSessionMapEntry(bridge, 's1', 's2'), true);
  assert.deepEqual(bridge.worldSessionMap, { s2: ['w1'] });
  assert.equal(deleteWorldSessionMapEntry(bridge, 's2'), true);
  assert.deepEqual(bridge.worldSessionMap, {});
  assert.equal(bridge.persisted, 2);
  console.log('ok - world session runtime helper keeps legacy rename delete fallback');
}

{
  const nextMap = { s3: ['w3'] };
  const bridge = {
    replaced: null,
    replaceWorldSessionMap(map) {
      this.replaced = map;
    },
  };
  assert.equal(replaceWorldSessionMap(bridge, nextMap), true);
  assert.equal(bridge.replaced, nextMap);
  console.log('ok - world session runtime helper delegates map replacement contract');
}

{
  const bridge = {
    getCurrentWorldId: () => 'w1',
    getCurrentWorldIds: () => ['w1', 'w2'],
    getGlobalWorldId: () => 'global',
    getWorldIdsForSession: sessionId => (sessionId === 's1' ? ['w3'] : []),
  };
  assert.equal(getCurrentWorldId(bridge), 'w1');
  assert.deepEqual(getCurrentWorldIds(bridge), ['w1', 'w2']);
  assert.equal(getGlobalWorldId(bridge), 'global');
  assert.deepEqual(getWorldIdsForSession(bridge, 's1'), ['w3']);
  console.log('ok - world session runtime helper prefers explicit world state getters');
}

{
  const bridge = {
    currentWorldId: 'legacy-current',
    currentWorldIds: ['legacy-current', 'legacy-extra'],
    globalWorldId: 'legacy-global',
    worldSessionMap: { s1: ['legacy-session'] },
  };
  assert.equal(getCurrentWorldId(bridge), 'legacy-current');
  assert.deepEqual(getCurrentWorldIds(bridge), ['legacy-current', 'legacy-extra']);
  assert.equal(getGlobalWorldId(bridge), 'legacy-global');
  assert.deepEqual(getWorldIdsForSession(bridge, 's1'), ['legacy-session']);
  console.log('ok - world session runtime helper keeps legacy world state fallback');
}

{
  const bridge = {
    persisted: 0,
    persistWorldSessionMap() {
      this.persisted += 1;
    },
  };
  assert.equal(persistWorldSessionMap(bridge), true);
  assert.equal(bridge.persisted, 1);
  assert.equal(persistWorldSessionMap(null), false);
  console.log('ok - world session runtime helper delegates persist contract safely');
}

{
  const bridge = {
    detail: null,
    emitWorldInfoChanged(detail) {
      this.detail = detail;
    },
  };
  assert.equal(emitWorldInfoChanged(bridge, { sessionId: 's1' }), true);
  assert.deepEqual(bridge.detail, { sessionId: 's1' });
  assert.equal(emitWorldInfoChanged({}, {}), false);
  console.log('ok - world session runtime helper delegates world info events safely');
}

{
  const calls = [];
  const bridge = {
    setCurrentWorld(worldId, sessionId) {
      calls.push([worldId, sessionId]);
    },
  };
  assert.equal(setCurrentWorld(bridge, 'w1', 's1'), true);
  assert.deepEqual(calls, [['w1', 's1']]);
  assert.equal(setCurrentWorld({}, 'w1', 's1'), false);
  console.log('ok - world session runtime helper delegates current world setter safely');
}
