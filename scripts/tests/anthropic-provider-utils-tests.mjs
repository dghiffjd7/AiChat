import assert from 'node:assert/strict';
import { AnthropicProvider, collectAnthropicStreamUsage } from '../../src/scripts/api/providers/anthropic.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

const provider = new AnthropicProvider({
  apiKey: 'test-key',
  baseUrl: 'https://api.anthropic.com/v1',
  model: 'claude-test',
});

test('convertMessages replaces whitespace-only text with Claude-safe placeholder', () => {
  const converted = provider.convertMessages([
    { role: 'user', content: '   \n\t  ' },
    { role: 'assistant', content: [{ type: 'text', text: '' }] },
  ]);
  assert.equal(converted.messages[0].content[0].text, '\u200b');
  assert.equal(converted.messages[1].content[0].text, '\u200b');
});

test('convertMessages keeps valid text and image blocks while guarding empty arrays', () => {
  const converted = provider.convertMessages([
    { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    { role: 'assistant', content: [] },
    {
      role: 'user',
      content: [
        { type: 'image_url', image_url: { url: 'data:image/png;base64,abc' } },
      ],
    },
  ]);
  assert.equal(converted.messages[0].content[0].text, 'hello');
  assert.equal(converted.messages[1].content[0].text, '\u200b');
  assert.equal(converted.messages[2].content[0].type, 'image');
});

test('collectAnthropicStreamUsage merges message_start and message_delta usage events', () => {
  let usage = null;
  usage = collectAnthropicStreamUsage({
    type: 'message_start',
    message: { usage: { input_tokens: 1200, cache_read_input_tokens: 300, output_tokens: 1 } },
  }, usage);
  usage = collectAnthropicStreamUsage({ type: 'content_block_delta', delta: { text: 'hi' } }, usage);
  usage = collectAnthropicStreamUsage({
    type: 'message_delta',
    delta: { stop_reason: 'end_turn' },
    usage: { output_tokens: 88 },
  }, usage);
  assert.deepEqual(usage, {
    input_tokens: 1200,
    cache_read_input_tokens: 300,
    output_tokens: 88,
  });
  assert.equal(collectAnthropicStreamUsage({ type: 'ping' }, null), null);
});

for (const { name, fn } of tests) {
  await fn();
  console.log(`ok - ${name}`);
}
