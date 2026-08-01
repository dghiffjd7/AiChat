import assert from 'node:assert/strict';

import {
  buildCompletedResponseDiagnostics,
  buildFirstTokenResponseDiagnostics,
} from '../../src/scripts/ui/chat/request-response-diagnostics-utils.js';

{
  const first = buildFirstTokenResponseDiagnostics(null, {
    requestStartedAt: 1_000,
    firstTokenAt: 1_640,
    stream: true,
  });
  assert.deepEqual(first, {
    stream: true,
    firstTokenAt: 1640,
    firstTokenLatencyMs: 640,
  });
  const repeated = buildFirstTokenResponseDiagnostics(first, {
    requestStartedAt: 1_000,
    firstTokenAt: 2_000,
    stream: true,
  });
  assert.deepEqual(repeated, first, '首字只允许记录一次');
  console.log('ok - response diagnostics records the first provider token once');
}

{
  const completed = buildCompletedResponseDiagnostics({
    stream: true,
    firstTokenAt: 1_700,
    firstTokenLatencyMs: 700,
  }, {
    requestStartedAt: 1_000,
    completedAt: 4_100,
    usage: {
      promptTokens: 1200,
      completionTokens: 120,
      totalTokens: 1320,
      finishReason: 'stop',
      systemFingerprint: 'fp_alpha',
    },
  });
  assert.equal(completed.latencyMs, 3100);
  assert.equal(completed.outputDurationMs, 2400);
  assert.equal(completed.tokensPerSecond, 50);
  assert.equal(completed.systemFingerprint, 'fp_alpha');
  assert.equal(completed.promptTokens, 1200);
  assert.equal(completed.completionTokens, 120);
  console.log('ok - completed response diagnostics derives TPS from real usage after TTFT');
}

{
  const completed = buildCompletedResponseDiagnostics(null, {
    requestStartedAt: 1_000,
    completedAt: 2_000,
    usage: { completionTokens: null },
  });
  assert.equal(completed.firstTokenLatencyMs, null);
  assert.equal(completed.tokensPerSecond, null);
  assert.equal(completed.systemFingerprint, '');
  console.log('ok - response diagnostics does not fabricate TTFT, TPS or fingerprint');
}

