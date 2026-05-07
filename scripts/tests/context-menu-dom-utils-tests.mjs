import assert from 'node:assert/strict';

import {
  createContextMenuActionButton,
  createContextMenuReactionRow,
} from '../../src/scripts/ui/chat/context-menu-dom-utils.js';

const createClassList = (owner) => {
  const set = new Set();
  return {
    add: (...tokens) => {
      tokens.filter(Boolean).forEach(token => set.add(token));
      owner.className = [...set].join(' ');
    },
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
      this.classList = createClassList(this);
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
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
  const toggles = [];
  const row = createContextMenuReactionRow({
    documentLike,
    currentReactions: [{ emoji: '👍', actors: ['__self__'] }],
    emojis: ['👍', '😂'],
    isSelfReaction: entry => entry.actors.includes('__self__'),
    onToggle: emoji => toggles.push(emoji),
  });
  assert.equal(row.children.length, 2);
  assert.equal(row.children[0].className, 'is-active');
  row.children[1].onclick({ stopPropagation() {} });
  assert.deepEqual(toggles, ['😂']);
  console.log('ok - createContextMenuReactionRow renders active self reaction state and forwards toggles');
}

{
  const documentLike = createFakeDocument();
  let clicked = false;
  const btn = createContextMenuActionButton({
    documentLike,
    action: { label: '复制' },
    onClick: () => {
      clicked = true;
    },
  });
  assert.equal(btn.textContent, '复制');
  btn.onmouseenter();
  assert.equal(btn.style.background, 'var(--app-surface-hover)');
  btn.onmouseleave();
  assert.equal(btn.style.background, 'transparent');
  btn.onclick();
  assert.equal(clicked, true);
  console.log('ok - createContextMenuActionButton applies hover styles and forwards clicks');
}
