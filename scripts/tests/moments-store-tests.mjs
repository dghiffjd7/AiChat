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

  clear() {
    this.map.clear();
  }
}

const withMomentsEnv = async (fn) => {
  const previousLocalStorage = globalThis.localStorage;
  const previousInvoke = globalThis.__TAURI_INVOKE__;
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.localStorage = new MemoryLocalStorageMock();
  globalThis.__TAURI_INVOKE__ = async (cmd) => {
    if (cmd === 'load_kv') return null;
    if (cmd === 'save_kv') return true;
    return null;
  };
  globalThis.setTimeout = () => 0;

  try {
    const { MomentsStore } = await import('../../src/scripts/storage/moments-store.js');
    globalThis.setTimeout = originalSetTimeout;
    await fn(MomentsStore);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    if (previousLocalStorage === undefined) {
      delete globalThis.localStorage;
    } else {
      globalThis.localStorage = previousLocalStorage;
    }
    if (previousInvoke === undefined) {
      delete globalThis.__TAURI_INVOKE__;
    } else {
      globalThis.__TAURI_INVOKE__ = previousInvoke;
    }
  }
};

test('MomentsStore upsert normalizes duplicate comment ids and infers regex mode', async () => {
  await withMomentsEnv(async (MomentsStore) => {
    const store = new MomentsStore({ scopeId: 'moments:test' });
    await store.ready;

    const moment = store.upsert({
      id: 'moment-1',
      author: '发布者',
      content: '第一条动态',
      time: '10:00',
      mentions: [
        { id: 'contact:alice', name: 'Alice', type: 'contact' },
        { id: 'contact:alice', name: 'Alice Again', type: 'contact' },
        { id: 'group:room', name: 'Room', type: 'group' },
        { id: 'rp:persona_1', name: '角色房间' },
      ],
      comments: [
        { id: 'c1', author: '我', content: '第一条评论' },
        { id: 'c1', author: '路人甲', content: '回复第一条', replyTo: 'c1', replyToAuthor: '我' },
      ],
    });
    await store.flush();

    assert.equal(moment.comments.length, 2);
    assert.equal(moment.comments[0].id, 'c1');
    assert.equal(moment.comments[0].regexMode, 'input');
    assert.notEqual(moment.comments[1].id, 'c1');
    assert.equal(moment.comments[1].regexMode, 'output');
    assert.equal(moment.comments[1].replyTo, 'c1');
    assert.equal(moment.comments[1].replyToAuthor, '我');
    assert.deepEqual(moment.mentions, [
      { id: 'contact:alice', name: 'Alice', type: 'contact' },
      { id: 'group:room', name: 'Room', type: 'group' },
    ]);
  });
});

test('MomentsStore addComments keeps the newest 50 comments and preserves reply metadata', async () => {
  await withMomentsEnv(async (MomentsStore) => {
    const store = new MomentsStore({ scopeId: 'moments:test' });
    await store.ready;

    store.upsert({
      id: 'moment-2',
      author: '发布者',
      content: '第二条动态',
      time: '11:00',
    });

    store.addComments(
      'moment-2',
      Array.from({ length: 52 }, (_, index) => ({
        id: `c${index}`,
        author: index === 51 ? '我' : '路人甲',
        content: `评论 ${index}`,
        replyTo: index === 51 ? 'c50' : '',
        replyToAuthor: index === 51 ? '路人甲' : '',
        timestamp: index + 1,
      })),
    );
    await store.flush();

    const moment = store.get('moment-2');
    assert.equal(moment.comments.length, 50);
    assert.deepEqual(moment.comments.slice(0, 2).map((item) => item.id), ['c2', 'c3']);
    assert.equal(moment.comments.at(-1)?.id, 'c51');
    assert.equal(moment.comments.at(-1)?.regexMode, 'input');
    assert.equal(moment.comments.at(-1)?.replyTo, 'c50');
    assert.equal(moment.comments.at(-1)?.replyToAuthor, '路人甲');
  });
});

test('MomentsStore likeMoment toggles liked state and persists like count', async () => {
  await withMomentsEnv(async (MomentsStore) => {
    const store = new MomentsStore({ scopeId: 'moments:test' });
    await store.ready;

    store.upsert({
      id: 'moment-like',
      author: '发布者',
      content: '点赞测试',
      likes: 4,
    });

    const liked = store.likeMoment('moment-like');
    await store.flush();

    assert.equal(liked.likes, 5);
    assert.equal(liked.userLiked, true);
    assert.equal(store.get('moment-like').likes, 5);
    assert.equal(store.get('moment-like').userLiked, true);

    const second = store.likeMoment('moment-like');
    await store.flush();

    assert.equal(second.likes, 4);
    assert.equal(second.userLiked, false);
  });
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
