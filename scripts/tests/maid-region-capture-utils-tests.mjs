import assert from 'node:assert/strict';

import {
  captureMaidViewportRegion,
  normalizeMaidCaptureRect,
} from '../../src/scripts/ui/maid-region-capture-utils.js';

{
  assert.deepEqual(
    normalizeMaidCaptureRect(
      { left: -10, top: 20, width: 80, height: 60 },
      { width: 100, height: 90 },
    ),
    { left: 0, top: 20, width: 70, height: 60 },
  );
  assert.equal(
    normalizeMaidCaptureRect({ left: 120, top: 20, width: 30, height: 30 }, { width: 100, height: 90 }),
    null,
  );
  console.log('ok - maid capture rect clamps to the visible viewport');
}

{
  const classes = new Set(['maid-guide-step-target']);
  const target = {
    classList: {
      contains: value => classes.has(value),
      remove: value => classes.delete(value),
      add: value => classes.add(value),
    },
  };
  await captureMaidViewportRegion({
    rect: { left: 5, top: 5, width: 40, height: 30 },
    documentRef: {
      querySelectorAll: selector => selector === '.maid-guide-step-target' ? [target] : [],
    },
    windowRef: { innerWidth: 100, innerHeight: 80, devicePixelRatio: 1 },
    waitForPaint: async () => {},
    invokeCapture: async () => {
      assert.equal(classes.has('maid-guide-step-target'), false, 'guide target glow should be suspended');
      return { dataUrl: 'data:image/png;base64,AAAA', mime: 'image/png', bytes: 4 };
    },
  });
  assert.equal(classes.has('maid-guide-step-target'), true, 'guide target class should be restored');
  console.log('ok - maid capture suspends and restores guide target highlight');
}

{
  const hiddenStyle = new Map([['visibility', { value: 'collapse', priority: 'important' }]]);
  const style = {
    getPropertyValue: key => hiddenStyle.get(key)?.value || '',
    getPropertyPriority: key => hiddenStyle.get(key)?.priority || '',
    setProperty: (key, value, priority = '') => hiddenStyle.set(key, { value, priority }),
    removeProperty: key => hiddenStyle.delete(key),
  };
  await assert.rejects(
    captureMaidViewportRegion({
      rect: { left: 5, top: 5, width: 40, height: 30 },
      documentRef: { querySelectorAll: () => [{ style }] },
      windowRef: { innerWidth: 100, innerHeight: 80, devicePixelRatio: 1 },
      waitForPaint: async () => {},
      invokeCapture: async () => { throw new Error('native capture failed'); },
    }),
    /native capture failed/,
  );
  assert.deepEqual(hiddenStyle.get('visibility'), { value: 'collapse', priority: 'important' });
  console.log('ok - maid capture restores prior chrome visibility after native failure');
}

{
  const hiddenStyle = new Map();
  const style = {
    getPropertyValue: key => hiddenStyle.get(key)?.value || '',
    getPropertyPriority: key => hiddenStyle.get(key)?.priority || '',
    setProperty: (key, value, priority = '') => hiddenStyle.set(key, { value, priority }),
    removeProperty: key => hiddenStyle.delete(key),
  };
  const chrome = { style };
  const documentRef = { querySelectorAll: () => [chrome] };
  let invoked = 0;
  const result = await captureMaidViewportRegion({
    rect: { left: 10, top: 15, width: 90, height: 70 },
    documentRef,
    windowRef: { innerWidth: 320, innerHeight: 240, devicePixelRatio: 1.5 },
    waitForPaint: async () => {},
    invokeCapture: async payload => {
      invoked += 1;
      assert.equal(hiddenStyle.get('visibility')?.value, 'hidden');
      assert.deepEqual(payload, {
        left: 10,
        top: 15,
        width: 90,
        height: 70,
        viewportWidth: 320,
        viewportHeight: 240,
        pixelRatio: 1.5,
        maxDimension: 1600,
      });
      return {
        dataUrl: 'data:image/png;base64,AAAA',
        mime: 'image/png',
        width: 135,
        height: 105,
        bytes: 4,
      };
    },
  });
  assert.equal(invoked, 1);
  assert.equal(result.dataUrl, 'data:image/png;base64,AAAA');
  assert.equal(hiddenStyle.has('visibility'), false, 'capture chrome visibility should be restored');
  console.log('ok - maid capture hides overlay chrome and restores it after native capture');
}

{
  await assert.rejects(
    captureMaidViewportRegion({
      rect: { left: 500, top: 500, width: 20, height: 20 },
      windowRef: { innerWidth: 320, innerHeight: 240, devicePixelRatio: 1 },
      invokeCapture: async () => ({}),
    }),
    /不在当前可见视口/,
  );
  console.log('ok - maid capture rejects stale regions outside the viewport');
}

console.log('maid-region-capture-utils-tests passed');
