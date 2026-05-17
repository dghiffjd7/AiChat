import assert from 'node:assert/strict';

import { persistComposedMomentRecord } from '../../src/scripts/ui/moment-compose-runtime-utils.js';

{
  const saved = new Map();
  const momentsStore = {
    upsert(moment) {
      const id = String(moment?.id || 'moment-generated').trim();
      const prev = saved.get(id) || {};
      const next = { ...prev, ...moment, id };
      saved.set(id, next);
      return next;
    },
    get(id) {
      return saved.get(id) || null;
    },
  };
  const result = persistComposedMomentRecord({
    momentsStore,
    record: {
      author: '我',
      content: '今天很好',
      comments: [],
    },
    assets: [
      { output: { path: '/tmp/a.png' }, prompt: 'a' },
    ],
    normalizeGeneratedImageAsset: (asset, extra) => ({
      ...asset,
      sourceMomentId: extra.sourceMomentId,
    }),
  });

  assert.equal(result.ok, true);
  assert.equal(result.momentId, 'moment-generated');
  assert.deepEqual(result.generatedImages, [
    { output: { path: '/tmp/a.png' }, prompt: 'a', sourceMomentId: 'moment-generated' },
  ]);
  assert.equal(saved.get('moment-generated').generatedImages[0].sourceMomentId, 'moment-generated');
  console.log('ok - persistComposedMomentRecord uses generated store id for publish comments and images');
}

{
  const result = persistComposedMomentRecord({
    momentsStore: {},
    record: { content: 'missing store' },
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'missing-input');
  console.log('ok - persistComposedMomentRecord reports missing store instead of silently returning an empty id');
}
