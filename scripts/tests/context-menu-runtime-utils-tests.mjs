import assert from 'node:assert/strict';

import {
  createContextMenuShell,
  resolveContextMenuContext,
} from '../../src/scripts/ui/chat/context-menu-runtime-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.id = '';
      this.listeners = new Map();
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    contains(target) {
      if (target === this) return true;
      return this.children.some(child => child === target || child.contains?.(target));
    }
  }
  const listeners = new Map();
  return {
    body: new FakeElement('body'),
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    listeners,
  };
};

{
  const documentLike = createFakeDocument();
  const menu = createContextMenuShell({ documentLike });
  assert.equal(documentLike.body.children[0], menu);
  menu.style.display = 'block';
  documentLike.listeners.get('pointerdown')({ target: documentLike.createElement('div') });
  assert.equal(menu.style.display, 'none');
  menu.style.display = 'block';
  documentLike.listeners.get('pointerdown')({ target: menu });
  assert.equal(menu.style.display, 'block');
  console.log('ok - createContextMenuShell mounts menu and hides only on outside presses');
}

{
  const codeBlock = { __chatappCode: 'print(1)' };
  const wrapper = {
    __chatappMessage: { id: 'm1', content: 'rendered' },
    querySelector(selector) {
      if (selector === '.chat-codeblock') return codeBlock;
      return null;
    },
  };
  const target = {
    closest(selector) {
      if (selector === '[data-msg-id]') return wrapper;
      if (selector === '.chat-codeblock') return null;
      return null;
    },
  };
  const context = resolveContextMenuContext({
    event: { target },
    message: { id: 'm1', content: 'fallback' },
    scrollEl: null,
  });
  assert.equal(context.wrapper, wrapper);
  assert.equal(context.message.content, 'rendered');
  assert.equal(context.codeBlock, codeBlock);
  assert.equal(context.hasCode, true);
  console.log('ok - resolveContextMenuContext prefers wrapper message and wrapper code block fallback');
}

{
  const wrapper = {
    __chatappMessage: { id: 'm2', content: 'wrapper-msg' },
    querySelector() {
      return null;
    },
  };
  const scrollEl = {
    querySelector(selector) {
      if (selector === '[data-msg-id="m2"]') return wrapper;
      return null;
    },
  };
  const directCodeBlock = { __chatappCode: 'raw code' };
  const target = {
    closest(selector) {
      if (selector === '.chat-codeblock') return directCodeBlock;
      return null;
    },
  };
  const context = resolveContextMenuContext({
    event: { target },
    message: { id: 'm2', content: 'fallback' },
    scrollEl,
  });
  assert.equal(context.wrapper, wrapper);
  assert.equal(context.codeBlock, directCodeBlock);
  assert.equal(context.hasCode, true);
  console.log('ok - resolveContextMenuContext falls back to scroll lookup and keeps direct code block target');
}
