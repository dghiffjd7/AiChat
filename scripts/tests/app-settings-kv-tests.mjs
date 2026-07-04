import assert from 'node:assert/strict';

// app-settings 是模块单例（内部 memorySettings 状态），用子场景顺序测试。
const storageMap = new Map();
globalThis.localStorage = {
  getItem: key => (storageMap.has(key) ? storageMap.get(key) : null),
  setItem: (key, value) => {
    if (globalThis.__quotaFull) throw new Error('quota exceeded');
    storageMap.set(key, String(value));
  },
  removeItem: key => storageMap.delete(key),
};

const { appSettings } = await import('../../src/scripts/storage/app-settings.js');

{
  // 配额满 + kv 通道：更新仍持久化到 kv，hydrate 恢复。
  globalThis.__quotaFull = true;
  const kvMap = new Map();
  await appSettings.hydrate({
    loadKv: async key => kvMap.get(key) || null,
    saveKv: async (key, data) => { kvMap.set(key, data); },
  });
  appSettings.update({ toastEnabled: false });
  await new Promise(r => setTimeout(r, 0));
  const kvSaved = kvMap.get('app_settings_v1');
  assert.equal(kvSaved?.toastEnabled, false, '配额满时设置应写入 kv');
  assert.ok(Number(kvSaved?.__updatedAt) > 0, 'kv 数据应带时间戳');
  assert.equal(appSettings.get().toastEnabled, false, '会话内内存态为准');
  assert.equal(Object.prototype.hasOwnProperty.call(appSettings.get(), '__updatedAt'), false, '对外不暴露时间戳');
  console.log('ok - 配额满时设置经 kv 持久化且会话内一致');
}

{
  // hydrate 裁决：kv 较新时以 kv 为准。
  const kvMap = new Map([
    ['app_settings_v1', { toastEnabled: true, typingDotsEnabled: false, __updatedAt: 9999 }],
  ]);
  storageMap.set('app_settings_v1', JSON.stringify({ toastEnabled: false, __updatedAt: 1000 }));
  await appSettings.hydrate({
    loadKv: async key => kvMap.get(key) || null,
    saveKv: async () => {},
  });
  assert.equal(appSettings.get().toastEnabled, true, 'kv 较新应胜出');
  assert.equal(appSettings.get().typingDotsEnabled, false);
  console.log('ok - hydrate 按 __updatedAt 裁决 kv 与 localStorage');
}

{
  // localStorage 较新时以 localStorage 为准（如 kv 是旧备份）。
  const kvMap = new Map([
    ['app_settings_v1', { toastEnabled: true, __updatedAt: 500 }],
  ]);
  storageMap.set('app_settings_v1', JSON.stringify({ toastEnabled: false, __updatedAt: 8888 }));
  await appSettings.hydrate({
    loadKv: async key => kvMap.get(key) || null,
    saveKv: async () => {},
  });
  assert.equal(appSettings.get().toastEnabled, false, 'localStorage 较新应胜出');
  console.log('ok - localStorage 较新时不被旧 kv 覆盖');
}

console.log('app-settings-kv-tests passed');
