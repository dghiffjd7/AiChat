import assert from 'node:assert/strict';

import { createMomentsMenuRuntime } from '../../src/scripts/ui/moments-menu-runtime-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.className = '';
      this.dataset = {};
      this.style = {};
      this.children = [];
      this.listeners = {};
      this.offsetWidth = 140;
      this.offsetHeight = 80;
      this.classList = {
        add: (...tokens) => {
          const next = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          tokens.filter(Boolean).forEach(token => next.add(token));
          this.className = [...next].join(' ');
        },
        remove: (...tokens) => {
          const next = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          tokens.filter(Boolean).forEach(token => next.delete(token));
          this.className = [...next].join(' ');
        },
      };
    }
    appendChild(child) {
      this.children.push(child);
      child.parentNode = this;
      return child;
    }
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    }
    click() {
      this.listeners.click?.({ stopPropagation() {} });
    }
    getBoundingClientRect() {
      return { right: 340, bottom: 120 };
    }
  }

  const documentLike = {
    body: new FakeElement('body'),
    documentElement: {
      clientWidth: 360,
      clientHeight: 640,
    },
    createElement(tagName) {
      return new FakeElement(tagName);
    },
    addEventListener() {},
  };
  return { documentLike, FakeElement };
};

{
  const { documentLike } = createFakeDocument();
  const deleted = [];
  const runtime = createMomentsMenuRuntime({
    documentLike,
    windowLike: { innerWidth: 360, innerHeight: 640 },
    appConfirmFn: async () => true,
  });
  const menu = runtime.ensureMomentMenu({
    onDeleteMoment: async (momentId) => deleted.push(momentId),
  });
  runtime.showMomentMenu({
    menuEl: menu,
    anchorEl: documentLike.createElement('button'),
    momentId: 'm-1',
  });
  assert.equal(menu.dataset.momentId, 'm-1');
  assert.equal(menu.className.includes('hidden'), false);
  assert.equal(menu.style.left.endsWith('px'), true);
  assert.equal(menu.style.top.endsWith('px'), true);
  await menu.children[0].listeners.click?.({ stopPropagation() {} });
  assert.deepEqual(deleted, ['m-1']);
  assert.equal(menu.dataset.momentId, '');
  console.log('ok - moment menu runtime creates positions and confirms moment deletion');
}

{
  const { documentLike } = createFakeDocument();
  const deleted = [];
  const runtime = createMomentsMenuRuntime({
    documentLike,
    windowLike: { innerWidth: 360, innerHeight: 640 },
    appConfirmFn: async () => true,
  });
  const menu = runtime.ensureCommentMenu({
    onDeleteComment: async (momentId, commentId) => deleted.push([momentId, commentId]),
  });
  runtime.showCommentMenu({
    menuEl: menu,
    point: { x: 300, y: 80 },
    momentId: 'm-2',
    commentId: 'c-9',
  });
  assert.equal(menu.dataset.momentId, 'm-2');
  assert.equal(menu.dataset.commentId, 'c-9');
  assert.equal(menu.style.left.endsWith('px'), true);
  assert.equal(menu.style.top.endsWith('px'), true);
  await menu.children[0].listeners.click?.({ stopPropagation() {} });
  assert.deepEqual(deleted, [['m-2', 'c-9']]);
  assert.equal(menu.dataset.momentId, '');
  assert.equal(menu.dataset.commentId, '');
  console.log('ok - comment menu runtime creates positions and confirms comment deletion');
}
