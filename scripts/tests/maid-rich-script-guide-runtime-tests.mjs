import assert from 'node:assert/strict';

import {
  createMaidRichScriptGuideRuntime,
  MAID_RICH_SCRIPT_GUIDE_FLOW_ID,
  MAID_RICH_SCRIPT_GUIDE_HINT_ID,
} from '../../src/scripts/ui/maid-rich-script-guide-runtime.js';
import { RICH_SCRIPT_EXECUTION_REQUIRED_EVENT } from '../../src/scripts/ui/chat/rich-render-routing.js';

const makeWindow = () => {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      const bucket = listeners.get(type) || new Set();
      bucket.add(handler);
      listeners.set(type, bucket);
    },
    removeEventListener(type, handler) {
      listeners.get(type)?.delete(handler);
    },
    emit(type, detail = {}) {
      listeners.get(type)?.forEach(handler => handler({ type, detail }));
    },
  };
};

{
  const windowRef = makeWindow();
  const dismissed = new Set();
  const started = [];
  const emitted = [];
  const onboardingRuntime = {
    isActive: () => false,
    startFlow: flowId => {
      started.push(flowId);
      return true;
    },
    emit: (event, payload) => emitted.push({ event, payload }),
  };
  const runtime = createMaidRichScriptGuideRuntime({
    windowRef,
    guideStore: {
      isHintDismissed: hintId => dismissed.has(hintId),
      dismissHint: hintId => {
        dismissed.add(hintId);
        return true;
      },
    },
    getOnboardingRuntime: () => onboardingRuntime,
    isExecutionEnabled: () => false,
  });
  runtime.bind();
  windowRef.emit(RICH_SCRIPT_EXECUTION_REQUIRED_EVENT, { reason: 'empty-mount-shell' });
  assert.deepEqual(started, [MAID_RICH_SCRIPT_GUIDE_FLOW_ID]);
  assert.equal(dismissed.has(MAID_RICH_SCRIPT_GUIDE_HINT_ID), true, 'showing the guide once should prevent future nags even if it is skipped');
  windowRef.emit(RICH_SCRIPT_EXECUTION_REQUIRED_EVENT, { reason: 'empty-mount-shell' });
  assert.equal(started.length, 1);

  windowRef.emit('app-settings-changed', { key: 'allowRichIframeScripts', value: true });
  assert.deepEqual(emitted, [{ event: 'rich-script-enabled', payload: { enabled: true } }]);
  runtime.destroy();
  console.log('ok - a high-confidence blocked greeting starts the rich-script guide exactly once and advances on confirmed enable');
}

{
  const windowRef = makeWindow();
  let active = true;
  const started = [];
  const dismissed = new Set();
  const onboardingRuntime = {
    isActive: () => active,
    startFlow: flowId => {
      started.push(flowId);
      return true;
    },
    emit: () => false,
  };
  const runtime = createMaidRichScriptGuideRuntime({
    windowRef,
    guideStore: {
      isHintDismissed: hintId => dismissed.has(hintId),
      dismissHint: hintId => {
        dismissed.add(hintId);
        return true;
      },
    },
    getOnboardingRuntime: () => onboardingRuntime,
    isExecutionEnabled: () => false,
  });
  runtime.bind();
  windowRef.emit(RICH_SCRIPT_EXECUTION_REQUIRED_EVENT, { sessionId: 'rp:test' });
  assert.equal(started.length, 0);
  assert.equal(dismissed.size, 0, 'a competing guide must queue rather than consume the one-time offer');
  active = false;
  assert.equal(runtime.retryPending(), true);
  assert.deepEqual(started, [MAID_RICH_SCRIPT_GUIDE_FLOW_ID]);
  assert.equal(dismissed.has(MAID_RICH_SCRIPT_GUIDE_HINT_ID), true);
  runtime.destroy();
  console.log('ok - rich-script discovery waits for an active maid guide to finish');
}
