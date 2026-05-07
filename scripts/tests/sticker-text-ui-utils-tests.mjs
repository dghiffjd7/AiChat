import assert from 'node:assert/strict';

import { renderTextWithStickersCore } from '../../src/scripts/ui/chat/sticker-text-ui-utils.js';

const createFakeDocument = () => {
  class FakeNode {
    constructor(nodeName) {
      this.nodeName = nodeName;
      this.children = [];
      this.childNodes = this.children;
      this.parentNode = null;
      this.textContent = '';
      this.className = '';
      this.style = {};
      this.listeners = new Map();
      this.alt = '';
      this.src = '';
      this.currentSrc = '';
      this.loading = '';
      this.decoding = '';
      this.classList = {
        add: (...tokens) => {
          const values = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          tokens.filter(Boolean).forEach(token => values.add(token));
          this.className = [...values].join(' ');
        },
      };
    }
    appendChild(child) {
      if (child?.isFragment) {
        child.childNodes.forEach(node => this.appendChild(node));
        return child;
      }
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      this.listeners.set(type, handler);
    }
    emit(type, event = {}) {
      this.listeners.get(type)?.(event);
    }
  }

  class FakeFragment {
    constructor() {
      this.isFragment = true;
      this.childNodes = [];
    }
    appendChild(child) {
      this.childNodes.push(child);
      return child;
    }
    get lastChild() {
      return this.childNodes[this.childNodes.length - 1] || null;
    }
  }

  return {
    createElement(tagName) {
      return new FakeNode(String(tagName || '').toUpperCase());
    },
    createTextNode(text) {
      const node = new FakeNode('#text');
      node.textContent = String(text || '');
      return node;
    },
    createDocumentFragment() {
      return new FakeFragment();
    },
  };
};

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  assert.equal(renderTextWithStickersCore({
    bubble,
    text: 'plain text',
    documentLike,
    resolveMediaAsset: () => null,
  }), false);
  assert.equal(bubble.children.length, 0);
  console.log('ok - renderTextWithStickersCore returns false when message contains no sticker tokens');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  const previews = [];
  const animations = [];
  const rendered = renderTextWithStickersCore({
    bubble,
    text: 'Hi [bqb-wave] there',
    documentLike,
    resolveMediaAsset: (_kind, keyword) => (keyword === 'wave' ? { id: 'wave' } : null),
    resolveStickerFrames: () => ['frame1', 'frame2'],
    resolveStickerFps: () => 8,
    applyImageFallback: (img) => {
      img.src = 'sticker://wave';
      img.currentSrc = 'sticker://wave';
      return true;
    },
    registerStickerAnimation: (...args) => animations.push(args),
    toastOnce: () => {},
    onPreview: url => previews.push(url),
  });
  assert.equal(rendered, true);
  assert.equal(bubble.style.whiteSpace, 'pre-wrap');
  const imageNode = bubble.children.find(node => node.nodeName === 'IMG');
  assert.ok(imageNode);
  assert.equal(animations.length, 1);
  imageNode.emit('click');
  assert.deepEqual(previews, ['sticker://wave']);
  console.log('ok - renderTextWithStickersCore renders inline sticker images and preview bindings');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  renderTextWithStickersCore({
    bubble,
    text: '[bqb-missing]',
    documentLike,
    resolveMediaAsset: () => null,
    resolveStickerFrames: () => [],
    resolveStickerFps: () => 0,
    applyImageFallback: () => false,
    registerStickerAnimation: () => {},
    toastOnce: () => {},
    onPreview: () => {},
  });
  const chip = bubble.children.find(node => node.className === 'chip');
  assert.ok(chip);
  assert.equal(chip.textContent, '表情包：missing');
  console.log('ok - renderTextWithStickersCore falls back to chip output when sticker asset is unavailable');
}
