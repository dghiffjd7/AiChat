import assert from 'node:assert/strict';

import {
  DEFAULT_CONSERVATIVE_COEFFICIENT,
  TokenCalibrationStore,
  mergeTokenCalibrationStates,
  getTokenCalibrationRecord,
  normalizeTokenCalibrationState,
  updateTokenCalibrationState,
} from '../../src/scripts/memory/token-calibration-utils.js';
import { estimateTokens } from '../../src/scripts/memory/memory-prompt-utils.js';

let state = normalizeTokenCalibrationState(null);
let result = updateTokenCalibrationState(state, {
  provider: 'OpenAI',
  model: 'gpt-test',
  estimatedTokens: 1000,
  actualPromptTokens: 1500,
  now: 1,
});
assert.equal(result.updated, true);
assert.equal(result.record.coefficient, 1.5);
assert.equal(result.record.samples, 1);
state = result.state;

result = updateTokenCalibrationState(state, {
  provider: 'openai',
  model: 'GPT-TEST',
  estimatedTokens: 1000,
  actualPromptTokens: 1000,
  alpha: 0.25,
  now: 2,
});
assert.equal(result.record.coefficient, 1.375);
assert.equal(result.record.samples, 2);
assert.equal(getTokenCalibrationRecord(result.state, {
  provider: 'OPENAI',
  model: 'gpt-test',
}).coefficient, 1.375);

const clamped = updateTokenCalibrationState(null, {
  provider: 'p',
  model: 'm',
  estimatedTokens: 1,
  actualPromptTokens: 100,
});
assert.equal(clamped.record.coefficient, 4);
assert.equal(
  estimateTokens('abcdefgh', { mode: 'rough', coefficient: 1.5 }),
  3,
);

const ignored = updateTokenCalibrationState(state, {
  provider: 'openai',
  model: 'gpt-test',
  estimatedTokens: 0,
  actualPromptTokens: 100,
});
assert.equal(ignored.updated, false);
assert.equal(ignored.record.samples, 1);

const memoryStorage = {
  value: '',
  getItem() { return this.value; },
  setItem(_key, value) { this.value = value; },
};
const store = new TokenCalibrationStore({ storage: memoryStorage, storageKey: 'test' });
store.update({
  provider: 'anthropic',
  model: 'claude-test',
  estimatedTokens: 100,
  actualPromptTokens: 120,
});
assert.equal(store.get('anthropic', 'claude-test').coefficient, 1.2);
assert.match(memoryStorage.value, /claude-test/);

console.log('ok - token calibration stores a bounded per-provider/model sliding coefficient');

// 无样本时用保守默认系数（真机实测中文 rough 低估 ~28%），首个真实样本直接覆盖默认值
assert.equal(DEFAULT_CONSERVATIVE_COEFFICIENT, 1.25);
const noSample = getTokenCalibrationRecord(null, { provider: 'deepseek', model: 'deepseek-v4-pro' });
assert.equal(noSample.coefficient, DEFAULT_CONSERVATIVE_COEFFICIENT);
assert.equal(noSample.samples, 0);
const firstSample = updateTokenCalibrationState(null, {
  provider: 'deepseek',
  model: 'deepseek-v4-pro',
  estimatedTokens: 1000,
  actualPromptTokens: 900,
  now: 3,
});
assert.equal(firstSample.record.coefficient, 0.9);
assert.equal(firstSample.record.samples, 1);

console.log('ok - zero-sample calibration falls back to the conservative default coefficient');

// kv 权威通道：localStorage 配额满静默丢写时，系数必须仍能跨启动存活
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

const quotaStore = new TokenCalibrationStore({ storage: quotaFullStorage, storageKey: 'calib' });
await quotaStore.hydrate(kvChannel);
quotaStore.update({ provider: 'custom', model: 'opus', estimatedTokens: 1000, actualPromptTokens: 1280 });
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(quotaFullStorage.value, '', 'localStorage 写入应当失败且被吞掉');
assert.ok(kvFile.has('calib'), 'kv 侧必须落盘');

// 模拟重启：新实例只有空的 localStorage，靠 kv hydrate 找回系数
const restarted = new TokenCalibrationStore({ storage: quotaFullStorage, storageKey: 'calib' });
assert.equal(restarted.get('custom', 'opus').samples, 0);
await restarted.hydrate(kvChannel);
assert.equal(restarted.get('custom', 'opus').samples, 1);
assert.equal(restarted.get('custom', 'opus').coefficient, 1.28);

// 逐记录按 updatedAt 取新：两侧各自学到的不同模型都要保留，不能整块覆盖
const merged = mergeTokenCalibrationStates(
  { version: 1, records: {
    'a::m1': { provider: 'a', model: 'm1', coefficient: 1.1, samples: 2, updatedAt: 100 },
    'b::m2': { provider: 'b', model: 'm2', coefficient: 1.2, samples: 3, updatedAt: 500 },
  } },
  { version: 1, records: {
    'a::m1': { provider: 'a', model: 'm1', coefficient: 1.9, samples: 9, updatedAt: 900 },
    'b::m2': { provider: 'b', model: 'm2', coefficient: 1.7, samples: 1, updatedAt: 200 },
    'c::m3': { provider: 'c', model: 'm3', coefficient: 1.3, samples: 4, updatedAt: 50 },
  } },
);
assert.equal(merged.records['a::m1'].coefficient, 1.9, '较新的一侧胜出');
assert.equal(merged.records['b::m2'].coefficient, 1.2, '较旧的一侧不得覆盖');
assert.equal(merged.records['c::m3'].samples, 4, '只存在于一侧的记录必须保留');

// hydrate 后内存为权威：localStorage 即便被别处写脏也不再回读
quotaFullStorage.value = JSON.stringify({ version: 1, records: {} });
assert.equal(restarted.get('custom', 'opus').samples, 1);

console.log('ok - token calibration survives a full localStorage via the kv channel');
