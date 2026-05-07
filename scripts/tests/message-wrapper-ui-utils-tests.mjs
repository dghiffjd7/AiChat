import assert from 'node:assert/strict';

import {
  createDividerMessageWrapperCore,
  createMessageAvatarImageCore,
  createStandardMessageWrapperCore,
  createSystemMessageWrapperCore,
} from '../../src/scripts/ui/chat/message-wrapper-ui-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.className = '';
      this.textContent = '';
      this.children = [];
      this.childNodes = this.children;
      this.dataset = {};
      this.attributes = {};
      this.src = '';
      this.alt = '';
      this.loading = '';
      this.decoding = '';
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
      this.attributes[name] = String(value);
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
  const wrapper = createDividerMessageWrapperCore({
    documentLike,
    message: { id: 'd1', content: '未读消息' },
  });
  assert.equal(wrapper.className, 'QQ_chat_sysmsg QQ_chat_unread-divider');
  assert.equal(wrapper.dataset.msgId, 'd1');
  assert.equal(wrapper.children[0].className, 'QQ_chat_unread-line');
  assert.equal(wrapper.children[0].children[0].textContent, '未读消息');
  console.log('ok - createDividerMessageWrapperCore builds unread divider wrapper');
}

{
  const documentLike = createFakeDocument();
  const wrapper = createSystemMessageWrapperCore({
    documentLike,
    message: { id: 's1', content: '系统消息', time: '09:00', timestamp: 12 },
  });
  assert.equal(wrapper.className, 'QQ_chat_sysmsg');
  assert.equal(wrapper.dataset.timestamp, '12');
  assert.equal(wrapper.children[0].className, 'QQ_chat_sysbubble');
  assert.equal(wrapper.children[0].textContent, '系统消息');
  assert.equal(wrapper.children[1].textContent, '09:00');
  console.log('ok - createSystemMessageWrapperCore builds system bubble and optional time text');
}

{
  const documentLike = createFakeDocument();
  const creativeCalls = [];
  const wrapper = createStandardMessageWrapperCore({
    documentLike,
    message: {
      id: 'm1',
      role: 'assistant',
      timestamp: 99,
      status: 'sending',
      meta: { floor: 2, swipeRegenerating: true },
    },
    isUser: false,
    applyCreativeBubbleState: (...args) => creativeCalls.push(args),
  });
  assert.equal(wrapper.className.includes('QQ_chat_charmsg'), true);
  assert.equal(wrapper.className.includes('is-rp-regenerating'), true);
  assert.equal(wrapper.className.includes('message-pending'), true);
  assert.equal(wrapper.dataset.timestamp, '99');
  assert.equal(wrapper.dataset.rpFloor, '2');
  assert.equal(wrapper.dataset.status, 'sending');
  assert.equal(wrapper.attributes['aria-busy'], 'true');
  assert.equal(creativeCalls.length, 1);
  console.log('ok - createStandardMessageWrapperCore applies role pending swipe and creative wrapper chrome');
}

{
  const documentLike = createFakeDocument();
  const avatar = createMessageAvatarImageCore({
    documentLike,
    message: { avatar: '/a.png', name: 'Alice' },
    defaultAvatar: '/default.png',
  });
  assert.equal(avatar.className, 'QQ_chat_head');
  assert.equal(avatar.src, '/a.png');
  assert.equal(avatar.alt, 'Alice');
  assert.equal(avatar.loading, 'lazy');
  assert.equal(avatar.decoding, 'async');
  console.log('ok - createMessageAvatarImageCore builds lazy async avatar image with message metadata');
}
