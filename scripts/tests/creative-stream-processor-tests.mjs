import assert from 'node:assert/strict';

import {
  CreativeStreamProcessor,
  balanceCreativeStreamPreview,
} from '../../src/scripts/ui/chat/creative-stream-processor.js';
import {
  protectUnclosedAutoImagePromptTags,
  restoreProtectedAutoImagePromptTags,
} from '../../src/scripts/ui/chat/auto-image-prompt-utils.js';

const splitThinking = (raw) => {
  const text = String(raw ?? '');
  const start = text.indexOf('<think>');
  if (start < 0) return { content: text, reasoning: '', reasoningDisplay: '' };
  const bodyStart = start + '<think>'.length;
  const end = text.indexOf('</think>', bodyStart);
  if (end < 0) {
    return {
      content: text.slice(0, start).trimEnd(),
      reasoning: text.slice(bodyStart).trim(),
      reasoningDisplay: text.slice(bodyStart).trim(),
    };
  }
  return {
    content: `${text.slice(0, start)}${text.slice(end + '</think>'.length)}`.trim(),
    reasoning: text.slice(bodyStart, end).trim(),
    reasoningDisplay: text.slice(bodyStart, end).trim(),
  };
};

const testPreviewBalance = () => {
  assert.equal(balanceCreativeStreamPreview('abc ```js\nconst x = 1;'), 'abc ```js\nconst x = 1;\n```');
  assert.equal(balanceCreativeStreamPreview('他说 "你好'), '他说 "你好"');
};

const testIncompleteReasoningSplit = () => {
  let now = 1000;
  const processor = new CreativeStreamProcessor({
    now: () => now,
    minChunkChars: 1,
    normalizeText: value => String(value ?? ''),
    extractReasoning: splitThinking,
    applyStored: value => value,
    applyDisplay: value => value,
  });
  const snapshot = processor.append('正文<think>先想一下');
  assert.ok(snapshot);
  assert.equal(snapshot.contentSource, '正文');
  assert.equal(snapshot.display, '正文');
  assert.equal(snapshot.reasoning, '先想一下');
  assert.equal(snapshot.reasoningDisplay, '先想一下');
};

const testPreviewFallbackWhenRegexEmpties = () => {
  let now = 2000;
  const processor = new CreativeStreamProcessor({
    now: () => now,
    minChunkChars: 1,
    normalizeText: value => String(value ?? ''),
    extractReasoning: value => ({ content: String(value ?? ''), reasoning: '', reasoningDisplay: '' }),
    applyStored: () => '',
    applyDisplay: () => '',
  });
  const snapshot = processor.append('可见正文');
  assert.ok(snapshot);
  assert.equal(snapshot.display, '可见正文');
  assert.equal(snapshot.stored, '可见正文');
};

const testThrottleAndFinalize = () => {
  let now = 3000;
  const processor = new CreativeStreamProcessor({
    now: () => now,
    fps: 20,
    minChunkChars: 10,
    normalizeText: value => String(value ?? ''),
    extractReasoning: value => ({ content: String(value ?? ''), reasoning: '', reasoningDisplay: '' }),
    applyStored: value => value,
    applyDisplay: value => value,
  });
  const first = processor.append('abc');
  assert.ok(first);
  assert.equal(first.display, 'abc');
  now += 10;
  assert.equal(processor.append('def'), null);
  now += 60;
  const emitted = processor.append('ghi');
  assert.ok(emitted);
  const preview = processor.append('```code');
  assert.equal(preview, null);
  const finalSnapshot = processor.finalize();
  assert.equal(finalSnapshot.display, 'abcdefghi```code');
};

const testIncompleteImagePromptSurvivesRegex = () => {
  let now = 4000;
  const dangerousStrip = value => String(value ?? '').replace(/<\s*image_prompt\b[\s\S]*/i, '');
  const processor = new CreativeStreamProcessor({
    now: () => now,
    minChunkChars: 1,
    normalizeText: value => String(value ?? ''),
    extractReasoning: value => ({ content: String(value ?? ''), reasoning: '', reasoningDisplay: '' }),
    applyStored: dangerousStrip,
    applyDisplay: dangerousStrip,
    protectRegexSource: protectUnclosedAutoImagePromptTags,
    restoreRegexOutput: restoreProtectedAutoImagePromptTags,
  });
  const snapshot = processor.append('正文\n<image_prompt>\n后续正文');
  assert.ok(snapshot);
  assert.equal(snapshot.stored, '正文\n<image_prompt>\n后续正文');
  assert.equal(snapshot.display, '正文\n<image_prompt>\n后续正文');
};

const testContentWrapperHiddenDuringStream = () => {
  let now = 5000;
  const processor = new CreativeStreamProcessor({
    now: () => now,
    minChunkChars: 1,
    normalizeText: value => String(value ?? ''),
    extractReasoning: value => ({ content: String(value ?? ''), reasoning: '', reasoningDisplay: '' }),
    applyStored: value => value,
    applyDisplay: value => value,
  });
  const opening = processor.append('<content');
  assert.ok(opening);
  assert.equal(opening.stored, '<content');
  assert.equal(opening.display, '');
  now += 60;
  const body = processor.append('>正文</content>');
  assert.ok(body);
  assert.equal(body.stored, '<content>正文</content>');
  assert.equal(body.display, '正文');
};

testPreviewBalance();
testIncompleteReasoningSplit();
testPreviewFallbackWhenRegexEmpties();
testThrottleAndFinalize();
testIncompleteImagePromptSurvivesRegex();
testContentWrapperHiddenDuringStream();

console.log('creative-stream-processor tests passed');
