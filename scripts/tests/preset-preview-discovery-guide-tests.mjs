import assert from 'node:assert/strict';

import {
  calculatePresetPreviewDiscoveryPosition,
  createPresetPreviewDiscoveryGuide,
  PRESET_PREVIEW_DISCOVERY_HINT_ID,
} from '../../src/scripts/ui/preset-preview-discovery-guide.js';

class FakeClassList {
  constructor() {
    this.values = new Set();
  }

  add(...names) {
    names.forEach(name => this.values.add(name));
  }

  remove(...names) {
    names.forEach(name => this.values.delete(name));
  }

  contains(name) {
    return this.values.has(name);
  }
}

class FakeElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = new Map();
    this.parentNode = null;
    this._rect = { left: 0, top: 0, width: 164, height: 64, right: 164, bottom: 64 };
  }

  appendChild(child) {
    this.children.push(child);
    child.parentNode = this;
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  remove() {
    if (!this.parentNode) return;
    this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }

  getBoundingClientRect() {
    return this._rect;
  }
}

const makeDom = () => {
  const elementsById = new Map();
  const body = new FakeElement('body');
  const head = new FakeElement('head');
  const originalAppend = head.appendChild.bind(head);
  head.appendChild = (child) => {
    originalAppend(child);
    if (child.id) elementsById.set(child.id, child);
    return child;
  };
  const listeners = new Map();
  const windowRef = {
    innerWidth: 1024,
    innerHeight: 768,
    addEventListener: (type, handler) => listeners.set(type, handler),
    removeEventListener: type => listeners.delete(type),
    requestAnimationFrame: callback => {
      callback();
      return 1;
    },
    cancelAnimationFrame: () => {},
    matchMedia: () => ({ matches: false }),
    visualViewport: null,
  };
  const documentRef = {
    body,
    head,
    createElement: tagName => new FakeElement(tagName),
    getElementById: id => elementsById.get(id) || null,
  };
  return { documentRef, windowRef };
};

{
  const position = calculatePresetPreviewDiscoveryPosition({
    targetRect: { left: 990, top: 300, width: 24, height: 112 },
    markerSize: { width: 164, height: 64 },
    viewport: { width: 1024, height: 768 },
  });
  assert.deepEqual(position, { left: 814, top: 324 });

  const clamped = calculatePresetPreviewDiscoveryPosition({
    targetRect: { left: 130, top: 8, width: 24, height: 24 },
    markerSize: { width: 164, height: 64 },
    viewport: { width: 180, height: 100 },
  });
  assert.deepEqual(clamped, { left: 8, top: 8 });
  console.log('ok - preset preview discovery marker stays beside the right-edge handle and inside the viewport');
}

{
  const { documentRef, windowRef } = makeDom();
  const dismissed = new Set();
  const guideStore = {
    isHintDismissed: hintId => dismissed.has(hintId),
    dismissHint: hintId => {
      if (dismissed.has(hintId)) return false;
      dismissed.add(hintId);
      return true;
    },
  };
  const target = new FakeElement('button');
  target._rect = { left: 990, top: 300, width: 24, height: 112, right: 1014, bottom: 412 };
  const guide = createPresetPreviewDiscoveryGuide({ documentRef, windowRef, guideStore });

  assert.equal(guide.show(target), true);
  assert.equal(guide.getElement()?.getAttribute('aria-hidden'), 'false');
  assert.equal(target.classList.contains('is-opaque'), true, 'the actual preview handle should wake while the marker points at it');
  guide.hide();
  assert.equal(dismissed.size, 0, 'closing the panel without opening preview must not consume the one-time hint');

  assert.equal(guide.show(target), true);
  assert.equal(guide.complete(), true);
  assert.equal(dismissed.has(PRESET_PREVIEW_DISCOVERY_HINT_ID), true);
  assert.equal(guide.getElement()?.getAttribute('aria-hidden'), 'true');
  assert.equal(target.classList.contains('is-opaque'), false);
  assert.equal(guide.show(target), false, 'a completed discovery hint must never show again for the same profile');
  guide.destroy();
  console.log('ok - preset preview discovery is dismissed only by actually opening preview');
}
