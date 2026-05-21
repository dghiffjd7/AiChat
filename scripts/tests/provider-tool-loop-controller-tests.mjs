import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_LOOP_PHASES,
  runProviderToolLoopController,
} from '../../src/scripts/agent/provider-tool-loop-controller.js';

const buildOpenAIToolDeltaEvents = (callId = 'call-controller-1', limit = 2) => [
  {
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: callId,
          function: {
            name: 'contact_profile.list',
            arguments: '{"limit":',
          },
        }],
      },
    }],
  },
  {
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          function: { arguments: `${limit}}` },
        }],
      },
    }],
  },
  { choices: [{ finish_reason: 'tool_calls' }] },
];

{
  let executed = false;
  const result = await runProviderToolLoopController({
    enabled: false,
    executeToolCall: async () => {
      executed = true;
      return { ok: true };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'disabled');
  assert.equal(result.loopState.phase, PROVIDER_TOOL_LOOP_PHASES.disabled);
  assert.equal(result.loopState.phaseCount, 1);
  assert.equal(result.continuation.shouldContinue, false);
  assert.equal(executed, false);
  console.log('ok - provider tool loop controller returns disabled state without executing tools');
}

{
  const executed = [];
  const result = await runProviderToolLoopController({
    events: buildOpenAIToolDeltaEvents('call-controller-2', 4),
    provider: 'openai',
    model: 'gpt-controller',
    sessionId: 's1',
    now: () => 1000,
    runnerModePlan: {
      mode: 'read_only_capture',
      status: 'ready',
      runner: 'none',
      runnerFacadeEnabled: false,
      network: false,
      writesChat: false,
    },
    executeToolCall: async (toolCall) => {
      executed.push(toolCall);
      return {
        ok: true,
        status: 'succeeded',
        toolCall,
        output: { summary: 'contact profiles listed: 4', result: { items: [{ id: 'c1' }] } },
        parts: [{ type: 'provider_tool_call' }, { type: 'provider_tool_result' }],
      };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.completedToolCalls.length, 1);
  assert.deepEqual(executed[0].arguments, { limit: 4 });
  assert.equal(result.requestPreview.format, 'openai_chat_completions_tool_result');
  assert.equal(result.mockLoopPreview.status, 'preview_ready');
  assert.equal(result.mockProviderRun.status, 'succeeded');
  assert.equal(result.mockProviderRun.network, false);
  assert.equal(result.runnerHandoff.status, 'ready');
  assert.equal(result.runnerHandoff.output, 'provider_stream_events');
  assert.equal(result.runnerHandoff.writesChat, false);
  assert.equal(result.runnerRequestDraft.status, 'ready');
  assert.equal(result.runnerRequestDraft.payloadKind, 'messages');
  assert.equal(result.runnerRequestDraft.writesChat, false);
  assert.equal(result.runnerModePlan.mode, 'read_only_capture');
  assert.equal(result.runnerModePlan.status, 'ready');
  assert.equal(result.runnerModePlan.runnerFacadeEnabled, false);
  assert.equal(result.runnerFacade.status, 'disabled');
  assert.equal(result.runnerFacade.eventCount, 0);
  assert.equal(result.runnerFacade.writesChat, false);
  assert.equal(result.runnerDryRun.status, 'succeeded');
  assert.deepEqual(result.runnerDryRun.events.map(event => event.type).filter((type, index, list) => list.indexOf(type) === index), [
    'provider_stream_start',
    'provider_stream_delta',
    'provider_stream_end',
  ]);
  assert.equal(result.runnerDryRun.network, false);
  assert.equal(result.runnerDryRun.writesChat, false);
  assert.deepEqual(
    result.loopState.phases.map(phase => phase.phase),
    [
      PROVIDER_TOOL_LOOP_PHASES.captureDeltas,
      PROVIDER_TOOL_LOOP_PHASES.executeTools,
      PROVIDER_TOOL_LOOP_PHASES.requestPreview,
      PROVIDER_TOOL_LOOP_PHASES.mockLoopPreview,
      PROVIDER_TOOL_LOOP_PHASES.mockProviderRun,
    ],
  );
  assert.equal(result.loopState.status, 'succeeded');
  assert.equal(result.loopState.phase, PROVIDER_TOOL_LOOP_PHASES.completed);
  assert.equal(result.loopState.network, false);
  assert.equal(result.loopState.deltas >= 3, true);
  assert.equal(result.loopState.completedToolCalls, 1);
  assert.equal(result.loopState.results, 1);
  assert.equal(result.loopState.parts, 2);
  assert.equal(result.loopState.requestPreviewFormat, 'openai_chat_completions_tool_result');
  assert.equal(result.loopState.mockLoopStatus, 'preview_ready');
  assert.equal(result.loopState.mockProviderStatus, 'succeeded');
  assert.equal(result.loopState.mockProviderEvents, result.mockProviderRun.events.length);
  assert.equal(result.loopState.runnerHandoffStatus, 'ready');
  assert.equal(result.loopState.runnerHandoffOutput, 'provider_stream_events');
  assert.equal(result.loopState.runnerHandoffWritesChat, false);
  assert.equal(result.loopState.runnerRequestDraftStatus, 'ready');
  assert.equal(result.loopState.runnerRequestDraftPayloadKind, 'messages');
  assert.equal(result.loopState.runnerRequestDraftWritesChat, false);
  assert.equal(result.loopState.runnerMode, 'read_only_capture');
  assert.equal(result.loopState.runnerModeStatus, 'ready');
  assert.equal(result.loopState.runnerModeFacadeEnabled, false);
  assert.equal(result.loopState.runnerModeNetwork, false);
  assert.equal(result.loopState.runnerFacadeStatus, 'disabled');
  assert.equal(result.loopState.runnerFacadeEvents, 0);
  assert.equal(result.loopState.runnerFacadeWritesChat, false);
  assert.equal(result.loopState.runnerDryRunStatus, 'succeeded');
  assert.equal(result.loopState.runnerDryRunEvents, result.runnerDryRun.events.length);
  assert.equal(result.loopState.shouldContinue, false);
  console.log('ok - provider tool loop controller organizes tool execution and mock continuation state');
}

{
  let executed = false;
  const result = await runProviderToolLoopController({
    events: [{ choices: [{ delta: { content: 'hello' } }] }],
    provider: 'openai',
    executeToolCall: async () => {
      executed = true;
      return { ok: true };
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'no_tool_calls');
  assert.equal(result.completedToolCalls.length, 0);
  assert.equal(result.requestPreview, null);
  assert.equal(result.mockProviderRun, null);
  assert.equal(result.runnerHandoff, null);
  assert.equal(result.runnerRequestDraft, null);
  assert.equal(result.runnerFacade, null);
  assert.equal(result.runnerDryRun, null);
  assert.equal(result.loopState.status, 'no_tool_calls');
  assert.equal(result.loopState.phases[0].status, 'no_tool_calls');
  assert.equal(executed, false);
  console.log('ok - provider tool loop controller skips tool and preview phases when stream has no tool calls');
}

{
  const runnerInputs = [];
  const result = await runProviderToolLoopController({
    events: buildOpenAIToolDeltaEvents('call-controller-facade', 1),
    provider: 'openai',
    model: 'gpt-controller',
    sessionId: 's1',
    now: () => 2000,
    runnerFacadeEnabled: true,
    providerRunner: async (runnerRequestDraft, context) => {
      runnerInputs.push({ runnerRequestDraft, context });
      return {
        output: 'provider_stream_events',
        events: [
          { type: 'provider_stream_start' },
          { type: 'provider_stream_delta', textDelta: 'facade', accumulatedText: 'facade' },
          { type: 'provider_stream_end', finalText: 'facade', finishReason: 'stop' },
        ],
      };
    },
    executeToolCall: async (toolCall) => ({
      ok: true,
      status: 'succeeded',
      toolCall,
      output: { summary: 'contact profiles listed: 1', result: { items: [] } },
      parts: [{ type: 'provider_tool_call' }, { type: 'provider_tool_result' }],
    }),
  });
  assert.equal(result.runnerFacade.status, 'succeeded');
  assert.equal(result.runnerFacade.eventCount, 3);
  assert.equal(result.runnerFacade.finalText, 'facade');
  assert.equal(result.runnerFacade.network, false);
  assert.equal(result.runnerFacade.writesChat, false);
  assert.equal(result.loopState.runnerFacadeStatus, 'succeeded');
  assert.equal(result.loopState.runnerFacadeEvents, 3);
  assert.equal(runnerInputs.length, 1);
  assert.equal(runnerInputs[0].runnerRequestDraft.payloadKind, 'messages');
  assert.equal(runnerInputs[0].context.allowNetwork, false);
  console.log('ok - provider tool loop controller can run debug-only provider runner facade');
}
