import assert from 'node:assert/strict';

const memoryStorage = new Map();
globalThis.localStorage = {
  getItem: key => memoryStorage.get(String(key)) ?? null,
  setItem: (key, value) => {
    memoryStorage.set(String(key), String(value));
  },
  removeItem: key => {
    memoryStorage.delete(String(key));
  },
};
globalThis.document = { body: { dataset: {} } };
globalThis.window = globalThis;
globalThis.setTimeout = () => 0;

const disk = { index: null, parts: new Map() };
const partKey = args => `${args.sessionDir}/${args.threadDir}/${args.partId}`;
globalThis.__TAURI__ = {
  core: {
    invoke: async (cmd, args = {}) => {
      switch (cmd) {
        case 'load_kv':
          return null;
        case 'save_kv':
          return true;
        case 'chat_store_v2_read_index':
          return disk.index;
        case 'chat_store_v2_write_index':
          disk.index = JSON.parse(JSON.stringify(args.data ?? null));
          return true;
        case 'chat_store_v2_write_part':
          disk.parts.set(partKey(args), JSON.parse(JSON.stringify(args.data ?? [])));
          return true;
        case 'chat_store_v2_read_part':
          return disk.parts.get(partKey(args)) || [];
        default:
          return null;
      }
    },
  },
};

const { ChatStore } = await import('../../src/scripts/storage/chat-store.js');

const drainQueue = store => store._v2._queue;

// —— 场景 A：重置剧情（startNewChat/归档路径）——
// v2 的 cloneCurrentToArchive 排在异步队列里执行；在队列被前序任务阻塞的窗口内，
// hasOlderMessages / loadOlderMessages / ensureRecentMessagesLoaded 必须把刚重置的
// current 线程当作权威空态回答，不得从旧索引把旧消息复活回内存。
{
  const store = new ChatStore({ scopeId: 'reset-window-a' });
  await store.fullyReady;
  assert.equal(store._useV2, true, '测试环境必须启用 v2 存储');

  const sid = 'rp:reset-window-card';
  for (let i = 0; i < 5; i += 1) {
    store.appendMessage({ id: `old-${i}`, role: i % 2 ? 'assistant' : 'user', content: `旧消息${i}` }, sid);
  }
  await drainQueue(store);
  assert.ok(store._v2.getThreadParts(sid, '').length > 0, '旧消息应已写入 current 线程分片');

  await store.ensureRecentMessagesLoaded(sid);
  assert.equal(store.getMessages(sid).length, 5);

  let releaseGate;
  store._v2.enqueue(() => new Promise(resolve => { releaseGate = resolve; }));

  // 模拟重置前一刻仍在飞的写任务：它先于 clone 执行，消息应随归档走
  store.appendMessage({ id: 'old-5', role: 'user', content: '压队消息' }, sid);

  const archiveId = store.startNewChat(sid, '窗口存档');
  assert.ok(archiveId, 'startNewChat 应产生归档 id');
  assert.equal(store.getMessages(sid).length, 0, '内存消息应被同步清空');

  assert.equal(
    store.hasOlderMessages(sid),
    false,
    '重置窗口内 hasOlderMessages 必须返回权威 false，不得读到未换空的旧索引',
  );
  const older = await store.loadOlderMessages(sid, '', { partCount: 1 });
  assert.deepEqual(older, [], '重置窗口内 loadOlderMessages 不得返回旧消息');
  assert.equal(store.getMessages(sid).length, 0, '旧消息不得被污染回内存数组');
  const ensured = await store.ensureRecentMessagesLoaded(sid);
  assert.equal(ensured.length, 0, '重置窗口内 recent load 不得复活旧消息');

  releaseGate();
  await drainQueue(store);

  assert.equal(store._v2.getThreadTotal(sid, archiveId), 6, '含压队消息在内的旧消息应全部归档（FIFO 保留）');
  assert.equal(store._v2.getThreadParts(sid, '').length, 0, '队列排干后 current 线程应为空');
  assert.equal(store.hasOlderMessages(sid), false, '队列排干后 hasOlderMessages 仍应为 false');
  assert.equal(store.getMessages(sid).length, 0);

  console.log('ok - plot reset keeps current thread authoritatively empty while archive swap is queued');
}

// —— 场景 B：clear()（resetThread 路径）同一窗口 ——
{
  const store = new ChatStore({ scopeId: 'reset-window-b' });
  await store.fullyReady;
  assert.equal(store._useV2, true);

  const sid = 'private:reset-window-clear';
  for (let i = 0; i < 3; i += 1) {
    store.appendMessage({ id: `c-${i}`, role: 'user', content: `内容${i}` }, sid);
  }
  await drainQueue(store);
  await store.ensureRecentMessagesLoaded(sid);
  assert.equal(store.getMessages(sid).length, 3);

  let releaseGate;
  store._v2.enqueue(() => new Promise(resolve => { releaseGate = resolve; }));

  store.clear(sid);
  assert.equal(store.getMessages(sid).length, 0);
  assert.equal(store.hasOlderMessages(sid), false, 'clear 窗口内 hasOlderMessages 必须返回 false');
  assert.deepEqual(await store.loadOlderMessages(sid, '', { partCount: 1 }), [], 'clear 窗口内不得复活旧消息');
  assert.equal(store.getMessages(sid).length, 0);

  releaseGate();
  await drainQueue(store);
  assert.equal(store._v2.getThreadParts(sid, '').length, 0, '队列排干后线程分片应已清空');
  assert.equal(store.hasOlderMessages(sid), false);

  console.log('ok - clear keeps thread authoritatively empty while resetThread is queued');
}

console.log('chat-store-thread-reset-window-tests passed');
