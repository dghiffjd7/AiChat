import assert from 'node:assert/strict';

import { runProviderToolRunnerFacade } from '../../src/scripts/agent/provider-tool-runner-facade.js';

const buildDraft = (overrides = {}) => ({
  ok: true,
  status: 'ready',
  runner: 'real_provider_runner_draft',
  network: false,
  writesChat: false,
  output: 'provider_stream_events',
  provider: 'openai',
  model: 'gpt-facade',
  sessionId: 's1',
  payloadKind: 'messages',
  requestPreviewFormat: 'openai_chat_completions_tool_result',
  request: {
    provider: 'openai',
    model: 'gpt-facade',
    sessionId: 's1',
    messages: [{ role: 'tool', content: '{"summary":"listed"}' }],
  },
  ...overrides,
});

{
  let called = false;
  const result = await runProviderToolRunnerFacade({
    runnerRequestDraft: buildDraft(),
    runner: async () => {
      called = true;
      return { events: [] };
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'disabled');
  assert.equal(result.reason, 'provider runner facade disabled');
  assert.equal(called, false);
  console.log('ok - provider tool runner facade stays disabled by default');
}

{
  const draft = buildDraft();
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: draft,
    now: () => 1000,
    runner: async (inputDraft, context) => {
      assert.equal(context.allowNetwork, false);
      inputDraft.request.messages[0].content = 'mutated in runner';
      return {
        output: 'provider_stream_events',
        network: false,
        writesChat: false,
        events: [
          { type: 'provider_stream_start', role: 'assistant' },
          { type: 'provider_stream_delta', textDelta: 'hello', accumulatedText: 'hello' },
          { type: 'provider_stream_end', finalText: 'hello', finishReason: 'stop' },
        ],
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, 'succeeded');
  assert.equal(result.network, false);
  assert.equal(result.writesChat, false);
  assert.equal(result.output, 'provider_stream_events');
  assert.equal(result.eventCount, 3);
  assert.equal(result.events[1].provider, 'openai');
  assert.equal(result.events[1].textDelta, 'hello');
  assert.equal(result.finalText, 'hello');
  assert.equal(draft.request.messages[0].content, '{"summary":"listed"}');
  console.log('ok - provider tool runner facade runs injected runner and normalizes provider stream events');
}

{
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: buildDraft(),
    runner: async () => ({
      network: true,
      events: [{ type: 'provider_stream_start' }],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason.includes('network'), true);
  console.log('ok - provider tool runner facade blocks network results by default');
}

{
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: buildDraft(),
    runner: async () => ({
      writesChat: true,
      events: [{ type: 'provider_stream_start' }],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason.includes('chat'), true);
  console.log('ok - provider tool runner facade blocks direct chat writes');
}

{
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: buildDraft(),
    runner: async () => ({
      output: 'chat_message',
      events: [{ type: 'provider_stream_start' }],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason.includes('provider stream events'), true);
  console.log('ok - provider tool runner facade enforces provider stream event output');
}

{
  const result = await runProviderToolRunnerFacade({
    enabled: true,
    runnerRequestDraft: buildDraft(),
    runner: async () => ({
      events: [{ type: 'assistant_message' }],
    }),
  });

  assert.equal(result.ok, false);
  assert.equal(result.status, 'blocked');
  assert.equal(result.reason.includes('unsupported provider stream event type'), true);
  console.log('ok - provider tool runner facade rejects unsupported event types');
}
