import assert from 'node:assert/strict';

import {
  buildReactionSummaryElement,
  createReactionPicker,
  createReactionTriggerButton,
  hideReactionPicker,
  showReactionPicker,
} from '../../src/scripts/ui/chat/reaction-ui-utils.js';

const createClassList = (initial = []) => {
  const set = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = tagName;
      this.children = [];
      this.parentNode = null;
      this.className = '';
      this.classList = createClassList();
      this.style = { cssText: '', display: '', visibility: '', left: '', top: '' };
      this.textContent = '';
      this.type = '';
      this.id = '';
      this.attributes = {};
      this.listeners = new Map();
      this.offsetWidth = 240;
      this.offsetHeight = 48;
      let inner = '';
      Object.defineProperty(this, 'innerHTML', {
        get: () => inner,
        set: (value) => {
          inner = String(value || '');
          this.children = [];
        },
      });
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
    contains(target) {
      if (target === this) return true;
      return this.children.some(child => child === target || child.contains?.(target));
    }
    emit(type, event = {}) {
      this.listeners.get(type)?.(event);
    }
  }

  const listeners = new Map();
  return {
    listeners,
    body: new FakeElement('body'),
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
  };
};

{
  const documentLike = createFakeDocument();
  const toggles = [];
  const message = {
    meta: {
      reactions: [
        { emoji: '👍', actors: ['__self__', 'u1'] },
        { emoji: '😂', actors: ['u2'] },
      ],
    },
  };
  const el = buildReactionSummaryElement(message, {
    documentLike,
    isThreadingEnabled: true,
    onToggleReaction: emoji => toggles.push(emoji),
  });
  assert.equal(el.className, 'chat-reaction-summary');
  assert.equal(el.children.length, 2);
  assert.equal(el.children[0].classList.contains('is-self'), true);
  el.children[0].emit('click', { preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(toggles, ['👍']);
  console.log('ok - buildReactionSummaryElement renders chips and forwards reaction toggles');
}

{
  const documentLike = createFakeDocument();
  const picker = createReactionPicker({
    documentLike,
    onOutsidePress: () => {
      picker.style.display = 'none';
    },
  });
  picker.style.display = 'flex';
  documentLike.listeners.get('pointerdown')({ target: documentLike.createElement('div') });
  assert.equal(picker.style.display, 'none');
  console.log('ok - createReactionPicker wires outside press dismissal');
}

{
  const documentLike = createFakeDocument();
  const calls = [];
  const trigger = createReactionTriggerButton({ id: 'm1' }, {
    documentLike,
    isThreadingEnabled: true,
    onShowPicker: (button, message) => calls.push([button.className, message.id]),
  });
  trigger.emit('click', { preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(calls, [['chat-reaction-trigger', 'm1']]);
  console.log('ok - createReactionTriggerButton forwards click into picker opener');
}

{
  const documentLike = createFakeDocument();
  const picker = documentLike.createElement('div');
  picker.offsetWidth = 240;
  picker.offsetHeight = 48;
  const contextMenuEl = { style: { display: 'block' } };
  const toggles = [];
  const anchor = {
    getBoundingClientRect() {
      return { left: 100, top: 60, bottom: 90, width: 30 };
    },
  };
  const message = {
    meta: {
      reactions: [{ emoji: '👍', actors: ['__self__'] }],
    },
  };
  const shown = showReactionPicker({
    picker,
    contextMenuEl,
    anchor,
    message,
    isThreadingEnabled: true,
    onToggleReaction: emoji => toggles.push(emoji),
    hidePicker: () => hideReactionPicker(picker),
    windowLike: { innerWidth: 360, innerHeight: 640 },
    documentLike,
  });
  assert.equal(shown, true);
  assert.equal(contextMenuEl.style.display, 'none');
  assert.equal(picker.children.length > 0, true);
  assert.equal(picker.children[0].classList.contains('is-active'), true);
  picker.children[0].emit('click', { preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(toggles, ['👍']);
  assert.equal(picker.style.display, 'none');
  console.log('ok - showReactionPicker populates options positions picker and toggles reactions');
}
