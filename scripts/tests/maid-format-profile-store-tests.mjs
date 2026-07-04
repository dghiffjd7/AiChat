import assert from 'node:assert/strict';

import {
  createMaidFormatProfileStore,
  normalizeMaidFormatProfileState,
} from '../../src/scripts/storage/maid-format-profile-store.js';

const createFakeStorage = () => {
  const map = new Map();
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: key => map.delete(key),
  };
};

{
  const storage = createFakeStorage();
  const store = createMaidFormatProfileStore({ storage, now: () => 1000 });
  const saved = store.set('蒂法', {
    guide: '每条回复末尾必须有 <status>好感度:N</status> 状态块',
    sources: [{ type: 'worldbook', ref: '蒂法' }, { type: 'regex', ref: 'status 渲染' }],
  });
  assert.equal(saved.sessionId, '蒂法');
  assert.equal(saved.sources.length, 2);

  const reloaded = createMaidFormatProfileStore({ storage, now: () => 2000 });
  const profile = reloaded.get('蒂法');
  assert.match(profile.guide, /status/);
  assert.equal(profile.sources[0].type, 'worldbook');
  console.log('ok - 画像保存并跨实例持久化');
}

{
  const storage = createFakeStorage();
  const store = createMaidFormatProfileStore({ storage, now: () => 1000 });
  assert.equal(store.set('会话A', { guide: '' }), null, '空规范不保存');
  assert.equal(store.set('', { guide: '有内容' }), null, '空会话不保存');
  assert.equal(store.get('不存在'), null);
  assert.equal(store.remove('不存在'), false);
  store.set('会话A', { guide: '规范内容规范内容' });
  assert.equal(store.remove('会话A'), true);
  assert.equal(store.get('会话A'), null);
  console.log('ok - 非法输入拒绝与删除');
}

{
  const state = normalizeMaidFormatProfileState({
    profiles: {
      a: { guide: 'x'.repeat(9000), updatedAt: 5 },
      b: { guide: '正常规范内容', sources: [{ type: 'regex', ref: 'r1' }], updatedAt: 9 },
      c: { guide: '', updatedAt: 3 },
    },
  }, { now: () => 100 });
  assert.equal(state.profiles.a.guide.length, 6000, '超长规范截断');
  assert.equal(state.profiles.c, undefined, '空规范条目被清理');
  assert.equal(state.profiles.b.sources.length, 1);
  console.log('ok - 归一化截断与清理');
}

{
  // localStorage 配额满（setItem 抛异常）时 kv 通道仍保证持久化。
  const kvStore = new Map();
  const quotaFullStorage = {
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded'); },
    removeItem: () => {},
  };
  const { createMaidFormatProfileStore } = await import('../../src/scripts/storage/maid-format-profile-store.js');
  const store = createMaidFormatProfileStore({
    storage: quotaFullStorage,
    loadKv: async key => kvStore.get(key) || null,
    saveKv: async (key, data) => { kvStore.set(key, data); },
    now: () => 1000,
    logger: { warn() {}, debug() {} },
  });
  await store.hydrate();
  const saved = store.set('蒂法', { guide: 'status 块格式规范内容' });
  assert.ok(saved, 'localStorage 满时保存仍应成功（kv 通道）');
  await new Promise(r => setTimeout(r, 0));
  assert.ok(kvStore.has('maid_format_profile_store_v1'), 'kv 应已写入');

  const reloaded = createMaidFormatProfileStore({
    storage: quotaFullStorage,
    loadKv: async key => kvStore.get(key) || null,
    saveKv: async () => {},
    now: () => 2000,
    logger: { warn() {}, debug() {} },
  });
  await reloaded.hydrate();
  assert.match(reloaded.get('蒂法')?.guide || '', /status/, 'kv hydrate 应恢复画像');
  console.log('ok - localStorage 配额满时经 kv 通道持久化与恢复');
}

console.log('maid-format-profile-store-tests passed');
