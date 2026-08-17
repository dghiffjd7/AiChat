import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  armChatStructuredCircuitRetry,
  buildChatStructuredCircuitOccurrenceKey,
  createChatStructuredCircuitToastTracker,
  showChatStructuredCircuitToast,
} from '../../src/scripts/ui/chat/chat-structured-route-status-utils.js';

{
  assert.equal(buildChatStructuredCircuitOccurrenceKey({}), '');
  assert.equal(buildChatStructuredCircuitOccurrenceKey({
    evidenceKey: 'cell-a',
    circuitEpoch: 1,
  }), '');
  assert.equal(buildChatStructuredCircuitOccurrenceKey({
    evidenceKey: 'cell-a',
    circuitEpoch: 1,
    circuitOpenedAt: 100,
  }), 'cell-a:1:100');
}

{
  const tracker = createChatStructuredCircuitToastTracker({ maxEntries: 2 });
  const first = { evidenceKey: 'cell-a', circuitEpoch: 1, circuitOpenedAt: 100 };
  assert.equal(tracker.shouldNotify(first), true);
  assert.equal(tracker.shouldNotify(first), false);
  assert.equal(tracker.shouldNotify({ ...first, circuitOpenedAt: 200 }), true);
  assert.equal(tracker.shouldNotify({}), false);
  assert.equal(tracker.shouldNotify({}), false);
  assert.equal(tracker.shouldNotify({ evidenceKey: 'cell-b', circuitEpoch: 1, circuitOpenedAt: 300 }), true);
  assert.equal(tracker.size, 2);
  console.log('ok - circuit toasts dedupe one occurrence without suppressing a post-reset reopen');
}

{
  const calls = [];
  const cell = {
    key: 'cell-retry',
    identity: { provider: 'openai', model: 'gpt-test' },
    mode: 'provider_fc',
    health: { circuitOpen: true },
  };
  assert.equal(await armChatStructuredCircuitRetry({
    detail: { evidenceKey: 'cell-retry', localRuleId: 'local-rule-1' },
    evidenceStore: {
      list: () => [cell],
      armHalfOpen: async (identity, mode) => {
        calls.push(['evidence', identity, mode]);
        return true;
      },
    },
    localCapabilityStore: {
      resetCircuit: async ruleId => {
        calls.push(['local', ruleId]);
        return true;
      },
    },
  }), true);
  assert.deepEqual(calls, [
    ['local', 'local-rule-1'],
    ['evidence', cell.identity, 'provider_fc'],
  ]);
  console.log('ok - toast retry rearms evidence and resets the matching local-rule circuit');
}

{
  const listeners = new Map();
  const button = {
    disabled: false,
    textContent: '',
    classList: { add() {} },
    addEventListener: (type, handler) => listeners.set(type, handler),
  };
  const root = { querySelector: selector => selector === '.chat-structured-route-toast-action' ? button : null };
  const calls = [];
  const shown = showChatStructuredCircuitToast({
    toastr: {
      info: (...args) => {
        calls.push(args);
        return [root];
      },
    },
    detail: { evidenceKey: 'cell-retry' },
    onRetry: async detail => {
      calls.push(['retry', detail.evidenceKey]);
      return true;
    },
  });
  assert.equal(shown, true);
  assert.match(calls[0][0], /chat-structured-route-toast-action/);
  assert.equal(calls[0][2].tapToDismiss, false);
  await listeners.get('click')({ preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
  assert.deepEqual(calls[1], ['retry', 'cell-retry']);
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, '已安排重试');
  console.log('ok - circuit toast exposes a small in-place retry action');
}

{
  const bridgeSource = await readFile(new URL('../../src/scripts/ui/bridge.js', import.meta.url), 'utf8');
  const appSource = await readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');
  assert.match(bridgeSource, /circuitOpenedAt:\s*Number\(structuredEvidenceTransition\?\.cell\?\.health\?\.circuitOpenedAt/);
  assert.doesNotMatch(bridgeSource, /halfOpenAttempt:/);
  assert.match(bridgeSource, /localRuleId:\s*String\(/);
  assert.match(appSource, /structuredRouteCircuitToastTracker\.shouldNotify\(detail\)/);
  assert.match(appSource, /showChatStructuredCircuitToast\(\{/);
  console.log('ok - bridge emits occurrence identity and app consumes the tested toast tracker');
}

console.log('chat-structured-route-toast-tests passed');
