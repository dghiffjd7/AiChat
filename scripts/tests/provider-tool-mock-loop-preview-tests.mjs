import assert from 'node:assert/strict';

import { buildProviderToolMockLoopPreview } from '../../src/scripts/agent/provider-tool-mock-loop-preview.js';
import { buildProviderToolResultRequestPreview } from '../../src/scripts/agent/provider-tool-result-request-preview.js';

{
  const requestPreview = buildProviderToolResultRequestPreview({
    provider: 'openai',
    assistantToolCalls: [{
      id: 'call-1',
      toolName: 'contact_profile.list',
      arguments: { limit: 1 },
    }],
    toolResults: [{
      toolCallId: 'call-1',
      output: { summary: 'contact profiles listed: 2', result: { items: [{ id: 'c1' }, { id: 'c2' }] } },
    }],
  });
  const preview = buildProviderToolMockLoopPreview({ requestPreview });
  assert.equal(preview.ok, true);
  assert.equal(preview.status, 'preview_ready');
  assert.equal(preview.network, false);
  assert.equal(preview.requestPreview, requestPreview);
  assert.equal(preview.assistantPreview.role, 'assistant');
  assert.equal(preview.assistantPreview.content.includes('contact_profile_list: contact profiles listed: 2'), true);
  console.log('ok - provider tool mock loop preview builds OpenAI second-turn assistant preview without network');
}

{
  const requestPreview = buildProviderToolResultRequestPreview({
    provider: 'openai',
    assistantToolCalls: [{
      id: 'call-skip',
      toolName: 'memory.snapshot',
      arguments: { scope: 'session' },
    }],
    toolResults: [{
      toolCallId: 'call-skip',
      output: { summary: 'memory rows', result: { rows: [{ secret: 'hidden' }] } },
    }],
  });
  const preview = buildProviderToolMockLoopPreview({ requestPreview });
  assert.equal(requestPreview.toolResultCount, 0);
  assert.equal(preview.ok, false);
  assert.equal(preview.status, 'skipped');
  assert.equal(preview.network, false);
  console.log('ok - provider tool mock loop preview skips when policy prevents provider continuation preview');
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
      output: { summary: 'contact profiles listed: 1', result: { items: [{ id: 'c1' }] } },
    }],
  });
  const preview = buildProviderToolMockLoopPreview({ requestPreview });
  assert.equal(preview.ok, false);
  assert.equal(preview.status, 'unsupported');
  assert.equal(preview.reason.includes('openai_chat_completions_tool_result'), true);
  console.log('ok - provider tool mock loop preview stays OpenAI-only');
}
