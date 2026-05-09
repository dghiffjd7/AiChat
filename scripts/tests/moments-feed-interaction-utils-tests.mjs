import assert from 'node:assert/strict';

import {
  bindMomentFeedCardInteractions,
  clearMomentReplyTarget,
  createMomentFeedSendHandler,
  toggleMomentCommentsExpanded,
  toggleMomentComposer,
} from '../../src/scripts/ui/moments-feed-interaction-utils.js';

{
  const openComposer = new Set();
  const replyTargets = new Map([['m1', { id: 'c1' }]]);
  const renders = [];
  const focuses = [];
  const active = toggleMomentComposer({
    momentId: 'm1',
    openComposer,
    replyTargets,
    render: (options) => renders.push(options),
    focusComposerInput: (momentId) => focuses.push(momentId),
  });
  assert.equal(active, true);
  assert.equal(openComposer.has('m1'), true);
  assert.equal(replyTargets.has('m1'), false);
  assert.deepEqual(renders, [{ preserveScroll: true }]);
  assert.deepEqual(focuses, ['m1']);
  console.log('ok - toggleMomentComposer toggles composer state clears reply target and focuses input');
}

{
  const expandedComments = new Set();
  const renders = [];
  assert.equal(toggleMomentCommentsExpanded({
    momentId: 'm1',
    action: 'expand',
    expandedComments,
    render: (options) => renders.push(options),
  }), true);
  assert.equal(toggleMomentCommentsExpanded({
    momentId: 'm1',
    action: 'collapse',
    expandedComments,
    render: (options) => renders.push(options),
  }), false);
  assert.deepEqual(renders, [{ preserveScroll: true }, { preserveScroll: true }]);
  console.log('ok - toggleMomentCommentsExpanded expands and collapses threaded comments');
}

{
  const replyTargets = new Map([['m1', { id: 'c1' }]]);
  const renders = [];
  const focuses = [];
  clearMomentReplyTarget({
    momentId: 'm1',
    replyTargets,
    render: (options) => renders.push(options),
    focusComposerInput: (momentId) => focuses.push(momentId),
  });
  assert.equal(replyTargets.has('m1'), false);
  assert.deepEqual(renders, [{ preserveScroll: true }]);
  assert.deepEqual(focuses, ['m1']);
  console.log('ok - clearMomentReplyTarget clears reply state rerenders and refocuses composer');
}

{
  const replyTargets = new Map([['m1', { id: 'c1', author: '甲', content: '你好' }]]);
  const openComposer = new Set(['m1']);
  const pendingComment = new Set();
  const added = [];
  const calls = [];
  const traces = [];
  const inputEl = { value: ' 测试评论 ' };
  const send = createMomentFeedSendHandler({
    moment: { id: 'm1', originSessionId: 'contact:moment' },
    inputEl,
    replyTargets,
    openComposer,
    pendingComment,
    store: {
      addComments(momentId, items) {
        added.push([momentId, items]);
      },
    },
    applyMomentStoredRegex: (text) => `IN:${text}`,
    render: (options) => calls.push(['render', options]),
    onUserComment: async (momentId, text, meta) => {
      calls.push(['comment', momentId, text, meta.replyTo?.id]);
    },
    loggerWarn: (...args) => calls.push(['warn', ...args]),
    recordLifecycleEvent: event => traces.push(event),
    generateCommentId: () => 'comment-fixed',
  });
  const result = await send();
  assert.equal(result, true);
  assert.deepEqual(added, [[
    'm1',
    [{
      id: 'comment-fixed',
      author: '我',
      content: 'IN:测试评论',
      regexMode: 'input',
      replyTo: 'c1',
      replyToAuthor: '甲',
    }],
  ]]);
  assert.equal(inputEl.value, '');
  assert.equal(openComposer.has('m1'), false);
  assert.equal(replyTargets.has('m1'), false);
  assert.deepEqual(calls, [
    ['render', { preserveScroll: true }],
    ['comment', 'm1', '测试评论', 'c1'],
    ['render', { preserveScroll: true }],
  ]);
  assert.deepEqual(traces.map(event => [event.phase, event.status, event.sessionId, event.momentId, event.details]), [
    ['comment.local.start', 'started', 'contact:moment', 'm1', {
      userCommentId: 'comment-fixed',
      isReplyToComment: true,
    }],
    ['comment.local.finish', 'success', 'contact:moment', 'm1', {
      userCommentId: 'comment-fixed',
      isReplyToComment: true,
    }],
  ]);
  console.log('ok - createMomentFeedSendHandler stores local comment clears state and forwards async callback');
}

