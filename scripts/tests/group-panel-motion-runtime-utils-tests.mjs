import assert from 'node:assert/strict';

import { createGroupPanelMotionRuntime } from '../../src/scripts/ui/group-panel-motion-runtime-utils.js';

const createClassList = () => {
  const values = new Set();
  return {
    add: (...tokens) => tokens.forEach(token => values.add(token)),
    remove: (...tokens) => tokens.forEach(token => values.delete(token)),
    contains: token => values.has(token),
  };
};

{
  const frames = [];
  const timers = [];
  const overlay = { style: { display: 'none' }, classList: createClassList(), offsetWidth: 1 };
  const panel = { style: { display: 'none' }, classList: createClassList(), offsetWidth: 1 };
  const runtime = createGroupPanelMotionRuntime({
    overlayEl: overlay,
    panelEl: panel,
    requestFrame: callback => frames.push(callback),
    schedule: callback => {
      timers.push(callback);
      return timers.length;
    },
    cancelSchedule: () => {},
  });

  runtime.show();
  assert.equal(overlay.style.display, 'block');
  assert.equal(panel.style.display, 'flex');
  frames.shift()();
  assert.equal(overlay.classList.contains('is-open'), true);
  assert.equal(panel.classList.contains('is-open'), true);

  runtime.hide();
  assert.equal(overlay.classList.contains('is-closing'), true);
  assert.equal(panel.classList.contains('is-closing'), true);
  assert.equal(panel.style.display, 'flex');
  timers.shift()();
  assert.equal(overlay.style.display, 'none');
  assert.equal(panel.style.display, 'none');
  assert.equal(panel.classList.contains('is-closing'), false);
  console.log('ok - group redesign panels keep their DOM visible until the exit transition completes');
}
