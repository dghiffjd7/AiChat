import assert from 'node:assert/strict';

import { buildMomentThreadedComments } from '../../src/scripts/ui/moments-thread-utils.js';

{
  const comments = [
    { id: 'c1', author: '发布者', content: '根评论' },
    { id: 'c2', author: '路人甲', content: '回复根评论', replyTo: 'c1' },
    { id: 'c3', author: '路人乙', content: '回复楼中楼', replyTo: 'c2' },
    { id: 'c4', author: '路人丙', content: '孤儿回复', replyTo: 'missing' },
    null,
  ];
  const { roots, repliesByParent, byId } = buildMomentThreadedComments(comments);
  assert.deepEqual(roots.map(item => item.id), ['c1', 'c4']);
  assert.deepEqual((repliesByParent.get('c1') || []).map(item => item.id), ['c2']);
  assert.deepEqual((repliesByParent.get('c2') || []).map(item => item.id), ['c3']);
  assert.equal(byId.get('c4'), comments[3]);
  console.log('ok - buildMomentThreadedComments groups roots replies and nested replies in source order');
}

{
  const { roots, repliesByParent, byId } = buildMomentThreadedComments([
    { author: '匿名', content: '无 id 评论' },
    { id: 'c1', author: '发布者', content: '有 id 评论' },
  ]);
  assert.equal(roots.length, 2);
  assert.equal(repliesByParent.size, 0);
  assert.equal(byId.size, 1);
  assert.equal(byId.has('c1'), true);
  console.log('ok - buildMomentThreadedComments keeps idless comments as roots but excludes them from byId');
}
