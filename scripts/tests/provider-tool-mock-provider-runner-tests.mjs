import assert from 'node:assert/strict';

import { buildProviderToolMockLoopPreview } from '../../src/scripts/agent/provider-tool-mock-loop-preview.js';
import { buildProviderToolMockProviderRun } from '../../src/scripts/agent/provider-tool-mock-provider-runner.js';
import { buildProviderToolResultRequestPreview } from '../../src/scripts/agent/provider-tool-result-request-preview.js';

{
  const requestPreview = buildProviderToolResultRequestPreview({
    provider: 'openai',
    model: 'gpt-test',
    sessionId: 's1',
    assistantToolCalls: [{
      id: 'call-1',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
    }],
    toolResults: [{
      toolCallId: 'call-1',
      output: { summary: 'contact profiles listed: 1', result: { items: [{ id: 'c1' }] } },
    }],
  });
  const mockLoopPreview = buildProviderToolMockLoopPreview({ requestPreview });
  const run = buildProviderToolMockProviderRun({
    mockLoopPreview,
    chunkChars: 12,
    now: () => 1000,
  });
  assert.equal(run.ok, true);
  assert.equal(run.status, 'succeeded');
  assert.equal(run.provider, 'openai');
  assert.equal(run.model, 'gpt-test');
  assert.equal(run.sessionId, 's1');
  assert.equal(run.network, false);
  assert.equal(run.requestPreview, requestPreview);
  assert.equal(run.assistantPreview.role, 'assistant');
  assert.equal(run.finalText.includes('contact_profile.list: contact profiles listed: 1'), true);
  assert.equal(run.eventCount, run.events.length);
  assert.equal(run.events[0].type, 'mock_provider_stream_start');
  assert.equal(run.events.at(-1).type, 'mock_provider_stream_end');
  assert.equal(run.events.filter(event => event.type === 'mock_provider_stream_delta').length > 1, true);
  assert.equal(run.events.at(-1).finalText, run.finalText);
  console.log('ok - provider tool mock provider runner streams OpenAI preview text without network');
}

{
  const run = buildProviderToolMockProviderRun();
  assert.equal(run.ok, false);
  assert.equal(run.status, 'skipped');
  assert.equal(run.network, false);
  assert.deepEqual(run.events, []);
  console.log('ok - provider tool mock provider runner skips when preview is missing');
}

{
  const run = buildProviderToolMockProviderRun({
    mockLoopPreview: {
      ok: true,
      status: 'preview_ready',
      provider: 'openai',
      network: false,
      requestPreview: { provider: 'openai', network: true },
      assistantPreview: { role: 'assistant', content: 'should not stream' },
    },
  });
  assert.equal(run.ok, false);
  assert.equal(run.status, 'blocked');
  assert.equal(run.network, false);
  assert.equal(run.events.length, 0);
  console.log('ok - provider tool mock provider runner blocks network previews');
}

{
  const requestPreview = buildProviderToolResultRequestPreview({
    provider: 'anthropic',
    assistantToolCalls: [{
      id: 'call-2',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
    }],
    toolResults: [{
      toolCallId: 'call-2',
      output: { summary: 'contact profiles listed: 1' },
    }],
  });
  const mockLoopPreview = buildProviderToolMockLoopPreview({ requestPreview });
  const run = buildProviderToolMockProviderRun({ mockLoopPreview });
  assert.equal(run.ok, false);
  assert.equal(run.status, 'unsupported');
  assert.equal(run.events.length, 0);
  console.log('ok - provider tool mock provider runner stays OpenAI-only');
}
