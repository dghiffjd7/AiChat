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
  const divider = createContextMenuDivider({ documentLike });
  assert.equal(divider.className, 'chat-context-menu-section-divider');
  console.log('ok - createContextMenuDivider renders menu group divider');
}
