import assert from 'node:assert/strict';

import {
  createFormatRepairMomentTransactionRuntime,
} from '../../src/scripts/ui/chat/format-repair-moment-transaction-utils.js';

const clone = value => JSON.parse(JSON.stringify(value));

{
  let state = { moments: [{ id: 'existing', comments: [] }] };
  const finalized = [];
  const runtime = createFormatRepairMomentTransactionRuntime({
    exportState: () => clone(state),
    importState: snapshot => { state = clone(snapshot); },
    addMany: items => {
      state.moments.push(...clone(items));
      return items;
    },
    getMoment: id => state.moments.find(moment => moment.id === id),
    finalizePosts: posts => finalized.push(posts.map(item => item.id)),
  });

  assert.equal(runtime.begin(), true);
  runtime.addPosts([{ id: 'new-post', comments: [] }]);
  state.moments[0].comments.push({ id: 'temporary-comment' });
  assert.deepEqual(runtime.rollback(), { ok: true, restored: true });
  assert.deepEqual(state, { moments: [{ id: 'existing', comments: [] }] });
  assert.deepEqual(finalized, []);
  console.log('ok - moment repair transaction rolls posts and comments back together');
}

{
  let state = { moments: [] };
  const finalized = [];
  let renderCount = 0;
  const runtime = createFormatRepairMomentTransactionRuntime({
    exportState: () => clone(state),
    importState: snapshot => { state = clone(snapshot); },
    addMany: items => {
      state.moments.push(...clone(items));
      return items;
    },
    getMoment: id => state.moments.find(moment => moment.id === id),
    finalizePosts: posts => finalized.push(posts.map(item => item.id)),
    render: () => { renderCount += 1; },
  });

  runtime.begin();
  runtime.addPosts([{ id: 'post-1' }, { id: 'post-1' }, { id: 'post-2' }]);
  const committed = await runtime.commit();
  assert.deepEqual(committed, { ok: true, momentPostCount: 2 });
  assert.deepEqual(finalized, [['post-1', 'post-2']]);
  assert.equal(renderCount, 1);
  console.log('ok - moment repair transaction finalizes each captured post once');
}

{
  let state = { moments: [] };
  const runtime = createFormatRepairMomentTransactionRuntime({
    exportState: () => clone(state),
    importState: snapshot => { state = clone(snapshot); },
    addMany: items => {
      state.moments.push(...clone(items));
      return items;
    },
    getMoment: id => state.moments.find(moment => moment.id === id),
    finalizePosts: () => {
      throw new Error('schedule failed');
    },
  });

  runtime.begin();
  runtime.addPosts([{ id: 'post-failed' }]);
  const failed = await runtime.commit();
  assert.equal(failed.ok, false);
  assert.equal(failed.restored, true);
  assert.deepEqual(state, { moments: [] });
  console.log('ok - moment repair transaction restores its snapshot when finalization fails');
}
