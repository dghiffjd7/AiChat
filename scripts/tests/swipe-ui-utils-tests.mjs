import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  createSwipeIndicatorElement,
  ensureSwipeMeta,
  renderSwipeDraftPlaceholderCore,
  resolveActiveSwipeMessageCore,
  resolveSwipeIndicatorState,
  syncSwipeIndicatorElement,
} from '../../src/scripts/ui/chat/swipe-ui-utils.js';

const createClassList = () => {
  const set = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createFakeDocument = () => {
  class FakeElement {
    constructor(tagName) {
      this.tagName = String(tagName || '').toUpperCase();
      this.children = [];
      this.parentElement = null;
      this.className = '';
      this.classList = createClassList();
      this.dataset = {};
      this.textContent = '';
      this.disabled = false;
      this.style = {};
      this.attributes = new Map();
    }
    appendChild(child) {
      this.children.push(child);
      child.parentElement = this;
      return child;
    }
    setAttribute(name, value) {
      this.attributes.set(name, value);
    }
    querySelector(selector) {
      if (selector.startsWith('.')) {
        const cls = selector.slice(1);
        return this.children.find(child => child.className === cls) || null;
      }
      return null;
    }
  }
  return {
    createElement(tagName) {
      return new FakeElement(tagName);
    },
  };
};

{
  const message = {
    content: 'a',
    raw: 'raw-a',
    rawSource: 'source-a',
    rawOriginal: 'original-a',
    meta: {
      reasoningDisplay: 'think-a',
      sources: [{ url: 'https://first.example', title: 'First' }],
    },
  };
  const meta = ensureSwipeMeta(message);
  assert.equal(Array.isArray(meta.swipes), true);
  assert.equal(meta.swipes.length, 1);
  assert.equal(meta.swipes[0].content, 'a');
  assert.equal(meta.swipes[0].rawSource, 'source-a');
  assert.equal(meta.swipes[0].rawOriginal, 'original-a');
  assert.equal(meta.swipes[0].reasoningDisplay, 'think-a');
  assert.deepEqual(meta.swipes[0].sources, [{ url: 'https://first.example', title: 'First' }]);
  assert.equal(meta.activeSwipe, 0);
  console.log('ok - ensureSwipeMeta seeds swipe branches and active index');
}

{
  const resolved = resolveActiveSwipeMessageCore({
    id: 'm-sources',
    content: 'first',
    meta: {
      sources: [{ url: 'https://first.example', title: 'First' }],
      activeSwipe: 1,
      swipes: [
        {
          content: 'first',
          sources: [{ url: 'https://first.example', title: 'First' }],
        },
        {
          content: 'second',
          sources: [{ url: 'https://second.example', title: 'Second' }],
        },
      ],
    },
  });
  assert.deepEqual(resolved.meta.sources, [{ url: 'https://second.example', title: 'Second' }]);
  resolved.meta.activeSwipe = 0;
  const restored = resolveActiveSwipeMessageCore(resolved);
  assert.deepEqual(restored.meta.sources, [{ url: 'https://first.example', title: 'First' }]);
  console.log('ok - resolveActiveSwipeMessageCore keeps citations scoped to each swipe branch');
}

{
  const resolved = resolveActiveSwipeMessageCore({
    id: 'm-sources-none',
    content: 'first',
    meta: {
      sources: [{ url: 'https://first.example', title: 'First' }],
      activeSwipe: 1,
      swipes: [
        {
          content: 'first',
          sources: [{ url: 'https://first.example', title: 'First' }],
        },
        { content: 'second' },
      ],
    },
  });
  assert.equal(resolved.meta.sources, undefined);
  console.log('ok - a swipe branch without citations clears inherited message sources');
}

{
  const appSource = await readFile('src/scripts/ui/app.js', 'utf8');
  assert.match(appSource, /const branchSources = buildAssistantReplySources\(\[/);
  assert.match(appSource, /consumeLastGenerationSources\?\.\(\) \?\? \[\]/);
  assert.match(appSource, /if \(branchSources\) newBranch\.sources = branchSources;/);
  console.log('ok - swipe regeneration commits current-round and late-arriving citations');
}

{
  const message = {
    id: 'm1',
    meta: {
      swipes: [
        { content: 'a', raw: 'ra' },
        { content: 'b', raw: 'rb' },
      ],
      activeSwipe: 1,
    },
  };
  const state = resolveSwipeIndicatorState(message);
  assert.deepEqual({
    total: state.total,
    active: state.active,
    generating: state.generating,
    nextLabel: state.nextLabel,
  }, {
    total: 2,
    active: 1,
    generating: false,
    nextLabel: '生成新回复',
  });
  console.log('ok - resolveSwipeIndicatorState derives active index and next label');
}

{
  const documentLike = createFakeDocument();
  const message = {
    id: 'm1',
    meta: {
      swipes: [
        { content: 'a' },
        { content: 'b' },
      ],
      activeSwipe: 0,
      activeSwipeDraft: { active: true, label: '生成新回复中...' },
    },
  };
  const indicator = createSwipeIndicatorElement(documentLike, message);
  assert.equal(indicator.dataset.msgId, 'm1');
  assert.equal(indicator.querySelector('.rp-swipe-counter').textContent, '1/2');
  assert.equal(indicator.querySelector('.rp-swipe-prev').innerHTML.includes('<svg'), true);
  assert.equal(indicator.querySelector('.rp-swipe-next').innerHTML.includes('<svg'), true);
  assert.equal(indicator.querySelector('.rp-swipe-prev').disabled, true);
  assert.equal(indicator.querySelector('.rp-swipe-next').disabled, true);
  syncSwipeIndicatorElement(indicator, 1, 2, { generating: false });
  assert.equal(indicator.querySelector('.rp-swipe-counter').textContent, '2/2');
  assert.equal(indicator.querySelector('.rp-swipe-prev').disabled, false);
  assert.equal(indicator.querySelector('.rp-swipe-next').disabled, false);
  console.log('ok - swipe indicator builder and sync update counter and button states');
}

{
  const documentLike = createFakeDocument();
  const target = documentLike.createElement('div');
  const rendered = renderSwipeDraftPlaceholderCore(target, {
    documentLike,
    label: '生成中',
  });
  assert.equal(rendered, true);
  assert.equal(target.classList.contains('rp-swipe-draft-placeholder'), true);
  assert.equal(target.children.length, 2);
  assert.equal(target.children[1].textContent, '生成中');
  console.log('ok - renderSwipeDraftPlaceholderCore mounts placeholder dots and text');
}

{
  const resolved = resolveActiveSwipeMessageCore({
    id: 'm-reason',
    content: 'first',
    rawOriginal: 'first original',
    meta: {
      reasoningDisplay: 'first reasoning',
      activeSwipe: 1,
      swipes: [
        { content: 'first', raw: 'first raw', reasoningDisplay: 'branch first reasoning' },
        { content: 'second', raw: 'second raw' },
      ],
    },
  });
  assert.equal(resolved.content, 'second');
  assert.equal(resolved.raw, 'second raw');
  assert.equal(resolved.rawOriginal, undefined);
  assert.equal(resolved.meta.reasoningDisplay, undefined);
  console.log('ok - resolveActiveSwipeMessageCore clears stale reasoning on later branches without reasoning');
}

{
  const resolved = resolveActiveSwipeMessageCore({
    id: 'm2',
    content: 'old',
    raw: 'old-raw',
    meta: {
      activeSwipe: 1,
      swipes: [
        { content: 'branch-0', raw: 'raw-0' },
        { content: '', raw: '', draft: true, label: '生成新回复中...' },
      ],
      swipeRegenerating: true,
    },
  }, {
    activeSwipeGenerationMsgId: '',
  });
  assert.equal(resolved.content, 'branch-0');
  assert.equal(resolved.raw, 'raw-0');
  assert.equal(Array.isArray(resolved.meta.swipes), true);
  assert.equal(resolved.meta.swipes.length, 1);
  assert.equal(resolved.meta.activeSwipeDraft, undefined);
  console.log('ok - resolveActiveSwipeMessageCore drops stale draft branches and rebinds active content');
}
