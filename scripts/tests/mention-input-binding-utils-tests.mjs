import assert from 'node:assert/strict';

import {
  bindMentionInputControl,
  buildMentionMembersFromContacts,
} from '../../src/scripts/ui/mention-input-binding-utils.js';

const createElement = (tagName = 'div') => {
  const listeners = new Map();
  const element = {
    tagName,
    className: '',
    dataset: {},
    style: {},
    children: [],
    parentElement: null,
    value: '',
    selectionStart: 0,
    disabled: false,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter(item => item !== handler));
    },
    dispatch(type, event = {}) {
      (listeners.get(type) || []).forEach(handler => handler(event));
    },
    dispatchEvent(event) {
      this.dispatch(event?.type || 'input', event);
    },
    appendChild(child) {
      child.parentElement = this;
      this.children.push(child);
      return child;
    },
    querySelectorAll(selector) {
      if (selector === '.mention-item') return this.children.filter(child => child.className === 'mention-item');
      return [];
    },
    getBoundingClientRect() {
      return { left: 20, top: 400 };
    },
    focus() {},
    setSelectionRange(start) {
      this.selectionStart = start;
    },
  };
  return element;
};

const createDocumentLike = () => {
  const listeners = new Map();
  return {
    body: createElement('body'),
    documentElement: { clientHeight: 720 },
    createElement,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(handler);
    },
    removeEventListener(type, handler) {
      const list = listeners.get(type) || [];
      listeners.set(type, list.filter(item => item !== handler));
    },
    dispatch(type, event = {}) {
      (listeners.get(type) || []).forEach(handler => handler(event));
    },
  };
};

{
  const members = buildMentionMembersFromContacts({
    contactsStore: {
      listContacts: () => [
        { id: 'alice', name: 'Alice', avatar: 'alice.png' },
        { id: 'group:room', name: 'Room', isGroup: true },
        { id: 'rp:persona_1', name: '角色房间' },
        { id: 'bob', name: 'Bob' },
        { id: 'alice', name: 'Alice Again' },
      ],
    },
    resolveAvatar: contact => contact.avatar || `${contact.id}.png`,
  });
  assert.deepEqual(members, [
    { id: 'alice', name: 'Alice', avatar: 'alice.png' },
    { id: 'bob', name: 'Bob', avatar: 'bob.png' },
  ]);
  console.log('ok - buildMentionMembersFromContacts filters groups rp contacts and duplicate ids');
}

{
  let dropdown = null;
  const documentLike = createDocumentLike();
  const windowLike = {
    innerHeight: 720,
    setTimeout,
    clearTimeout,
  };
  const input = createElement('textarea');
  const anchor = createElement('label');
  input.parentElement = anchor;
  input.value = 'hello @a';
  input.selectionStart = input.value.length;
  let inputEvents = 0;
  input.addEventListener('input', () => {
    inputEvents += 1;
  });

  bindMentionInputControl({
    inputEl: input,
    anchorEl: anchor,
    documentLike,
    windowLike,
    getMembers: () => [
      { id: 'alice', name: 'Alice' },
      { id: 'bob', name: 'Bob' },
    ],
    getDropdown: () => dropdown,
    setDropdown: next => {
      dropdown = next;
    },
  });

  input.dispatch('input', { type: 'input' });
  assert.equal(dropdown.style.display, 'block');
  assert.equal(dropdown.children.length, 1);
  assert.equal(dropdown.children[0].dataset.memberName, 'Alice');

  const keyEvent = {
    key: 'Enter',
    shiftKey: false,
    defaultPrevented: false,
    propagationStopped: false,
    immediateStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    stopImmediatePropagation() {
      this.immediateStopped = true;
    },
  };
  input.dispatch('keydown', keyEvent);

  assert.equal(input.value, 'hello @Alice ');
  assert.equal(input.selectionStart, input.value.length);
  assert.equal(dropdown.style.display, 'none');
  assert.equal(keyEvent.defaultPrevented, true);
  assert.equal(keyEvent.immediateStopped, true);
  assert.equal(inputEvents, 2);
  console.log('ok - bindMentionInputControl inserts selected mention before Enter send handlers');
}

{
  let dropdown = null;
  const documentLike = createDocumentLike();
  const windowLike = {
    innerHeight: 720,
    setTimeout,
    clearTimeout,
  };
  const input = createElement('textarea');
  input.value = '@';
  input.selectionStart = 1;

  bindMentionInputControl({
    inputEl: input,
    anchorEl: input,
    documentLike,
    windowLike,
    getMembers: () => [
      { id: 'alice', name: 'Alice' },
    ],
    getDropdown: () => dropdown,
    setDropdown: next => {
      dropdown = next;
    },
  });

  input.dispatch('input', { type: 'input' });
  assert.equal(dropdown.style.display, 'block');
  documentLike.dispatch('pointerdown', { target: createElement('div') });
  assert.equal(dropdown.style.display, 'none');
  console.log('ok - bindMentionInputControl hides dropdown on outside pointerdown');
}
