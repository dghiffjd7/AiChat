import assert from 'node:assert/strict';

import { buildProviderToolRunnerHandoff } from '../../src/scripts/agent/provider-tool-runner-handoff.js';
import {
  PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS,
  buildProviderToolRunnerRequestDraft,
} from '../../src/scripts/agent/provider-tool-runner-request-draft.js';

const buildLoopState = (overrides = {}) => ({
  status: 'succeeded',
  phase: 'completed',
  phaseCount: 5,
  provider: 'openai',
  model: 'gpt-draft',
  sessionId: 's1',
  shouldContinue: false,
  ...overrides,
});

{
  const requestPreview = {
    provider: 'openai',
    model: 'gpt-draft',
    sessionId: 's1',
    format: 'openai_chat_completions_tool_result',
    network: false,
    toolResultCount: 1,
    messages: [
      { role: 'assistant', content: '', tool_calls: [{ id: 'call-1', type: 'function' }] },
      { role: 'tool', tool_call_id: 'call-1', content: '{"summary":"listed"}' },
    ],
  };
  const loopState = buildLoopState();
  const runnerHandoff = buildProviderToolRunnerHandoff({
    requestPreview,
    loopState,
    now: () => 1000,
  });
  const draft = buildProviderToolRunnerRequestDraft({
    runnerHandoff,
    requestPreview,
    loopState,
    now: () => 1001,
  });

  assert.equal(draft.ok, true);
  assert.equal(draft.status, 'ready');
  assert.equal(draft.network, false);
  assert.equal(draft.writesChat, false);
  assert.equal(draft.output, 'provider_stream_events');
  assert.equal(draft.payloadKind, PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.messages);
  assert.equal(draft.payloadCount, 2);
  assert.equal(draft.request.messages[1].role, 'tool');
  requestPreview.messages[1].content = 'mutated';
  assert.equal(draft.request.messages[1].content, '{"summary":"listed"}');
  console.log('ok - provider tool runner request draft builds isolated OpenAI message payload');
}

{
  const requestPreview = {
    provider: 'gemini',
    model: 'gemini-draft',
    sessionId: 's2',
    format: 'gemini_function_response',
    network: false,
    toolResultCount: 1,
    contents: [
      { role: 'model', parts: [{ functionCall: { name: 'contact_profile.list', args: { limit: 1 } } }] },
      { role: 'user', parts: [{ functionResponse: { name: 'contact_profile.list', response: { summary: 'listed' } } }] },
    ],
  };
  const loopState = buildLoopState({
    provider: 'gemini',
    model: 'gemini-draft',
    sessionId: 's2',
  });
  const runnerHandoff = buildProviderToolRunnerHandoff({
    requestPreview,
    loopState,
  });
  const draft = buildProviderToolRunnerRequestDraft({
    runnerHandoff,
    requestPreview,
    loopState,
  });

  assert.equal(draft.ok, true);
  assert.equal(draft.payloadKind, PROVIDER_TOOL_RUNNER_PAYLOAD_KINDS.contents);
  assert.equal(draft.payloadCount, 2);
  assert.equal(draft.request.contents[1].parts[0].functionResponse.name, 'contact_profile.list');
  console.log('ok - provider tool runner request draft supports Gemini contents payload');
}

{
  const blocked = buildProviderToolRunnerRequestDraft({
    runnerHandoff: {
      ok: true,
      status: 'ready',
      output: 'provider_stream_events',
      provider: 'openai',
      writesChat: true,
    },
    requestPreview: {
      provider: 'openai',
      network: false,
      messages: [{ role: 'tool', content: '{}' }],
    },
    loopState: buildLoopState(),
  });

  assert.equal(blocked.ok, false);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.reason.includes('write chat'), true);
  console.log('ok - provider tool runner request draft rejects direct chat writes');
}

{
  const skipped = buildProviderToolRunnerRequestDraft({
    runnerHandoff: {
      ok: false,
      status: 'blocked',
      reason: 'runner handoff refuses network by default',
      output: 'provider_stream_events',
    },
    requestPreview: {
      provider: 'openai',
      network: false,
      messages: [{ role: 'tool', content: '{}' }],
    },
    loopState: buildLoopState(),
  });

  assert.equal(skipped.ok, false);
  assert.equal(skipped.status, 'blocked');
  assert.equal(skipped.reason, 'runner handoff refuses network by default');
  console.log('ok - provider tool runner request draft respects blocked handoff');
}

{
  const requestPreview = {
    provider: 'openai',
    model: 'gpt-draft',
    sessionId: 's3',
    format: 'generic_tool_result_preview',
    network: false,
    toolResultCount: 1,
  };
  const loopState = buildLoopState({ sessionId: 's3' });
  const runnerHandoff = buildProviderToolRunnerHandoff({
    requestPreview,
    loopState,
  });
  const draft = buildProviderToolRunnerRequestDraft({
    runnerHandoff,
    requestPreview,
    loopState,
  });

  assert.equal(draft.ok, false);
  assert.equal(draft.status, 'skipped');
  assert.equal(draft.reason.includes('no provider runner payload'), true);
  console.log('ok - provider tool runner request draft skips empty provider payload');
}
