import assert from 'node:assert/strict';

import {
  isBridgeAbortError,
  resolveBridgeCancellationReason,
  shouldTreatBridgeStreamErrorAsCancellation,
} from '../../src/scripts/ui/bridge-cancel-utils.js';

const makeAbortError = () => {
  const error = new Error('Aborted');
  error.name = 'AbortError';
  return error;
};

{
  const controller = new AbortController();
  controller.abort();
  assert.equal(isBridgeAbortError(makeAbortError()), true);
  assert.equal(shouldTreatBridgeStreamErrorAsCancellation(makeAbortError(), {
    signal: controller.signal,
    abortReason: 'swipe',
  }), true);
  assert.equal(resolveBridgeCancellationReason({
    signal: controller.signal,
    abortReason: 'swipe',
  }), 'swipe');
  console.log('ok - bridge stream abort uses active request signal for user cancellation');
}

{
  const controller = new AbortController();
  assert.equal(shouldTreatBridgeStreamErrorAsCancellation(makeAbortError(), {
    signal: controller.signal,
    abortReason: 'stale-user-cancel',
  }), false);
  console.log('ok - stale bridge abort reason does not override a non-aborted request signal');
}

{
  const controller = new AbortController();
  controller.abort('menu-stop');
  assert.equal(resolveBridgeCancellationReason({
    signal: controller.signal,
    abortReason: '',
  }), 'menu-stop');
  console.log('ok - bridge cancellation reason can fall back to signal reason');
}

{
  const controller = new AbortController();
  controller.abort();
  assert.equal(shouldTreatBridgeStreamErrorAsCancellation(new Error('network failed'), {
    signal: controller.signal,
    abortReason: 'user',
  }), false);
  console.log('ok - non-abort errors are not treated as cancellations');
}
