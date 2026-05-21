import assert from 'node:assert/strict';

import { createProviderToolExperimentRuntime } from '../../src/scripts/agent/provider-tool-experiment-runtime.js';
import { createProviderToolCallRuntime } from '../../src/scripts/agent/provider-tool-call-runtime.js';
import { createProviderToolLoopGuard } from '../../src/scripts/agent/provider-tool-loop-guard.js';

const buildOpenAIToolDeltaEvents = (callId = 'call-stream-1', limit = 3) => [
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
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async () => {
        throw new Error('should not run while disabled');
      },
    },
    enabledByDefault: false,
  });
  const result = await runtime.run({
    toolName: 'contact_profile.list',
    allowOnce: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'disabled');
  assert.equal(result.parts.length, 0);
  console.log('ok - provider tool experiment runtime stays disabled unless explicitly enabled');
}

{
  const calls = [];
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async (toolCall, context) => {
        calls.push([toolCall, context]);
        return {
          ok: true,
          status: 'succeeded',
          parts: [{ type: 'provider_tool_call' }],
        };
      },
    },
    allowedTools: ['contact_profile.list'],
    provider: 'debug-provider',
    model: 'debug-model',
    now: () => 1000,
  });
  const result = await runtime.run({
    enabled: true,
    toolName: 'contact_profile.list',
    arguments: { limit: 2 },
    sessionId: 's1',
    allowOnce: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.explicitEnabled, true);
  assert.equal(calls[0][0].toolName, 'contact_profile.list');
  assert.deepEqual(calls[0][0].arguments, { limit: 2 });
  assert.equal(calls[0][0].provider, 'debug-provider');
  assert.equal(calls[0][0].model, 'debug-model');
  assert.equal(calls[0][1].sessionId, 's1');
  assert.deepEqual(await calls[0][1].requestPermission({ toolName: 'contact_profile.list' }), {
    decision: 'allow',
    request: { toolName: 'contact_profile.list' },
  });
  const diagnostics = runtime.getDiagnostics();
  assert.equal(diagnostics.history.length, 1);
  assert.equal(diagnostics.history[0].kind, 'tool_call');
  assert.equal(diagnostics.history[0].toolCall.toolName, 'contact_profile.list');
  assert.deepEqual(diagnostics.history[0].parts, [{ type: 'provider_tool_call' }]);
  console.log('ok - provider tool experiment runtime runs allowed tool with explicit enable');
}

{
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async () => ({ ok: true }),
    },
    allowedTools: ['contact_profile.list'],
  });
  const result = await runtime.run({
    enabled: true,
    toolName: 'memory.update_after_chat',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason.includes('contact_profile.list'), true);
  console.log('ok - provider tool experiment runtime blocks tools outside the explicit allowlist');
}

{
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async () => ({ ok: true, status: 'succeeded', parts: [] }),
    },
    enabledByDefault: false,
  });
  assert.equal(runtime.getStatus().enabled, false);
  runtime.setEnabled(true);
  const result = await runtime.run({
    toolName: 'contact_profile.list',
  });
  assert.equal(result.ok, true);
  assert.equal(result.experiment.enabled, true);
  console.log('ok - provider tool experiment runtime can be toggled for debug-only sessions');
}

{
  const permissionRequests = [];
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async (toolCall, context) => ({
        ok: true,
        status: 'succeeded',
        parts: [],
        permission: await context.requestPermission({ toolName: toolCall.toolName }),
      }),
    },
    allowedTools: ['contact_profile.list'],
  });
  const result = await runtime.run({
    enabled: true,
    toolName: 'contact_profile.list',
    requestPermission: async (request, meta) => {
      permissionRequests.push([request, meta]);
      return { decision: 'allow', request };
    },
  });
  assert.equal(result.permission.decision, 'allow');
  assert.equal(permissionRequests.length, 1);
  assert.equal(permissionRequests[0][1].toolCall.toolName, 'contact_profile.list');
  assert.equal(permissionRequests[0][1].experiment.enabled, false);
  console.log('ok - provider tool experiment runtime delegates permission requests to UI callback');
}

