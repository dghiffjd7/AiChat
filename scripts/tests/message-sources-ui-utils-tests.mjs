import assert from 'node:assert/strict';

import {
  buildMessageSourcesElement,
  buildMessageSourcesSignature,
} from '../../src/scripts/ui/chat/message-sources-ui-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.className = '';
      this.textContent = '';
      this.children = [];
      this.dataset = {};
      this.style = { cssText: '' };
      this.href = '';
      this.target = '';
      this.rel = '';
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
  }
  return { createElement: tagName => new FakeElement(tagName) };
};

const message = {
  role: 'assistant',
  meta: {
    sources: [
      { url: 'https://example.com/a', title: 'Example A', provider: 'gemini' },
      { url: 'https://example.org/b', title: 'Example B' },
    ],
  },
};

assert.notEqual(buildMessageSourcesSignature(message), '');
assert.equal(buildMessageSourcesSignature({ meta: {} }), '');

const element = buildMessageSourcesElement({ documentLike: createFakeDocument(), message });
assert.equal(element.className, 'chat-message-sources');
assert.equal(element.children[0].tagName, 'SUMMARY');
assert.equal(element.children[0].textContent, '来源 · 2');
assert.equal(element.children[1].children.length, 2);
assert.equal(element.children[1].children[0].tagName, 'A');
assert.equal(element.children[1].children[0].href, 'https://example.com/a');
assert.equal(element.children[1].children[0].target, '_blank');
assert.equal(element.children[1].children[0].rel, 'noopener noreferrer');
console.log('ok - assistant sources render as a safe compact list below the message bubble');

