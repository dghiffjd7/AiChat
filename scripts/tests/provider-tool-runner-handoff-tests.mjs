import assert from 'node:assert/strict';

import { buildProviderToolRunnerHandoff } from '../../src/scripts/agent/provider-tool-runner-handoff.js';

const requestPreview = {
  provider: 'openai',
  model: 'gpt-test',
  sessionId: 's1',
  format: 'openai_chat_completions_tool_result',
  network: false,
  toolResultCount: 1,
};

const loopState = {
  provider: 'openai',
  model: 'gpt-test',
  sessionId: 's1',
  status: 'succeeded',
  phase: 'completed',
  phaseCount: 5,
  shouldContinue: false,
};

{
  const handoff = buildProviderToolRunnerHandoff({
    requestPreview,
    loopState,
    now: () => 1000,
  });
  assert.equal(handoff.ok, true);
  assert.equal(handoff.status, 'ready');
  assert.equal(handoff.network, false);
  assert.equal(handoff.writesChat, false);
  assert.deepEqual(handoff.inputKeys, ['requestPreview', 'loopState']);
  assert.equal(handoff.output, 'provider_stream_events');
  assert.deepEqual(handoff.outputEventTypes, [
    'provider_stream_start',
    'provider_stream_delta',
    'provider_stream_end',
  ]);
  assert.equal(handoff.requestPreviewFormat, 'openai_chat_completions_tool_result');
  assert.equal(handoff.loopStateStatus, 'succeeded');
  assert.equal(handoff.loopStatePhase, 'completed');
  assert.equal(handoff.shouldContinue, false);
  console.log('ok - provider tool runner handoff exposes requestPreview loopState stream-event contract');
}

{
  const handoff = buildProviderToolRunnerHandoff({
    requestPreview: { ...requestPreview, network: true },
    loopState,
  });
  assert.equal(handoff.ok, false);
  assert.equal(handoff.status, 'blocked');
  assert.equal(handoff.reason.includes('network'), true);
  console.log('ok - provider tool runner handoff blocks network previews by default');
}

{
  const handoff = buildProviderToolRunnerHandoff({
    requestPreview,
    loopState,
    writesChat: true,
  });
  assert.equal(handoff.ok, false);
  assert.equal(handoff.status, 'blocked');
  assert.equal(handoff.reason.includes('write chat'), true);
  console.log('ok - provider tool runner handoff rejects direct chat writes');
}

{
  const handoff = buildProviderToolRunnerHandoff({
    requestPreview: { ...requestPreview, toolResultCount: 0 },
    loopState,
  });
  assert.equal(handoff.ok, false);
  assert.equal(handoff.status, 'skipped');
  assert.equal(handoff.reason.includes('no model-safe tool results'), true);
  console.log('ok - provider tool runner handoff skips empty model-safe tool result previews');
}
