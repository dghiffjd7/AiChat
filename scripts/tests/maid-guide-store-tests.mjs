import assert from 'node:assert/strict';

import {
  MaidGuideStore,
  buildMaidGuideStoreKey,
  normalizeMaidGuideStoreState,
} from '../../src/scripts/storage/maid-guide-store.js';

const createStorage = () => {
  const backing = new Map();
  return {
    backing,
    getItem: key => backing.get(String(key)) ?? null,
    setItem: (key, value) => {
      backing.set(String(key), String(value));
    },
    removeItem: key => {
      backing.delete(String(key));
    },
  };
};

{
  assert.equal(buildMaidGuideStoreKey(''), 'maid_guide_store_v1');
  assert.equal(buildMaidGuideStoreKey(' rp:char '), 'maid_guide_store_v1__rp_char');
  console.log('ok - maid guide store keys are scoped');
}

{
  const state = normalizeMaidGuideStoreState({
    completed: {
      a: { guideId: 'a', completedAt: 10 },
      b: { guideId: 'b', completedAt: 20 },
    },
  }, {
    now: () => 100,
    maxCompleted: 1,
  });
  assert.deepEqual(Object.keys(state.completed), ['b']);
  console.log('ok - maid guide store normalization trims old guide records');
}

{
  let now = 1000;
  const storage = createStorage();
  const store = new MaidGuideStore({
    storage,
    now: () => now,
  });
  store.load();
  assert.equal(store.isCompleted('session.config.open.guide'), false);

  const record = store.markCompleted('session.config.open.guide', {
    featureId: 'session.config.open',
    title: '打开会话配置',
  });
  assert.equal(record.completedAt, 1000);
  assert.equal(store.isCompleted('session.config.open.guide'), true);
  assert.match(storage.backing.get('maid_guide_store_v1'), /session\.config\.open\.guide/);

  now = 1200;
  const restored = new MaidGuideStore({
    storage,
    now: () => now,
  });
  restored.load();
  assert.equal(restored.getGuide('session.config.open.guide').featureId, 'session.config.open');
  assert.equal(restored.resetGuide('session.config.open.guide'), true);
  assert.equal(restored.isCompleted('session.config.open.guide'), false);
  console.log('ok - MaidGuideStore persists, reads, and resets completed guides');
}
