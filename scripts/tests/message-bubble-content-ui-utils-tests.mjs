import assert from 'node:assert/strict';

import { renderMessageBubbleContentCore } from '../../src/scripts/ui/chat/message-bubble-content-ui-utils.js';

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.nodeName = this.tagName;
      this.children = [];
      this.childNodes = this.children;
      this.dataset = {};
      this.style = {};
      this.textContent = '';
      this.className = '';
      this.src = '';
      this.alt = '';
      this.loading = '';
      this.decoding = '';
      this.controls = false;
      this.preload = '';
      this.disabled = false;
      this.innerHTML = '';
      this.listeners = new Map();
      this.classList = {
        add: (...tokens) => {
          const next = new Set(String(this.className || '').split(/\s+/).filter(Boolean));
          tokens.filter(Boolean).forEach(token => next.add(token));
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
      this.listeners.set(type, handler);
    }
    emit(type, event = {}) {
      return this.listeners.get(type)?.(event);
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
  const bubble = documentLike.createElement('div');
  const previews = [];
  const toasts = [];
  renderMessageBubbleContentCore({
    bubble,
    message: { type: 'image', content: 'cat.png' },
    documentLike,
    resolveMediaUrl: () => 'resolved://cat.png',
    toastOnce: text => toasts.push(text),
    openLightbox: url => previews.push(url),
  });
  const img = bubble.children[0];
  assert.equal(img.tagName, 'IMG');
  assert.equal(img.src, 'resolved://cat.png');
  img.emit('click');
  assert.deepEqual(previews, ['resolved://cat.png']);
  img.onerror();
  assert.equal(img.alt, '图片加载失败');
  assert.deepEqual(toasts, ['图片加载失败，请检查链接或网络']);
  console.log('ok - renderMessageBubbleContentCore renders previewable images with lightbox and failure toast');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  renderMessageBubbleContentCore({
    bubble,
    message: {
      type: 'image',
      content: '[binary omitted]',
      meta: { localPath: 'D:\\images\\generated.png' },
    },
    documentLike,
    resolveMediaAsset: () => {
      throw new Error('local generated image path should be resolved directly');
    },
  });
  const img = bubble.children[0];
  assert.equal(img.src, 'file:///D:/images/generated.png');
  console.log('ok - renderMessageBubbleContentCore resolves generated image local path from meta');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  const target = documentLike.createElement('div');
  const renders = [];
  const logs = [];
  renderMessageBubbleContentCore({
    bubble,
    message: { id: 'm-rich', type: 'text', content: '<b>x</b>', meta: { renderRich: true, isGreeting: true } },
    resolvedSessionId: 'rp:test',
    documentLike,
    prepareTextContainer: () => target,
    renderRichText: (...args) => renders.push(args),
    logGreetingRender: (...args) => logs.push(args),
  });
  assert.equal(renders.length, 1);
  assert.equal(renders[0][0], target);
  assert.equal(renders[0][1], '<b>x</b>');
  assert.equal(renders[0][2].sessionId, 'rp:test');
  assert.equal(renders[0][2].debugTag, 'rp-greeting');
  assert.equal(logs.length, 1);
  console.log('ok - renderMessageBubbleContentCore routes renderRich messages through rich renderer with greeting diagnostics');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  const target = documentLike.createElement('div');
  const renders = [];
  renderMessageBubbleContentCore({
    bubble,
    message: { id: 'm-content', type: 'text', content: '<content><b>x</b></content>', meta: { renderRich: true } },
    resolvedSessionId: 'rp:test',
    documentLike,
    prepareTextContainer: () => target,
    renderRichText: (...args) => renders.push(args),
  });
  assert.equal(renders.length, 1);
  assert.equal(renders[0][1], '<content><b>x</b></content>');
  console.log('ok - renderMessageBubbleContentCore preserves creative content wrapper for rich rendering');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  const target = documentLike.createElement('div');
  const renders = [];
  renderMessageBubbleContentCore({
    bubble,
    message: {
      id: 'm-content-raw',
      type: 'text',
      content: '<b>x</b>',
      rawSource: '<content><b>x</b></content>',
      meta: { renderRich: true, isGreeting: true },
    },
    resolvedSessionId: 'rp:test',
    documentLike,
    prepareTextContainer: () => target,
    renderRichText: (...args) => renders.push(args),
  });
  assert.equal(renders.length, 1);
  assert.equal(renders[0][1], '<content><b>x</b></content>');
  console.log('ok - renderMessageBubbleContentCore restores raw content wrapper for rich greeting rendering');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  const target = documentLike.createElement('div');
  const drafts = [];
  renderMessageBubbleContentCore({
    bubble,
    message: { type: 'text', meta: { activeSwipeDraft: { active: true, label: '继续生成' } } },
    documentLike,
    prepareTextContainer: () => target,
    renderSwipeDraftPlaceholder: (...args) => drafts.push(args),
  });
  assert.deepEqual(drafts, [[target, '继续生成']]);
  console.log('ok - renderMessageBubbleContentCore routes active swipe drafts into placeholder rendering');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  renderMessageBubbleContentCore({
    bubble,
    message: {
      type: 'text',
      content: '图片生成失败：429',
      meta: {
        generatedMedia: {
          status: 'failed',
          prompt: 'blue sky',
          error: 'NovelAI API Error: 429',
        },
      },
    },
    documentLike,
  });
  const card = bubble.children[0];
  assert.equal(card.tagName, 'DETAILS');
  assert.equal(card.className.includes('generated-media-error-card'), true);
  const summary = card.children[0];
  const retry = summary.children.find(node => String(node.className || '').includes('generated-media-error-retry'));
  assert.ok(retry);
  assert.equal(retry.dataset.action, 'retry-generated-media');
  assert.equal(retry.textContent, '重新生成图片');
  console.log('ok - renderMessageBubbleContentCore renders retry button for failed generated media');
}

{
  const documentLike = createFakeDocument();
  const bubble = documentLike.createElement('div');
  const target = documentLike.createElement('div');
  let normalizedInput = null;
  const stickerCalls = [];
  renderMessageBubbleContentCore({
    bubble,
    message: { type: 'text', role: 'assistant', raw: 'a\nb' },
    documentLike,
    prepareTextContainer: () => target,
    normalizeAssistantLineBreaks: text => {
      normalizedInput = text;
      return 'normalized text';
    },
    renderTextWithStickers: (...args) => {
      stickerCalls.push(args);
      return false;
    },
  });
  assert.equal(normalizedInput, 'a\nb');
  assert.equal(stickerCalls.length, 1);
  assert.equal(target.textContent, 'normalized text');
  assert.equal(target.style.whiteSpace, 'pre-wrap');
  console.log('ok - renderMessageBubbleContentCore falls back to normalized plain text when sticker rendering does not intercept');
}
