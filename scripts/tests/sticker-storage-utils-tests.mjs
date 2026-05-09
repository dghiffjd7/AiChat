import assert from 'node:assert/strict';

import {
  STICKER_AI_STATE_STORAGE_KEY,
  STICKER_RECENT_STORAGE_KEY,
  STICKER_USAGE_STORAGE_KEY,
  readStickerAiState,
  readStickerRecents,
  readStickerUsage,
  resolveMostUsedStickerKeys,
  updateStickerRecents,
  writeStickerAiState,
  writeStickerRecents,
  writeStickerUsage,
} from '../../src/scripts/ui/sticker-storage-utils.js';

const createStorage = () => {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
  };
};

{
  assert.equal(STICKER_USAGE_STORAGE_KEY, 'sticker_usage_v1');
  assert.equal(STICKER_RECENT_STORAGE_KEY, 'sticker_recents');
  assert.equal(STICKER_AI_STATE_STORAGE_KEY, 'sticker_ai_state_v1');
  console.log('ok - sticker storage helpers preserve legacy storage keys');
}

{
  const storage = createStorage();
  assert.equal(writeStickerUsage({ a: 2, b: 1 }, { storage }), true);
  assert.deepEqual(readStickerUsage({ storage }), { a: 2, b: 1 });
  storage.values.set(STICKER_USAGE_STORAGE_KEY, 'bad-json');
  assert.deepEqual(readStickerUsage({ storage }), {});
  storage.values.set(STICKER_USAGE_STORAGE_KEY, '["x"]');
  assert.deepEqual(readStickerUsage({ storage }), ['x']);
  console.log('ok - sticker usage storage preserves object fallback and legacy array tolerance');
}

{
  const storage = createStorage();
  assert.equal(writeStickerRecents(['a', 'b', 'c'], { storage, max: 2 }), true);
  assert.deepEqual(readStickerRecents({ storage }), ['a', 'b']);
  assert.equal(updateStickerRecents(' c ', { storage, max: 3 }), true);
  assert.deepEqual(readStickerRecents({ storage }), ['c', 'a', 'b']);
  assert.equal(updateStickerRecents('', { storage }), false);
  storage.values.set(STICKER_RECENT_STORAGE_KEY, '{"bad":true}');
  assert.deepEqual(readStickerRecents({ storage }), []);
  console.log('ok - sticker recent storage preserves ordering dedupe limit and invalid fallback');
}

{
  const storage = createStorage();
  writeStickerRecents(['fallback-1', 'fallback-2'], { storage, max: 24 });
  assert.deepEqual(resolveMostUsedStickerKeys({
    usage: { low: 1, high: 3, zero: 0, bad: 'x' },
    storage,
    max: 2,
  }), ['high', 'low']);
  assert.deepEqual(resolveMostUsedStickerKeys({
    usage: {},
    storage,
    max: 1,
  }), ['fallback-1']);
  console.log('ok - sticker most-used helper prefers usage counts and falls back to recents');
}

{
  const storage = createStorage();
  assert.equal(writeStickerAiState({ packId: 'p1', slices: [1] }, { storage }), true);
  assert.deepEqual(readStickerAiState({ storage }), { packId: 'p1', slices: [1] });
  assert.equal(writeStickerAiState(null, { storage }), true);
  assert.deepEqual(readStickerAiState({ storage }), {});
  storage.values.set(STICKER_AI_STATE_STORAGE_KEY, 'bad-json');
  assert.equal(readStickerAiState({ storage }), null);
  console.log('ok - sticker ai state storage preserves object null and invalid fallback contracts');
}

{
  const storage = {
    getItem() { throw new Error('read failed'); },
    setItem() { throw new Error('write failed'); },
  };
  assert.deepEqual(readStickerUsage({ storage }), {});
  assert.deepEqual(readStickerRecents({ storage }), []);
  assert.equal(readStickerAiState({ storage }), null);
  assert.equal(writeStickerUsage({ a: 1 }, { storage }), false);
  assert.equal(writeStickerRecents(['a'], { storage }), false);
  assert.equal(updateStickerRecents('a', { storage }), false);
  assert.equal(writeStickerAiState({ a: 1 }, { storage }), false);
  console.log('ok - sticker storage helpers tolerate storage failures');
}
