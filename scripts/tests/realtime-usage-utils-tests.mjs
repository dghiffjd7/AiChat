import assert from 'node:assert/strict';

import {
  accumulateRealtimeUsage,
  createRealtimeUsageTotals,
  formatRealtimeUsageText,
} from '../../src/scripts/ui/realtime/realtime-usage-utils.js';

let totals = createRealtimeUsageTotals();
totals = accumulateRealtimeUsage(totals, {
  type: 'response',
  usage: {
    total_tokens: 140,
    input_tokens: 100,
    output_tokens: 40,
    input_token_details: { text_tokens: 30, audio_tokens: 70 },
    output_token_details: { text_tokens: 15, audio_tokens: 25 },
  },
});
totals = accumulateRealtimeUsage(totals, {
  type: 'response',
  usage: {
    total_tokens: 30,
    input_tokens: 20,
    output_tokens: 10,
    input_tokens_details: { text_tokens: 5, audio_tokens: 15 },
    output_tokens_details: { text_tokens: 4, audio_tokens: 6 },
  },
});
totals = accumulateRealtimeUsage(totals, {
  type: 'transcription',
  usage: {
    total_tokens: 15,
    input_tokens: 12,
    output_tokens: 3,
    input_token_details: { audio_tokens: 12 },
  },
});

assert.equal(totals.responseCount, 2);
assert.equal(totals.transcriptionCount, 1);
assert.deepEqual(totals.response, {
  totalTokens: 170,
  inputTokens: 120,
  outputTokens: 50,
  inputTextTokens: 35,
  inputAudioTokens: 85,
  outputTextTokens: 19,
  outputAudioTokens: 31,
});
assert.deepEqual(totals.transcription, {
  totalTokens: 15,
  inputTokens: 12,
  outputTokens: 3,
  inputTextTokens: null,
  inputAudioTokens: 12,
});
assert.equal(formatRealtimeUsageText(totals), [
  '语音回应 2 次｜输入：文字 35 · 音频 85 · 合计 120｜输出：文字 19 · 音频 31 · 合计 50',
  '输入转写 1 次｜输入 12 · 输出 3 · 总计 15',
].join('\n'));
assert.match(formatRealtimeUsageText(createRealtimeUsageTotals()), /未提供/);

console.log('realtime usage utils tests passed');