{
  const traces = [];
  const emptySend = createMomentFeedSendHandler({
    moment: { id: 'm-empty', originSessionId: 'contact:moment' },
    inputEl: { value: '   ' },
    pendingComment: new Set(),
    recordLifecycleEvent: event => traces.push(event),
  });
  const pendingSend = createMomentFeedSendHandler({
    moment: { id: 'm-pending', originSessionId: 'contact:moment' },
    inputEl: { value: 'comment' },
    pending: true,
    pendingComment: new Set(),
    recordLifecycleEvent: event => traces.push(event),
  });
  assert.equal(await emptySend(), false);
  assert.equal(await pendingSend(), false);
  assert.deepEqual(traces.map(event => [event.phase, event.status, event.momentId, event.details.reason]), [
    ['comment.local.skipped', 'skipped', 'm-empty', 'empty-text'],
    ['comment.local.skipped', 'skipped', 'm-pending', 'pending'],
  ]);
  console.log('ok - createMomentFeedSendHandler emits optional local comment skip traces');
}

{
  const listeners = new Map();
  const makeNode = (dataset = {}) => ({
    dataset,
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  });
  const dots = makeNode();
  const commentBtn = makeNode();
  const toggle = makeNode({ action: 'expand' });
  const commentEl = makeNode({ commentId: 'c1' });
  const authorEl = makeNode({ commentId: 'c1' });
  const cancelBtn = makeNode();
  const sendBtn = makeNode();
  const inputEl = makeNode();
  const calls = [];
  const cardEl = {
    querySelector(selector) {
      return {
        '.moment-more': dots,
        '[data-action="comment"]': commentBtn,
        '.moment-reply-cancel': cancelBtn,
        '.moment-comment-input': inputEl,
        '.moment_comment[data-action="send"]': sendBtn,
      }[selector] || null;
    },
    querySelectorAll(selector) {
      return {
        '.moment-comments-toggle': [toggle],
        '.moment-comment': [commentEl],
        '.comment-author': [authorEl],
      }[selector] || [];
    },
  };
  bindMomentFeedCardInteractions({
    cardEl,
    moment: { id: 'm1', comments: [{ id: 'c1' }] },
    pending: false,
    showMenu: (anchorEl, momentId) => calls.push(['menu', anchorEl === dots, momentId]),
    bindCommentContextMenu: (payload) => calls.push(['bind-comment', payload.momentId, payload.commentId]),
    activateReplyTarget: (payload) => calls.push(['reply', payload.momentId, payload.commentId]),
    toggleComposer: (momentId) => calls.push(['composer', momentId]),
    toggleExpanded: (momentId, action) => calls.push(['expanded', momentId, action]),
    clearReplyTarget: (momentId) => calls.push(['clear-reply', momentId]),
    createSendHandler: ({ moment, inputEl, pending }) => {
      calls.push(['create-send', moment.id, inputEl === inputEl, pending]);
      return () => calls.push(['send']);
    },
  });
  dots.listeners.click?.({ stopPropagation() {} });
  commentBtn.listeners.click?.({ stopPropagation() {} });
  toggle.listeners.click?.({ stopPropagation() {} });
  authorEl.listeners.click?.({ preventDefault() {}, stopPropagation() {} });
  cancelBtn.listeners.click?.({ preventDefault() {}, stopPropagation() {} });
  sendBtn.listeners.click?.({ stopPropagation() {} });
  inputEl.listeners.keydown?.({ key: 'Enter', preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, [
    ['bind-comment', 'm1', 'c1'],
    ['create-send', 'm1', true, false],
    ['menu', true, 'm1'],
    ['composer', 'm1'],
    ['expanded', 'm1', 'expand'],
    ['reply', 'm1', 'c1'],
    ['clear-reply', 'm1'],
    ['send'],
    ['send'],
  ]);
  console.log('ok - bindMomentFeedCardInteractions wires menu composer expand reply clear and send handlers');
}