{
  const executed = [];
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async (toolCall, context) => {
        executed.push([toolCall, context]);
        return {
          ok: true,
          status: 'succeeded',
          parts: [{ type: 'provider_tool_call' }, { type: 'provider_tool_result' }],
        };
      },
    },
    allowedTools: ['contact_profile.list'],
  });
  const result = await runtime.runStreamDeltas(buildOpenAIToolDeltaEvents('call-stream-1', 3), {
    enabled: true,
    allowOnce: true,
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.deltas.length >= 3, true);
  assert.equal(result.completedToolCalls.length, 1);
  assert.equal(result.continuation.strategy, 'stop_after_tool_result');
  assert.equal(result.continuation.shouldContinue, false);
  assert.equal(result.requestPreview.network, false);
  assert.equal(result.requestPreview.format, 'openai_chat_completions_tool_result');
  assert.equal(result.requestPreview.messages[1].role, 'tool');
  assert.equal(result.mockLoopPreview.status, 'preview_ready');
  assert.equal(result.mockLoopPreview.assistantPreview.role, 'assistant');
  assert.equal(result.mockProviderRun.status, 'succeeded');
  assert.equal(result.mockProviderRun.network, false);
  assert.equal(result.mockProviderRun.events[0].type, 'mock_provider_stream_start');
  assert.equal(result.mockProviderRun.events.at(-1).type, 'mock_provider_stream_end');
  assert.equal(result.mockProviderRun.finalText.includes('contact_profile.list'), true);
  assert.equal(result.loopState.status, 'succeeded');
  assert.equal(result.loopState.phase, 'completed');
  assert.equal(result.loopState.network, false);
  assert.equal(result.loopState.mockProviderStatus, 'succeeded');
  assert.equal(result.runnerHandoff.status, 'ready');
  assert.equal(result.runnerHandoff.output, 'provider_stream_events');
  assert.equal(result.runnerHandoff.writesChat, false);
  assert.equal(result.runnerRequestDraft.status, 'ready');
  assert.equal(result.runnerRequestDraft.payloadKind, 'messages');
  assert.equal(result.runnerRequestDraft.writesChat, false);
  assert.equal(result.runnerFacade.status, 'disabled');
  assert.equal(result.runnerFacade.eventCount, 0);
  assert.equal(result.runnerDryRun.status, 'succeeded');
  assert.equal(result.runnerDryRun.events[0].type, 'provider_stream_start');
  assert.equal(result.runnerDryRun.events.at(-1).type, 'provider_stream_end');
  assert.equal(executed.length, 1);
  assert.equal(executed[0][0].toolName, 'contact_profile.list');
  assert.deepEqual(executed[0][0].arguments, { limit: 3 });
  assert.equal(executed[0][1].provider, 'openai');
  assert.equal(executed[0][1].sessionId, 's1');
  const diagnostics = runtime.getDiagnostics();
  assert.equal(diagnostics.history.length, 1);
  assert.equal(diagnostics.history[0].kind, 'stream_delta');
  assert.equal(diagnostics.history[0].deltas.length >= 3, true);
  assert.equal(diagnostics.history[0].completedToolCalls[0].toolName, 'contact_profile.list');
  assert.equal(diagnostics.history[0].continuation.shouldContinue, false);
  assert.equal(diagnostics.history[0].requestPreview.toolResultCount, 1);
  assert.equal(diagnostics.history[0].mockLoopPreview.network, false);
  assert.equal(diagnostics.history[0].mockProviderRun.network, false);
  assert.equal(diagnostics.history[0].mockProviderRun.eventCount, diagnostics.history[0].mockProviderRun.events.length);
  assert.equal(diagnostics.history[0].loopState.status, 'succeeded');
  assert.equal(diagnostics.history[0].loopState.phaseCount, 5);
  assert.equal(diagnostics.history[0].runnerHandoff.status, 'ready');
  assert.equal(diagnostics.history[0].runnerHandoff.writesChat, false);
  assert.equal(diagnostics.history[0].runnerRequestDraft.status, 'ready');
  assert.equal(diagnostics.history[0].runnerRequestDraft.payloadKind, 'messages');
  assert.equal(diagnostics.history[0].runnerRequestDraft.writesChat, false);
  assert.equal(diagnostics.history[0].runnerFacade.status, 'disabled');
  assert.equal(diagnostics.history[0].runnerFacade.eventCount, 0);
  assert.equal(diagnostics.history[0].runnerDryRun.status, 'succeeded');
  assert.equal(diagnostics.history[0].runnerDryRun.writesChat, false);
  assert.equal(diagnostics.history[0].parts.length, 2);
  runtime.clearDiagnostics();
  assert.equal(runtime.getDiagnostics().history.length, 0);
  console.log('ok - provider tool experiment runtime executes completed streaming tool call deltas');
}

