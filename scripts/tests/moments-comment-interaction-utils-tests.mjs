import assert from 'node:assert/strict';

import {
  activateMomentReplyTarget,
  bindMomentCommentContextMenu,
  focusMomentComposerInput,
  resolveMomentReplyTarget,
} from '../../src/scripts/ui/moments-comment-interaction-utils.js';

{
  assert.deepEqual(resolveMomentReplyTarget({
    comments: [{ id: 'c1', author: '甲', content: '你好' }],
    commentId: 'c1',
  }), { id: 'c1', author: '甲', content: '你好' });
  assert.equal(resolveMomentReplyTarget({ comments: [], commentId: 'missing' }), null);
  console.log('ok - resolveMomentReplyTarget returns normalized reply targets and ignores misses');
}

{
  const replyTargets = new Map();
  const openComposer = new Set();
  const renders = [];
  const focuses = [];
  const target = activateMomentReplyTarget({
    momentId: 'm1',
    commentId: 'c1',
    comments: [{ id: 'c1', author: '甲', content: '你好' }],
    replyTargets,
    openComposer,
    render: (options) => renders.push(options),
    focusComposerInput: (momentId) => focuses.push(momentId),
  });
  assert.deepEqual(target, { id: 'c1', author: '甲', content: '你好' });
  assert.deepEqual(replyTargets.get('m1'), target);
  assert.equal(openComposer.has('m1'), true);
  assert.deepEqual(renders, [{ preserveScroll: true }]);
  assert.deepEqual(focuses, ['m1']);
  console.log('ok - activateMomentReplyTarget stores state rerenders and focuses feed composer');
}

{
  const scheduled = [];
  const queries = [];
  focusMomentComposerInput({
    listEl: {
      querySelector(selector) {
        queries.push(selector);
        return { focus() {} };
      },
    },
    momentId: 'm"1',
    schedule(handler) {
      scheduled.push(true);
      handler();
    },
  });
  assert.deepEqual(scheduled, [true]);
  assert.equal(queries[0].includes('m\\"1'), true);
  console.log('ok - focusMomentComposerInput escapes selectors and defers focus');
}

{
  const listeners = {};
  const calls = [];
  const commentEl = {
    style: {},
    addEventListener(type, handler) {
      listeners[type] = handler;
    },
  };
  const timers = [];
  bindMomentCommentContextMenu({
    commentEl,
    momentId: 'm1',
    commentId: 'c1',
    showCommentMenu: (...args) => calls.push(args),
    scheduleTimeout(handler, delay) {
      timers.push(delay);
      handler();
      return 1;
    },
    clearTimeoutFn() {},
  });
  listeners.mousedown?.({ button: 0, clientX: 11, clientY: 22 });
  listeners.contextmenu?.({
    clientX: 33,
    clientY: 44,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(timers, [520]);
  assert.deepEqual(calls, [
    [{ x: 11, y: 22 }, 'm1', 'c1'],
    [{ x: 33, y: 44 }, 'm1', 'c1'],
  ]);
  console.log('ok - bindMomentCommentContextMenu wires long-press and context menu comment actions');
}
