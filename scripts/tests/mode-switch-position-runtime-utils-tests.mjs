import assert from 'node:assert/strict';

import {
  MODE_SWITCH_POSITION_STORAGE_KEY,
  createModeSwitchPositionRuntime,
  normalizeStoredModeSwitchPosition,
  readModeSwitchPosition,
  writeModeSwitchPosition,
} from '../../src/scripts/ui/mode-switch-position-runtime-utils.js';

const createClassList = (initial = []) => {
  const set = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
  };
};

const createModeSwitchEl = () => ({
  classList: createClassList(['is-hidden']),
  style: { left: '', top: '', pointerEvents: '' },
});

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
  assert.equal(MODE_SWITCH_POSITION_STORAGE_KEY, 'phone_mode_switch_pos_v1');
  assert.deepEqual(normalizeStoredModeSwitchPosition({ xRatio: '0.25', yRatio: 0.75 }), {
    xRatio: 0.25,
    yRatio: 0.75,
  });
  assert.equal(normalizeStoredModeSwitchPosition({ xRatio: 'bad', yRatio: 0.75 }), null);
  assert.equal(normalizeStoredModeSwitchPosition(null), null);
  console.log('ok - mode switch position storage helpers preserve legacy key and validation contract');
}

{
  const storage = createStorage();
  assert.equal(writeModeSwitchPosition({ xRatio: 0.4, yRatio: 0.6 }, { storage }), true);
  assert.equal(storage.values.get(MODE_SWITCH_POSITION_STORAGE_KEY), '{"xRatio":0.4,"yRatio":0.6}');
  assert.deepEqual(readModeSwitchPosition({ storage }), { xRatio: 0.4, yRatio: 0.6 });
  storage.values.set(MODE_SWITCH_POSITION_STORAGE_KEY, '{"xRatio":"0.1","yRatio":"0.9"}');
  assert.deepEqual(readModeSwitchPosition({ storage }), { xRatio: 0.1, yRatio: 0.9 });
  storage.values.set(MODE_SWITCH_POSITION_STORAGE_KEY, 'not-json');
  assert.equal(readModeSwitchPosition({ storage }), null);
  console.log('ok - mode switch position read write helpers preserve JSON storage fallback behavior');
}

{
  const storage = {
    getItem() { throw new Error('read failed'); },
    setItem() { throw new Error('write failed'); },
  };
  assert.equal(readModeSwitchPosition({ storage }), null);
  assert.equal(writeModeSwitchPosition({ xRatio: 0.4, yRatio: 0.6 }, { storage }), false);
  assert.equal(writeModeSwitchPosition(null, { storage: createStorage() }), false);
  console.log('ok - mode switch position storage helpers tolerate storage failures');
}

{
  const modeSwitchEl = createModeSwitchEl();
  let pinned = true;
  let pos = { xRatio: 0.5, yRatio: 0.5 };
  const metrics = [];
  const runtime = createModeSwitchPositionRuntime({
    modeSwitchEl,
    readCssVarPx: (name, fallback) => (name === '--mode-switch-size' ? 30 : name === '--mode-switch-slot' ? 12 : fallback),
    setMetrics: value => metrics.push(value),
    getSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    getModeSwitchPos: () => pos,
    isModeSwitchPinned: () => pinned,
    setModeSwitchPinned: value => {
      pinned = value;
    },
    isChatRoomActive: () => false,
    getUiMode: () => 'chat',
    getChatInputRect: () => null,
    getBottomNavRect: () => ({ top: 620, left: 0, width: 360, height: 20 }),
    getContactsButtonRect: () => ({ left: 100, top: 620, width: 40, height: 20 }),
    getViewportSize: () => ({ w: 360, h: 640 }),
  });
  runtime.syncPosition();
  assert.equal(modeSwitchEl.style.left, '180px');
  assert.equal(modeSwitchEl.style.top, '320px');
  assert.equal(modeSwitchEl.style.pointerEvents, 'auto');
  assert.equal(modeSwitchEl.classList.contains('is-hidden'), false);
  assert.deepEqual(metrics[0], { size: 30, slot: 12 });
  assert.deepEqual(runtime.getMetrics(), { size: 30, slot: 12 });
  assert.deepEqual(runtime.normalizeModeSwitchPos(180, 320), { xRatio: 0.5, yRatio: 0.5 });
  console.log('ok - createModeSwitchPositionRuntime restores pinned position and exposes normalized coordinates');
}

{
  const modeSwitchEl = createModeSwitchEl();
  let pinned = true;
  const runtime = createModeSwitchPositionRuntime({
    modeSwitchEl,
    getSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    getModeSwitchPos: () => null,
    isModeSwitchPinned: () => pinned,
    setModeSwitchPinned: value => {
      pinned = value;
    },
    isChatRoomActive: () => false,
    getUiMode: () => 'chat',
    getBottomNavRect: () => ({ top: 620, left: 0, width: 360, height: 20 }),
    getContactsButtonRect: () => ({ left: 100, top: 620, width: 40, height: 20 }),
    getViewportSize: () => ({ w: 360, h: 640 }),
  });
  runtime.syncPosition();
  assert.equal(modeSwitchEl.style.left, '120px');
  assert.equal(modeSwitchEl.style.top, '597px');
  assert.equal(modeSwitchEl.classList.contains('is-hidden'), false);
  assert.equal(pinned, true);
  console.log('ok - createModeSwitchPositionRuntime falls back to dock anchor when no pinned position is available');
}

{
  const modeSwitchEl = createModeSwitchEl();
  let scheduled = 0;
  const runtime = createModeSwitchPositionRuntime({
    modeSwitchEl,
    getSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    getModeSwitchPos: () => null,
    isModeSwitchPinned: () => false,
    setModeSwitchPinned: () => {},
    isChatRoomActive: () => true,
    getUiMode: () => 'rp',
    getChatInputRect: () => ({ left: 40, top: 500, width: 200, height: 48 }),
    getBottomNavRect: () => null,
    getContactsButtonRect: () => null,
    getViewportSize: () => ({ w: 360, h: 640 }),
    requestAnimationFrameFn: (fn) => {
      scheduled += 1;
      fn();
    },
  });
  runtime.scheduleSync();
  assert.equal(scheduled, 1);
  assert.equal(modeSwitchEl.style.left, '140px');
  assert.equal(modeSwitchEl.style.top, '479px');
  console.log('ok - createModeSwitchPositionRuntime schedules sync through animation frame and uses input anchor in rp/chat-room contexts');
}

{
  const modeSwitchEl = createModeSwitchEl();
  let pinned = true;
  const runtime = createModeSwitchPositionRuntime({
    modeSwitchEl,
    getSafeInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    getModeSwitchPos: () => ({ xRatio: 0.5, yRatio: 0.5 }),
    isModeSwitchPinned: () => pinned,
    setModeSwitchPinned: value => {
      pinned = value;
    },
    isChatRoomActive: () => false,
    getUiMode: () => 'chat',
    getBottomNavRect: () => null,
    getContactsButtonRect: () => null,
    getViewportSize: () => ({ w: 0, h: 0 }),
  });
  runtime.syncPosition();
  assert.equal(pinned, false);
  assert.equal(modeSwitchEl.classList.contains('is-hidden'), true);
  assert.equal(modeSwitchEl.style.pointerEvents, 'none');
  console.log('ok - createModeSwitchPositionRuntime clears invalid pinned state and hides the switch when no anchor can be resolved');
}
