import assert from 'node:assert/strict';

import { createInlineEditUiRuntime } from '../../src/scripts/ui/chat/inline-edit-ui-utils.js';

const createFakeDocument = () => {
  const createClassList = () => {
    const classes = new Set();
    return {
      add: value => classes.add(value),
      remove: value => classes.delete(value),
      contains: value => classes.has(value),
    };
  };
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentNode = null;
      this.style = {};
      this.classList = createClassList();
      this.className = '';
      this.textContent = '';
      this.value = '';
      this.scrollHeight = 72;
      this.listeners = new Map();
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    emit(type, event = {}) {
      return this.listeners.get(type)?.(event);
    }
    focus() {
      this.focused = true;
    }
    setSelectionRange(start, end) {
      this.selection = [start, end];
    }
    blur() {
      this.emit('blur');
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
  const scheduled = [];
  const confirms = [];
  const bubble = {
    children: [],
    style: {},
    classList: {
      add(value) { this.value = value; },
      remove(value) { if (this.value === value) this.value = ''; },
      contains(value) { return this.value === value; },
      value: '',
    },
    textContent: '',
    innerHTML: '',
    appendChild(child) {
      this.children = [child];
      this.lastChild = child;
      return child;
    },
  };
  const scrollEl = {
    querySelector(selector) {
      if (selector === '[data-msg-id="m1"]') {
        return {
          classList: {
            add(value) { this.value = value; },
            remove(value) { if (this.value === value) this.value = ''; },
            contains(value) { return this.value === value; },
            value: '',
          },
          querySelector(nextSelector) {
            if (nextSelector === '.QQ_chat_msgdiv') return bubble;
            return null;
          },
        };
      }
      return null;
    },
  };
  const runtime = createInlineEditUiRuntime({
    documentLike,
    schedule: cb => scheduled.push(cb),
    onConfirmEdit: (message, text) => confirms.push([message.id, text]),
  });
  runtime.startInlineEdit({
    scrollEl,
    message: { id: 'm1', content: 'hello' },
  });
  const textarea = bubble.lastChild;
  textarea.value = 'next text';
  scheduled[0]();
  assert.equal(textarea.className, 'chat-inline-edit-textarea');
  assert.equal(textarea.focused, true);
  assert.deepEqual(textarea.selection, [9, 9]);
  textarea.emit('keydown', {
    key: 'Enter',
    shiftKey: false,
    preventDefault() {},
  });
  assert.deepEqual(confirms, [['m1', 'next text']]);
  console.log('ok - startInlineEdit saves trimmed text on enter-triggered blur');
}

{
  const documentLike = createFakeDocument();
  const renderedNode = { kind: 'rendered-rich-content' };
  const bubble = {
    children: [renderedNode],
    style: { whiteSpace: '' },
    classList: {
      add(value) { this.value = value; },
      remove(value) { if (this.value === value) this.value = ''; },
      contains(value) { return this.value === value; },
      value: '',
    },
    textContent: '',
    _innerHTML: '<article>rendered</article>',
    get childNodes() { return this.children; },
    get innerHTML() { return this._innerHTML; },
    set innerHTML(value) {
      this._innerHTML = value;
      if (value === '') this.children = [];
    },
    appendChild(child) {
      this.children.push(child);
      this.lastChild = child;
      return child;
    },
  };
  const scrollEl = {
    querySelector() {
      return {
        classList: {
          add(value) { this.value = value; },
          remove(value) { if (this.value === value) this.value = ''; },
          contains(value) { return this.value === value; },
          value: '',
        },
        querySelector() {
          return bubble;
        },
      };
    },
  };
  const runtime = createInlineEditUiRuntime({
    documentLike,
    schedule: cb => cb(),
    onConfirmEdit: () => {
      throw new Error('should not confirm on escape');
    },
  });
  runtime.startInlineEdit({
    scrollEl,
    message: { id: 'm2', content: 'origin' },
    initialText: '<status>raw origin</status>',
  });
  const textarea = bubble.lastChild;
  assert.equal(textarea.value, '<status>raw origin</status>');
  textarea.value = 'changed';
  textarea.emit('keydown', {
    key: 'Escape',
    preventDefault() {},
  });
  textarea.emit('blur');
  assert.deepEqual(bubble.children, [renderedNode]);
  assert.equal(bubble.style.whiteSpace, '');
  console.log('ok - startInlineEdit uses raw initial text while restoring the original rendered nodes on escape');
}
