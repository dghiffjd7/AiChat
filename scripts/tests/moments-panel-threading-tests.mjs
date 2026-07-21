import assert from 'node:assert/strict';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

class MemoryLocalStorageMock {
  constructor() {
    this.map = new Map();
  }

  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }

  setItem(key, value) {
    this.map.set(String(key), String(value));
  }

  removeItem(key) {
    this.map.delete(String(key));
  }
}

const previousLocalStorage = globalThis.localStorage;
const previousDocument = globalThis.document;
const originalSetTimeout = globalThis.setTimeout;
if (previousLocalStorage === undefined) {
  globalThis.localStorage = new MemoryLocalStorageMock();
}
if (previousDocument === undefined) {
  globalThis.document = {
    body: {
      dataset: {
        themeMode: 'dark',
      },
    },
  };
}
globalThis.setTimeout = () => 0;

const { MomentsPanel } = await import('../../src/scripts/ui/moments-panel.js');
globalThis.setTimeout = originalSetTimeout;

test('buildThreadedComments groups roots, replies, and nested replies in source order', () => {
  const panel = new MomentsPanel();
  const comments = [
    { id: 'c1', author: '发布者', content: '根评论' },
    { id: 'c2', author: '路人甲', content: '回复根评论', replyTo: 'c1' },
    { id: 'c3', author: '路人乙', content: '回复楼中楼', replyTo: 'c2' },
    { id: 'c4', author: '路人丙', content: '孤儿回复', replyTo: 'missing' },
    null,
  ];

  const { roots, repliesByParent, byId } = panel.buildThreadedComments(comments);

  assert.deepEqual(roots.map((item) => item.id), ['c1', 'c4']);
  assert.deepEqual((repliesByParent.get('c1') || []).map((item) => item.id), ['c2']);
  assert.deepEqual((repliesByParent.get('c2') || []).map((item) => item.id), ['c3']);
  assert.equal(byId.get('c4'), comments[3]);
});

test('buildThreadedComments keeps idless comments as roots but excludes them from byId', () => {
  const panel = new MomentsPanel();
  const comments = [
    { author: '匿名', content: '无 id 评论' },
    { id: 'c1', author: '发布者', content: '有 id 评论' },
  ];

  const { roots, repliesByParent, byId } = panel.buildThreadedComments(comments);

  assert.equal(roots.length, 2);
  assert.equal(repliesByParent.size, 0);
  assert.equal(byId.size, 1);
  assert.equal(byId.has('c1'), true);
});

test('likeMoment updates one button without rebuilding the moments list', () => {
  const scheduled = [];
  const cancelled = [];
  const previousTimer = globalThis.setTimeout;
  const previousClearTimer = globalThis.clearTimeout;
  globalThis.setTimeout = fn => {
    scheduled.push(fn);
    return scheduled.length;
  };
  globalThis.clearTimeout = id => cancelled.push(id);
  try {
    const classes = new Set();
    const countEl = { textContent: '' };
    const attributes = new Map();
    const panel = new MomentsPanel({
      momentsStore: {
        get: id => id === 'm1' ? { id, likes: 2, userLiked: false } : null,
        likeMoment: id => ({ id, likes: 3, userLiked: true }),
      },
    });
    let renderCount = 0;
    panel.render = () => {
      renderCount += 1;
    };
    const buttonEl = {
      dataset: {},
      classList: {
        add: name => classes.add(name),
        remove: name => classes.delete(name),
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
        },
      },
      setAttribute: (name, value) => attributes.set(name, value),
      querySelector: selector => selector === '.moment-like-count' ? countEl : null,
    };

    assert.equal(panel.likeMoment({ momentId: 'm1', buttonEl }), true);
    assert.equal(renderCount, 0);
    assert.equal(countEl.textContent, '3');
    assert.equal(classes.has('is-liked'), true);
    assert.equal(classes.has('is-burst'), true);
    assert.equal(attributes.get('aria-pressed'), 'true');
    assert.equal(panel.likeMoment({ momentId: 'm1', buttonEl }), true);
    assert.deepEqual(cancelled, [1]);
    scheduled[0]?.();
    assert.equal(classes.has('is-burst'), true);
    scheduled[1]?.();
    assert.equal(classes.has('is-burst'), false);
  } finally {
    globalThis.setTimeout = previousTimer;
    globalThis.clearTimeout = previousClearTimer;
  }
});

let failed = 0;
for (const t of tests) {
  try {
    await t.fn();
    console.log(`ok - ${t.name}`);
  } catch (err) {
    failed += 1;
    console.error(`not ok - ${t.name}`);
    console.error(err);
  }
}

if (failed > 0) {
  process.exit(1);
}

if (previousLocalStorage === undefined) {
  delete globalThis.localStorage;
}
if (previousDocument === undefined) {
  delete globalThis.document;
}
