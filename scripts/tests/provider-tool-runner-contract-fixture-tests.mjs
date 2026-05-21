import assert from 'node:assert/strict';

import { runProviderToolRunnerFacade } from '../../src/scripts/agent/provider-tool-runner-facade.js';
import {
  PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS,
  runProviderToolRunnerContractFixture,
} from '../../src/scripts/agent/provider-tool-runner-contract-fixture.js';

const buildDraft = (overrides = {}) => ({
  ok: true,
  status: 'ready',
  runner: 'real_provider_runner_draft',
  network: false,
  writesChat: false,
  output: 'provider_stream_events',
  provider: 'openai',
  model: 'model-contract',
  sessionId: 'session-contract',
  payloadKind: 'messages',
  payloadCount: 2,
  toolResultCount: 1,
  requestPreviewFormat: 'openai_chat_completions_tool_result',
  request: {
    provider: 'openai',
    model: 'model-contract',
    sessionId: 'session-contract',
    format: 'openai_chat_completions_tool_result',
    messages: [
      { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function' }] },
      { role: 'tool', tool_call_id: 'call-1', content: '{"summary":"listed"}' },
    ],
  },
  ...overrides,
});

const assertFacadeEnvelope = (result, adapter) => {
  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.network, false);
  assert.equal(result.writesChat, false);
  assert.equal(result.output, 'provider_stream_events');
  assert.equal(result.eventCount, 3);
  assert.deepEqual(result.events.map(event => event.type), [
    'provider_stream_start',
    'provider_stream_delta',
    'provider_stream_end',
  ]);
  assert.equal(result.finalText.includes(adapter), true);
  assert.equal(result.events[0].provider, result.provider);
  assert.equal(result.events[1].textDelta, result.finalText);
  assert.equal(result.events[2].finalText, result.finalText);
};

{
  const draft = buildDraft();
  const direct = await runProviderToolRunnerContractFixture(draft, { now: () => 1000 });
  assert.equal(direct.adapter, PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.openai);
  assert.equal(direct.network, false);
  assert.equal(direct.writesChat, false);

  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: draft,
    runner: runProviderToolRunnerContractFixture,
    now: () => 1001,
  });
  assertFacadeEnvelope(result, PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.openai);
  console.log('ok - provider runner contract fixture simulates OpenAI message runner through facade');
}

{
  const draft = buildDraft({
    provider: 'anthropic',
    payloadKind: 'messages',
    requestPreviewFormat: 'anthropic_messages_tool_result',
    request: {
      provider: 'anthropic',
      model: 'claude-contract',
      sessionId: 'session-anthropic',
      format: 'anthropic_messages_tool_result',
      messages: [
        {
          role: 'assistant',
          content: [{ type: 'tool_use', id: 'toolu-1', name: 'contact_profile.list', input: { limit: 1 } }],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'toolu-1', content: '{"summary":"listed"}' }],
        },
      ],
    },
  });
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: draft,
    runner: runProviderToolRunnerContractFixture,
  });
  assertFacadeEnvelope(result, PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.anthropic);
  assert.equal(result.provider, 'anthropic');
  console.log('ok - provider runner contract fixture simulates Anthropic message runner through facade');
}

{
  const draft = buildDraft({
    provider: 'gemini',
    payloadKind: 'contents',
    requestPreviewFormat: 'gemini_function_response',
    request: {
      provider: 'gemini',
      model: 'gemini-contract',
      sessionId: 'session-gemini',
      format: 'gemini_function_response',
      contents: [
        { role: 'model', parts: [{ functionCall: { name: 'contact_profile.list', args: { limit: 1 } } }] },
        { role: 'user', parts: [{ functionResponse: { name: 'contact_profile.list', response: { summary: 'listed' } } }] },
      ],
    },
  });
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: draft,
    runner: runProviderToolRunnerContractFixture,
  });
  assertFacadeEnvelope(result, PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.gemini);
  assert.equal(result.provider, 'gemini');
  console.log('ok - provider runner contract fixture simulates Gemini contents runner through facade');
}

{
  const draft = buildDraft({
    provider: 'unknown-provider',
    payloadKind: 'tool_results',
    requestPreviewFormat: 'generic_tool_result_preview',
    request: {
      provider: 'unknown-provider',
      model: 'generic-contract',
      sessionId: 'session-generic',
      format: 'generic_tool_result_preview',
      toolResults: [
        {
          toolCallId: 'call-1',
          toolName: 'contact_profile.list',
          status: 'succeeded',
          result: { summary: 'listed' },
        },
      ],
    },
  });
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: draft,
    runner: runProviderToolRunnerContractFixture,
  });
  assertFacadeEnvelope(result, PROVIDER_TOOL_RUNNER_CONTRACT_ADAPTERS.generic);
  assert.equal(result.provider, 'unknown-provider');
  console.log('ok - provider runner contract fixture simulates generic tool result runner through facade');
}

{
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: buildDraft({
      provider: 'openai',
      payloadKind: 'contents',
      request: {
        provider: 'openai',
        contents: [{ role: 'user', parts: [] }],
      },
    }),
    runner: runProviderToolRunnerContractFixture,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'unsupported');
  assert.equal(result.reason.includes('unsupported'), true);
  console.log('ok - provider runner contract fixture reports unsupported payloads through facade');
}
