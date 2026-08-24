import assert from 'node:assert/strict';

import {
  createContextMenuActionButton,
  createContextMenuDivider,
  createContextMenuReactionRow,
  createContextMenuSpeakRow,
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


{
  const documentLike = createFakeDocument();
  const spoken = [];
  let moreCalls = 0;
  const row = createContextMenuSpeakRow({
    documentLike,
    quickVoices: [
      { voiceRef: 'voice_a', label: '苏晓彤音' },
      { voiceRef: 'voice_b', label: '温柔女声' },
      { voiceRef: '', label: '空引用被跳过' },
    ],
    onSpeak: voiceRef => spoken.push(voiceRef),
    onMore: () => { moreCalls += 1; },
  });
  assert.equal(row.className, 'chat-context-speak-row');
  const buttons = row.children;
  assert.equal(buttons[0].className, 'chat-context-speak-main');
  assert.equal(buttons[0].dataset.actionKey, 'speak');
  const chips = buttons.filter(node => node.className === 'chat-context-speak-chip');
  assert.deepEqual(chips.map(chip => [chip.dataset.voiceRef, chip.textContent]), [
    ['voice_a', '苏晓彤音'],
    ['voice_b', '温柔女声'],
  ]);
  const more = buttons[buttons.length - 1];
  assert.equal(more.className, 'chat-context-speak-more');
  assert.equal(more.dataset.actionKey, 'select-voice');
  const fakeEvent = { stopPropagation() {} };
  buttons[0].onclick(fakeEvent);
  chips[0].onclick(fakeEvent);
  more.onclick(fakeEvent);
  assert.deepEqual(spoken, [null, 'voice_a']);
  assert.equal(moreCalls, 1);
  console.log('ok - speak row exposes default speak, quick voice chips, and picker entry');
}

{
  const documentLike = createFakeDocument();
  // 气泡已有朗读按钮：不显示「朗读」，chips + ⋯ 保留
  const withChips = createContextMenuSpeakRow({
    documentLike,
    quickVoices: [{ voiceRef: 'voice_a', label: 'A' }],
    showSpeakButton: false,
    onSpeak: () => {},
    onMore: () => {},
  });
  assert.equal(withChips.children.some(node => node.className === 'chat-context-speak-main'), false);
  assert.equal(withChips.children.filter(node => node.className === 'chat-context-speak-chip').length, 1);
  assert.equal(withChips.children[withChips.children.length - 1].className, 'chat-context-speak-more');

  // 气泡已有朗读且声音库为空：退化为带文字的「选择声音…」，不显示孤零零的 ⋯
  const bare = createContextMenuSpeakRow({
    documentLike,
    quickVoices: [],
    showSpeakButton: false,
    onSpeak: () => {},
    onMore: () => {},
  });
  assert.equal(bare.children.length, 1);
  assert.equal(bare.children[0].className, 'chat-context-speak-more is-labeled');
  assert.equal(bare.children[0].textContent, '选择声音…');
  console.log('ok - speak row suppresses duplicate speak button when bubble already has one');
}
