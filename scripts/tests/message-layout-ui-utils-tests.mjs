import assert from 'node:assert/strict';

import {
  appendStandardMessageLayoutCore,
  buildBubbleStackCore,
  scheduleSelectionModeApplyCore,
} from '../../src/scripts/ui/chat/message-layout-ui-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.className = '';
      this.textContent = '';
      this.children = [];
      this.childNodes = this.children;
      this.style = {};
      this.dataset = {};
      this.attributes = new Map();
      this.classList = {
        add: (...tokens) => {
          const next = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          tokens.filter(Boolean).forEach(token => next.add(token));
          this.className = [...next].join(' ');
        },
      };
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    setAttribute(name, value) {
      this.attributes.set(name, String(value));
    }
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  const reactionSummary = documentLike.createElement('div');
  const reactionBtn = documentLike.createElement('button');
  const stack = buildBubbleStackCore({
    documentLike,
    bubble,
    isUser: true,
    reactionSummaryEl: reactionSummary,
    reactionButton: reactionBtn,
  });
  assert.equal(stack.className.includes('chat-bubble-stack'), true);
  assert.equal(stack.className.includes('is-user'), true);
  assert.deepEqual(stack.children, [bubble, reactionSummary, reactionBtn]);
  console.log('ok - buildBubbleStackCore composes bubble reaction summary and trigger button');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  const sidecar = documentLike.createElement('div');
  const reactionSummary = documentLike.createElement('div');
  const stack = buildBubbleStackCore({
    documentLike,
    bubble,
    messageSidecarEl: sidecar,
    reactionSummaryEl: reactionSummary,
  });
  assert.deepEqual(stack.children, [bubble, sidecar, reactionSummary]);
  console.log('ok - buildBubbleStackCore places optional message sidecar outside bubble content before reactions');
}

{
  const documentLike = createFakeDocument();
  const wrapper = documentLike.createElement('div');
  const avatar = documentLike.createElement('img');
  const bubbleStack = documentLike.createElement('div');
  appendStandardMessageLayoutCore({
    documentLike,
    wrapper,
    avatarImg: avatar,
    bubbleStack,
    message: { role: 'user', time: '10:00', meta: {} },
    isUser: true,
  });
  assert.equal(wrapper.children.length, 2);
  const contentWrap = wrapper.children[0];
  const timeRow = contentWrap.children[1];
  assert.equal(contentWrap.className, 'chat-message-stack');
  assert.equal(timeRow.className, 'chat-time-row');
  assert.equal(timeRow.children[0].className, 'chat-delivery-status');
  assert.equal(timeRow.children[0].textContent, '已读');
  assert.equal(timeRow.children[1].textContent, '10:00');
  console.log('ok - appendStandardMessageLayoutCore builds user-side stack with delivery row');
}

{
  const documentLike = createFakeDocument();
  const wrapper = documentLike.createElement('div');
  const avatar = documentLike.createElement('img');
  const bubbleStack = documentLike.createElement('div');
  const swipeIndicator = documentLike.createElement('div');
  appendStandardMessageLayoutCore({
    documentLike,
    wrapper,
    avatarImg: avatar,
    bubbleStack,
    message: { id: 'a1', role: 'assistant', name: '助手', time: '11:00', meta: {} },
    isUser: false,
    uiMode: 'rp',
    createSwipeIndicatorElement: () => swipeIndicator,
    resolveRpCharacterName: () => '莉莉丝',
  });
  assert.equal(wrapper.children.length, 2);
  assert.equal(wrapper.className.includes('has-rp-message-chrome'), true);
  const contentWrap = wrapper.children[1];
  const header = contentWrap.children[0];
  assert.equal(header.className, 'rp-message-header');
  assert.equal(header.children[0].className, 'QQ_chat_name rp-message-name');
  assert.equal(header.children[0].textContent, '莉莉丝');
  assert.equal(header.children[1].className, 'QQ_chat_time');
  assert.equal(header.children[1].textContent, '11:00');
  assert.equal(contentWrap.children[1], bubbleStack);
  const actions = contentWrap.children[2];
  assert.equal(actions.className, 'rp-message-actions');
  assert.equal(actions.children[0], swipeIndicator);
  assert.deepEqual(
    actions.children[1].children.map(button => button.dataset.rpMessageAction),
    ['regenerate', 'view-code', 'copy'],
  );
  assert.equal(contentWrap.children.length, 3);
  console.log('ok - appendStandardMessageLayoutCore builds compact rp assistant chrome with character header and actions');
}

{
  const documentLike = createFakeDocument();
  const wrapper = documentLike.createElement('div');
  const avatar = documentLike.createElement('img');
  const bubbleStack = documentLike.createElement('div');
  appendStandardMessageLayoutCore({
    documentLike,
    wrapper,
    avatarImg: avatar,
    bubbleStack,
    message: { role: 'assistant', name: 'Bot', time: '11:10', meta: { showName: true, isGreeting: true } },
    isUser: false,
    uiMode: 'rp',
    createSwipeIndicatorElement: () => {
      throw new Error('greeting should not build rp actions');
    },
  });
  assert.equal(wrapper.className.includes('has-rp-message-chrome'), false);
  const contentWrap = wrapper.children[1];
  assert.equal(contentWrap.children[0].className, 'QQ_chat_name');
  assert.equal(contentWrap.children[1], bubbleStack);
  assert.equal(contentWrap.children[2].className, 'QQ_chat_time');
  console.log('ok - appendStandardMessageLayoutCore leaves the rp greeting card chrome unchanged');
}

{
  const documentLike = createFakeDocument();
  const wrapper = documentLike.createElement('div');
  const avatar = documentLike.createElement('img');
  const bubbleStack = documentLike.createElement('div');
  appendStandardMessageLayoutCore({
    documentLike,
    wrapper,
    avatarImg: avatar,
    bubbleStack,
    message: { role: 'assistant', name: 'Bot', time: '11:20', meta: { showName: true } },
    isUser: false,
    uiMode: 'chat',
    resolveRpCharacterName: () => 'should not be used',
  });
  const contentWrap = wrapper.children[1];
  assert.equal(wrapper.className.includes('has-rp-message-chrome'), false);
  assert.equal(contentWrap.children[0].textContent, 'Bot');
  assert.equal(contentWrap.children[1], bubbleStack);
  assert.equal(contentWrap.children[2].textContent, '11:20');
  console.log('ok - appendStandardMessageLayoutCore does not change ordinary chat assistant messages');
}

{
  const marked = [];
  const visibleCalls = [];
  const scheduled = [];
  const wrapper = { id: 'wrapper' };
  const scrollEl = {
    querySelector(selector) {
      return selector === '[data-msg-id="m-select"]' ? wrapper : null;
    },
  };
  const scheduledOk = scheduleSelectionModeApplyCore({
    selectionMode: true,
    messageId: 'm-select',
    scrollEl,
    markWrapperSelectable: (nextWrapper, msgId) => marked.push([nextWrapper, msgId]),
    setSelectionBarVisible: visible => visibleCalls.push(visible),
    schedule: (handler, delay) => {
      scheduled.push(delay);
      handler();
    },
  });
  assert.equal(scheduledOk, true);
  assert.deepEqual(marked, [[wrapper, 'm-select']]);
  assert.deepEqual(visibleCalls, [true]);
  assert.deepEqual(scheduled, [0]);
  assert.equal(scheduleSelectionModeApplyCore({ selectionMode: false, messageId: 'm-select' }), false);
  console.log('ok - scheduleSelectionModeApplyCore defers selectable wrapper marking only when selection mode is active');
}
