import assert from 'node:assert/strict';

import {
  bindMomentDetailInteractions,
  buildMomentDetailBodyMarkup,
  renderMomentDetailBody,
} from '../../src/scripts/ui/moments-detail-runtime-utils.js';

{
  const html = buildMomentDetailBodyMarkup({
    moment: {
      author: '角色A',
      time: '刚刚',
      views: 12,
      likes: 3,
      comments: [{ id: 'c1', author: '甲', content: '你好' }],
    },
    avatar: 'https://example.com/a.png',
    escapeHtml: (value) => String(value ?? ''),
    renderMomentTextWithStickers: (value) => `HTML:${value}`,
    resolveMomentDisplayText: (value) => String(value?.content ?? ''),
  });
  assert.equal(html.includes('角色A'), true);
  assert.equal(html.includes('https://example.com/a.png'), true);
  assert.equal(html.includes('HTML:你好'), true);
  console.log('ok - buildMomentDetailBodyMarkup renders summary stats and comment bodies');
}

{
  const detailTextEl = {
    innerHTML: '',
    style: {},
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const commentEl = {
    dataset: { commentId: 'c1' },
  };
  const authorEl = {
    dataset: { commentId: 'c1' },
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
  const bodyEl = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === '.moment-detail-text') return detailTextEl;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.moment-detail-comment') return [commentEl];
      if (selector === '.moment-detail-author') return [authorEl];
      return [];
    },
  };
  const openedImages = [];
  const boundComments = [];
  const activated = [];
  const documentLike = {
    createElement(tagName) {
      return {
        tagName,
        className: '',
        children: [],
        listeners: {},
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        addEventListener(type, handler) {
          this.listeners[type] = handler;
        },
        innerHTML: '',
      };
    },
  };
  renderMomentDetailBody({
    bodyEl,
    moment: {
      id: 'm1',
      author: '角色A',
      content: '正文',
      comments: [{ id: 'c1', author: '甲', content: '你好' }],
    },
    avatar: 'https://example.com/a.png',
    documentLike,
    escapeHtml: (value) => String(value ?? ''),
    renderMomentTextWithStickers: (value) => `HTML:${value}`,
    resolveMomentDisplayText: (value) => String(value?.content ?? ''),
    extractMomentMedia: () => ({
      text: '正文',
      images: [{ url: 'https://example.com/p.png', label: 'p' }],
      audios: [{ url: 'https://example.com/a.mp3', label: 'a' }],
    }),
    onOpenImage: (url) => openedImages.push(url),
    bindCommentContextMenu: (payload) => boundComments.push([payload.momentId, payload.commentId]),
    activateReplyTarget: (payload) => activated.push([payload.momentId, payload.commentId]),
  });
  assert.equal(bodyEl.innerHTML.includes('角色A'), true);
  assert.equal(detailTextEl.innerHTML, 'HTML:正文');
  assert.equal(detailTextEl.style.display, '');
  assert.equal(detailTextEl.children.length, 2);
  detailTextEl.children[0].children[0].listeners.click?.({ stopPropagation() {} });
  authorEl.listeners.click?.({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(openedImages, ['https://example.com/p.png']);
  assert.deepEqual(boundComments, [['m1', 'c1']]);
  assert.deepEqual(activated, [['m1', 'c1']]);
  console.log('ok - renderMomentDetailBody fills media binds comment menu and forwards reply activation');
}

{
  const bound = [];
  const activated = [];
  const authorEl = {
    dataset: { commentId: 'c-1' },
    listeners: {},
    addEventListener(type, handler) {
      this.listeners[type] = handler;
    },
  };
  bindMomentDetailInteractions({
    bodyEl: {
      querySelectorAll(selector) {
        if (selector === '.moment-detail-comment') return [{ dataset: { commentId: 'c-1' } }];
        if (selector === '.moment-detail-author') return [authorEl];
        return [];
      },
    },
    moment: { id: 'm-1', comments: [{ id: 'c-1', author: '甲', content: 'hi' }] },
    bindCommentContextMenu: (payload) => bound.push([payload.momentId, payload.commentId]),
    activateReplyTarget: (payload) => activated.push([payload.momentId, payload.commentId]),
  });
  authorEl.listeners.click?.({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(bound, [['m-1', 'c-1']]);
  assert.deepEqual(activated, [['m-1', 'c-1']]);
  console.log('ok - bindMomentDetailInteractions binds detail comment menus and author reply actions');
}
