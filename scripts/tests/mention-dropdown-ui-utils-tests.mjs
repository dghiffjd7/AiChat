import assert from 'node:assert/strict';

import {
  applyMentionInsertion,
  buildMentionDropdownItems,
  ensureMentionDropdownShell,
  filterMentionMembers,
  positionMentionDropdownCore,
  updateMentionSelectionCore,
} from '../../src/scripts/ui/chat/mention-dropdown-ui-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.className = '';
      this.style = {};
      this.dataset = {};
      this.textContent = '';
      this.innerHTML = '';
      this.listeners = new Map();
    }
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    dispatch(type, event = {}) {
      this.listeners.get(type)?.({
        preventDefault() {},
        stopPropagation() {},
        ...event,
      });
    }
    scrollIntoView(options) {
      this.scrolledWith = options;
    }
  }
  const body = new FakeElement('body');
  return {
    body,
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const filtered = filterMentionMembers([
    { name: 'Alice', id: 'alice' },
    { name: 'Bob', id: 'member-b' },
  ], 'bo');
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].name, 'Bob');
  console.log('ok - filterMentionMembers matches query against name and id');
}

{
  const documentLike = createFakeDocument();
  const dropdown = ensureMentionDropdownShell(documentLike, null);
  assert.equal(documentLike.body.children[0], dropdown);
  assert.equal(dropdown.className, 'mention-dropdown');
  assert.equal(ensureMentionDropdownShell(documentLike, dropdown), dropdown);
  console.log('ok - ensureMentionDropdownShell mounts shell once and reuses it');
}

{
  const items = [
    { style: {}, scrollIntoView(options) { this.scrolled = options; } },
    { style: {}, scrollIntoView(options) { this.scrolled = options; } },
  ];
  updateMentionSelectionCore(items, 1);
  assert.equal(items[0].style.background, 'transparent');
  assert.equal(items[1].style.background, 'var(--app-accent-soft)');
  assert.deepEqual(items[1].scrolled, { block: 'nearest' });
  console.log('ok - updateMentionSelectionCore toggles active background and scrolls selected item');
}

{
  const documentLike = createFakeDocument();
  const hovered = [];
  const selected = [];
  const items = buildMentionDropdownItems(documentLike, [
    { name: '甲', avatar: '' },
    { name: '乙', id: 'b2', avatar: 'b.png' },
  ], {
    selectedIndex: 0,
    onHover: index => hovered.push(index),
    onSelect: name => selected.push(name),
  });
  assert.equal(items.length, 2);
  assert.equal(items[0].style.cssText.includes('background:var(--app-accent-soft)'), true);
  items[1].dispatch('pointerenter');
  items[1].dispatch('click');
  assert.deepEqual(hovered, [1]);
  assert.deepEqual(selected, ['乙']);
  console.log('ok - buildMentionDropdownItems wires hover select and initial active styling');
}

{
  const dropdown = { style: {} };
  const inputContainer = {
    getBoundingClientRect() {
      return { left: 24, top: 620 };
    },
  };
  const positioned = positionMentionDropdownCore(dropdown, inputContainer, {
    windowHeight: 900,
  });
  assert.equal(positioned, true);
  assert.equal(dropdown.style.left, '32px');
  assert.equal(dropdown.style.bottom, '284px');
  assert.equal(dropdown.style.top, 'auto');
  console.log('ok - positionMentionDropdownCore aligns popup above input container');
}

{
  const result = applyMentionInsertion({
    value: 'hello @ab world',
    selectionStart: 9,
    mentionStartPos: 6,
    name: 'Alice',
  });
  assert.deepEqual(result, {
    value: 'hello @Alice  world',
    cursor: 13,
  });
  console.log('ok - applyMentionInsertion replaces partial query and returns next cursor');
}
