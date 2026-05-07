import assert from 'node:assert/strict';

import {
  ensureMomentDetailModalShell,
  hideMomentDetailModal,
  openMomentImagePreview,
  showMomentDetailModal,
} from '../../src/scripts/ui/moments-modal-shell-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.id = '';
      this.className = '';
      this.innerHTML = '';
      this.children = [];
      this.style = {};
      this.listeners = {};
      this.lookup = {};
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
    querySelector(selector) {
      return this.lookup[selector] || null;
    }
    remove() {
      this.removed = true;
    }
  }

  const documentLike = {
    body: new FakeElement('body'),
    createElement(tagName) {
      const element = new FakeElement(tagName);
      if (String(tagName).toLowerCase() === 'div') {
        const closeButton = new FakeElement('button');
        const sendButton = new FakeElement('button');
        element.lookup['#moment-detail-close'] = closeButton;
        element.lookup['#moment-comment-send'] = sendButton;
      }
      return element;
    },
  };
  return { documentLike };
};

{
  const { documentLike } = createFakeDocument();
  const sent = [];
  const modal = ensureMomentDetailModalShell({
    documentLike,
    onSendComment: () => sent.push(true),
  });
  assert.equal(documentLike.body.children.includes(modal), true);
  const panel = modal.children[0];
  panel.lookup['#moment-comment-send'].listeners.click?.();
  panel.lookup['#moment-detail-close'].listeners.click?.();
  assert.deepEqual(sent, [true]);
  assert.equal(modal.style.display, 'none');
  console.log('ok - ensureMomentDetailModalShell creates modal shell and wires send/close actions');
}

{
  const modal = { style: {} };
  assert.equal(showMomentDetailModal(modal), true);
  assert.equal(modal.style.display, 'block');
  assert.equal(hideMomentDetailModal(modal), true);
  assert.equal(modal.style.display, 'none');
  console.log('ok - showMomentDetailModal and hideMomentDetailModal toggle modal visibility');
}

{
  const { documentLike } = createFakeDocument();
  const overlay = openMomentImagePreview({
    documentLike,
    url: 'https://example.com/p.png',
  });
  assert.equal(documentLike.body.children.includes(overlay), true);
  assert.equal(overlay.innerHTML.includes('https://example.com/p.png'), true);
  overlay.listeners.click?.();
  assert.equal(overlay.removed, true);
  assert.equal(openMomentImagePreview({ documentLike, url: '' }), null);
  console.log('ok - openMomentImagePreview mounts lightbox preview and ignores empty urls');
}
