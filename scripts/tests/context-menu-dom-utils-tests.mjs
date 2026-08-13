import assert from 'node:assert/strict';

import {
  createContextMenuActionButton,
  createContextMenuDivider,
  createContextMenuReactionRow,
} from '../../src/scripts/ui/chat/context-menu-dom-utils.js';

const createClassList = (owner) => {
  const set = new Set();
  return {
    add: (...tokens) => {
      tokens.filter(Boolean).forEach(token => set.add(token));
      owner.className = [owner.className, ...set].join(' ').trim();
    },
    contains: token => String(owner.className || '').split(/\s+/).includes(token) || set.has(token),
  };
};

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
      this.dataset = {};
      this.attributes = {};
      this.classList = createClassList(this);
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
    createElementNS(_namespace, tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const documentLike = createFakeDocument();
  const toggles = [];
  const row = createContextMenuReactionRow({
    documentLike,
    currentReactions: [{ emoji: '👍', actors: ['__self__'] }],
    emojis: ['👍', '😂'],
    isSelfReaction: entry => entry.actors.includes('__self__'),
    onToggle: emoji => toggles.push(emoji),
  });
  assert.equal(row.children.length, 2);
  assert.equal(row.children[0].classList.contains('is-active'), true);
  assert.equal(row.children[0].children[0].children[0].tagName, 'IMG');
  assert.equal(row.children[0].children[0].children[0].src.endsWith('/1f44d.svg'), true);
  row.children[1].onclick({ stopPropagation() {} });
  assert.deepEqual(toggles, ['😂']);
  console.log('ok - createContextMenuReactionRow renders active self reaction state and forwards toggles');
}

{
  const documentLike = createFakeDocument();
  let clicked = false;
  const btn = createContextMenuActionButton({
    documentLike,
    action: { key: 'copy-text', label: '复制' },
    onClick: () => {
      clicked = true;
    },
  });
  assert.equal(btn.className, 'chat-context-menu-action');
  assert.equal(btn.children[1].textContent, '复制');
  assert.equal(btn.dataset.actionKey, 'copy-text');
  btn.onclick();
  assert.equal(clicked, true);
  console.log('ok - createContextMenuActionButton renders structured action rows and forwards clicks');
}

{
  const documentLike = createFakeDocument();
  const btn = createContextMenuActionButton({
    documentLike,
    action: { key: 'check-format', label: '检查格式' },
  });
  const icon = btn.children[0];
  assert.equal(icon.textContent, '');
  assert.equal(icon.children.length, 1);
  assert.equal(icon.children[0].tagName, 'SVG');
  assert.equal(icon.children[0].attributes.viewBox, '0 0 24 24');
  assert.equal(icon.children[0].attributes.stroke, 'currentColor');
  assert.equal(icon.children[0].children.length, 4);
  console.log('ok - createContextMenuActionButton renders the check-format SVG icon');
}

{
  const documentLike = createFakeDocument();
  const btn = createContextMenuActionButton({
    documentLike,
    action: { key: 'speak', label: '朗读' },
  });
  const icon = btn.children[0];
  assert.equal(icon.textContent, '');
  assert.equal(icon.children.length, 1);
  assert.equal(icon.children[0].tagName, 'SVG');
  assert.equal(icon.children[0].attributes.viewBox, '0 0 24 24');
  assert.equal(icon.children[0].attributes.stroke, 'currentColor');
  assert.equal(icon.children[0].children.length, 3);
  console.log('ok - createContextMenuActionButton renders the speak SVG icon');
}

{
  const documentLike = createFakeDocument();
  const divider = createContextMenuDivider({ documentLike });
  assert.equal(divider.className, 'chat-context-menu-section-divider');
  console.log('ok - createContextMenuDivider renders menu group divider');
}
