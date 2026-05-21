import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_BRIDGE_LOOP_MODES,
  buildProviderToolBridgeLoopPlan,
} from '../../src/scripts/agent/provider-tool-bridge-loop-plan.js';

{
  const plan = buildProviderToolBridgeLoopPlan({
    provider: 'openai',
    model: 'gpt-bridge',
    sessionId: 's1',
    requestId: 'req-1',
  });

  assert.equal(plan.enabled, false);
  assert.equal(plan.mode, PROVIDER_TOOL_BRIDGE_LOOP_MODES.disabled);
  assert.equal(plan.handleProviderToolCallDelta, null);
  assert.deepEqual(plan.requestOptions, {});
  assert.deepEqual(plan.diagnostics, {
    mode: 'disabled',
    provider: 'openai',
    model: 'gpt-bridge',
    sessionId: 's1',
    requestId: 'req-1',
    source: 'bridge.generateStream',
    network: false,
    writesChat: false,
    executesTools: false,
    runsProvider: false,
    continuationStrategy: 'none',
  });
  console.log('ok - provider tool bridge loop plan stays disabled without capture action');
}

{
  const captured = [];
  let executed = false;
  const plan = buildProviderToolBridgeLoopPlan({
    debugUiRegistry: {
      actions: {
        captureProviderToolCallDeltas: (events, options) => {
          captured.push([events, options]);
          return { ok: true, status: 'captured' };
        },
        runProviderToolExecutionLoopFixture: () => {
          executed = true;
          throw new Error('must not execute from bridge plan');
        },
      },
    },
    provider: 'openai',
    model: 'gpt-bridge',
    sessionId: 's1',
    requestId: 'req-2',
    source: 'bridge.generateStream',
  });

  assert.equal(plan.enabled, true);
  assert.equal(plan.mode, PROVIDER_TOOL_BRIDGE_LOOP_MODES.readOnlyCapture);
  assert.equal(plan.diagnostics.executesTools, false);
  assert.equal(plan.diagnostics.runsProvider, false);
  assert.equal(plan.diagnostics.writesChat, false);
  assert.equal(plan.diagnostics.network, false);
  assert.equal(typeof plan.requestOptions.onProviderToolCallDelta, 'function');
  const result = plan.requestOptions.onProviderToolCallDelta(
    { choices: [{ delta: { tool_calls: [] } }] },
    { provider: 'custom-openai', model: 'gpt-meta' },
  );

  assert.deepEqual(result, { ok: true, status: 'captured' });
  assert.equal(captured.length, 1);
  assert.equal(captured[0][0].length, 1);
  assert.deepEqual(captured[0][1], {
    provider: 'custom-openai',
    model: 'gpt-meta',
    sessionId: 's1',
    requestId: 'req-2',
    source: 'bridge.generateStream',
  });
  assert.equal(executed, false);
  console.log('ok - provider tool bridge loop plan only wires read-only capture callback');
}

{
  const errors = [];
  const plan = buildProviderToolBridgeLoopPlan({
    debugUiRegistry: {
      actions: {
        captureProviderToolCallDeltas: () => {
          throw new Error('capture failed');
        },
      },
    },
    provider: 'openai',
    model: 'gpt-bridge',
    sessionId: 's1',
    requestId: 'req-3',
    onCaptureError: error => errors.push(error),
  });

  const result = plan.handleProviderToolCallDelta({ type: 'bad' });
  assert.equal(result, null);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message, 'capture failed');
  assert.equal(plan.diagnostics.mode, 'read_only_capture');
  console.log('ok - provider tool bridge loop plan contains capture failures');
}
