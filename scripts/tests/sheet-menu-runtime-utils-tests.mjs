import assert from 'node:assert/strict';

import { createSheetMenuRuntime } from '../../src/scripts/ui/sheet-menu-runtime-utils.js';

const createClassList = (initial = []) => {
  const set = new Set(initial);
  return {
    add: (...tokens) => tokens.forEach(token => set.add(token)),
    remove: (...tokens) => tokens.forEach(token => set.delete(token)),
    contains: token => set.has(token),
    toggle: (token, force) => {
      if (force === true) {
        set.add(token);
        return true;
      }
      if (force === false) {
        set.delete(token);
        return false;
      }
      if (set.has(token)) {
        set.delete(token);
        return false;
      }
      set.add(token);
      return true;
    },
  };
};

const createMenu = ({ hidden = true, width = 200, height = 100 } = {}) => ({
  classList: createClassList(hidden ? ['hidden'] : []),
  style: { visibility: '', top: '', left: '', right: '' },
  offsetWidth: width,
  offsetHeight: height,
});

{
  const runtime = createSheetMenuRuntime({
    getViewportWidth: () => 360,
    getViewportHeight: () => 640,
  });
  const menu = createMenu();
  const anchor = {
    getBoundingClientRect() {
      return { left: 320, right: 350, top: 610, bottom: 630 };
    },
  };
  assert.equal(runtime.positionSheet(menu, anchor, 0, 4, true), true);
  assert.equal(menu.style.top, '506px');
  assert.equal(menu.style.left, '148px');
  assert.equal(menu.classList.contains('hidden'), true);
  console.log('ok - createSheetMenuRuntime clamps positioned sheet within viewport and preserves hidden state after measurement');
}

{
  const hideCalls = [];
  const runtime = createSheetMenuRuntime({
    hideMenus: () => hideCalls.push('hide'),
    getViewportWidth: () => 360,
    getViewportHeight: () => 640,
  });
  const menu = createMenu();
  const anchorA = {
    getBoundingClientRect() {
      return { left: 10, right: 40, top: 20, bottom: 40 };
    },
  };
  const anchorB = {
    getBoundingClientRect() {
      return { left: 60, right: 90, top: 20, bottom: 40 };
    },
  };
  assert.equal(runtime.toggleSheetAt(menu, anchorA, { kind: 'persona' }), true);
  assert.equal(menu.classList.contains('hidden'), false);
  assert.equal(runtime.getLastAnchor('persona'), anchorA);
  assert.equal(runtime.toggleSheetAt(menu, anchorA, { kind: 'persona' }), true);
  assert.equal(menu.classList.contains('hidden'), true);
  assert.equal(runtime.toggleSheetAt(menu, anchorB, { kind: 'persona' }), true);
  assert.equal(menu.classList.contains('hidden'), false);
  assert.equal(runtime.getLastAnchor('persona'), anchorB);
  assert.deepEqual(hideCalls, ['hide', 'hide', 'hide']);
  console.log('ok - createSheetMenuRuntime toggles same-anchor sheet closed and reopens for a new anchor');
}
