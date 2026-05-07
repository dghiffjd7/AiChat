import assert from 'node:assert/strict';

import {
  createTypingIndicatorShell,
  renderTypingGroupMembers,
} from '../../src/scripts/ui/chat/typing-indicator-dom-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.className = '';
      this.classList = createClassList();
      this.style = {};
      this.textContent = '';
      this.innerHTML = '';
    }
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
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
  const groupShell = createTypingIndicatorShell({
    documentLike,
    groupMembers: [{ name: 'A' }],
  });
  assert.equal(groupShell.kind, 'group');
  assert.equal(groupShell.wrap.children.length, 2);
  assert.equal(groupShell.avatarStack.className, 'typing-avatar-stack');
  assert.equal(groupShell.labelEl.className, 'typing-group-label');

  const privateShell = createTypingIndicatorShell({
    documentLike,
    groupMembers: [],
  });
  assert.equal(privateShell.kind, 'private');
  assert.equal(privateShell.wrap.children.length, 2);
  assert.equal(privateShell.labelEl.textContent, '输入中');
  console.log('ok - createTypingIndicatorShell builds group and private typing shells');
}

{
  const documentLike = createFakeDocument();
  const shell = createTypingIndicatorShell({
    documentLike,
    groupMembers: [{ name: '甲' }],
  });
  const timers = [];
  const selected = renderTypingGroupMembers({
    documentLike,
    avatarStack: shell.avatarStack,
    labelEl: shell.labelEl,
    members: [
      { name: '甲', avatar: '' },
    ],
    getDefaultAvatar: () => 'default.png',
    schedule: (handler, delay) => {
      timers.push([handler, delay]);
      return timers.length;
    },
    random: () => 0,
  });
  assert.equal(selected.length, 1);
  assert.equal(shell.labelEl.textContent, '甲 正在输入');
  assert.equal(shell.avatarStack.classList.contains('typing-avatar-fade'), true);
  timers[0][0]();
  assert.equal(shell.avatarStack.children.length, 1);
  assert.equal(shell.avatarStack.children[0].src, 'default.png');
  assert.equal(shell.avatarStack.classList.contains('typing-avatar-fade'), false);
  console.log('ok - renderTypingGroupMembers updates label and avatar stack with fade timing');
}
