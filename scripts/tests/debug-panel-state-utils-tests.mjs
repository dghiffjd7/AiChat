import assert from 'node:assert/strict';

import {
  applyDebugPanelEnabledState,
  clearDebugPanelAutoHideTimer,
  createDebugLogListener,
  hideDebugPanel,
  runDebugPanelStartupAutoShow,
  showDebugPanel,
  toggleDebugPanelVisibility,
} from '../../src/scripts/ui/debug-panel-state-utils.js';

{
  const calls = [];
  const listener = createDebugLogListener({
    log: (message, type) => calls.push([message, type]),
  });
  assert.equal(listener({ detail: { message: 'hello', source: 'boot', type: 'warn' } }), true);
  assert.equal(listener({ detail: { message: '   ' } }), false);
  assert.deepEqual(calls, [['[boot] hello', 'warn']]);
  console.log('ok - createDebugLogListener normalizes source prefix and skips empty messages');
}

{
  const cleared = [];
  const panel = { style: { display: 'none' } };
  const result = showDebugPanel({
    panel,
    scrollToBottom: () => cleared.push('scroll'),
    autoHideTimer: 42,
    clearTimer: (value) => cleared.push(['clear', value]),
  });
  assert.equal(panel.style.display, 'flex');
  assert.equal(result.isVisible, true);
  assert.equal(result.autoHideTimer, null);
  assert.deepEqual(cleared, ['scroll', ['clear', 42]]);
  const hidden = hideDebugPanel({ panel });
  assert.equal(panel.style.display, 'none');
  assert.equal(hidden.isVisible, false);
  console.log('ok - debug panel visibility helpers update display and clear auto-hide timer');
}

{
  const calls = [];
  const toggleBtn = { style: { display: '' } };
  const result = applyDebugPanelEnabledState({
    enabled: false,
    toggleBtn,
    autoHideTimer: 99,
    clearTimer: (value) => calls.push(['clear', value]),
    onDisable: () => calls.push(['hide']),
  });
  assert.equal(result.enabled, false);
  assert.equal(result.autoHideTimer, null);
  assert.equal(toggleBtn.style.display, 'none');
  assert.deepEqual(calls, [['hide'], ['clear', 99]]);
  console.log('ok - applyDebugPanelEnabledState hides toggle and clears auto-hide timer when disabled');
}

{
  const calls = [];
  assert.equal(toggleDebugPanelVisibility({
    isVisible: true,
    onShow: () => calls.push('show'),
    onHide: () => calls.push('hide'),
  }), false);
  assert.equal(toggleDebugPanelVisibility({
    isVisible: false,
    onShow: () => calls.push('show'),
    onHide: () => calls.push('hide'),
  }), true);
  assert.deepEqual(calls, ['hide', 'show']);
  console.log('ok - toggleDebugPanelVisibility dispatches show and hide callbacks based on current state');
}

{
  let timerCallback = null;
  const timer = runDebugPanelStartupAutoShow({
    enabled: true,
    show: () => {},
    hide: () => { timerCallback = 'hide'; },
    getLogCount: () => 1,
    setTimer: (callback, delay) => {
      assert.equal(delay, 8000);
      timerCallback = callback;
      return 123;
    },
  });
  assert.equal(timer, 123);
  timerCallback();
  assert.equal(timerCallback, 'hide');
  assert.equal(clearDebugPanelAutoHideTimer({ autoHideTimer: null }), null);
  console.log('ok - runDebugPanelStartupAutoShow schedules sparse-log auto-hide and clear helper tolerates empty timer');
}
