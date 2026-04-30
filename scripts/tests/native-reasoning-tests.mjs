import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createReasoningStreamEvent,
  extractAnthropicStreamParts,
  extractGeminiStreamParts,
  extractOpenAICompatibleStreamParts,
  normalizeAssistantStreamChunk,
} from '../../src/scripts/api/native-reasoning.js';

test('normalizeAssistantStreamChunk keeps reasoning events separate from content', () => {
  const event = createReasoningStreamEvent('step-1', { provider: 'anthropic', label: 'Thought' });
  const normalized = normalizeAssistantStreamChunk(event);
  assert.equal(normalized.content, '');
  assert.equal(normalized.reasoning, 'step-1');
  assert.equal(normalized.provider, 'anthropic');
  assert.equal(normalized.reasoningLabel, 'Thought');
});

test('extractAnthropicStreamParts separates thinking and text deltas', () => {
  const blockKinds = new Map();
  assert.deepEqual(
    extractAnthropicStreamParts(
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking' } },
      blockKinds,
    ),
    { content: '', reasoning: '' },
  );
  assert.deepEqual(
    extractAnthropicStreamParts(
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '先思考' } },
      blockKinds,
    ),
    { content: '', reasoning: '先思考' },
  );
  assert.deepEqual(
    extractAnthropicStreamParts(
      { type: 'content_block_start', index: 1, content_block: { type: 'text' } },
      blockKinds,
    ),
    { content: '', reasoning: '' },
  );
  assert.deepEqual(
    extractAnthropicStreamParts(
      { type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: '正文' } },
      blockKinds,
    ),
    { content: '正文', reasoning: '' },
  );
});

test('extractGeminiStreamParts routes thought parts into reasoning', () => {
  const parts = extractGeminiStreamParts({
    parts: [
      { thought: true, text: '先想一下。' },
      { text: '最后回答。' },
    ],
  });
  assert.equal(parts.reasoning, '先想一下。');
  assert.equal(parts.content, '最后回答。');
});

test('extractOpenAICompatibleStreamParts supports reasoning_content and structured parts', () => {
  const direct = extractOpenAICompatibleStreamParts({
    choices: [{ delta: { reasoning_content: '思维', content: '正文' } }],
  });
  assert.equal(direct.reasoning, '思维');
  assert.equal(direct.content, '正文');

  const structured = extractOpenAICompatibleStreamParts({
    choices: [{
      delta: {
        content: [
          { type: 'reasoning', text: '先推理' },
          { type: 'output_text', text: '再输出' },
        ],
      },
    }],
  });
  assert.equal(structured.reasoning, '先推理');
  assert.equal(structured.content, '再输出');
});

console.log('native reasoning tests passed');
