import assert from 'node:assert/strict';

import { createReasoningStreamEvent } from '../../src/scripts/api/native-reasoning.js';
import {
  buildProviderToolRealRunnerBoundary,
  createProviderToolRealRunnerAdapter,
  resolveProviderToolRealRunnerCapability,
  runProviderToolRealRunnerAdapter,
} from '../../src/scripts/agent/provider-tool-real-runner-adapter.js';
import { runProviderToolRunnerFacade } from '../../src/scripts/agent/provider-tool-runner-facade.js';

const buildDraft = (overrides = {}) => ({
  ok: true,
  status: 'ready',
  runner: 'real_provider_runner_draft',
  network: false,
  writesChat: false,
  output: 'provider_stream_events',
  provider: 'openai',
  model: 'gpt-real-runner',
  sessionId: 's1',
  requestPreviewFormat: 'openai_chat_completions_tool_result',
  payloadKind: 'messages',
  payloadCount: 2,
  toolResultCount: 1,
  request: {
    provider: 'openai',
    model: 'gpt-real-runner',
    sessionId: 's1',
    format: 'openai_chat_completions_tool_result',
    messages: [
      { role: 'assistant', tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'contact_profile.list', arguments: '{"limit":1}' } }] },
      { role: 'tool', tool_call_id: 'call-1', content: '{"summary":"listed"}' },
    ],
  },
  ...overrides,
});

{
  const providerClient = {
    streamChat: async function* () {
      yield 'unused';
    },
  };
  const boundary = buildProviderToolRealRunnerBoundary({
    runnerRequestDraft: buildDraft(),
    providerClient,
  });
  assert.equal(boundary.ok, true);
  assert.equal(boundary.status, 'ready');
  assert.equal(boundary.input, 'runnerRequestDraft.request');
  assert.equal(boundary.output, 'provider_stream_events');
  assert.equal(boundary.clientMethod, 'streamChat');
  assert.equal(boundary.capability.providerFamily, 'openai');
  assert.equal(boundary.capability.runnerKind, 'llmclient_stream_chat');
  assert.equal(boundary.network, false);
  assert.equal(boundary.writesChat, false);
  assert.equal(boundary.forbiddenInputs.includes('bridge'), true);
  assert.equal(boundary.forbiddenInputs.includes('chatStore'), true);
  console.log('ok - provider real runner boundary exposes only the request draft contract');
}

{
  const openai = resolveProviderToolRealRunnerCapability({
    provider: 'custom',
    requestPreviewFormat: 'openai_chat_completions_tool_result',
    payloadKind: 'messages',
    providerClient: { streamChat: async function* () {} },
  });
  assert.equal(openai.ok, true);
  assert.equal(openai.providerFamily, 'openai');
  assert.equal(openai.clientMethod, 'streamChat');

  const anthropic = resolveProviderToolRealRunnerCapability({
    provider: 'anthropic',
    requestPreviewFormat: 'anthropic_messages_tool_result',
    payloadKind: 'messages',
    providerClient: { streamChat: async function* () {} },
  });
  assert.equal(anthropic.ok, false);
  assert.equal(anthropic.requiresProviderNativeRunner, true);
  assert.equal(anthropic.reason.includes('provider-native'), true);

  const gemini = resolveProviderToolRealRunnerCapability({
    provider: 'gemini',
    requestPreviewFormat: 'gemini_function_response',
    payloadKind: 'contents',
    providerClient: { streamChat: async function* () {} },
  });
  assert.equal(gemini.ok, false);
  assert.equal(gemini.requiresProviderNativeRunner, true);
  assert.equal(gemini.reason.includes('functionResponse'), true);
  console.log('ok - provider real runner capability distinguishes streamChat and provider-native payloads');
}

