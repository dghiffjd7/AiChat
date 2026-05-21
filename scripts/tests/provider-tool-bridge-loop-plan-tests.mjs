import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_BRIDGE_LOOP_MODES,
  buildProviderToolBridgeLoopPlan,
} from '../../src/scripts/agent/provider-tool-bridge-loop-plan.js';

const deferredPermissionStrategy = sessionGateEnabled => ({
  mode: 'deferred_message_part',
  presentation: 'message_part',
  promptModal: false,
  silentPrompt: false,
  defaultAction: 'deny',
  sessionGateEnabled,
  reason: 'deferred to message part; stream callbacks must not open modal prompts',
});

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
    experimentEnabled: false,
    sessionGateEnabled: false,
    sessionGateSource: '',
    requiresSessionGate: false,
    requiresExperimentEnabled: false,
    permissionStrategy: deferredPermissionStrategy(false),
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
        getProviderToolExperimentStatus: () => ({ enabled: false }),
        getProviderToolSessionGate: () => ({ enabled: false, source: 'test' }),
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
  assert.equal(plan.diagnostics.sessionGateEnabled, false);
  assert.deepEqual(plan.diagnostics.permissionStrategy, deferredPermissionStrategy(false));
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
          throw new Error('must stay read-only until session gate is enabled');
        },
        getProviderToolExperimentStatus: () => ({ enabled: true }),
        getProviderToolSessionGate: () => ({ enabled: false, source: 'session_settings' }),
      },
    },
    provider: 'openai',
    model: 'gpt-bridge',
    sessionId: 's1',
    requestId: 'req-read-only-status',
  });

  assert.equal(plan.mode, PROVIDER_TOOL_BRIDGE_LOOP_MODES.readOnlyCapture);
  assert.equal(plan.diagnostics.experimentEnabled, true);
  assert.equal(plan.diagnostics.sessionGateEnabled, false);
  assert.equal(plan.diagnostics.sessionGateSource, 'session_settings');
  assert.deepEqual(plan.diagnostics.permissionStrategy, deferredPermissionStrategy(false));
  assert.equal(plan.diagnostics.executesTools, false);
  plan.handleProviderToolCallDelta({ choices: [{ delta: { tool_calls: [] } }] });
  assert.equal(captured.length, 1);
  assert.equal(executed, false);
  console.log('ok - provider tool bridge loop plan requires session gate before execution loop');
}

{
  const executed = [];
  const plan = buildProviderToolBridgeLoopPlan({
    debugUiRegistry: {
      actions: {
        captureProviderToolCallDeltas: () => {
          throw new Error('execution mode should not use read-only capture action');
        },
        runProviderToolExecutionLoopFixture: async (events, options) => {
          executed.push([events, options]);
          return {
            ok: true,
            status: 'succeeded',
            completedToolCalls: [{ toolName: 'contact_profile.list' }],
          };
        },
        getProviderToolExperimentStatus: () => ({ enabled: true }),
        getProviderToolSessionGate: () => ({ enabled: true, source: 'session_settings' }),
      },
    },
    provider: 'openai',
    model: 'gpt-bridge',
    sessionId: 's1',
    requestId: 'req-execution-loop',
    source: 'bridge.generateStream',
  });

  assert.equal(plan.enabled, true);
  assert.equal(plan.mode, PROVIDER_TOOL_BRIDGE_LOOP_MODES.executionLoop);
  assert.equal(plan.diagnostics.executesTools, true);
  assert.equal(plan.diagnostics.runsProvider, false);
  assert.equal(plan.diagnostics.network, false);
  assert.equal(plan.diagnostics.writesChat, false);
  assert.equal(plan.diagnostics.continuationStrategy, 'stop_after_tool_result');
  assert.equal(plan.diagnostics.experimentEnabled, true);
  assert.equal(plan.diagnostics.sessionGateEnabled, true);
  assert.equal(plan.diagnostics.sessionGateSource, 'session_settings');
  assert.equal(plan.diagnostics.requiresSessionGate, true);
  assert.deepEqual(plan.diagnostics.permissionStrategy, deferredPermissionStrategy(true));
  const first = await plan.handleProviderToolCallDelta({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call-bridge-1',
          function: {
            name: 'contact_profile.list',
            arguments: '{"limit":',
          },
        }],
      },
    }],
  }, { provider: 'custom-openai', model: 'gpt-meta' });
  assert.equal(first.status, 'capturing');
  assert.equal(executed.length, 0);
  await plan.handleProviderToolCallDelta({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          function: { arguments: '1}' },
        }],
      },
    }],
  }, { provider: 'custom-openai', model: 'gpt-meta' });
  assert.equal(executed.length, 0);
  const result = await plan.handleProviderToolCallDelta(
    { choices: [{ finish_reason: 'tool_calls' }] },
    { provider: 'custom-openai', model: 'gpt-meta' },
  );
  assert.equal(result.status, 'succeeded');
  assert.equal(executed.length, 1);
  assert.equal(executed[0][0].length, 3);
  assert.deepEqual(executed[0][1], {
    enabled: true,
    provider: 'custom-openai',
    model: 'gpt-meta',
    sessionId: 's1',
    requestId: 'req-execution-loop',
    source: 'bridge.generateStream',
    continuationStrategy: 'stop_after_tool_result',
    promptPermission: false,
    permissionStrategy: 'deferred_message_part',
    permissionInteractionMode: 'deferred_message_part',
    sessionGate: { enabled: true, source: 'session_settings' },
    runnerMode: 'read_only_capture',
    allowRunnerNetwork: false,
    allowRealRunner: false,
  });
  console.log('ok - provider tool bridge loop plan can route completed deltas to execution loop when enabled');
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
