import assert from 'node:assert/strict';

import { createMessagePatchUiRuntime } from '../../src/scripts/ui/chat/message-patch-ui-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.filter(Boolean).forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createWrapper = (message = {}) => {
  const avatarImg = { src: '' };
  const nameEl = { textContent: '' };
  const timeEl = { textContent: '' };
  const statusEl = { textContent: '' };
  return {
    __chatappMessage: message,
    dataset: { trackDelivery: '1' },
    classList: createClassList(),
    querySelector(selector) {
      if (selector === 'img.QQ_chat_head') return avatarImg;
      if (selector === '.QQ_chat_name') return nameEl;
      if (selector === '.chat-delivery-status') return statusEl;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.QQ_chat_time') return [timeEl];
      return [];
    },
    __testRefs: {
      avatarImg,
      nameEl,
      timeEl,
      statusEl,
    },
  };
};

{
  const runtime = createMessagePatchUiRuntime({
    normalizeReplyTarget: replyTo => (replyTo ? { id: String(replyTo.id || '') } : null),
    normalizeReactionEntries: entries => (Array.isArray(entries) ? entries.map(entry => ({ emoji: entry.emoji })) : []),
    resolveActiveSwipeMessage: message => ({
      ...message,
      content: 'active text',
      meta: {
        ...message.meta,
        activeSwipe: 9,
        swipes: ['a', 'b', 'c'],
      },
    }),
    applyCreativeBubbleState: () => {},
  });
  const signature = JSON.parse(runtime.getMessageRenderSignature({
    role: 'assistant',
    type: 'text',
    raw: 'raw value',
    raw_source: 'raw-source',
    meta: {
      renderRich: true,
      replyTo: { id: 7 },
      reactions: [{ emoji: '👍', actors: ['self'] }],
    },
  }));
  assert.equal(signature.content, 'active text');
  assert.equal(signature.activeSwipe, 2);
  assert.equal(signature.swipeCount, 3);
  assert.deepEqual(signature.replyTo, { id: '7' });
  assert.deepEqual(signature.reactions, [{ emoji: '👍' }]);
  console.log('ok - getMessageRenderSignature captures active swipe and normalized interaction payloads');
}

{
  const runtime = createMessagePatchUiRuntime({
    normalizeReplyTarget: value => value ?? null,
    normalizeReactionEntries: value => value ?? [],
    resolveActiveSwipeMessage: message => message,
    applyCreativeBubbleState: () => {},
  });
  const running = runtime.getMessageRenderSignature({
    role: 'assistant',
    type: 'text',
    content: 'same',
    meta: {
      agentMessageParts: [{ type: 'agent_status', runId: 'run-1', status: 'running', title: 'Memory' }],
    },
  });
  const done = runtime.getMessageRenderSignature({
    role: 'assistant',
    type: 'text',
    content: 'same',
    meta: {
      agentMessageParts: [{ type: 'agent_status', runId: 'run-1', status: 'succeeded', title: 'Memory' }],
    },
  });
  assert.notEqual(running, done);
  console.log('ok - getMessageRenderSignature tracks agent message sidecar status changes');
}

{
  const creativeCalls = [];
  const runtime = createMessagePatchUiRuntime({
    normalizeReplyTarget: value => value ?? null,
    normalizeReactionEntries: value => value ?? [],
    resolveActiveSwipeMessage: message => message,
    applyCreativeBubbleState: (...args) => creativeCalls.push(args),
  });
  const wrapper = createWrapper({ id: 'm1' });
  runtime.patchMessageChrome(wrapper, {
    id: 'm1',
    role: 'user',
    avatar: '/avatar.png',
    name: 'Alice',
    time: '09:30',
    timestamp: 100,
  });
  assert.equal(wrapper.dataset.msgId, 'm1');
  assert.equal(wrapper.dataset.role, 'user');
  assert.equal(wrapper.dataset.timestamp, '100');
  assert.equal(wrapper.__testRefs.avatarImg.src, '/avatar.png');
  assert.equal(wrapper.__testRefs.nameEl.textContent, 'Alice');
  assert.equal(wrapper.__testRefs.timeEl.textContent, '09:30');
  assert.equal(wrapper.__testRefs.statusEl.textContent, '✔ 已送出');
  assert.equal(creativeCalls.length, 1);
  console.log('ok - patchMessageChrome syncs wrapper dataset chrome and delivery fallback state');
}

{
  const runtime = createMessagePatchUiRuntime({
    normalizeReplyTarget: value => value ?? null,
    normalizeReactionEntries: value => value ?? [],
    resolveActiveSwipeMessage: message => message,
    applyCreativeBubbleState: () => {},
  });
  const wrapper = createWrapper({
    id: 'm2',
    role: 'assistant',
    type: 'text',
    content: 'same',
    name: 'Bot',
    time: '10:00',
  });
  const patched = runtime.tryPatchMessageElement(wrapper, {
    id: 'm2',
    role: 'assistant',
    type: 'text',
    content: 'same',
    avatar: '/next.png',
    name: 'Bot',
    time: '10:01',
  });
  assert.equal(patched, true);
  assert.equal(wrapper.__testRefs.avatarImg.src, '/next.png');
  assert.equal(wrapper.__testRefs.nameEl.textContent, 'Bot');
  assert.equal(wrapper.__testRefs.timeEl.textContent, '10:01');
  assert.equal(runtime.tryPatchMessageElement(wrapper, {
    id: 'm2',
    role: 'assistant',
    type: 'text',
    content: 'changed',
  }), false);
  console.log('ok - tryPatchMessageElement patches chrome only when render signature stays stable');
}