{
  const runnerCalls = [];
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async (toolCall) => ({
        ok: true,
        status: 'succeeded',
        toolCall,
        parts: [{ type: 'provider_tool_call' }, { type: 'provider_tool_result' }],
      }),
    },
    allowedTools: ['contact_profile.list'],
  });
  const result = await runtime.runStreamDeltas(buildOpenAIToolDeltaEvents('call-runner-facade-1', 2), {
    enabled: true,
    runnerFacadeEnabled: true,
    allowOnce: true,
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
    providerRunner: async (runnerRequestDraft, context) => {
      runnerCalls.push([runnerRequestDraft, context]);
      return {
        output: 'provider_stream_events',
        events: [
          { type: 'provider_stream_start' },
          { type: 'provider_stream_delta', textDelta: 'runner', accumulatedText: 'runner' },
          { type: 'provider_stream_end', finalText: 'runner', finishReason: 'stop' },
        ],
      };
    },
  });
  assert.equal(result.runnerFacade.status, 'succeeded');
  assert.equal(result.runnerFacade.eventCount, 3);
  assert.equal(result.runnerFacade.finalText, 'runner');
  assert.equal(result.loopState.runnerFacadeStatus, 'succeeded');
  assert.equal(result.loopState.runnerFacadeEvents, 3);
  assert.equal(runnerCalls.length, 1);
  assert.equal(runnerCalls[0][0].payloadKind, 'messages');
  assert.equal(runnerCalls[0][1].allowNetwork, false);
  const diagnostics = runtime.getDiagnostics();
  assert.equal(diagnostics.history[0].runnerFacade.status, 'succeeded');
  assert.equal(diagnostics.history[0].runnerFacade.eventCount, 3);
  console.log('ok - provider tool experiment runtime can run debug-only provider runner facade');
}

{
  const permissionRequests = [];
  let executed = false;
  const providerToolCallRuntime = createProviderToolCallRuntime({
    toolRegistry: {
      executeTool: async (toolName, args, context) => {
        const decision = await context.requestPermission({
          toolName,
          permissions: ['contact_profile:read'],
          argsPreview: args,
          riskLevel: 'low',
        });
        permissionRequests.push(decision);
        if (decision?.decision !== 'allow') throw new Error(`permission ${decision?.decision || 'ask'}`);
        executed = true;
        return { status: 'succeeded', result: { items: [] }, summary: 'listed contacts' };
      },
    },
    now: () => 9000,
    logger: { warn: () => {} },
  });
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime,
    allowedTools: ['contact_profile.list'],
  });
  const result = await runtime.runStreamDeltas(buildOpenAIToolDeltaEvents('call-deny-1', 1), {
    enabled: true,
    provider: 'openai',
    sessionId: 's1',
    requestPermission: async () => ({ decision: 'deny' }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].ok, false);
  assert.equal(result.results[0].parts.map(part => part.type).includes('provider_tool_permission_request'), true);
  assert.equal(result.results[0].parts.at(-1).status, 'failed');
  assert.equal(result.continuation.shouldContinue, false);
  assert.deepEqual(JSON.parse(result.requestPreview.messages[1].content), {
    toolName: 'contact_profile.list',
    status: 'failed',
    summary: 'permission deny',
  });
  assert.equal(permissionRequests[0].decision, 'deny');
  assert.equal(executed, false);
  console.log('ok - provider tool experiment runtime stops execution loop when permission is denied');
}

