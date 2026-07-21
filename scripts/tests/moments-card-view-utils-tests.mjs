import assert from 'node:assert/strict';

import {
  buildMomentCardMarkup,
  buildMomentThreadedCommentsHtml,
  renderMomentCardContent,
} from '../../src/scripts/ui/moments-card-view-utils.js';

{
  const html = buildMomentThreadedCommentsHtml({
    visibleComments: [
      { id: 'c1', author: '甲', content: '你好' },
      { id: 'c2', author: '乙', content: '回复', replyTo: 'c1', replyToAuthor: '甲' },
      { id: 'c3', author: '丙', content: '回复楼中楼', replyTo: 'c2', replyToAuthor: '乙' },
    ],
    buildThreadedComments: () => ({
      roots: [{ id: 'c1', author: '甲', content: '你好' }],
      repliesByParent: new Map([
        ['c1', [{ id: 'c2', author: '乙', content: '回复', replyToAuthor: '甲' }]],
        ['c2', [{ id: 'c3', author: '丙', content: '回复楼中楼', replyToAuthor: '乙' }]],
      ]),
    }),
    escapeHtml: (value) => String(value ?? ''),
    renderMomentTextWithStickers: (value) => `HTML:${value}`,
    resolveMomentDisplayText: (value) => String(value?.content ?? ''),
  });
  assert.equal(html.includes('HTML:你好'), true);
  assert.equal(html.includes('HTML:回复'), true);
  assert.equal(html.includes('HTML:回复楼中楼'), true);
  assert.equal(html.includes('moment-comment-reply'), true);
  assert.equal(html.includes('回复 <span'), true);
  console.log('ok - buildMomentThreadedCommentsHtml renders root and flattened nested reply bodies');
}

{
  const html = buildMomentCardMarkup({
    moment: { author: '角色A', time: '刚刚', views: 12, likes: 3, comments: [{ id: 'c1' }] },
    avatar: 'https://example.com/a.png',
    userAvatar: 'https://example.com/me.png',
    comments: [{ id: 'c1' }],
    hiddenCount: 2,
    expanded: false,
    threadedHtml: '<div>comments</div>',
    replyTarget: { author: '甲', content: '你好' },
    showComposer: true,
    pending: true,
    escapeHtml: (value) => String(value ?? ''),
    resolveMomentDisplayText: (value) => String(value?.content ?? ''),
  });
  assert.equal(html.includes('https://example.com/a.png'), true);
  assert.equal(html.includes('class="moment-comment-avatar"'), true);
  assert.equal(html.includes('https://example.com/me.png'), true);
  assert.equal(html.includes('class="moment-comment-composer-inner"'), true);
  assert.equal(html.includes('M12 21'), true);
  assert.equal(html.includes('展开查看更多评论 (2条)'), true);
  assert.equal(html.includes('data-action="like"'), true);
  assert.equal(html.includes('<span class="moment-like-count">3</span>'), true);
  assert.equal(html.includes('回复 <b>甲</b>：你好'), true);
  assert.equal(html.includes('发送中…'), true);
  console.log('ok - buildMomentCardMarkup renders stats threaded comments and reply composer state');
}

{
  const html = buildMomentCardMarkup({
    moment: { author: '角色A', likes: 8, userLiked: true },
    avatar: '',
    escapeHtml: (value) => String(value ?? ''),
  });
  assert.equal(html.includes('moment-like-button is-liked'), true);
  assert.equal(html.includes('aria-pressed="true"'), true);
  assert.equal(html.includes('disabled'), false);
  console.log('ok - buildMomentCardMarkup renders persisted liked state');
}

{
  const textEl = {
    innerHTML: '',
    style: {},
  };
  const contentEl = {
    children: [],
    appendChild(child) {
      this.children.push(child);
      return child;
    },
  };
  const cardEl = {
    innerHTML: '',
    querySelector(selector) {
      if (selector === '.moment-text') return textEl;
      if (selector === '.moment-content') return contentEl;
      return null;
    },
  };
  const openedImages = [];
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
  renderMomentCardContent({
    cardEl,
    moment: {
      author: '角色A',
      content: '正文',
      comments: [{ id: 'c1', author: '甲', content: '你好' }],
    },
    avatar: 'https://example.com/a.png',
    visibleComments: [{ id: 'c1', author: '甲', content: '你好' }],
    documentLike,
    buildThreadedComments: () => ({ roots: [], repliesByParent: new Map() }),
    escapeHtml: (value) => String(value ?? ''),
    renderMomentTextWithStickers: (value) => `HTML:${value}`,
    resolveMomentDisplayText: (value) => String(value?.content ?? ''),
    extractMomentMedia: () => ({
      text: '正文',
      images: [{ url: 'https://example.com/p.png', label: 'p' }],
      audios: [{ url: 'https://example.com/a.mp3', label: 'a' }],
    }),
    onOpenImage: (url) => openedImages.push(url),
  });
  assert.equal(cardEl.innerHTML.includes('角色A'), true);
  assert.equal(textEl.innerHTML, 'HTML:正文');
  assert.equal(textEl.style.display, '');
  assert.equal(contentEl.children.length, 2);
  contentEl.children[0].children[0].listeners.click?.({ stopPropagation() {} });
  assert.deepEqual(openedImages, ['https://example.com/p.png']);
  console.log('ok - renderMomentCardContent fills moment text and appends image/audio media blocks');
}

{
  const cardEl = {
    innerHTML: '',
    querySelector() {
      return null;
    },
  };
  const comments = [
    { id: 'c1', author: '甲', content: '1' },
    { id: 'c2', author: '乙', content: '2' },
    { id: 'c3', author: '丙', content: '3' },
    { id: 'c4', author: '丁', content: '4' },
  ];
  renderMomentCardContent({
    cardEl,
    moment: { author: '角色A', comments },
    expanded: true,
    visibleComments: comments,
    collapsedCommentLimit: 3,
    documentLike: { createElement() {} },
    buildThreadedComments: (items) => ({ roots: items, repliesByParent: new Map() }),
    escapeHtml: (value) => String(value ?? ''),
    renderMomentTextWithStickers: (value) => String(value ?? ''),
    resolveMomentDisplayText: (value) => String(value?.content ?? ''),
  });
  assert.equal(cardEl.innerHTML.includes('收起评论'), true);
  console.log('ok - renderMomentCardContent keeps collapse control visible when expanded');
}
