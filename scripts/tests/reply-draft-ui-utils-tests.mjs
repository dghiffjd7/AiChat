import assert from 'node:assert/strict';

import { createReplyDraftUiRuntime } from '../../src/scripts/ui/chat/reply-draft-ui-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.className = '';
      this.style = {};
      this.textContent = '';
      this.type = '';
      this.src = '';
      this.alt = '';
      this.attributes = {};
      this.listeners = new Map();
      let innerHtml = '';
      Object.defineProperty(this, 'innerHTML', {
        get: () => innerHtml,
        set: (value) => {
          innerHtml = String(value || '');
          this.children = [];
        },
      });
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    insertBefore(child, before) {
      if (!before) return this.appendChild(child);
      const index = this.children.indexOf(before);
      if (index < 0) return this.appendChild(child);
      this.children.splice(index, 0, child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    emit(type, event = {}) {
      return this.listeners.get(type)?.(event);
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
  const inputContainer = documentLike.createElement('div');
  const composerAttachmentsEl = documentLike.createElement('div');
  inputContainer.appendChild(composerAttachmentsEl);
  const runtime = createReplyDraftUiRuntime({
    documentLike,
    normalizeReplyTarget: value => value,
    getDefaultReplyAvatar: () => 'fallback.png',
    getReplyCancelHandler: () => null,
  });
  const bar = runtime.ensureReplyDraftBar({ inputContainer, composerAttachmentsEl, existingBar: null });
  assert.equal(bar.className, 'chat-reply-draft');
  assert.equal(bar.style.display, 'none');
  assert.equal(inputContainer.children[0], bar);
  assert.equal(inputContainer.children[1], composerAttachmentsEl);
  console.log('ok - ensureReplyDraftBar mounts draft bar before attachment area');
}

{
  const documentLike = createFakeDocument();
  const cancelCalls = [];
  const runtime = createReplyDraftUiRuntime({
    documentLike,
    normalizeReplyTarget: value => (value ? { ...value } : null),
    getDefaultReplyAvatar: () => 'fallback.png',
    getReplyCancelHandler: () => () => cancelCalls.push('cancelled'),
  });
  const draftBar = documentLike.createElement('div');
  runtime.setReplyTarget(draftBar, {
    author: 'Alice',
    content: '原始消息',
  });
  assert.equal(draftBar.style.display, '');
  assert.equal(draftBar.children.length, 1);
  const main = draftBar.children[0];
  const cancelBtn = main.children[2];
  assert.equal(main.children[0].src, 'fallback.png');
  assert.equal(main.children[1].children[0].textContent, 'Alice');
  assert.equal(main.children[1].children[1].textContent, '原始消息');
  cancelBtn.emit('click', {
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(cancelCalls, ['cancelled']);
  console.log('ok - setReplyTarget renders reply draft content and forwards cancel');
}

{
  const documentLike = createFakeDocument();
  const runtime = createReplyDraftUiRuntime({
    documentLike,
    normalizeReplyTarget: () => null,
    getDefaultReplyAvatar: () => 'fallback.png',
    getReplyCancelHandler: () => null,
  });
  const draftBar = documentLike.createElement('div');
  draftBar.style.display = '';
  draftBar.appendChild(documentLike.createElement('span'));
  runtime.setReplyTarget(draftBar, null);
  assert.equal(draftBar.style.display, 'none');
  assert.equal(draftBar.children.length, 0);
  console.log('ok - setReplyTarget clears draft bar when reply target is removed');
}
