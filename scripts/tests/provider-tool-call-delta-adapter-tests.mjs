import assert from 'node:assert/strict';

import {
  PROVIDER_TOOL_CALL_DELTA_PHASES,
  createProviderToolCallDeltaAccumulator,
  normalizeProviderToolCallDeltas,
} from '../../src/scripts/agent/provider-tool-call-delta-adapter.js';

{
  const deltas = normalizeProviderToolCallDeltas({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call_1',
          type: 'function',
          function: {
            name: 'contact_profile.list',
            arguments: '{"limit"',
          },
        }],
      },
    }],
  }, { provider: 'openai', model: 'gpt-x', now: () => 1000 });
  assert.deepEqual(deltas.map(delta => delta.phase), [
    PROVIDER_TOOL_CALL_DELTA_PHASES.start,
    PROVIDER_TOOL_CALL_DELTA_PHASES.argumentsDelta,
  ]);
  assert.equal(deltas[0].toolCallId, 'call_1');
  assert.equal(deltas[0].toolName, 'contact_profile.list');
  assert.equal(deltas[1].argumentsDelta, '{"limit"');
  console.log('ok - provider tool delta adapter normalizes OpenAI chat tool_call deltas');
}

{
  const accumulator = createProviderToolCallDeltaAccumulator({
    provider: 'openai',
    model: 'gpt-x',
    now: () => 2000,
  });
  accumulator.push({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          id: 'call_2',
          function: { name: 'contact_profile.list', arguments: '{"limit":' },
        }],
      },
    }],
  });
  accumulator.push({
    choices: [{
      delta: {
        tool_calls: [{
          index: 0,
          function: { arguments: '2}' },
        }],
      },
    }],
  });
  const done = accumulator.push({ choices: [{ finish_reason: 'tool_calls' }] });
  assert.equal(done.completed.length, 1);
  assert.equal(done.completed[0].toolName, 'contact_profile.list');
  assert.deepEqual(done.completed[0].arguments, { limit: 2 });
  assert.equal(done.completed[0].metadata.streamingArgumentsText, '{"limit":2}');
  console.log('ok - provider tool delta accumulator completes OpenAI chat tool calls on finish_reason');
}

{
  const accumulator = createProviderToolCallDeltaAccumulator({
    provider: 'openai',
    model: 'gpt-4.1',
    now: () => 3000,
  });
  accumulator.push({
    type: 'response.output_item.added',
    output_index: 0,
    item: {
      type: 'function_call',
      id: 'item_1',
      call_id: 'call_resp_1',
      name: 'contact_profile.list',
    },
  });
  accumulator.push({
    type: 'response.function_call_arguments.delta',
    item_id: 'item_1',
    call_id: 'call_resp_1',
    output_index: 0,
    delta: '{"limit":',
  });
  const done = accumulator.push({
    type: 'response.function_call_arguments.done',
    item_id: 'item_1',
    call_id: 'call_resp_1',
    output_index: 0,
    arguments: '{"limit":5}',
  });
  assert.equal(done.completed.length, 1);
  assert.equal(done.completed[0].toolCallId, 'call_resp_1');
  assert.deepEqual(done.completed[0].arguments, { limit: 5 });
  console.log('ok - provider tool delta accumulator supports OpenAI responses function call events');
}

{
  const accumulator = createProviderToolCallDeltaAccumulator({
    provider: 'anthropic',
    model: 'claude-x',
    now: () => 4000,
  });
  accumulator.push({
    type: 'content_block_start',
    index: 1,
    content_block: {
      type: 'tool_use',
      id: 'toolu_1',
      name: 'contact_profile.list',
      input: {},
    },
  });
  accumulator.push({
    type: 'content_block_delta',
    index: 1,
    delta: { type: 'input_json_delta', partial_json: '{"limit":7}' },
  });
  const done = accumulator.push({ type: 'content_block_stop', index: 1 });
  assert.equal(done.completed.length, 1);
  assert.equal(done.completed[0].toolCallId, 'toolu_1');
  assert.equal(done.completed[0].toolName, 'contact_profile.list');
  assert.deepEqual(done.completed[0].arguments, { limit: 7 });
  console.log('ok - provider tool delta accumulator supports Anthropic tool_use input_json_delta');
}

{
  const done = createProviderToolCallDeltaAccumulator({
    provider: 'gemini',
    model: 'gemini-x',
    now: () => 5000,
  }).push({
    candidates: [{
      content: {
        parts: [{
          functionCall: {
            name: 'contact_profile.list',
            args: { limit: 9 },
          },
        }],
      },
    }],
  });
  assert.equal(done.completed.length, 1);
  assert.equal(done.completed[0].toolName, 'contact_profile.list');
  assert.deepEqual(done.completed[0].arguments, { limit: 9 });
  console.log('ok - provider tool delta accumulator supports Gemini functionCall parts');
}
