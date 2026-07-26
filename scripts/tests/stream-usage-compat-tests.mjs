import assert from 'node:assert/strict';

import {
  createStreamUsageCompat,
  isStreamOptionsRejectionError,
} from '../../src/scripts/api/stream-usage-compat.js';

const memoryStorage = {
  value: '',
  getItem() { return this.value || null; },
  setItem(_key, value) { this.value = value; },
};
const compat = createStreamUsageCompat({ storage: memoryStorage });

// 默认携带 include_usage；已有 stream_options 不覆盖
assert.deepEqual(
  compat.applyStreamUsageOptions({ model: 'm', stream: true }, 'https://api.deepseek.com/v1'),
  { model: 'm', stream: true, stream_options: { include_usage: true } },
);
assert.deepEqual(
  compat.applyStreamUsageOptions({ stream_options: { include_usage: false } }, 'https://api.deepseek.com/v1'),
  { stream_options: { include_usage: false } },
);

// 标记后不再携带（大小写/末尾斜杠归一），并持久化
compat.markUnsupported('https://Relay.example.com/v1/');
assert.equal(compat.isMarkedUnsupported('https://relay.example.com/v1'), true);
assert.equal(
  'stream_options' in compat.applyStreamUsageOptions({ model: 'm' }, 'https://relay.example.com/v1'),
  false,
);
assert.match(memoryStorage.value, /relay\.example\.com/);
const reloaded = createStreamUsageCompat({ storage: memoryStorage });
assert.equal(reloaded.isMarkedUnsupported('https://relay.example.com/v1'), true);

// 只认点名 stream_options/include_usage 的 4xx；普通 400、5xx、网络错误都不算
assert.equal(isStreamOptionsRejectionError({
  status: 400,
  response: '{"error":{"message":"Unknown parameter: stream_options"}}',
}), true);
assert.equal(isStreamOptionsRejectionError({
  status: 422,
  message: 'include_usage is not supported',
}), true);
assert.equal(isStreamOptionsRejectionError({ status: 400, message: 'context length exceeded' }), false);
assert.equal(isStreamOptionsRejectionError({ status: 500, response: 'stream_options' }), false);
assert.equal(isStreamOptionsRejectionError(new Error('network failed')), false);

console.log('ok - stream usage compat adds include_usage with per-endpoint rejection memory');

// kv 权威通道：localStorage 配额满时降级记忆不能丢，否则每次启动都要先踩一个 4xx
const quotaFullStorage = {
  value: '',
  getItem() { return this.value || null; },
  setItem() { throw new Error('QuotaExceededError'); },
};
const kvFile = new Map();
const kvChannel = {
  loadKv: async name => (kvFile.has(name) ? JSON.parse(JSON.stringify(kvFile.get(name))) : null),
  saveKv: async (name, data) => { kvFile.set(name, JSON.parse(JSON.stringify(data))); },
};

const quotaCompat = createStreamUsageCompat({ storage: quotaFullStorage });
await quotaCompat.hydrate(kvChannel);
quotaCompat.markUnsupported('https://strict-relay.example/v1');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(quotaFullStorage.value, '', 'localStorage 写入应当失败且被吞掉');
assert.ok(kvFile.size > 0, 'kv 侧必须落盘');

// 模拟重启：localStorage 空，靠 kv hydrate 找回，不再重复携带 stream_options
const restarted = createStreamUsageCompat({ storage: quotaFullStorage });
assert.equal(restarted.isMarkedUnsupported('https://strict-relay.example/v1'), false);
await restarted.hydrate(kvChannel);
assert.equal(restarted.isMarkedUnsupported('https://strict-relay.example/v1'), true);
assert.equal(
  'stream_options' in restarted.applyStreamUsageOptions({ model: 'm' }, 'https://strict-relay.example/v1'),
  false,
);

// hydrate 取并集：本地已记的端点不会被 kv 覆盖掉
const localOnly = {
  value: JSON.stringify(['https://local-only.example/v1']),
  getItem() { return this.value || null; },
  setItem(_key, value) { this.value = value; },
};
const unionCompat = createStreamUsageCompat({ storage: localOnly });
await unionCompat.hydrate(kvChannel);
assert.equal(unionCompat.isMarkedUnsupported('https://local-only.example/v1'), true, '本地侧保留');
assert.equal(unionCompat.isMarkedUnsupported('https://strict-relay.example/v1'), true, 'kv 侧并入');

// 无 kv 通道（如 Web 环境）时 hydrate 不得抛错，行为退回纯 localStorage
const noKv = createStreamUsageCompat({ storage: localOnly });
assert.deepEqual(await noKv.hydrate(), ['https://local-only.example/v1']);

console.log('ok - stream usage rejection memory survives a full localStorage via the kv channel');

// 重试守卫：仅在尚未产出增量时允许去掉 stream_options 重跑；已产出增量必须按原错误抛出
{
  const { OpenAIProvider } = await import('../../src/scripts/api/providers/openai.js');
  const rejection = () => ({
    status: 400,
    response: '{"error":{"message":"Unknown parameter: stream_options"}}',
  });

  // 未产出任何增量：允许重试一次并标记端点
  const clean = new OpenAIProvider({ apiKey: 'k', baseUrl: 'https://guard-a.example.com/v1' });
  let cleanCalls = 0;
  clean.streamChatUnguarded = async function* () {
    cleanCalls += 1;
    if (cleanCalls === 1) throw rejection();
    yield 'ok';
  };
  const cleanChunks = [];
  for await (const chunk of clean.streamChat([], {})) cleanChunks.push(chunk);
  assert.deepEqual(cleanChunks, ['ok']);
  assert.equal(cleanCalls, 2);

  // 已产出增量后再出错：不得整段重跑（会重复输出），按原错误抛出
  const dirty = new OpenAIProvider({ apiKey: 'k', baseUrl: 'https://guard-b.example.com/v1' });
  let dirtyCalls = 0;
  dirty.streamChatUnguarded = async function* () {
    dirtyCalls += 1;
    yield 'part1';
    throw rejection();
  };
  const dirtyChunks = [];
  let dirtyError = null;
  try {
    for await (const chunk of dirty.streamChat([], {})) dirtyChunks.push(chunk);
  } catch (err) {
    dirtyError = err;
  }
  assert.deepEqual(dirtyChunks, ['part1']);
  assert.equal(dirtyCalls, 1);
  assert.equal(dirtyError?.status, 400);
  console.log('ok - stream_options retry only happens before the first yielded delta');
}