{
  const providerToolCallRuntime = createProviderToolCallRuntime({
    toolRegistry: {
      executeTool: async () => ({ status: 'succeeded', result: { items: [] }, summary: 'listed contacts' }),
    },
    loopGuard: createProviderToolLoopGuard({ maxRepeats: 1, now: () => 9100 }),
    now: () => 9100,
    logger: { warn: () => {} },
  });
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime,
    allowedTools: ['contact_profile.list'],
  });
  const first = await runtime.runStreamDeltas(buildOpenAIToolDeltaEvents('call-loop-1', 1), {
    enabled: true,
    allowOnce: true,
    provider: 'openai',
    sessionId: 's1',
  });
  const second = await runtime.runStreamDeltas(buildOpenAIToolDeltaEvents('call-loop-2', 1), {
    enabled: true,
    allowOnce: true,
    provider: 'openai',
    sessionId: 's1',
  });
  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.status, 'blocked');
  assert.equal(second.results[0].status, 'blocked');
  assert.equal(second.results[0].parts.at(-1).errorMessage.includes('repeated provider tool call blocked'), true);
  assert.equal(second.continuation.shouldContinue, false);
  console.log('ok - provider tool experiment runtime blocks repeated execution loop tool calls');
}

{
  const providerToolCallRuntime = createProviderToolCallRuntime({
    toolRegistry: {
      executeTool: async () => {
        throw new Error('fixture failure');
      },
    },
    now: () => 9200,
    logger: { warn: () => {} },
  });
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime,
    allowedTools: ['contact_profile.list'],
  });
  const result = await runtime.runStreamDeltas(buildOpenAIToolDeltaEvents('call-failure-1', 1), {
    enabled: true,
    allowOnce: true,
    provider: 'openai',
    sessionId: 's1',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  assert.equal(result.results[0].errorMessage, 'fixture failure');
  assert.equal(result.results[0].parts.at(-1).status, 'failed');
  assert.equal(result.continuation.shouldContinue, false);
  console.log('ok - provider tool experiment runtime records tool failure without continuing provider generation');
}

{
  const executed = [];
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async (...args) => {
        executed.push(args);
        return { ok: true, status: 'succeeded', parts: [{ type: 'provider_tool_result' }] };
      },
    },
    allowedTools: ['contact_profile.list'],
  });
  const first = runtime.captureStreamDeltas([{
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call-capture-1',
          function: {
            name: 'contact_profile.list',
            arguments: '{"limit":',
          },
        }],
      },
    }],
  }], {
    requestId: 'capture-stream-case',
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
  });
  assert.equal(first.ok, true);
  assert.equal(first.status, 'capturing');
  assert.equal(first.completedToolCalls.length, 0);
  assert.equal(runtime.getDiagnostics().history.length, 0);

  const second = runtime.captureStreamDeltas([
    {
      choices: [{
        delta: {
          tool_calls: [{
            index: 0,
            function: { arguments: '2}' },
          }],
        },
      }],
    },
    { choices: [{ finish_reason: 'tool_calls' }] },
  ], {
    requestId: 'capture-stream-case',
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
  });
  assert.equal(second.ok, true);
  assert.equal(second.status, 'captured');
  assert.equal(second.completedToolCalls.length, 1);
  assert.equal(second.completedToolCalls[0].toolName, 'contact_profile.list');
  assert.deepEqual(second.completedToolCalls[0].arguments, { limit: 2 });
  assert.deepEqual(second.results, []);
  assert.equal(executed.length, 0);

  const diagnostics = runtime.getDiagnostics();
  assert.equal(diagnostics.history.length, 1);
  assert.equal(diagnostics.history[0].kind, 'stream_delta_capture');
  assert.equal(diagnostics.history[0].status, 'captured');
  assert.equal(diagnostics.history[0].completedToolCalls.length, 1);
  assert.equal(diagnostics.history[0].provider, 'openai');
  assert.equal(diagnostics.history[0].sessionId, 's1');
  assert.deepEqual(diagnostics.history[0].results, []);
  console.log('ok - provider tool experiment runtime captures streaming tool deltas without executing tools');
}

{
  const runtime = createProviderToolExperimentRuntime({
    providerToolCallRuntime: {
      executeToolCall: async () => ({ ok: true }),
    },
    allowedTools: ['contact_profile.list'],
  });
  const result = await runtime.runStreamDeltas([{
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'memory.update_after_chat',
            args: { sessionId: 's1' },
          },
        }],
      },
    }],
  }], {
    enabled: true,
    allowOnce: true,
    provider: 'gemini',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.results[0].reason.includes('contact_profile.list'), true);
  console.log('ok - provider tool experiment runtime applies allowlist to streaming tool deltas');
}
