import assert from 'node:assert/strict';

import { buildProviderToolRunnerDryRun } from '../../src/scripts/agent/provider-tool-runner-dry-run-adapter.js';

const runnerHandoff = {
  ok: true,
  status: 'ready',
  runner: 'mock_provider_runner',
  output: 'provider_stream_events',
  provider: 'openai',
  model: 'gpt-test',
  sessionId: 's1',
  network: false,
  writesChat: false,
};

const mockProviderRun = {
  ok: true,
  status: 'succeeded',
  provider: 'openai',
  model: 'gpt-test',
  sessionId: 's1',
  network: false,
  finalText: 'done',
  events: [
    { type: 'mock_provider_stream_start', provider: 'openai', model: 'gpt-test', sessionId: 's1', createdAt: 1000 },
    { type: 'mock_provider_stream_delta', textDelta: 'do', accumulatedText: 'do', createdAt: 1001 },
    { type: 'mock_provider_stream_delta', textDelta: 'ne', accumulatedText: 'done', createdAt: 1002 },
    { type: 'mock_provider_stream_end', finalText: 'done', finishReason: 'stop', createdAt: 1003 },
  ],
};

{
  const dryRun = buildProviderToolRunnerDryRun({
    runnerHandoff,
    mockProviderRun,
    now: () => 2000,
  });
  assert.equal(dryRun.ok, true);
  assert.equal(dryRun.status, 'succeeded');
  assert.equal(dryRun.network, false);
  assert.equal(dryRun.writesChat, false);
  assert.equal(dryRun.output, 'provider_stream_events');
  assert.equal(dryRun.eventCount, 4);
  assert.deepEqual(dryRun.events.map(event => event.type), [
    'provider_stream_start',
    'provider_stream_delta',
    'provider_stream_delta',
    'provider_stream_end',
  ]);
  assert.equal(dryRun.events[1].sourceType, 'mock_provider_stream_delta');
  assert.equal(dryRun.events[1].textDelta, 'do');
  assert.equal(dryRun.events.at(-1).finalText, 'done');
  assert.equal(dryRun.finalText, 'done');
  console.log('ok - provider tool runner dry-run adapter normalizes mock stream events into provider event envelope');
}

{
  const dryRun = buildProviderToolRunnerDryRun({
    runnerHandoff: { ...runnerHandoff, ok: false, status: 'blocked', reason: 'blocked' },
    mockProviderRun,
  });
  assert.equal(dryRun.ok, false);
  assert.equal(dryRun.status, 'blocked');
  assert.equal(dryRun.events.length, 0);
  console.log('ok - provider tool runner dry-run adapter respects blocked handoff');
}

{
  const dryRun = buildProviderToolRunnerDryRun({
    runnerHandoff,
    mockProviderRun: { ...mockProviderRun, ok: false, status: 'skipped', events: [] },
  });
  assert.equal(dryRun.ok, false);
  assert.equal(dryRun.status, 'skipped');
  assert.equal(dryRun.eventCount, 0);
  console.log('ok - provider tool runner dry-run adapter skips when mock provider run is unavailable');
}
