import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_CALL_PART_TYPES,
  buildProviderToolCallMessagePart,
  buildProviderToolMessageParts,
  buildProviderToolPermissionRequestPart,
  buildProviderToolResultMessagePart,
  normalizeProviderToolCall,
} from '../../src/scripts/agent/provider-tool-call-parts.js';

{
  const call = normalizeProviderToolCall({
    id: 'call-1',
    function: {
      name: 'memory.write',
      arguments: '{"scope":"session","value":"x"}',
    },
    status: 'requires_action',
  }, {
    provider: 'openai',
    model: 'gpt-x',
    sessionId: 's1',
    now: () => 1000,
  });
  assert.equal(call.toolCallId, 'call-1');
  assert.equal(call.toolName, 'memory.write');
  assert.equal(call.status, 'waiting_permission');
  assert.deepEqual(call.arguments, { scope: 'session', value: 'x' });
  assert.equal(call.provider, 'openai');
  assert.equal(call.model, 'gpt-x');
  console.log('ok - normalizeProviderToolCall adapts provider function call payloads');
}

{
  const part = buildProviderToolCallMessagePart({
    id: 'call-2',
    toolName: 'contact_profile.read',
    args: { contactId: 'c1' },
    provider: 'anthropic',
    status: 'running',
  }, {
    now: () => 2000,
  });
  assert.equal(part.type, PROVIDER_TOOL_CALL_PART_TYPES.call);
  assert.equal(part.id, 'provider-tool-call:call-2');
  assert.equal(part.title, 'contact_profile.read');
  assert.equal(part.status, 'running');
  assert.deepEqual(part.metadata.arguments, { contactId: 'c1' });
  console.log('ok - buildProviderToolCallMessagePart creates sidecar-ready call part');
}

{
  const part = buildProviderToolPermissionRequestPart({
    toolCall: {
      id: 'call-3',
      toolName: 'memory.write',
      arguments: { rowId: 'r1' },
      provider: 'openai',
    },
    permissions: ['memory:write'],
    riskLevel: 'medium',
    checks: [{ decision: 'ask' }],
    now: () => 3000,
  });
  assert.equal(part.type, PROVIDER_TOOL_CALL_PART_TYPES.permissionRequest);
  assert.equal(part.status, 'waiting_permission');
  assert.equal(part.summary, 'permission required for memory.write');
  assert.deepEqual(part.metadata.permissions, ['memory:write']);
  assert.deepEqual(part.metadata.argsPreview, { rowId: 'r1' });
  console.log('ok - buildProviderToolPermissionRequestPart captures ask UI payload shape');
}

{
  const part = buildProviderToolResultMessagePart({
    toolCall: {
      id: 'call-4',
      toolName: 'image.generate',
      provider: 'custom',
    },
    result: { imageId: 'img-1' },
    status: 'complete',
    now: () => 4000,
  });
  assert.equal(part.type, PROVIDER_TOOL_CALL_PART_TYPES.result);
  assert.equal(part.status, 'succeeded');
  assert.deepEqual(part.metadata.result, { imageId: 'img-1' });
  console.log('ok - buildProviderToolResultMessagePart captures normalized provider tool result');
}

{
  const parts = buildProviderToolMessageParts({
    toolCall: {
      id: 'call-5',
      toolName: 'memory.write',
      arguments: { text: 'remember' },
    },
    permission: { permissions: ['memory:write'] },
    result: { status: 'succeeded', result: { changed: 1 } },
    now: () => 5000,
  });
  assert.deepEqual(parts.map(part => part.type), [
    PROVIDER_TOOL_CALL_PART_TYPES.call,
    PROVIDER_TOOL_CALL_PART_TYPES.permissionRequest,
    PROVIDER_TOOL_CALL_PART_TYPES.result,
  ]);
  console.log('ok - buildProviderToolMessageParts composes call permission and result parts');
}
