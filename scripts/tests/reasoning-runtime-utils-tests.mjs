import assert from 'node:assert/strict';

import { createReasoningRuntime } from '../../src/scripts/ui/chat/reasoning-runtime-utils.js';

const createRuntime = ({
  reasoningAutoParse = true,
  prefix = '<think>',
  suffix = '</think>',
} = {}) => createReasoningRuntime({
  getSettings: () => ({ reasoningAutoParse }),
  getPreset: () => ({ prefix, suffix }),
  normalizeLineBreaks: value => String(value ?? '').replace(/\r\n/g, '\n'),
  applyReasoningRegex: text => ({
    stored: `[stored]${String(text ?? '').trim()}`,
    display: `[display]${String(text ?? '').trim()}`,
  }),
});

{
  const runtime = createRuntime();
  assert.deepEqual(runtime.parseReasoningBlock('<think>步骤</think>\n正文'), {
    content: '正文',
    reasoning: '步骤',
  });
  assert.deepEqual(runtime.parseReasoningBlock('正文', { strict: false }), {
    content: '正文',
    reasoning: '',
  });
  console.log('ok - createReasoningRuntime parses closed reasoning blocks with preset markers');
}

{
  const runtime = createRuntime();
  assert.deepEqual(runtime.extractReasoningFromContent('<think>步骤</think>\n正文', { depth: 1 }), {
    content: '正文',
    reasoning: '[stored]步骤',
    reasoningDisplay: '[display]步骤',
  });
  console.log('ok - createReasoningRuntime applies reasoning regex to extracted blocks');
}

{
  const runtime = createRuntime();
  assert.deepEqual(runtime.extractStreamingReasoningFromContent('前文<think>推理中', { depth: 0 }), {
    content: '前文',
    reasoning: '[stored]推理中',
    reasoningDisplay: '[display]推理中',
  });
  assert.deepEqual(runtime.extractStreamingReasoningFromContent('前文<think>推理中', { depth: 0, final: true }), {
    content: '前文<think>推理中',
    reasoning: '',
    reasoningDisplay: '',
  });
  console.log('ok - createReasoningRuntime supports streaming partial reasoning and final fallback');
}

{
  const runtime = createRuntime({ reasoningAutoParse: false });
  assert.deepEqual(runtime.extractStreamingReasoningFromContent('前文<think>推理中', { depth: 0 }), {
    content: '前文<think>推理中',
    reasoning: '',
    reasoningDisplay: '',
  });
  console.log('ok - createReasoningRuntime respects disabled auto parse setting');
}