{
  let called = false;
  const providerClient = {
    streamChat: async function* () {
      called = true;
      yield 'unused';
    },
  };
  const result = await runProviderToolRealRunnerAdapter({
    runnerRequestDraft: buildDraft(),
    providerClient,
    allowNetwork: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'disabled');
  assert.equal(result.network, false);
  assert.equal(result.runnerBoundary.status, 'ready');
  assert.equal(called, false);
  console.log('ok - provider real runner adapter stays disabled by default');
}

{
  let called = false;
  const providerClient = {
    streamChat: async function* () {
      called = true;
      yield 'unused';
    },
  };
  const result = await runProviderToolRealRunnerAdapter({
    runnerRequestDraft: buildDraft(),
    providerClient,
    enabled: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason.includes('network'), true);
  assert.equal(called, false);
  console.log('ok - provider real runner adapter requires explicit network allowance');
}

{
  const calls = [];
  const draft = buildDraft();
  const providerClient = {
    streamChat: async function* (messages, options) {
      calls.push({ messages, options });
      messages[0].content = 'mutated in client';
      yield 'hello';
      yield createReasoningStreamEvent('hidden reasoning', { provider: 'openai' });
      yield { content: ' world' };
    },
  };
  const result = await runProviderToolRealRunnerAdapter({
    runnerRequestDraft: draft,
    providerClient,
    enabled: true,
    allowNetwork: true,
    requestOptions: {
      requestId: 'real-runner-test',
      temperature: 0.2,
      onProviderToolCallDelta: () => {},
      options: {
        onChunk: () => {},
        top_p: 0.9,
      },
    },
    now: () => 1000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.network, true);
  assert.equal(result.writesChat, false);
  assert.equal(result.output, 'provider_stream_events');
  assert.deepEqual(result.events.map(event => event.type), [
    'provider_stream_start',
    'provider_stream_delta',
    'provider_stream_delta',
    'provider_stream_end',
  ]);
  assert.equal(result.events[1].textDelta, 'hello');
  assert.equal(result.events[2].textDelta, ' world');
  assert.equal(result.events[2].accumulatedText, 'hello world');
  assert.equal(result.finalText, 'hello world');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.onProviderToolCallDelta, undefined);
  assert.equal(calls[0].options.options.onChunk, undefined);
  assert.equal(calls[0].options.options.top_p, 0.9);
  assert.equal(draft.request.messages[0].content, undefined);
  console.log('ok - provider real runner adapter converts client stream into provider events');
}

{
  const providerClient = {
    streamChat: async function* () {
      yield 'unused';
    },
  };
  const draft = buildDraft({
    provider: 'gemini',
    payloadKind: 'contents',
    requestPreviewFormat: 'gemini_function_response',
    request: {
      provider: 'gemini',
      model: 'gemini-test',
      sessionId: 's1',
      format: 'gemini_function_response',
      contents: [
        { role: 'model', parts: [{ functionCall: { name: 'contact_profile.list', args: { limit: 1 } } }] },
        { role: 'user', parts: [{ functionResponse: { name: 'contact_profile.list', response: { summary: 'listed' } } }] },
      ],
    },
  });
  const result = await runProviderToolRealRunnerAdapter({
    runnerRequestDraft: draft,
    providerClient,
    enabled: true,
    allowNetwork: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason.includes('functionResponse'), true);
  assert.equal(result.runnerBoundary.capability.requiresProviderNativeRunner, true);
  console.log('ok - provider real runner adapter reports unsupported payload kinds for streamChat clients');
}

{
  const calls = [];
  const providerClient = {
    runProviderToolRequest: async (request, options) => {
      calls.push({ request, options });
      return {
        output: 'provider_stream_events',
        network: true,
        writesChat: false,
        finalText: `native:${request.provider}`,
        events: [
          { type: 'provider_stream_start' },
          { type: 'provider_stream_delta', textDelta: `native:${request.provider}`, accumulatedText: `native:${request.provider}` },
          { type: 'provider_stream_end', finalText: `native:${request.provider}`, finishReason: 'stop' },
        ],
      };
    },
  };
  const draft = buildDraft({
    provider: 'gemini',
    payloadKind: 'contents',
    requestPreviewFormat: 'gemini_function_response',
    request: {
      provider: 'gemini',
      model: 'gemini-test',
      sessionId: 's1',
      format: 'gemini_function_response',
      contents: [
        { role: 'model', parts: [{ functionCall: { name: 'contact_profile.list', args: { limit: 1 } } }] },
        { role: 'user', parts: [{ functionResponse: { name: 'contact_profile.list', response: { summary: 'listed' } } }] },
      ],
    },
  });
  const result = await runProviderToolRealRunnerAdapter({
    runnerRequestDraft: draft,
    providerClient,
    enabled: true,
    allowNetwork: true,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.runnerBoundary.capability.runnerKind, 'provider_native');
  assert.equal(result.runnerBoundary.clientMethod, 'runProviderToolRequest');
  assert.equal(result.runnerBoundary.nativeRunnerContract.status, 'ready');
  assert.equal(result.runnerBoundary.nativeRunnerContract.contractKind, 'gemini_function_response');
  assert.equal(result.eventCount, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.nativeRunnerContract.contractKind, 'gemini_function_response');
  console.log('ok - provider real runner adapter allows provider-native runner capability');
}

{
  let called = false;
  const providerClient = {
    runProviderToolRequest: async () => {
      called = true;
      return [];
    },
  };
  const draft = buildDraft({
    provider: 'anthropic',
    payloadKind: 'messages',
    requestPreviewFormat: 'anthropic_messages_tool_result',
    request: {
      provider: 'anthropic',
      model: 'claude-test',
      sessionId: 's1',
      format: 'anthropic_messages_tool_result',
      messages: [{ role: 'assistant', content: [{ type: 'tool_use', id: 'toolu-1' }] }],
    },
  });
  const result = await runProviderToolRealRunnerAdapter({
    runnerRequestDraft: draft,
    providerClient,
    enabled: true,
    allowNetwork: true,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.runnerBoundary.nativeRunnerContract.reason.includes('tool_result'), true);
  assert.equal(called, false);
  console.log('ok - provider real runner adapter blocks malformed provider-native requests');
}

{
  const providerClient = {
    streamChat: async function* () {
      yield 'ok';
    },
  };
  const runner = createProviderToolRealRunnerAdapter({
    providerClient,
    enabled: true,
    now: () => 2000,
  });
  const result = await runProviderToolRunnerFacade({
    runnerRequestDraft: buildDraft(),
    runner,
    enabled: true,
    allowNetwork: true,
    now: () => 2000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.network, true);
  assert.equal(result.writesChat, false);
  assert.equal(result.eventCount, 3);
  assert.equal(result.finalText, 'ok');
  assert.equal(result.runnerBoundary.input, 'runnerRequestDraft.request');
  assert.equal(result.runnerBoundary.clientMethod, 'streamChat');
  assert.equal(result.runnerBoundary.capability.runnerKind, 'llmclient_stream_chat');
  console.log('ok - provider real runner adapter can pass through the facade when network is explicitly allowed');
}
