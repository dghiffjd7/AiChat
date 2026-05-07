import assert from 'node:assert/strict';

import {
  addMessageCore,
  buildHistoryRenderMessage,
  preloadHistoryCore,
  prependHistoryCore,
  refreshAvatarsCore,
  removeMessageCore,
  updateMessageCore,
} from '../../src/scripts/ui/chat/message-list-ui-utils.js';

const createFragment = () => ({
  children: [],
  appendChild(node) {
    this.children.push(node);
    return node;
  },
});

{
  const appended = [];
  const scrolled = [];
  const before = [];
  const after = [];
  const original = {};
  const wrapper = {
    dataset: {},
    querySelector(selector) {
      if (selector === '.QQ_chat_msgdiv') return { id: 'bubble' };
      return null;
    },
  };
  const rendered = addMessageCore({
    message: original,
    options: {},
    decorateMessage: () => ({ id: '', meta: {}, role: 'assistant' }),
    ensureMessageId: message => {
      message.id = 'm-added';
      return message;
    },
    syncOriginalMessageId: (source, next) => {
      if (!source.id) source.id = next.id;
    },
    dispatchBeforeRender: message => before.push(message.id),
    dispatchAfterRender: (message, element) => after.push([message.id, element.dataset.msgId]),
    isNearBottom: () => true,
    createRpFloorMarker: () => ({ kind: 'marker' }),
    buildMessageElement: message => {
      wrapper.dataset.msgId = message.id;
      return wrapper;
    },
    scrollEl: {
      appendChild(node) {
        appended.push(node);
      },
    },
    scrollToBottom: () => scrolled.push('bottom'),
    schedule: handler => handler(),
  });
  assert.equal(original.id, 'm-added');
  assert.deepEqual(before, ['m-added']);
  assert.deepEqual(after, [['m-added', 'm-added']]);
  assert.equal(appended.length, 2);
  assert.equal(wrapper.dataset.newMsg, undefined);
  assert.deepEqual(scrolled, ['bottom']);
  assert.deepEqual(rendered, { id: 'bubble' });
  console.log('ok - addMessageCore decorates syncs ids dispatches render hooks and scrolls when near bottom');
}

{
  const rendered = buildHistoryRenderMessage({
    role: 'user',
    type: 'text',
    content: 'hello',
    meta: { renderRich: true },
    id: 'm1',
  }, {
    lazyRichMount: true,
  });
  assert.equal(rendered.role, 'user');
  assert.equal(rendered.__lazyRichMount, true);
  console.log('ok - buildHistoryRenderMessage normalizes message payload for list rendering');
}

{
  const appended = [];
  const documentLike = {
    createDocumentFragment: () => createFragment(),
  };
  const scrollEl = {
    appendChild(node) {
      appended.push(node);
    },
  };
  preloadHistoryCore({
    messages: [
      { id: 'a', role: 'assistant', type: 'text', content: 'A', meta: { floor: 3 } },
      { id: 'b', role: 'user', type: 'text', content: 'B', meta: { renderRich: true, floor: 4 } },
    ],
    keepScroll: true,
    scrollEl,
    documentLike,
    isRp: true,
    createRpFloorMarker: message => ({ floor: message.id }),
    buildMessageElement: message => ({ dataset: {}, message }),
    scrollToBottom() {
      throw new Error('should not scroll when keepScroll is true');
    },
    refreshScrollDateBadge() {},
    scheduleScrollBottomButtonRefresh() {},
  });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].children.length, 4);
  assert.equal(appended[0].children[1].dataset.rpFloor, '3');
  assert.equal(appended[0].children[3].message.__lazyRichMount, false);
  console.log('ok - preloadHistoryCore appends floor markers and history items into a fragment');
}

{
  const fragment = createFragment();
  const first = { id: 'first' };
  const scrollEl = {
    firstChild: first,
    scrollHeight: 100,
    scrollTop: 10,
    insertBefore(node, target) {
      assert.equal(node, fragment);
      assert.equal(target, first);
      this.scrollHeight = 150;
    },
  };
  prependHistoryCore({
    messages: [{ id: 'p1', role: 'assistant', content: 'older', meta: {} }],
    scrollEl,
    documentLike: {
      createDocumentFragment: () => fragment,
    },
    isRp: true,
    buildMessageElement: message => ({ message }),
    refreshRpFloorMarkers() {},
    refreshScrollDateBadge() {},
    scheduleScrollBottomButtonRefresh() {},
  });
  assert.equal(fragment.children.length, 1);
  assert.equal(scrollEl.scrollTop, 60);
  console.log('ok - prependHistoryCore preserves scroll offset after inserting older messages');
}

{
  const avatars = [
    {
      __chatappMessage: { id: 'x' },
      querySelector() { return { src: 'old-a' }; },
    },
    {
      __chatappMessage: { id: 'y' },
      querySelector() { return { src: 'same' }; },
    },
  ];
  const images = [{ src: 'old-a' }, { src: 'same' }];
  avatars[0].querySelector = () => images[0];
  avatars[1].querySelector = () => images[1];
  const updated = refreshAvatarsCore({
    scrollEl: {
      querySelectorAll() { return avatars; },
    },
    resolver: message => (message.id === 'x' ? 'new-a' : 'same'),
  });
  assert.equal(updated, 1);
  assert.equal(images[0].src, 'new-a');
  console.log('ok - refreshAvatarsCore only rewrites avatars whose resolved src changed');
}

{
  let cleaned = false;
  let removed = false;
  const element = {
    remove() { removed = true; },
  };
  const removedOk = removeMessageCore({
    scrollEl: {
      querySelector() { return element; },
    },
    msgId: 'rm1',
    isRp: true,
    cleanupRichTextMounts() { cleaned = true; },
    refreshRpFloorMarkers() {},
    refreshScrollDateBadge() {},
    scheduleScrollBottomButtonRefresh() {},
  });
  assert.equal(removedOk, true);
  assert.equal(cleaned, true);
  assert.equal(removed, true);
  console.log('ok - removeMessageCore cleans mounts removes wrapper and triggers refresh hooks');
}

{
  let refreshed = 0;
  let replaced = null;
  const existing = {
    __chatappMessage: { id: 'u1', sessionId: 's-prev', content: 'old' },
    replaceWith(node) { replaced = node; },
  };
  const updated = updateMessageCore({
    scrollEl: {
      querySelector() { return existing; },
    },
    msgId: 'u1',
    newMessage: { content: 'new' },
    resolveMessageSessionId: () => 'resolved-session',
    resolveActiveSwipeMessage: message => message,
    decorateMessage: message => message,
    tryPatchMessageElement: () => false,
    buildMessageElement: message => ({ rendered: message }),
    cleanupRichTextMounts() {},
    refreshScrollDateBadge() { refreshed += 1; },
    scheduleScrollBottomButtonRefresh() { refreshed += 1; },
  });
  assert.equal(updated.rendered.sessionId, 's-prev');
  assert.equal(replaced.rendered.content, 'new');
  assert.equal(refreshed, 2);
  console.log('ok - updateMessageCore rebuilds DOM when patch path is unavailable');
}
